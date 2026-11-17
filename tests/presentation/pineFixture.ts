import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HERO_PINE_FILES, type HeroPineTemplates } from '../../src/presentation/heroPine';
import { PINE_FILES, type PineTemplates } from '../../src/presentation/solitaryPine';
import { packGlb, parseGlb, readGlb } from './glbFixture';

export function pineBinary(file: string) {
  return readGlb(`flora/${file}`);
}

async function withoutImages(file: string): Promise<GLTF> {
  const glb = pineBinary(file), json = glb.json;
  // Keep every delivered vertex/index/UV and the MASK/PBR material semantics; image pixels have a browser gate.
  json.materials = json.materials.map((material: { alphaMode?: string; alphaCutoff?: number; doubleSided?: boolean }) => ({
    alphaMode: material.alphaMode, alphaCutoff: material.alphaCutoff, doubleSided: material.doubleSided,
    pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.9 },
  }));
  delete json.textures; delete json.images; delete json.samplers;
  delete json.extensionsUsed; delete json.extensionsRequired;
  return parseGlb(packGlb(glb, json));
}

export async function pineTemplates(): Promise<PineTemplates> {
  return await Promise.all(PINE_FILES.map(withoutImages)) as unknown as PineTemplates;
}

/** The generated hero pines (heroPine.ts), which draw species 'pine' by default, without their images like the pine's above. */
export async function heroPineFixtureTemplates(): Promise<HeroPineTemplates> {
  return await Promise.all(HERO_PINE_FILES.map(withoutImages)) as unknown as HeroPineTemplates;
}
