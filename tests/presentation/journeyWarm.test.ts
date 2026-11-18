import { describe, expect, it } from 'vitest';
import { MODEL_FILES } from '../../src/presentation/assets/modelFiles';
import { HERO_PINE_FILES, heroPineEnabled } from '../../src/presentation/heroPine';
import { JOURNEY_MODEL_FILES } from '../../src/presentation/journeyPrefetch';
import { forestTreeIds } from '../../src/presentation/forestPlanting';
import { MESHY_TREE_LODS, meshyTreeModelPath } from '../../src/presentation/meshyTrees';

describe('the journey files fetched ahead from the menu (A86)', () => {
  it('names only shipped model files, each once: the woodland near files before their mid or far levels', () => {
    expect(JOURNEY_MODEL_FILES.length).toBeGreaterThan(40);
    expect(new Set(JOURNEY_MODEL_FILES).size).toBe(JOURNEY_MODEL_FILES.length);
    for (const file of JOURNEY_MODEL_FILES) expect(MODEL_FILES[file], file).toBeDefined();
    expect(JOURNEY_MODEL_FILES.some(file => file.startsWith('hero/'))).toBe(false);
    const trees = JOURNEY_MODEL_FILES.filter((file) => forestTreeIds().some(id => MESHY_TREE_LODS.some(lod => file === meshyTreeModelPath(id, lod))));
    const lastNear = trees.map((file) => file.endsWith('-near.glb')).lastIndexOf(true);
    const firstOther = trees.findIndex((file) => !file.endsWith('-near.glb'));
    expect(lastNear).toBeLessThan(firstOther);
  });

  it('names every tree file the forest loads, the generated families and pines included', () => {
    // The same files the world asks for with the game's default flags (forestTreeIds, loadHeroPine). The generated
    // families replaced supplied trees after the list was written, and were downloaded only once a journey began (18 MiB).
    const trees = MESHY_TREE_LODS.flatMap((lod) => forestTreeIds().map((id) => meshyTreeModelPath(id, lod)));
    expect(trees.some((file) => file.startsWith('flora/hero/'))).toBe(true);
    expect(JOURNEY_MODEL_FILES).toEqual(expect.arrayContaining(trees));
    if (heroPineEnabled()) expect(JOURNEY_MODEL_FILES).toEqual(expect.arrayContaining(HERO_PINE_FILES.map((file) => `flora/${file}`)));
  });
});
