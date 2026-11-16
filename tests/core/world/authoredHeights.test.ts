import { describe, expect, it } from 'vitest';
import { authoredBounds, authoredHeight, buildingSolidHeight, buildStaticColliders } from '../../../src/core/world/colliders';
import { ARCHIVE_ROOM, BUILDINGS } from '../../../src/core/world/layout';
import { Terrain } from '../../../src/core/world/terrain';

// Every solid the core authors stands to a height of its own; what no mesh measured stands as the core says, in the
// gameplay world and in the physics module alike (physics/physics.ts asks authoredBounds for a shape without bounds).

const terrain = new Terrain();

describe('authored heights', () => {
  it('gives every shape the core authors its vertical bounds', () => {
    const colliders = buildStaticColliders(terrain);
    for (const shape of colliders.all) {
      expect(shape.minY, shape.id).toBeDefined();
      expect(shape.maxY!, shape.id).toBeGreaterThan(shape.minY!);
    }
  });

  it('stands a building to its walls and the bulk of its roof, and the rest by what it is', () => {
    for (const building of BUILDINGS) {
      expect(authoredHeight(`b:${building.id}`)).toBeCloseTo(building.h + Math.min(building.w, building.d) * 0.65 + 0.5, 12);
      expect(buildingSolidHeight(building)).toBe(authoredHeight(`b:${building.id}`));
    }
    expect(authoredHeight('bell_tower')).toBe(8.5);
    expect(authoredHeight('well')).toBe(1.15);
    expect(authoredHeight('archive_shutter')).toBe(ARCHIVE_ROOM.shutterTop);
    expect(authoredHeight('a shape nothing names')).toBe(2.2);
  });

  it('bounds a shape from 0.4 m under its ground to its height above it', () => {
    const shape = { id: 'well', x: 12, z: -40 }, ground = terrain.heightAt(12, -40);
    expect(authoredBounds(shape, terrain)).toEqual({ minY: ground - 0.4, maxY: ground + 1.15 });
  });
});
