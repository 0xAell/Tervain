import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MESHY_TREE_IDS, MESHY_TREE_LODS, meshyTreeModelPath, type MeshyTreeTemplates } from '../../src/presentation/meshyTrees';
import { packGlb, parseGlb, readGlb, withoutTextures } from './glbFixture';

export function meshyTreeBinary(file: string) {
  return readGlb(`flora/meshy-012/${file}`);
}

/** A tree model under public/models (`flora/hero/hero-oak-near.glb`), image-free.
 * Retain every delivered vertex/index/normal/UV/extras and source PBR factors.
 * Texture pixels and GPU appearance have their own actual-file/native acceptance gates. */
async function treeTemplate(path: string): Promise<GLTF> {
  const glb = readGlb(path);
  return parseGlb(packGlb(glb, withoutTextures(glb.json)));
}

/** A supplied tree's file under flora/meshy-012, image-free. */
export function meshyTreeTemplate(file: string): Promise<GLTF> {
  return treeTemplate(`flora/meshy-012/${file}`);
}

const cache = new Map<string, Promise<readonly [GLTF, GLTF, GLTF]>>();
/** Each tree's three levels, read from where the game reads them (meshyTreeModelPath: a generated tree's under flora/hero).
 * Reuse immutable parsed templates within a test module; production worlds own only clones. */
export async function meshyTreeTemplates(ids: readonly string[] = MESHY_TREE_IDS): Promise<MeshyTreeTemplates> {
  const result = new Map<string, readonly [GLTF, GLTF, GLTF]>();
  for (const id of ids) {
    let pending = cache.get(id);
    if (!pending) {
      pending = Promise.all(MESHY_TREE_LODS.map(lod => treeTemplate(meshyTreeModelPath(id, lod))))
        .then(models => models as unknown as readonly [GLTF, GLTF, GLTF]);
      cache.set(id, pending);
    }
    result.set(id, await pending);
  }
  return result;
}
