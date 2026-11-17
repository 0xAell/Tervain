import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fitHeroFingers } from '../../src/presentation/hero/fingerFit';
import { packGlb, parseGlb, readGlb } from './glbFixture';

/** Decode the delivered rig/geometry/curves in Node. Rendering/texture pixels require the browser visual gate. */
export async function loadHeroWithoutImages(): Promise<GLTF> {
  const glb = readGlb('hero/weathered-wanderer-hero-sealed.glb'), json = glb.json;
  // Texture decoding needs browser ImageBitmap. Remove only image/material references in this test copy,
  // preserving every authored vertex, joint, inverse bind and animation sample from the actual game binary.
  json.materials = (json.materials ?? []).map(() => ({ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 } }));
  delete json.textures; delete json.images; delete json.samplers;
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((name: string) => name !== 'EXT_texture_webp');
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((name: string) => name !== 'EXT_texture_webp');
  const asset = await parseGlb(packGlb(glb, json));
  // As the game loads it: finger joints seated in the fingers (A75).
  fitHeroFingers(asset);
  return asset;
}

export function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((object) => { if ((object as THREE.Mesh).isMesh) result.push(object as THREE.Mesh); });
  return result;
}
