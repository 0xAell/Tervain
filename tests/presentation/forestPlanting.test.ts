import { describe, expect, it } from 'vitest';
import { PLANTED_DRAWS } from '../../src/core/world/plantedForest';
import { forestTreeIds, takesPlantedForest } from '../../src/presentation/forestPlanting';
import { JOURNEY_MODEL_FILES } from '../../src/presentation/journeyPrefetch';
import { activeMeshyTreeIds, MESHY_TREE_LODS, meshyTreeModelPath } from '../../src/presentation/meshyTrees';

// A journey that takes the core's planted forest loads only the tree models its trees are drawn with. Planting afresh
// measures each tree by the supplied model a generated one replaces, so it needs every supplied model as well: seven of
// them, 15 MiB, were downloaded, parsed and kept by every journey after the planting had stopped needing them.

describe('the tree models a journey loads', () => {
  it('are the planted forest\'s own by default, and the warm-up fetches no other', () => {
    expect(takesPlantedForest(true, '')).toBe(true);
    expect(forestTreeIds('')).toEqual(PLANTED_DRAWS);
    const unused = activeMeshyTreeIds().filter((id) => !PLANTED_DRAWS.includes(id));
    expect(unused.length).toBeGreaterThan(0);
    const active = new Set(PLANTED_DRAWS.flatMap(id => MESHY_TREE_LODS.map(lod => meshyTreeModelPath(id, lod))));
    for (const id of unused) for (const lod of MESHY_TREE_LODS) {
      const file = meshyTreeModelPath(id, lod);
      expect(JOURNEY_MODEL_FILES.includes(file), id).toBe(active.has(file));
    }
  });

  it.each(['?herooak=0', '?herobirch=0', '?herosentinel=0', '?heropine=0', '?leafatlas=1', '?heronotrim=1', '?heronotwigs=1', '?lineup=0,0', '?treelab=oak'])(
    'are every model the planting may measure under %s', (search) => {
      expect(takesPlantedForest(new URLSearchParams(search).get('heropine') !== '0', search)).toBe(false);
      const ids = forestTreeIds(search);
      // The supplied trees the planting measures by are all there, whichever generated ones draw.
      for (const id of activeMeshyTreeIds(false)) expect(ids, id).toContain(id);
    });
});
