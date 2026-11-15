import { patchFloorPlantVertex, type FoliageField } from './foliage/foliageWind';
import * as THREE from 'three';
import { mulberry32 } from '../core/world/noise';
import type { Terrain } from '../core/world/terrain';
import type { Exclusions } from './vegetation';
import type { Quality, SceneModule } from './context';
import { barkTextures } from './treeTextures';
import type { FloraTree } from './floraPopulation';
import { attachInstanceDistanceVisibility, createPlanarDistanceFade, type InstanceDistanceVisibility } from './distanceVisibility';
import type { PlantedCrownField } from './plantedCrowns';
import { clamp01, fbmField, sstep } from './procTex';

import { FOREST_FLOOR_DISTANCE, createForestFloorPopulation, selectForestFloorPopulation, type ForestFloorKind, type ForestFloorPiece } from '../core/world/forestFloor';
export { FOREST_FLOOR_DISTANCE, createForestFloorPopulation, selectForestFloorPopulation, type ForestFloorKind, type ForestFloorPiece };

class FloorGeometry {
  pos: number[] = [];
  color: number[] = [];
  detail: number[] = [];
  idx: number[] = [];
  vertex(x: number, y: number, z: number, c: THREE.Color, leaf: readonly [number, number, number] = [0, 0, 0]) {
    this.pos.push(x, y, z);
    this.color.push(c.r, c.g, c.b);
    this.detail.push(...leaf);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute('aLeafDetail', new THREE.Float32BufferAttribute(this.detail, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Broad, curved fronds with real tapered leaflets. Each leaflet shares a root on its parent's continuous midrib. */
export function buildForestFernGeometry(variant: number): THREE.BufferGeometry {
  const a = new FloorGeometry();
  const rnd = mulberry32(2101 + variant * 139);
  const fronds = 7;
  // Related juvenile, spreading and upright forms, rather than one fan with random scale.
  // Topology and connected roots stay identical, so each complete fern remains 504 triangles.
  const form = [
    { length: 0.76, lengthJitter: 0.3, height: 0.59, heightJitter: 0.19, arc: 0.88, spread: 0.26 },
    { length: 1.18, lengthJitter: 0.38, height: 0.52, heightJitter: 0.15, arc: 0.95, spread: 0.34 },
    { length: 0.94, lengthJitter: 0.36, height: 0.59, heightJitter: 0.2, arc: 0.9, spread: 0.3 },
  ][variant % 3]!;
  for (let f = 0; f < fronds; f++) {
    const az = f * Math.PI * 2 / fronds + (rnd() - 0.5) * 0.48;
    const length = form.length + rnd() * form.lengthJitter;
    const height = form.height + rnd() * form.heightJitter;
    const direction = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const at = (t: number) => direction.clone().multiplyScalar(length * t).setY(-0.012 + Math.sin(t * Math.PI * form.arc) * height + t * 0.025);
    let last: [number, number] | null = null;
    const stem = new THREE.Color('#5c6548');
    for (let s = 0; s <= 8; s++) {
      const p = at(s / 8);
      const w = 0.015 * (1 - s / 10);
      const left = p.clone().addScaledVector(side, -w);
      const right = p.clone().addScaledVector(side, w);
      const ring: [number, number] = [a.vertex(left.x, left.y, left.z, stem), a.vertex(right.x, right.y, right.z, stem)];
      if (last) { a.tri(last[0], last[1], ring[0]); a.tri(last[1], ring[1], ring[0]); }
      last = ring;
    }
    for (let l = 1; l <= 7; l++) {
      const t = l / 8;
      const root = at(t);
      const span = Math.sin(Math.PI * t) * (form.spread + rnd() * 0.075);
      for (const sign of [-1, 1]) {
        const tip = root.clone().addScaledVector(side, span * sign).addScaledVector(direction, span * 0.6);
        tip.y -= span * 0.18;
        const mid = root.clone().lerp(tip, 0.55);
        mid.y += 0.009;
        const shade = new THREE.Color().setHSL(0.23 + rnd() * 0.05, 0.25 + rnd() * 0.1, 0.275 + rnd() * 0.085, THREE.SRGBColorSpace);
        const base = a.vertex(root.x, root.y, root.z, shade, [0.5, 0, 1]);
        const left = mid.clone().addScaledVector(direction, -0.105 * Math.sin(Math.PI * t));
        const right = mid.clone().addScaledVector(direction, 0.105 * Math.sin(Math.PI * t));
        const li = a.vertex(left.x, left.y, left.z, shade.clone().multiplyScalar(0.97), [0, 0.5, 1]);
        const mi = a.vertex(mid.x, mid.y, mid.z, shade.clone().multiplyScalar(1.02), [0.5, 0.5, 1]);
        const ri = a.vertex(right.x, right.y, right.z, shade, [1, 0.5, 1]);
        const ti = a.vertex(tip.x, tip.y, tip.z, shade.clone().multiplyScalar(1.08), [0.5, 1, 1]);
        a.tri(base, li, mi); a.tri(base, mi, ri); a.tri(li, ti, mi); a.tri(mi, ti, ri);
      }
    }
  }
  return a.geometry();
}

export function buildForestLitterGeometry(variant: number): THREE.BufferGeometry {
  const a = new FloorGeometry();
  const rnd = mulberry32(5101 + variant * 103);
  for (let i = 0; i < (variant === 2 ? 24 : 13); i++) {
    const az = rnd() * Math.PI * 2;
    const x = (rnd() - 0.5) * 1.4;
    const z = (rnd() - 0.5) * 1.4;
    const length = 0.09 + rnd() * 0.13;
    const wid = length * (variant === 2 ? 0.08 : 0.48);
    const dx = Math.cos(az), dz = Math.sin(az);
    const c = new THREE.Color().setHSL(0.083 + rnd() * 0.07, 0.22 + rnd() * 0.17, 0.2 + rnd() * 0.14, THREE.SRGBColorSpace);
    const root = a.vertex(x, 0.024, z, c, [0.5, 0, 1]);
    const left = a.vertex(x + dx * length * 0.5 - dz * wid, 0.035, z + dz * length * 0.5 + dx * wid, c, [0, 0.5, 1]);
    const ridge = a.vertex(x + dx * length * 0.5, 0.052, z + dz * length * 0.5, c.clone().multiplyScalar(1.08), [0.5, 0.5, 1]);
    const right = a.vertex(x + dx * length * 0.5 + dz * wid, 0.035, z + dz * length * 0.5 - dx * wid, c, [1, 0.5, 1]);
    const tip = a.vertex(x + dx * length, 0.024, z + dz * length, c, [0.5, 1, 1]);
    a.tri(root, left, ridge); a.tri(root, ridge, right); a.tri(left, tip, ridge); a.tri(ridge, tip, right);
  }
  return a.geometry();
}

/** An ankle-to-knee high woodland shrub: every folded leaf grows from one of five continuous woody stems. */
export function buildForestShrubGeometry(variant: number): THREE.BufferGeometry {
  const a = new FloorGeometry();
  const rnd = mulberry32(7101 + variant * 113);
  const bark = new THREE.Color('#514c37');
  const up = new THREE.Vector3(0, 1, 0);
  for (let branch = 0; branch < 5; branch++) {
    const az = branch * Math.PI * 2 / 5 + (rnd() - 0.5) * 0.45;
    const direction = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const spread = (variant ? 0.5 : 0.32) + rnd() * (variant ? 0.23 : 0.19);
    const height = (variant ? 0.37 : 0.47) + rnd() * (variant ? 0.17 : 0.25);
    const at = (t: number) => direction.clone().multiplyScalar(spread * t * t).setY(0.01 + height * t);
    let previous: number[] | null = null;
    for (let step = 0; step <= 5; step++) {
      const p = at(step / 5), ring: number[] = [];
      const r = 0.013 * (1 - step / 7);
      for (let k = 0; k < 4; k++) {
        const angle = k * Math.PI / 2;
        ring.push(a.vertex(p.x + Math.cos(angle) * r, p.y, p.z + Math.sin(angle) * r, bark));
      }
      if (previous) for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        a.tri(previous[k]!, ring[k]!, previous[next]!);
        a.tri(previous[next]!, ring[k]!, ring[next]!);
      }
      if (step === 0) { a.tri(ring[0]!, ring[2]!, ring[1]!); a.tri(ring[0]!, ring[3]!, ring[2]!); }
      if (step === 5) { a.tri(ring[0]!, ring[1]!, ring[2]!); a.tri(ring[0]!, ring[2]!, ring[3]!); }
      previous = ring;
    }
    for (let node = 1; node <= 4; node++) {
      const root = at(node / 5);
      for (const sign of [-1, 1]) {
        const length = (variant ? 0.2 : 0.15) + rnd() * 0.11;
        const leafDirection = side.clone().multiplyScalar(sign).addScaledVector(direction, 0.42).normalize();
        const across = leafDirection.clone().cross(up).normalize();
        const tip = root.clone().addScaledVector(leafDirection, length);
        tip.y += 0.045;
        const centre = root.clone().lerp(tip, 0.5); centre.y += 0.011;
        const left = centre.clone().addScaledVector(across, length * 0.45);
        const right = centre.clone().addScaledVector(across, -length * 0.45);
        const color = new THREE.Color().setHSL(0.225 + rnd() * 0.045, 0.22 + rnd() * 0.11, 0.26 + rnd() * 0.08, THREE.SRGBColorSpace);
        const ri = a.vertex(root.x, root.y, root.z, color.clone().multiplyScalar(0.9), [0.5, 0, 1]);
        const li = a.vertex(left.x, left.y, left.z, color, [0, 0.5, 1]);
        const ci = a.vertex(centre.x, centre.y, centre.z, color.clone().multiplyScalar(1.05), [0.5, 0.5, 1]);
        const oi = a.vertex(right.x, right.y, right.z, color.clone().multiplyScalar(0.94), [1, 0.5, 1]);
        const ti = a.vertex(tip.x, tip.y, tip.z, color, [0.5, 1, 1]);
        a.tri(ri, li, ci); a.tri(ri, ci, oi); a.tri(li, ti, ci); a.tri(ci, ti, oi);
      }
    }
  }
  return a.geometry();
}

function colorGeometry(g: THREE.BufferGeometry, base: THREE.Color): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const color: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const c = base.clone().multiplyScalar(0.82 + Math.max(0, y) * 0.55);
    color.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return g;
}

function floorGeometry(kind: ForestFloorKind, variant: number) {
  if (kind === 'fern') return buildForestFernGeometry(variant);
  if (kind === 'shrub') return buildForestShrubGeometry(variant);
  if (kind === 'litter') return buildForestLitterGeometry(variant);
  if (kind === 'moss') {
    const g = new THREE.IcosahedronGeometry(0.52, 1);
    // Low asymmetric hummocks read as a carpet rooted in humus, rather than green pebbles.
    const positions = g.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const edge = 0.88 + 0.12 * Math.sin(x * 8.3 + z * 9.7);
      positions.setXYZ(i, x * 1.45 * edge, y * 0.067 + 0.018, z * edge);
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return colorGeometry(g, new THREE.Color('#556343'));
  }
  if (kind === 'log') {
    const g = new THREE.CylinderGeometry(0.14, 0.22, variant ? 2.5 : 3.3, 7, 2, false);
    g.rotateZ(Math.PI / 2);
    g.translate(0, 0.12, 0);
    return colorGeometry(g, new THREE.Color('#e0d9bb'));
  }
  // A tight three-cap cluster on the damp forest floor, each with a full stem and underside.
  const a = new FloorGeometry();
  const capColor = new THREE.Color('#b49a70');
  const stemColor = new THREE.Color('#9a9079');
  for (let n = 0; n < 3; n++) {
    const x = (n - 1) * 0.16;
    const z = n === 1 ? 0.14 : -0.06;
    const h = 0.12 + n * 0.02;
    const apex = a.vertex(x, h + 0.055, z, capColor.clone().multiplyScalar(1.18));
    const underside = a.vertex(x, h - 0.018, z, stemColor);
    const rings: number[] = [];
    for (let k = 0; k < 7; k++) {
      const az = k * Math.PI * 2 / 7;
      rings.push(a.vertex(x + Math.cos(az) * 0.095, h, z + Math.sin(az) * 0.095, capColor));
    }
    for (let k = 0; k < 7; k++) { a.tri(apex, rings[k]!, rings[(k + 1) % 7]!); a.tri(underside, rings[(k + 1) % 7]!, rings[k]!); }
    const bottom: number[] = [], top: number[] = [];
    for (let k = 0; k < 5; k++) {
      const az = k * Math.PI * 2 / 5;
      bottom.push(a.vertex(x + Math.cos(az) * 0.02, -0.01, z + Math.sin(az) * 0.02, stemColor));
      top.push(a.vertex(x + Math.cos(az) * 0.015, h - 0.015, z + Math.sin(az) * 0.015, stemColor));
    }
    for (let k = 0; k < 5; k++) {
      const next = (k + 1) % 5;
      a.tri(bottom[k]!, bottom[next]!, top[k]!); a.tri(bottom[next]!, top[next]!, top[k]!);
    }
  }
  return a.geometry();
}

/** Original painted veins follow each physical folded leaflet. The UV chart is local to its
 * five vertices, so this detail stays with the plant instead of sliding over world-space noise.
 * Stems, moss and fungi have zero weight and keep their own vertex-painted surface. */
/** CPU pixels are authored once per resolution, independently of World / graphics-preset
 * lifetimes. Keep this buffer private: each owned GPU texture receives its own copy below. */
const forestLeafPixels = new Map<number, Uint8Array>();

function paintedForestLeafPixels(n: number): Uint8Array {
  const existing = forestLeafPixels.get(n);
  if (existing) return existing;
  const tissue = fbmField(n, 9, 12, 3, 8204), grain = fbmField(n, 46, 50, 2, 8205);
  const pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = y * n + x, u = (x + 0.5) / n, v = (y + 0.5) / n;
    const across = Math.abs(u - 0.5);
    // This rounded lanceolate outline stays strictly inside the five-vertex support kite.
    // Wider support geometry retains the old opaque leaf width while its silhouette becomes organic.
    const halfWidth = Math.sin(v * Math.PI) * 0.3 * (1 + 0.035 * Math.sin(v * 64 + Math.sin(v * 17)));
    const alpha = 1 - sstep(halfWidth - 0.004, halfWidth + 0.004, across);
    const vein = 1 - sstep(0.009, 0.021, across);
    const sideVeins = (1 - sstep(0.045, 0.13, Math.abs(Math.sin(v * 48 + across * 37)))) * sstep(0.014, 0.06, across);
    const worn = sstep(halfWidth * 0.55, Math.max(0.001, halfWidth), across) * (0.65 + tissue[o]! * 0.35);
    const freckles = sstep(0.62, 0.8, grain[o]!) * (1 - vein) * 0.15;
    const value = 0.72 + tissue[o]! * 0.17 + grain[o]! * 0.09 + vein * 0.1 + sideVeins * 0.07 - freckles;
    pixels[o * 4] = Math.round(clamp01(value * (1 + worn * 0.075)) * 255);
    pixels[o * 4 + 1] = Math.round(clamp01(value * (1 - worn * 0.035)) * 255);
    pixels[o * 4 + 2] = Math.round(clamp01(value * (1 - worn * 0.1)) * 255);
    pixels[o * 4 + 3] = Math.round(clamp01(alpha) * 255);
  }
  forestLeafPixels.set(n, pixels);
  return pixels;
}

/** A newly painted leaf modulation / cutout chart; no photographs or reference pixels. Broad
 * olive-grey tissue, fine branching veins and browned worn margins stay attached to the leaf UVs.
 * Only immutable CPU art is cached; textures/sources remain private and independently disposable. */
export function buildForestLeafTexture(size = 256): THREE.DataTexture {
  const texture = new THREE.DataTexture(paintedForestLeafPixels(size).slice(), size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace; // RGB is a linear painted multiplier over the plant's species palette.
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 8; texture.needsUpdate = true;
  texture.name = 'Original forest leaflet tissue and worn edge';
  return texture;
}

function installFloorLeafMask(material: THREE.Material, texture: THREE.DataTexture) {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.uFloorLeafSurface = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLeafDetail; varying vec3 vFloorLeafDetail;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorLeafDetail = aLeafDetail;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorLeafDetail; uniform sampler2D uFloorLeafSurface;')
      .replace('#include <alphatest_fragment>', `
        if (vFloorLeafDetail.z > 0.5 && texture2D(uFloorLeafSurface, vFloorLeafDetail.xy).a < 0.35) discard;
        #include <alphatest_fragment>`);
  };
  material.customProgramCacheKey = function() { return `${key.call(this)}|tervain-floor-leaf-mask-v1`; };
}

/** Wind and trampling for the floor's plants (after the leaf mask, which declares their leaf weights). */
function installFloorPlantWind(material: THREE.Material, foliage: FoliageField) {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    patchFloorPlantVertex(shader, foliage);
  };
  material.customProgramCacheKey = function() { return `${key.call(this)}|tervain-floor-plant-wind-v6-shake-matrix1-mover-members1`; };
}

