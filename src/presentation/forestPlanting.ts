import { PLANTED_DRAWS, PLANTED_WITH } from '../core/world/plantedForest.models';
import { heroPineEnabled } from './heroPine';
import { LEAF_ATLAS_DEFAULT } from './leafAtlas';
import { activeMeshyTreeIds, heroBirchEnabled, heroBushEnabled, heroOakEnabled, heroOrchardEnabled, heroSentinelEnabled, HERO_TREE_IDS } from './meshyTrees';

const currentSearch = () => (typeof location === 'undefined' ? '' : location.search);
/** Developer aids that plant or build trees otherwise (flora.ts, meshyTrees.ts): a forest planted under one is planted afresh. */
const DEVELOPER_FLAGS = ['heronotrim', 'heronotwigs', 'lineup', 'treelab'] as const;

/** Every tree model a forest may be planted or drawn with under these flags: the supplied ones and the generated ones on. */
function activeTrees(search: string): readonly string[] {
  return activeMeshyTreeIds(heroOakEnabled(search), heroBirchEnabled(search), heroBushEnabled(search), heroOrchardEnabled(search), heroSentinelEnabled(search));
}

/**
 * What a forest is planted with: the generated pines or the supplied pine, the generated trees that replace supplied
 * ones, the leaf atlas, and the developer aids that plant or build trees otherwise. The core keeps the forest planted with
 * the web build's defaults (PLANTED_WITH, written by tests/presentation/plantedForest.test.ts).
 */
export function forestPlantingKey(heroPines: boolean, search = currentSearch()): string {
  let flags: URLSearchParams;
  try { flags = new URLSearchParams(search); } catch { flags = new URLSearchParams(); }
  const atlas = flags.get('leafatlas'), leafAtlas = atlas === '1' ? true : atlas === '0' ? false : LEAF_ATLAS_DEFAULT;
  const generated = activeTrees(search).filter((id) => (HERO_TREE_IDS as readonly string[]).includes(id));
  return [heroPines ? 'generated pines' : 'supplied pines', `generated trees ${generated.join(' ') || 'none'}`, ...(leafAtlas ? ['leaf atlas'] : []),
    ...DEVELOPER_FLAGS.filter((flag) => flags.has(flag))].join('; ');
}

/** Whether a forest planted with these flags takes the core's planting (PLANTED_FLORA) rather than planting afresh. */
export function takesPlantedForest(heroPines: boolean, search = currentSearch()): boolean {
  return forestPlantingKey(heroPines, search) === PLANTED_WITH;
}

/**
 * The tree models a journey loads. One that takes the core's planting needs only the models its trees are drawn with
 * (PLANTED_DRAWS); one planted afresh needs every supplied model as well, to measure where each tree would stand.
 */
export function forestTreeIds(search = currentSearch()): readonly string[] {
  return takesPlantedForest(heroPineEnabled(search), search) ? PLANTED_DRAWS : activeTrees(search);
}
