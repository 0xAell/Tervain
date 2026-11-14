import * as THREE from 'three';

export interface SwayUniforms {
  uTime: { value: number };
  uWind: { value: number };
}

/**
 * The old rooted sway of the procedural fallback trees (authoring tools and fixtures) stays off. The supplied trees in
 * the world answer the realm's wind through foliage/foliageWind.ts instead (A62).
 */
export const TREE_SWAY_ENABLED = false;
export const TREE_SWAY_MULTIPLIER = TREE_SWAY_ENABLED ? 1 : 0;

/** Standard material whose vertices bend with `aSway` so branch and canopy motion stays attached. */
export function makeSwayMaterial(u: SwayUniforms, opts: { side?: THREE.Side; flat?: boolean } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: opts.flat ?? true, roughness: 0.95, metalness: 0, side: opts.side ?? THREE.FrontSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #endif
          float ph = ip.x * 0.31 + ip.z * 0.27;
          float gust = sin(uTime * 0.35 + ip.x * 0.02) * 0.5 + 0.5;
          float w = sin(uTime * 1.5 + ph + position.y * 0.7) * aSway * uWind * (0.55 + gust * 0.6) * ${TREE_SWAY_MULTIPLIER.toFixed(1)};
          transformed.x += w * 0.55;
          transformed.z += w * 0.3;
        }`,
      );
  };
  return mat;
}


/**
 * Prevailing wind (the same world-space convention Warpkeep uses for its grass and forest) and a shared
 * gust field. Adapted from ael-dev3/Warpkeep src/components/realm/realmLivingEnvironment.ts @786c0b2 (Apache-2.0).
 * Materials that want the wind to feel like one wind (trees, leaves, understory) inject WIND_GLSL.
 */
const WIND_LEN = Math.hypot(0.78, 0.62);
export const WIND_DIR = { x: 0.78 / WIND_LEN, z: 0.62 / WIND_LEN } as const;

const f9 = (v: number) => v.toFixed(9);

/** GLSL: `tvGust(worldXZ, t)` in 0..1 and `tvSwayLocal(instanceMatrix, amp, t, wind)`, a local-space rooted sway offset. */
export const WIND_GLSL = /* glsl */ `
const vec2 tvWindDir = vec2(${f9(WIND_DIR.x)}, ${f9(WIND_DIR.z)});
float tvGust(vec2 worldXZ, float t) {
  vec2 cross = vec2(-tvWindDir.y, tvWindDir.x);
  float front = sin(dot(worldXZ, tvWindDir) * 0.21 - t * 0.34);
  float side = sin(dot(worldXZ, cross) * 0.087 + t * 0.19 + 1.7);
  float shaped = clamp((front + 0.64) / 1.46, 0.0, 1.0);
  return clamp(shaped * 0.82 + (side * 0.5 + 0.5) * 0.18, 0.0, 1.0);
}
float tvHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
// Rooted sway of an instanced tree: 'amp' is the per-vertex rooted weight in native metres (height weighting is
// baked into the attribute), the result is a displacement in the mesh's local space (xz) so it stays attached
// whatever the instance yaw and scale are.
vec3 tvSwayLocal(mat4 wm, float amp, float t, float wind) {
  vec2 baseXZ = wm[3].xz;
  float gust = tvGust(baseXZ, t);
  float ph = tvHash(floor(baseXZ * 0.5));
  float s = sin(t * 0.72 + ph * 6.2831853 + dot(baseXZ, tvWindDir) * 0.11) * mix(0.28, 1.0, gust);
  s += 0.18 * sin(t * 1.9 + ph * 17.0) * gust;
  vec2 dW = tvWindDir * (s * amp * 0.02 * wind);
  mat2 A = mat2(wm[0].xz, wm[2].xz);
  float sc = max(length(wm[0].xz), 0.0001);
  vec2 dl = (dW * A) / sc;
  return vec3(dl.x, 0.0, dl.y);
}
`;

export function withSway(geo: THREE.BufferGeometry, fn: (y: number, x: number, z: number) => number): THREE.BufferGeometry {
  const n = geo.attributes.position!.count;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(geo.attributes.position!.getY(i), geo.attributes.position!.getX(i), geo.attributes.position!.getZ(i));
  geo.setAttribute('aSway', new THREE.BufferAttribute(a, 1));
  return geo;
}

export { Exclusions, streamDistance } from '../core/world/exclusions';