function installFloorLeafSurface(material: THREE.MeshStandardMaterial, texture: THREE.DataTexture) {
  installFloorLeafMask(material, texture);
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 floorLeafUV = vFloorLeafDetail.xy;
        float floorAcross = abs(floorLeafUV.x - 0.5) * 2.0;
        float floorVein = 1.0 - smoothstep(0.018, 0.065, floorAcross);
        float floorSides = (1.0 - smoothstep(0.04, 0.13, abs(sin(floorLeafUV.y * 25.0 + floorAcross * 9.0))))
          * smoothstep(0.07, 0.25, floorAcross) * (1.0 - smoothstep(0.65, 1.0, floorAcross));
        float floorDetail = 1.0 - smoothstep(0.09, 0.2, max(length(dFdx(floorLeafUV)), length(dFdy(floorLeafUV))));
        float floorPaper = sin(dot(floorLeafUV, vec2(43.0, 71.0))) * sin(dot(floorLeafUV, vec2(-67.0, 31.0))) * 0.025;
        float floorPaint = 0.96 + floorVein * 0.055 + floorSides * 0.05 + floorPaper;
        vec3 floorTissue = texture2D(uFloorLeafSurface, floorLeafUV).rgb;
        diffuseColor.rgb *= mix(vec3(1.0), floorTissue * floorPaint, vFloorLeafDetail.z);
        float floorDryTip = smoothstep(0.88, 1.0, floorLeafUV.y) * vFloorLeafDetail.z;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.04, 1.01, 0.93), floorDryTip);
      `);
  };
  material.customProgramCacheKey = () => 'tervain-floor-leaf-surface-v2';
}

/** Upload only rewritten visible slots; an empty batch has no GPU work. */
function uploadFloorPrefix(attribute: THREE.BufferAttribute | null, count: number) {
  if (!attribute || count === 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

/** Native forest detail shares flora ownership and disposal. No collider is needed for these low, nonblocking pieces. */
export function buildForestFloor(terrain: Terrain, exclusions: Exclusions, quality: Quality, trees?: readonly FloraTree[], crowns?: PlantedCrownField, foliage?: FoliageField): SceneModule {
  const population = createForestFloorPopulation(terrain, exclusions, trees, crowns);
  const pieces = selectForestFloorPopulation(population, quality);
  const group = new THREE.Group();
  group.name = 'deepwood_forest_floor';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.35 });
  const leafSurface = buildForestLeafTexture();
  installFloorLeafSurface(material, leafSurface);
  if (foliage) installFloorPlantWind(material, foliage);
  // Bark textures are shared with the tree module and released by flora's texture owner after this module disposes.
  const bark = barkTextures('dead');
  const logMaterial = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, vertexColors: true, roughness: 1, metalness: 0 });
  const batches = new Map<string, ForestFloorPiece[]>();
  for (const p of pieces) {
    const key = `${p.kind}:${p.variant}`;
    const batch = batches.get(key) ?? [];
    batch.push(p);
    batches.set(key, batch);
  }
  const owned: { geometry: THREE.BufferGeometry; mesh: THREE.InstancedMesh; pieces: ForestFloorPiece[]; transforms: THREE.Matrix4[]; bounds: THREE.Sphere[]; visibility: InstanceDistanceVisibility; packed: number[] }[] = [];
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), yaw = new THREE.Quaternion(), col = new THREE.Color();
  for (const [key, batch] of batches) {
    const first = batch[0]!;
    const geometry = floorGeometry(first.kind, first.variant);
    if (!geometry.hasAttribute('aLeafDetail')) geometry.setAttribute('aLeafDetail', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3));
    const mesh = new THREE.InstancedMesh(geometry, first.kind === 'log' ? logMaterial : material, batch.length);
    mesh.name = `forest_floor_${key}`;
    // Placements live in instanceMatrix; wind moves vertices in the shader. The batch's local transform is static.
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.castShadow = quality === 'high' && first.kind === 'fern';
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.setColorAt(0, col.setScalar(1));
    const transforms: THREE.Matrix4[] = [], bounds: THREE.Sphere[] = [];
    for (const p of batch) {
      position.set(p.x, p.y, p.z);
      normal.set(p.nx, 1, p.nz).normalize();
      rotation.setFromUnitVectors(up, normal).multiply(yaw.setFromAxisAngle(up, p.yaw));
      scale.setScalar(p.scale);
      matrix.compose(position, rotation, scale);
      transforms.push(matrix.clone());
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const bound = geometry.boundingSphere!.clone().applyMatrix4(matrix);
      bound.radius += 2; // Retain detail just outside the view, so turning does not reveal a stale cull.
      bounds.push(bound);
    }
    const visibility = attachInstanceDistanceVisibility(mesh);
    if (first.kind !== 'log') {
      installFloorLeafMask(mesh.customDepthMaterial!, leafSurface);
      installFloorLeafMask(mesh.customDistanceMaterial!, leafSurface);
      // Shadows move with the fronds.
      if (foliage) { installFloorPlantWind(mesh.customDepthMaterial!, foliage); installFloorPlantWind(mesh.customDistanceMaterial!, foliage); }
    }
    owned.push({ geometry, mesh, pieces: batch, transforms, bounds, visibility, packed: [] });
    group.add(mesh);
  }
  let disposed = false, visible = 0, sinceRefresh = 1, lastShadowPresent = false;
  const lastCamera = new THREE.Vector3(1e9, 0, 0);
  const lastRotation = new THREE.Quaternion();
  const lastProjection = new THREE.Matrix4();
  const lastShadowFrustum = new THREE.Frustum(), shadowPlaneNormalDelta = new THREE.Vector3();
  const hasCasters = owned.some((b) => b.mesh.castShadow);
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  const fade = FOREST_FLOOR_DISTANCE[quality];
  const coverageAt = createPlanarDistanceFade(fade.start, fade.end);
  return {
    group,
    update(dt, f) {
      if (disposed) return;
      sinceRefresh += dt;
      // Distance coverage and view-edge culling follow every moving frame. Stationary scenes keep their uploads.
      const cameraChanged = f.camera.position.distanceToSquared(lastCamera) >= 1e-12 || Math.abs(f.camera.quaternion.dot(lastRotation)) <= 0.9999999999 || !f.camera.projectionMatrix.equals(lastProjection);
      const shadowPresent = hasCasters && !!f.shadowFrustum;
      const shadowChanged = shadowPresent !== lastShadowPresent || (shadowPresent && !f.shadowFrustum!.planes.every((plane, i) => plane.equals(lastShadowFrustum.planes[i]!)));
      const shadowGuardExceeded = shadowPresent && lastShadowPresent && f.shadowFrustum!.planes.some((plane, i) => {
        const previous = lastShadowFrustum.planes[i]!;
        return Math.abs(plane.constant - previous.constant) + 600 * shadowPlaneNormalDelta.copy(plane.normal).sub(previous.normal).length() > 1;
      });
      // The same two-metre guard used by tree casters lets ordinary sun drift refresh at most five times
      // per second. Large hour/focus changes and shadow enable/disable changes are immediate.
      if (!cameraChanged && (!shadowChanged || (!shadowGuardExceeded && shadowPresent === lastShadowPresent && sinceRefresh < 0.2))) return;
      sinceRefresh = 0;
      lastCamera.copy(f.camera.position);
      lastRotation.copy(f.camera.quaternion);
      lastProjection.copy(f.camera.projectionMatrix);
      lastShadowPresent = shadowPresent;
      if (f.shadowFrustum) lastShadowFrustum.copy(f.shadowFrustum);
      f.camera.updateMatrixWorld();
      pv.multiplyMatrices(f.camera.projectionMatrix, f.camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pv);
      visible = 0;
      for (const b of owned) {
        let count = 0, staticChanged = false, coverageChanged = false;
        for (let i = 0; i < b.pieces.length; i++) {
          const p = b.pieces[i]!;
          const coverage = coverageAt(p.x - f.camera.position.x, p.z - f.camera.position.z);
          if (coverage <= 0) continue;
          const sphere = b.bounds[i]!;
          if (!frustum.intersectsSphere(sphere) && !(b.mesh.castShadow && f.shadowFrustum?.intersectsSphere(sphere))) continue;
          // These fields depend only on the patch occupying this packed slot, not the camera or fade.
          if (b.packed[count] !== i) {
            b.mesh.setMatrixAt(count, b.transforms[i]!);
            b.mesh.setColorAt(count, col.setScalar(0.85 + p.rank * 0.23));
            staticChanged = true;
          }
          b.packed[count] = i;
          // Compare the stored Float32 value, rather than a higher-precision value that rounds to the same bits.
          if (b.visibility.coverage.getX(count) !== 0 || b.visibility.coverage.getY(count) !== Math.fround(coverage)) {
            b.visibility.coverage.setXY(count, 0, coverage);
            coverageChanged = true;
          }
          count++;
        }
        const previousCount = b.mesh.count;
        b.mesh.count = count;
        // Zero-instance draws still run Three's material/uniform setup unless the batch leaves the render list.
        b.mesh.visible = count > 0;
        b.packed.length = count;
        if (staticChanged) {
          uploadFloorPrefix(b.mesh.instanceMatrix, count);
          uploadFloorPrefix(b.mesh.instanceColor, count);
        }
        // A catch-up step can truncate a pending upload. Regrowth must resend the exposed tail,
        // even when its cached CPU coverage already matches and does not dirty itself again.
        if (coverageChanged || count > previousCount) uploadFloorPrefix(b.visibility.coverage, count);
        visible += count;
      }
    },
    stats: () => ({ forestFloorPieces: pieces.length, forestFloorDrawn: visible }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { geometry, mesh, visibility } of owned) { visibility.dispose(); mesh.dispose(); geometry.dispose(); }
      material.dispose();
      leafSurface.dispose();
      logMaterial.dispose();
      group.clear();
    },
  };
}
