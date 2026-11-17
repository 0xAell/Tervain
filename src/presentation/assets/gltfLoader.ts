import { GLTFLoader, type GLTF, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * A GLTFLoader for the models under public/models. Their geometry is EXT_meshopt_compression (lossless, written by
 * tools/optimise-models.mjs), so every loader needs the meshopt decoder that three ships. The game parses through
 * parseModel and loadModel below; a loader of its own is for tests and tools that register plugins on it.
 */
export function createGltfLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

/** What the game reads of a model's parser once the model is built: the file's JSON, and which glTF entry each
 * material, texture, mesh or node came from. */
export type ModelParser = Pick<GLTFParser, 'json' | 'associations'>;

/** A model as the game keeps it: three's result, with the parser cut down to what is read after loading. */
export type ModelGltf = Omit<GLTF, 'parser'> & { parser: ModelParser };

/**
 * The parser holds the whole file (a GLB's binary chunk) and every buffer view, accessor and image it decoded, and the
 * caches that keep models for the life of the page (the residents', the animals', the trees', the hero's) kept their
 * parsers with them: at a settled journey that was 156 MB of the page's 810 MB of array buffers. The geometry and the
 * textures are the model's own and stay with it. The result is cut down where it stands: it has just come from the
 * loader, and nothing else holds it yet.
 */
function release(gltf: GLTF): ModelGltf {
  const { json, associations } = gltf.parser, model: ModelGltf = gltf;
  model.parser = { json, associations };
  return model;
}

/** Parses a model the game keeps (see release). `path` resolves the model's relative URIs. */
export async function parseModel(data: ArrayBuffer, path: string): Promise<ModelGltf> {
  return release(await createGltfLoader().parseAsync(data, path));
}

/** Loads a model by URL, as parseModel parses one. */
export async function loadModel(url: string): Promise<ModelGltf> {
  return release(await createGltfLoader().loadAsync(url));
}
