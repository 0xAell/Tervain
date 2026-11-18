import * as THREE from 'three';
import { FORD, LIGHTHOUSE } from '../core/world/layout';
import { coastX } from '../core/world/coast';
import { mulberry32, smoothstep } from '../core/world/noise';
import type { BuildContext, FrameContext, SceneModule } from './context';
import { RENDER_PX, SKY } from './skyState';
import { SHADER_CLOCK_WRAP } from './grass/wind';

/**
 * Gulls ride the sea breeze, smaller martins skim the ford and the mill race, and hearth smoke rises into the same
 * wind as the trees. The birds share a single instanced silhouette; the chimney plumes share one point batch. Presentation only.
 */

const GULL_VERT = /* glsl */ `
attribute vec4 aPath;     // centre x, centre z, radius, angular speed (rad/s)
attribute vec4 aParams;   // height, phase, size, flap rate
attribute vec3 aReach;    // long axis (x,z) and short/long radius ratio; river flights are narrow
attribute float aWing;    // 0 body, +1 / -1 wing tips (signed side)
uniform float uTime;
varying vec3 vFeather;
#include <fog_pars_vertex>
void main() {
  float a = aParams.y + uTime * aPath.w;
  float ca = cos(a), sa = sin(a);
  vec2 axis = aReach.xy, across = vec2(-axis.y, axis.x);
  vec2 c = aPath.xy + (axis * ca + across * sa * aReach.z) * aPath.z;
  vec2 tangent = normalize(-axis * sa + across * ca * aReach.z) * sign(aPath.w);
  float river = 1.0 - step(0.5, aReach.z);
  float bob = mix(1.6 * sin(uTime * 0.7 + aParams.y * 3.0), 0.9 * cos(2.0 * a), river);
  // A martin climbs and banks at the ends, then flattens out to skim the water on a long, low pass.
  vec3 fwd = normalize(vec3(tangent.x, -river * 0.18 * sin(2.0 * a) * sign(aPath.w), tangent.y));
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  float bank = sign(aPath.w) * mix(0.28, 0.12 + 0.52 * ca * ca, river);
  vec3 up = normalize(cross(fwd, side) - side * bank);
  vec3 right = cross(up, fwd);
  float beats = smoothstep(-0.45, 0.65, sin(uTime * 0.85 + aParams.y));
  float flap = beats * sin(uTime * aParams.w + aParams.y * 7.0);
  vec3 p = position;
  float wing = abs(aWing);
  p.y += wing * abs(p.x) * (0.08 + flap * 0.56);
  p.z -= wing * abs(p.x) * (0.12 * beats + 0.15 * river);
  vec3 world = vec3(c.x, aParams.x + bob, c.y) + (right * p.x + up * p.y + fwd * p.z) * aParams.z;
  vec3 feather = mix(vec3(1.0, 0.97, 0.86), vec3(0.18, 0.23, 0.24), river);
  vFeather = feather * (0.92 + 0.08 * up.y - wing * abs(p.x) * 0.18);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GULL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uDay;
varying vec3 vFeather;
#include <fog_pars_fragment>
void main() {
  vec3 plumage = uColor * vFeather;
  #ifdef USE_FOG
    plumage = mix(fogColor, plumage, uDay);
  #endif
  gl_FragColor = vec4(plumage, 1.0);
  #include <fog_fragment>
}`;

const SMOKE_VERT = /* glsl */ `
attribute vec3 aBase;
attribute vec2 aSeed;     // phase 0..1, size
uniform float uTime;
uniform float uStrength;
uniform vec4 uWind;
uniform float uPx;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  float t = fract(uTime * 0.075 + aSeed.x);
  float rise = t * 9.0;
  // The stack stays narrow for a metre, then a soft helix rolls out on the prevailing breeze.
  vec2 curl = vec2(sin(uTime * 0.29 - t * 7.0 + aBase.x), cos(uTime * 0.22 - t * 6.0 + aBase.z));
  vec2 drift = uWind.xy * t * t * (8.0 + 8.0 * uWind.z) + curl * t * 0.7;
  vec3 p = aBase + vec3(drift.x, rise, drift.y);
  vAlpha = smoothstep(0.0, 0.08, t) * pow(1.0 - t, 1.6) * uStrength;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = (1.5 + aSeed.y * (5.0 + t * 24.0)) * uPx * (90.0 / max(8.0, -mvPosition.z));
  #include <fog_vertex>
}`;

