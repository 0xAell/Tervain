import { ROCK_PILE_FILE } from '../../src/presentation/sourceRockPile';
import { packGlb, parseGlb, readGlb } from './glbFixture';

export function rockPileBinary() {
  return readGlb(`scenery/${ROCK_PILE_FILE}`);
}

/** Decode every real runtime surface; embedded image/GPU acceptance belongs to native review. */
export async function rockPileTemplate() {
  const glb = rockPileBinary(), json = glb.json;
  json.materials = [{ name: json.materials[0].name, doubleSided: true, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }];
  delete json.textures; delete json.images; delete json.samplers;
  delete json.extensionsUsed; delete json.extensionsRequired;
  return parseGlb(packGlb(glb, json));
}
