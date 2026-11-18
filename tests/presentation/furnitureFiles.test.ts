import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FURNITURE_TRIANGLE_LIMIT, type FurnitureManifest } from '../../src/presentation/furniture';
import { FURNITURE_SIZES } from '../../src/core/world/furnitureSizes';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const manifest = JSON.parse(read('public/models/craft/furniture/manifest.json').toString('utf8')) as FurnitureManifest;
const glb = (bytes: Buffer) => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));

describe('the prepared furniture (A66)', () => {
  it('ships every piece the rooms use, checked by size and hash, within its triangle budget', () => {
    expect(manifest.pieces.map((p) => p.id).sort()).toEqual(Object.keys(FURNITURE_SIZES).sort());
    for (const piece of manifest.pieces) {
      const bytes = read(`public/models/craft/furniture/${piece.file}`);
      expect(bytes.length, piece.id).toBe(piece.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), piece.id).toBe(piece.sha256);
      expect(piece.triangles, piece.id).toBeLessThanOrEqual(FURNITURE_TRIANGLE_LIMIT);
      const doc = glb(bytes);
      expect(doc.meshes, piece.id).toHaveLength(1);
      const indices = doc.accessors[doc.meshes[0].primitives[0].indices];
      expect(indices.count / 3, piece.id).toBe(piece.triangles);
      // Stood on the floor, centred on its footprint, the size the colliders use.
      const position = doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION];
      expect(position.min[1], piece.id).toBeCloseTo(0, 4);
      expect((position.min[0] + position.max[0]) / 2, piece.id).toBeCloseTo(0, 3);
      expect((position.min[2] + position.max[2]) / 2, piece.id).toBeCloseTo(0, 3);
      const size = FURNITURE_SIZES[piece.id as keyof typeof FURNITURE_SIZES];
      for (let axis = 0; axis < 3; axis++) expect(position.max[axis] - position.min[axis], `${piece.id} ${axis}`).toBeCloseTo(size[axis]!, 3);
      expect(doc.images, piece.id).toHaveLength(1);
      expect(doc.asset.generator).toBe('Tervain tools/craft-environment/build.mjs');
      const colors = doc.meshes[0].primitives[0].attributes.COLOR_0;
      expect(doc.accessors[colors].count, piece.id).toBe(position.count);

    }
  });

});
