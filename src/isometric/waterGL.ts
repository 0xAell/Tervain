import type { Ripple } from './water';
import shader from './water.frag?raw';
import { foamCell } from './foam';
import { impactsForTile, maxWaterImpacts, type WaterImpact } from './waterImpact';
import { bankRamp, oceanRamp, poolRamp, streamRamp } from './waterPalette';
import type { Atlas } from './atlas';
import type { Ground } from './ground';

type Chunk = ReturnType<Ground['makeChunk']>;
type Region = { x: number; y: number; chunk: Chunk };
type Texture = ReturnType<Atlas['read']>[number];
const vertex = `#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.); }`;
const composite = `#version 300 es
precision highp float;
uniform sampler2D displacement,mirrors;
uniform int viewHeight,mode;
out vec4 color;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);vec4 d=texelFetch(displacement,p,0);
  if(mode==1){color=vec4(1.,1.,1.,d.a);return;}
  ivec2 delta=ivec2(round(d.rg*16.-8.)),uv=ivec2(p.x,viewHeight-p.y-1)+delta;
  if(d.b<=0.||any(lessThan(uv,ivec2(0)))||any(greaterThanEqual(uv,textureSize(mirrors,0)))){color=vec4(0.);return;}
  vec4 sprite=texelFetch(mirrors,uv,0);vec3 scatter=vec3(.19,.32,.33);color=vec4(mix(sprite.rgb,scatter,.22),sprite.a*d.b);
}`;

function program(gl: WebGL2RenderingContext, source: string) {
  const p = gl.createProgram()!;
  for (const [type, code] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, source],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, code);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(s) ?? 'Water shader failed');
    gl.attachShader(p, s);
    gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw Error(gl.getProgramInfoLog(p) ?? 'Water shader link failed');
  return p;
}

/** The first pass writes surface colour and its normal/coverage map together.
 * The second pass reuses that map for the exact reflected animation frame. No GPU readback during play. */
