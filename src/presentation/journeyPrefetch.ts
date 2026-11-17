import { loadBakedTextures } from './bakedTextures';
import type { Quality } from './context';
import { loadFurniture } from './furniture';
import { warmContentCache } from './assets/download';
import { modelAssetUrl } from './assets/modelUrl';
import { HERO_PINE_FILES, heroPineEnabled } from './heroPine';
import { loadMeshyTrees, MESHY_TREE_LODS, meshyTreeModelPath } from './meshyTrees';
import { forestTreeIds } from './forestPlanting';
import { loadSolitaryPine, PINE_FILES } from './solitaryPine';
import { loadSourceRockPile, ROCK_PILE_FILE } from './sourceRockPile';
import { MAIN_HERO_FILE } from './assets/heroFile';
import { prefetchTerrainTextureData, TERRAIN_TEXTURE_SIZE } from './terrainTextures';

/**
 * Start everything the first world needs as soon as a journey begins (A68). Called after the wanderer and the residents
 * have asked for their models, so those keep the first of the shared load slots; the world's models and surfaces queue
 * behind them, and a worker makes the ground's pixels meanwhile. The network then never waits while the residents are
 * prepared, and the ground is ready when the build reaches it. Each loader keeps its request, so the world build takes
 * these up where they are; a failure here is reported by the world build, which asks again. The animals are not
 * prefetched: they arrive after the world opens (A70), and neither is the furniture when the world defers it.
 */
export function prefetchJourney(quality: Quality, options: { deferFurniture?: boolean } = {}) {
  const quiet = (request: Promise<unknown>) => { void request.catch(() => {}); };
  prefetchTerrainTextureData(TERRAIN_TEXTURE_SIZE[quality]);
  quiet(loadMeshyTrees(forestTreeIds()));
  quiet(loadSolitaryPine());
  quiet(loadSourceRockPile());
  if (!options.deferFurniture) quiet(loadFurniture());
  quiet(loadBakedTextures(quality));
}

/**
 * The largest files a journey downloads before its world opens, in the order it needs them (A86): the wanderer, every
 * tree the forest loads (near files first), the conifers and the rock pile. The trees are the ones the world asks for
 * (forestTreeIds): by default the models the core's planted forest is drawn with, the generated families among them, with
 * the generated pines; a journey planted afresh needs every supplied model as well. The list named the supplied trees
 * alone until 17 November 2026, so the generated ones, 18 MiB, were downloaded only once a journey had begun.
 */
export const JOURNEY_MODEL_FILES: readonly string[] = [
  MAIN_HERO_FILE,
  ...MESHY_TREE_LODS.flatMap((lod) => forestTreeIds().map((id) => meshyTreeModelPath(id, lod))),
  ...PINE_FILES.map((file) => `flora/${file}`),
  ...(heroPineEnabled() ? HERO_PINE_FILES.map((file) => `flora/${file}`) : []),
  `scenery/${ROCK_PILE_FILE}`,
];

/**
 * While the title menu is idle, fetch the journey's largest files into the content cache (A86). Before this they were
 * asked for only once a journey began: on a 20 Mbit/s link the forest alone took 20 s of the 36 s from New journey to the
 * world. Nothing is parsed, so the menu keeps its frame rate; a journey begun meanwhile takes up a file in flight, and
 * the rest are left to it. Not done when the browser asks to save data.
 */
export function warmJourney(stop: () => boolean): Promise<number> {
  const saveData = typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  if (saveData) return Promise.resolve(0);
  return warmContentCache(JOURNEY_MODEL_FILES, (model) => modelAssetUrl(model), stop);
}
