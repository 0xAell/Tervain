import { describe, expect, it } from 'vitest';
import { archiveSupports, buildingGround, buildingStepSurfacesAt, buildingTreads, onSupport, SUPPORT_FOOTING } from '../../../src/core/world/buildingEntries';
import { BUILDINGS } from '../../../src/core/world/layout';
import { Terrain } from '../../../src/core/world/terrain';

// The stones walkers stand on and cargo rests on are described once; the terrain and the physics both read them.
const terrain = new Terrain();
const heightAt = (x: number, z: number) => terrain.heightAt(x, z);
const toWorld = (b: { x: number; z: number; yaw: number }, lx: number, lz: number) =>
  ({ x: b.x + lx * Math.cos(b.yaw) + lz * Math.sin(b.yaw), z: b.z - lx * Math.sin(b.yaw) + lz * Math.cos(b.yaw) });

describe('the stones before the doors and in the archive', () => {
  it('are where a walker stands: the middle of each tread is a surface at its top', () => {
    const closed = BUILDINGS.filter((b) => b.kind !== 'archive');
    expect(closed.length).toBeGreaterThan(10);
    for (const b of closed) {
      const ground = buildingGround(heightAt, b);
      for (const tread of buildingTreads(b)) {
        const at = toWorld(b, tread.x, (tread.zMin + tread.zMax) / 2);
        expect(buildingStepSurfacesAt(at.x, at.z, heightAt).some((h) => Math.abs(h - (ground.avg + tread.top)) < 1e-9), b.id).toBe(true);
        expect(onSupport(tread, tread.x + tread.halfX + 0.01, (tread.zMin + tread.zMax) / 2)).toBe(false);
      }
    }
  });

  it('are what the archive stands a walker on: its rear sill, its door sill and its floor', () => {
    const archive = BUILDINGS.find((b) => b.kind === 'archive')!;
    const base = terrain.heightAt(archive.x, archive.z);
    const [sill, door, floor] = archiveSupports(archive);
    for (const support of [sill!, door!, floor!]) {
      const at = toWorld(archive, support.x, (support.zMin + support.zMax) / 2);
      expect(terrain.groundAt(at.x, at.z)).toBeCloseTo(Math.max(terrain.heightAt(at.x, at.z), base + support.top), 9);
    }
    // The sill is the forced entry's stone, higher than the floor; the floor runs between the walls to the door's sill.
    expect(sill!.top).toBeGreaterThan(floor!.top);
    expect(door!.zMin).toBe(floor!.zMax);
    expect(SUPPORT_FOOTING).toBeGreaterThan(0);
  });
});
