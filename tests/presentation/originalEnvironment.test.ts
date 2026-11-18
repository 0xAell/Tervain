import { describe, expect, it } from 'vitest';
import { activeMeshyTreeIds, MESHY_TREE_LODS, meshyTreeModelPath } from '../../src/presentation/meshyTrees';
import { PINE_FILES } from '../../src/presentation/solitaryPine';
import { readGlb } from './glbFixture';

describe('Tervain’s playable woodland collection', () => {
  it('resolves every historic planting key, including the optional planting modes, to a project-authored model', () => {
    const models = new Set(activeMeshyTreeIds().flatMap(id => MESHY_TREE_LODS.map(level => meshyTreeModelPath(id, level))));
    for (const path of models) {
      expect(path).toMatch(/^flora\/(hero|craft)\//);
      const source = readGlb(path).json;
      expect(source.asset.generator, path).toMatch(/^(Tervain|gltfpack)/);
      if (path.startsWith('flora/hero/')) expect(source.asset.extras.tervainHeroTree?.generator, path).toBe('tools/tree-gen');
      else expect(source.asset.generator).toBe('Tervain tools/craft-environment/build.mjs');
    }
  });

  it('ships articulated wood and folded foliage at every level, with self-contained near textures and reducing budgets', () => {
    const families = ['silver-fir', 'date-palm', 'fan-palm', 'wind-palm', 'shore-pine'];
    expect(PINE_FILES).toEqual(MESHY_TREE_LODS.map(level => 'craft/shore-pine-' + level + '.glb'));
    for (const family of families) {
      let previous = 20_000;
      for (const level of MESHY_TREE_LODS) {
        const { json } = readGlb(`flora/craft/${family}-${level}.glb`);
        expect(json.meshes.map((m: {name: string}) => m.name)).toEqual(['Trunk_Wood', 'Crown_Foliage']);
        let triangles = 0;
        for (const mesh of json.meshes) {
          const part = mesh.primitives[0], pos = json.accessors[part.attributes.POSITION];
          for (const k of [0,1,2]) expect(pos.max[k] - pos.min[k], family).toBeGreaterThan(.2);
          expect(json.accessors[part.attributes.NORMAL].count).toBe(pos.count);
          expect(json.accessors[part.attributes.COLOR_0].count).toBe(pos.count);
          if (mesh.name === 'Crown_Foliage') expect(part.extras.tervainVertexAlbedo).toBe(true);
          triangles += json.accessors[part.indices].count / 3;
        }
        expect(triangles, family + level).toBeLessThan(previous); previous = triangles;
        if (level === 'near' || family === 'shore-pine') {
          expect(json.images).toHaveLength(2);
          for (const image of json.images) { expect(image.bufferView).toBeTypeOf('number'); expect(image.uri).toBeUndefined(); }
        } else expect(json.asset.extras.tervainSharedImages).toBe(family + '-near.glb');
      }
    }
  });
});