export class WaterGL {
  readonly canvas: HTMLCanvasElement;
  private base: WebGLProgram;
  private overlay: WebGLProgram;
  private fbo: WebGLFramebuffer;
  private color: WebGLTexture;
  private displacement: WebGLTexture;
  private mirror: WebGLTexture;
  private paint: WebGLTexture;
  private bubble: WebGLTexture;
  private ramps: WebGLTexture;
  private impactShape = new Float32Array(maxWaterImpacts * 4);
  private impactMotion = new Float32Array(maxWaterImpacts * 4);
  private chunks = new Map<Chunk, WebGLTexture[]>();
  private stamp = '';
  private locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  static create(textures: Texture[][], shingle: Texture) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return null;
    try {
      return new WaterGL(gl, canvas, textures, shingle);
    } catch (e) {
      console.warn('Using the Canvas water renderer.', e);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return null;
    }
  }
  private constructor(
    private gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    textures: Texture[][],
    shingle: Texture
  ) {
    this.canvas = canvas;
    this.base = program(gl, shader);
    this.overlay = program(gl, composite);
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
    this.fbo = gl.createFramebuffer()!;
    this.color = this.texture();
    this.displacement = this.texture();
    this.mirror = this.rgba(1, 1, new Uint8Array(4));
    const bubbles = Uint8Array.from({ length: 128 * 128 }, (_, i) =>
      Math.round(foamCell(i & 127, i >> 7) * 255)
    );
    this.bubble = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 128, 128, 0, gl.RED, gl.UNSIGNED_BYTE, bubbles);
    const colors = new Uint32Array(32 * 4);
    [oceanRamp, bankRamp, streamRamp, poolRamp].forEach((array, i) => colors.set(array, i * 32));
    this.ramps = this.rgba(32, 4, new Uint8Array(colors.buffer));
    this.paint = this.texture(gl.TEXTURE_2D_ARRAY);
    const layers = [3, 2, 10, 11].flatMap((i) =>
      Array.from({ length: 7 }, (_, j) => textures[i]![j % textures[i]!.length]!)
    );
    layers.push(textures[1]![0]!, shingle);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 64, 64, layers.length);
    for (const [layer, tex] of layers.entries()) {
      const scaled = Uint32Array.from(
        { length: 4096 },
        (_, i) =>
          tex.pixels[Math.floor(((i >> 6) * tex.h) / 64) * tex.w + Math.floor(((i & 63) * tex.w) / 64)]!
      );
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        layer,
        64,
        64,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(scaled.buffer)
      );
    }
    gl.useProgram(this.base);
    ['terrain', 'geometry', 'material', 'skyMap', 'bubbles', 'palette', 'paintings'].forEach((n, i) =>
      gl.uniform1i(this.loc(this.base, n), i)
    );
    gl.useProgram(this.overlay);
    gl.uniform1i(this.loc(this.overlay, 'displacement'), 0);
    gl.uniform1i(this.loc(this.overlay, 'mirrors'), 1);
  }
  private loc(p: WebGLProgram, name: string) {
    let map = this.locations.get(p);
    if (!map) {
      map = new Map();
      this.locations.set(p, map);
    }
    if (!map.has(name)) map.set(name, this.gl.getUniformLocation(p, name));
    return map.get(name)!;
  }
  private texture(target: number = this.gl.TEXTURE_2D) {
    const gl = this.gl,
      tex = gl.createTexture()!;
    gl.bindTexture(target, tex);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  private rgba(w: number, h: number, bytes: Uint8Array) {
    const gl = this.gl,
      t = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return t;
  }
  private bind(index: number, texture: WebGLTexture, target: number = this.gl.TEXTURE_2D) {
    this.gl.activeTexture(this.gl.TEXTURE0 + index);
    this.gl.bindTexture(target, texture);
  }
  private upload(c: Chunk) {
    const gl = this.gl,
      size = c.canvas.width,
      n = size * size;
    gl.activeTexture(gl.TEXTURE0);
    const geom = new Float32Array(n * 4),
      mat = new Uint8Array(n * 4);
    geom.fill(-1000);
    for (const i of c.waterPixels) {
      const j = i * 4;
      geom[j] = c.bank[i]! / 64;
      geom[j + 1] = c.along[i]! / 64;
      geom[j + 2] = c.across[i]! / 64;
      geom[j + 3] = c.width[i]! / 24;
      mat[j] = c.course[i]!;
      mat[j + 1] = c.grain[i]!;
      mat[j + 2] = c.pocket[i]!;
      mat[j + 3] = c.material[i] === 11 ? 255 : 0;
    }
    const shape = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, geom);
    const set = [
      this.rgba(size, size, new Uint8Array(c.land.buffer)),
      shape,
      this.rgba(size, size, mat),
      this.rgba(size, size, new Uint8Array(c.sky.buffer)),
    ];
    this.chunks.set(c, set);
    return set;
  }
  release(c: Chunk) {
    for (const t of this.chunks.get(c) ?? []) this.gl.deleteTexture(t);
    this.chunks.delete(c);
  }
  get available() {
    return !this.gl.isContextLost();
  }
  private size(w: number, h: number) {
    if (this.canvas.width === w && this.canvas.height === h && this.stamp) return;
    const gl = this.gl;
    this.canvas.width = w;
    this.canvas.height = h;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    for (const [i, t] of [this.color, this.displacement].entries()) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error('Water framebuffer unavailable');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stamp = '';
  }
  draw(
    ctx: CanvasRenderingContext2D,
    regions: Region[],
    ox: number,
    oy: number,
    tick: number,
    hour: number,
    currents: number[],
    stage: number[],
    ripples: Ripple[],
    impacts: readonly WaterImpact[],
    pulseKey: string
  ) {
    const gl = this.gl,
      w = ctx.canvas.width,
      h = ctx.canvas.height;
    this.size(w, h);
    const stamp = [w, h, ox, oy, tick, Math.floor(hour * 12), ...stage, pulseKey].join('/');
    if (stamp !== this.stamp) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const p = this.base;
      gl.useProgram(p);
      gl.uniform1i(this.loc(p, 'viewHeight'), h);
      gl.uniform1f(this.loc(p, 'seconds'), tick / 30);
      gl.uniform1f(
        this.loc(p, 'sunlight'),
        Math.max(0, 0.38 + 0.62 * Math.cos(((hour - 10) * Math.PI) / 12))
      );
      gl.uniform1fv(
        this.loc(p, 'currents[0]'),
        currents.map((t) => t * 29)
      );
      gl.uniform1fv(this.loc(p, 'stage[0]'), stage);
      gl.uniform1i(this.loc(p, 'pulseCount'), ripples.length);
      if (ripples.length) {
        gl.uniform4fv(
          this.loc(p, 'pulses[0]'),
          ripples.flatMap((r) => [r.x, r.z, r.radius, r.amplitude])
        );
        gl.uniform1iv(
          this.loc(p, 'pulseCourse[0]'),
          ripples.map((r) => r.course)
        );
      }
      this.bind(4, this.bubble);
      this.bind(5, this.ramps);
      this.bind(6, this.paint, gl.TEXTURE_2D_ARRAY);
      const shape = this.loc(p, 'impactShape[0]'),
        motion = this.loc(p, 'impactMotion[0]'),
        count = this.loc(p, 'impactCount');
      for (const { x, y, chunk } of regions) {
        const cached = this.chunks.get(chunk) ?? this.upload(chunk);
        cached.forEach((t, j) => this.bind(j, t));
        const size = chunk.canvas.width;
        const hit = impactsForTile(impacts, chunk.worldX, chunk.worldY, size);
        gl.uniform1i(count, hit.length);
        if (hit.length) {
          hit.forEach((o, i) => {
            this.impactShape.set([o.x, o.z, o.radius, o.pressure], i * 4);
            this.impactMotion.set([o.tx, o.tz, o.age, o.course], i * 4);
          });
          gl.uniform4fv(shape, this.impactShape, 0, hit.length * 4);
          gl.uniform4fv(motion, this.impactMotion, 0, hit.length * 4);
        }
        gl.viewport(x, h - y - size, size, size);
        gl.uniform2i(this.loc(p, 'origin'), x, y);
        gl.uniform2i(this.loc(p, 'worldOrigin'), chunk.worldX, chunk.worldY);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      this.stamp = stamp;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    ctx.drawImage(this.canvas, 0, 0);
  }
  composite(ctx: CanvasRenderingContext2D, mirror?: HTMLCanvasElement) {
    const gl = this.gl,
      w = this.canvas.width,
      h = this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.overlay);
    gl.uniform1i(this.loc(this.overlay, 'viewHeight'), h);
    gl.uniform1i(this.loc(this.overlay, 'mode'), mirror ? 0 : 1);
    this.bind(0, this.displacement);
    this.bind(1, this.mirror);
    if (mirror) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mirror);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ctx.drawImage(this.canvas, 0, 0);
  }
}
