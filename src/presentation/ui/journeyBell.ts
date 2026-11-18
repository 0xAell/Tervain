import { makeStrandBell, type BellMaterial, type Point } from '../strandBell';

interface Vertex { x: number; y: number; z: number; grain: Point }
const edge = (a: Vertex, b: Vertex, x: number, y: number) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);

/** Paint a lit mesh into a transparent tile. A depth buffer keeps the hoop, its nails and the
 * clapper separate at every view angle. Texture coordinates are the original model's metres. */
function shadeTriangle(image: ImageData, depth: Float32Array, a: Vertex, b: Vertex, c: Vertex, tint: number[], material: BellMaterial) {
  const { width, height, data } = image;
  const area = edge(a, b, c.x, c.y);
  if (Math.abs(area) < .05) return;
  const x0 = Math.max(0, Math.floor(Math.min(a.x,b.x,c.x))), x1 = Math.min(width - 1, Math.ceil(Math.max(a.x,b.x,c.x)));
  const y0 = Math.max(0, Math.floor(Math.min(a.y,b.y,c.y))), y1 = Math.min(height - 1, Math.ceil(Math.max(a.y,b.y,c.y)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = edge(b, c, x + .5, y + .5) / area, v = edge(c, a, x + .5, y + .5) / area, w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const index = y * width + x, z = u * a.z + v * b.z + w * c.z;
    if (depth[index]! > z) continue;
    depth[index] = z;
    const mx = u * a.grain[0] + v * b.grain[0] + w * c.grain[0];
    const my = u * a.grain[1] + v * b.grain[1] + w * c.grain[1];
    const mz = u * a.grain[2] + v * b.grain[2] + w * c.grain[2];
    const fleck = Math.sin(79 * mx + 47 * mz + 21 * my) * Math.sin(39 * my - 68 * mz);
    let grain = 1 + .046 * fleck;
    if (material === 'timber') {
      const across = my > 2.50 ? my : mx;
      grain += .105 * Math.sin(across * 170 + mz * 117 + Math.sin(my * 4 + mx * 9) * 2.3) + .037 * Math.sin(across * 529 + mz * 14);
    } else if (material === 'bronze') {
      grain += .059 * Math.sin(mx * 17 + my * 3) * Math.sin(mz * 18 - my * 13);
    } else if (material === 'stone') grain += .065 * Math.sin(mx * 25 - mz * 39 + my * 11);
    const o = index * 4;
    data[o] = tint[0]! * grain; data[o+1] = tint[1]! * grain; data[o+2] = tint[2]! * grain; data[o+3] = 255;
  }
}

/** One still when the overlay opens, then only on resize. Works during WebGL context recovery. */
export function mountJourneyBell(canvas: HTMLCanvasElement, returning: boolean): () => void {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return () => {};
  const faces = makeStrandBell();
  const angle = returning ? -.49 : .57, sin = Math.sin(angle), cos = Math.cos(angle);
  let previousWidth = 0, previousHeight = 0;
  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1440 / rect.width);
    const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    if (width === previousWidth && height === previousHeight) return;
    canvas.width = previousWidth = width; canvas.height = previousHeight = height;
    const narrow = rect.width < 660;
    const cx = width * (narrow ? .62 : .71), cy = height * (narrow ? .29 : .48);
    const scale = Math.min(width * (narrow ? .24 : .19), height * (narrow ? .17 : .25));
    const light = ctx.createRadialGradient(cx, cy - scale * .68, 0, cx, cy, scale * 3.75);
    light.addColorStop(0, '#796f5c'); light.addColorStop(.42, '#434f4b'); light.addColorStop(1, '#152326');
    ctx.fillStyle = light; ctx.fillRect(0, 0, width, height);
    for (const sx of [-.98, .98]) {
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      shadow.addColorStop(0, 'rgba(8,16,18,.76)'); shadow.addColorStop(1, 'rgba(8,16,18,0)');
      const footZ = -sx * sin, footScale = scale * 8 / (8 - footZ);
      ctx.save(); ctx.translate(cx + sx * cos * footScale, cy + (1.41 + .12 * footZ) * footScale);
      ctx.scale(scale * .79, scale * .16); ctx.fillStyle = shadow; ctx.fillRect(-1,-1,2,2); ctx.restore();
    }
    const tile = document.createElement('canvas');
    tile.width = Math.ceil(scale * 3.8); tile.height = Math.ceil(scale * 3.4);
    const tileCtx = tile.getContext('2d')!;
    const image = tileCtx.createImageData(tile.width, tile.height), depth = new Float32Array(tile.width * tile.height).fill(-Infinity);
    for (const { points, color, material } of faces) {
      const view = points.map(([x,y,z]) => [x*cos+z*sin, y-1.32, z*cos-x*sin] as const);
      const [a,b,c] = view;
      const dx = b![0]-a![0], dy = b![1]-a![1], dz = b![2]-a![2];
      const ex = c![0]-a![0], ey = c![1]-a![1], ez = c![2]-a![2];
      const nx = dy*ez-dz*ey, ny = dz*ex-dx*ez, nz = dx*ey-dy*ex, len = Math.hypot(nx,ny,nz) || 1;
      const key = Math.max(0, (-.63*nx+.67*ny+.39*nz)/len);
      const sheen = material === 'bronze' ? 35 * Math.max(0, (-.32*nx+.30*ny+.89*nz)/len) ** 8 : 0;
      const tint = [16,8,0].map((shift,i) => (color >> shift & 255) * (.49 + key * [.90,.79,.62][i]!) + sheen * [1,.87,.58][i]!);
      const v = view.map(([x,y,z], i) => {
        const zoom = scale * 8 / (8 - z);
        return { x: tile.width/2 + x*zoom, y: tile.height/2 - (y-z*.12)*zoom, z: z+y*.12, grain: points[i]! };
      });
      shadeTriangle(image,depth,v[0]!,v[1]!,v[2]!,tint,material);
      shadeTriangle(image,depth,v[0]!,v[2]!,v[3]!,tint,material);
    }
    tileCtx.putImageData(image,0,0); ctx.drawImage(tile, cx-tile.width/2, cy-tile.height/2);
  };
  draw();
  const observer = new ResizeObserver(draw); observer.observe(canvas);
  return () => observer.disconnect();
}