const SMOKE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float soft = 1.0 - smoothstep(0.0, 1.0, r);
  float a = vAlpha * soft * soft * 0.55;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <fog_fragment>
}`;

function gullGeometry(): THREE.BufferGeometry {
  // A gull from above: a spindle body and two swept wings, each wing a pair of triangles, tips flagged for flapping.
  const pos: number[] = [];
  const wing: number[] = [];
  const idx: number[] = [];
  const v = (x: number, y: number, z: number, w: number) => {
    pos.push(x, y, z);
    wing.push(w);
    return pos.length / 3 - 1;
  };
  const nose = v(0, 0, 0.55, 0);
  const tail = v(0, 0, -0.5, 0);
  const l = v(-0.09, 0.02, 0.05, 0);
  const r = v(0.09, 0.02, 0.05, 0);
  const top = v(0, 0.08, 0.05, 0);
  const bot = v(0, -0.06, 0.02, 0);
  idx.push(nose, l, top, nose, top, r, nose, bot, l, nose, r, bot, tail, top, l, tail, r, top, tail, l, bot, tail, bot, r);
  for (const s of [-1, 1]) {
    const root0 = v(s * 0.08, 0.02, 0.24, 0);
    const root1 = v(s * 0.08, 0.02, -0.14, 0);
    const mid = v(s * 0.75, 0.0, 0.02, s);
    const tip = v(s * 1.42, -0.02, -0.28, s);
    const tipF = v(s * 1.25, -0.01, 0.12, s);
    if (s > 0) idx.push(root0, root1, mid, root0, mid, tipF, mid, tip, tipF, root1, tip, mid);
    else idx.push(root0, mid, root1, root0, tipF, mid, mid, tipF, tip, root1, mid, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  return g;
}

export function buildWildlife(ctx: BuildContext, chimneys: readonly THREE.Vector3[]): SceneModule {
  const { terrain, quality } = ctx;
  const group = new THREE.Group();
  group.name = 'wildlife';
  const rnd = mulberry32(31337);

  /* ---- Gulls ---- */
  const birdCount = quality === 'low' ? 6 : quality === 'medium' ? 10 : 16;
  const riverBirds = quality === 'high' ? 4 : 2;
  const nGulls = birdCount - riverBirds;
  const geo = gullGeometry();
  const path = new Float32Array(birdCount * 4);
  const params = new Float32Array(birdCount * 4);
  const reach = new Float32Array(birdCount * 3);
  for (let i = 0; i < nGulls; i++) {
    reach.set([1, 0, 1], i * 3);
    const zone = i % 4;
    // Strand, jetty, headland, open sea.
    const cz = zone === 0 ? 30 + rnd() * 30 : zone === 1 ? 60 + rnd() * 30 : zone === 2 ? LIGHTHOUSE.z + (rnd() - 0.5) * 20 : 10 + rnd() * 100;
    const cx = zone === 2 ? LIGHTHOUSE.x + 6 : coastX(cz) - 25 - rnd() * 30;
    path[i * 4] = cx;
    path[i * 4 + 1] = cz;
    path[i * 4 + 2] = zone === 2 ? 14 + rnd() * 22 : 28 + rnd() * 60;
    path[i * 4 + 3] = (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.08);
    params[i * 4] = (zone === 2 ? 20 : 12) + rnd() * 22;
    params[i * 4 + 1] = rnd() * Math.PI * 2;
    params[i * 4 + 2] = 0.62 + rnd() * 0.22;
    params[i * 4 + 3] = 7 + rnd() * 3;
  }
  // The two feeding runs follow open water at the ford and downstream of the wheel. Sample the banks
  // once when placing them, so the lowest point of an arc clears even the higher bank.
  const runs = [
    { x: FORD.x, z: FORD.z, dx: Math.SQRT1_2, dz: Math.SQRT1_2 },
    { x: -13.8, z: 9, dx: -0.10, dz: Math.sqrt(0.99) },
  ];
  for (let i = nGulls; i < birdCount; i++) {
    const run = runs[(i - nGulls) % runs.length]!;
    const radius = 5.8 + rnd() * 2.4, aspect = 0.24;
    let ground = -Infinity;
    for (let k = 0; k < 24; k++) {
      const angle = k * Math.PI / 12;
      const u = radius * Math.cos(angle), v = radius * aspect * Math.sin(angle);
      ground = Math.max(ground, terrain.heightAt(run.x + u * run.dx - v * run.dz, run.z + u * run.dz + v * run.dx));
    }
    reach.set([run.dx, run.dz, aspect], i * 3);
    path.set([run.x, run.z, radius, (i % 2 ? -1 : 1) * (0.52 + rnd() * 0.18)], i * 4);
    params.set([ground + 2.25 + rnd() * 0.4, rnd() * Math.PI * 2, 0.22 + rnd() * 0.03, 21 + rnd() * 4], i * 4);
  }
  const igeo = new THREE.InstancedBufferGeometry();
  igeo.index = geo.index;
  igeo.setAttribute('position', geo.attributes.position!);
  igeo.setAttribute('aWing', geo.attributes.aWing!);
  igeo.setAttribute('aPath', new THREE.InstancedBufferAttribute(path, 4));
  igeo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  igeo.setAttribute('aReach', new THREE.InstancedBufferAttribute(reach, 3));
  igeo.instanceCount = birdCount;
  const gullMat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uColor: { value: new THREE.Color(0.62, 0.62, 0.6) }, uDay: { value: 1 } },
    vertexShader: GULL_VERT,
    fragmentShader: GULL_FRAG,
    side: THREE.DoubleSide,
    fog: true,
  });
  const gulls = new THREE.Mesh(igeo, gullMat);
  gulls.frustumCulled = false;
  group.add(gulls);

  /* ---- Chimney smoke ---- */
  const perChimney = quality === 'low' ? 7 : 15;
  const base = new Float32Array(chimneys.length * perChimney * 3);
  const seed = new Float32Array(chimneys.length * perChimney * 2);
  chimneys.forEach((p, ci) => {
    for (let k = 0; k < perChimney; k++) {
      const o = ci * perChimney + k;
      base[o * 3] = p.x + (rnd() - 0.5) * 0.25;
      base[o * 3 + 1] = p.y;
      base[o * 3 + 2] = p.z + (rnd() - 0.5) * 0.25;
      seed[o * 2] = (k + rnd() * 0.6) / perChimney + ci * 0.137;
      seed[o * 2 + 1] = 0.6 + rnd() * 0.8;
    }
  });
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  sgeo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  sgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uStrength: { value: 0.5 }, uWind: ctx.foliage?.wind.uniforms.uWindDir ?? { value: new THREE.Vector4(0.78, 0.62, 0.5, 0) }, uColor: { value: new THREE.Color(0.36, 0.34, 0.31) }, uPx: { value: 1 } },
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const smoke = new THREE.Points(sgeo, smokeMat);
  smoke.frustumCulled = false;
  group.add(smoke);

  let clock = 0;
  return {
    group,
    update(dt: number, f: FrameContext) {
      // Wrapped like the other shader clocks (A90, A103 scout: past ~9 h a gull's wingbeat moved in steps).
      if (!f.reducedMotion && f.wildlifeActive !== false) clock = (clock + Math.max(0, Math.min(dt, 0.25))) % SHADER_CLOCK_WRAP;
      gullMat.uniforms.uTime!.value = clock;
      gullMat.uniforms.uDay!.value = 1 - Math.min(1, f.nightness * 1.6);
      gulls.visible = gullMat.uniforms.uDay!.value > 0.02;
      gullMat.uniforms.uColor!.value.copy(SKY.sunColor.value).multiplyScalar(0.36 + 0.17 * SKY.sunI.value);
      smokeMat.uniforms.uTime!.value = clock;
      // Fires burn brighter in the cold of the morning and evening and through the night, and are banked at midday.
      const h = f.hour;
      const cold = 1 - smoothstep(7, 11, h) * (1 - smoothstep(15, 19, h)) * 0.65;
      smokeMat.uniforms.uStrength!.value = f.reducedMotion ? 0.3 : 0.45 + 0.45 * cold;
      smokeMat.uniforms.uPx!.value = RENDER_PX.value;
      smokeMat.uniforms.uColor!.value.setRGB(0.15 + 0.46 * (1 - f.nightness), 0.17 + 0.40 * (1 - f.nightness), 0.19 + 0.30 * (1 - f.nightness));
    },
    stats: () => ({ gulls: nGulls, riverMartins: riverBirds, chimneys: chimneys.length }),
    dispose() {
      geo.dispose();
      igeo.dispose();
      sgeo.dispose();
      gullMat.dispose();
      smokeMat.dispose();
    },
  };
}
