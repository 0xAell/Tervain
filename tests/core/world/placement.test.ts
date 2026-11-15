import { beforeAll, describe, expect, it } from 'vitest';
import { Colliders } from '../../../src/core/world/colliders';
import { DETAIL_KEEP, type Detail } from '../../../src/core/world/detail';
import { Exclusions } from '../../../src/core/world/exclusions';
import { createFloraPopulation, type FloraTree } from '../../../src/core/world/flora';
import { createForestFloorPopulation, FOREST_FLOOR_DISTANCE, selectForestFloorPopulation, type ForestFloorPiece } from '../../../src/core/world/forestFloor';
import { Habitat, hash3, newSample, waterDistance, woodlandColonyAt } from '../../../src/core/world/habitat';
import { PLACES, STREAMS } from '../../../src/core/world/layout';
import {
  createShoreDetailPopulation, placeScatter, registerScatterColliders, ROCK_SHAPE_COUNT, selectScatterPopulation, type RockShapes, type ScatterRock,
} from '../../../src/core/world/scatter';
import { Terrain } from '../../../src/core/world/terrain';

// Where stones lie, what grows on the woodland floor and where grass may grow are rules of the world, not of a
// renderer: they run here on the core alone. A stone's own shape is the one thing placement asks of whoever draws it;
// these tests stand a flat-bottomed stone in for it.

const FLAT: RockShapes = {
  groundedY: (rock, heightAt, burial) => heightAt(rock.x, rock.z) - burial,
  contact: (rock, id) => ({ id, bounds: { minX: rock.x - rock.size, maxX: rock.x + rock.size, minY: rock.y, maxY: rock.y + rock.size, minZ: rock.z - rock.size, maxZ: rock.z + rock.size } }) as never,
};
const LEVELS: Detail[] = ['low', 'medium', 'high'];

let terrain: Terrain, exclusions: Exclusions, trees: FloraTree[], rocks: ScatterRock[], floor: ForestFloorPiece[];
beforeAll(() => {
  terrain = new Terrain(); exclusions = new Exclusions(terrain); trees = createFloraPopulation(terrain, exclusions);
  rocks = placeScatter(terrain, exclusions, trees, FLAT); floor = createForestFloorPopulation(terrain, exclusions, trees);
}, 60000);

describe('the loose stone', () => {
  it('lies in the same places on every authoring pass, whatever shapes the stones are given', () => {
    const again = placeScatter(terrain, exclusions, trees, FLAT);
    expect(again.map((rock) => [rock.kind, rock.x, rock.z, rock.size, rock.shape])).toEqual(rocks.map((rock) => [rock.kind, rock.x, rock.z, rock.size, rock.shape]));
    // Another renderer's stones rest at other heights, in the same places.
    const tall = placeScatter(terrain, exclusions, trees, { ...FLAT, groundedY: (rock, heightAt) => heightAt(rock.x, rock.z) + 5 });
    expect(tall.map((rock) => [rock.kind, rock.x, rock.z, rock.size])).toEqual(rocks.map((rock) => [rock.kind, rock.x, rock.z, rock.size]));
    expect(tall.some((rock, index) => rock.y !== rocks[index]!.y)).toBe(true);
  });

  it('has every kind, a shape among those there are, and solid stones only where a body would meet them', () => {
    const kinds = new Set(rocks.map((rock) => rock.kind));
    for (const kind of ['beach', 'surf', 'erratic', 'lighthouse', 'shelf'] as const) expect(kinds.has(kind), kind).toBe(true);
    expect(rocks.length).toBeGreaterThan(1000);
    for (const rock of rocks) {
      expect(rock.shape >= 0 && rock.shape < ROCK_SHAPE_COUNT && Number.isInteger(rock.shape), rock.kind).toBe(true);
      // Pebbles are never obstacles; an obstacle has an id and a radius in proportion to its size.
      if (rock.kind === 'beach') expect(rock.radius).toBe(0);
      expect(rock.collisionId === null).toBe(rock.radius === 0);
      if (rock.radius > 0) expect(rock.radius).toBeCloseTo(rock.size * 0.72, 9);
      expect(rock.contact !== undefined).toBe(rock.size >= 0.35);
    }
  });

  it('keeps clear of the ground kept clear and of the trees', () => {
    for (const rock of rocks.filter((entry) => entry.radius > 0)) {
      expect(exclusions.blocked(rock.x, rock.z, rock.radius + 0.55), `${rock.kind} at ${rock.x.toFixed(1)}, ${rock.z.toFixed(1)}`).toBe(false);
      for (const tree of trees) if (tree.radius > 0) expect(Math.hypot(rock.x - tree.x, rock.z - tree.z)).toBeGreaterThanOrEqual(rock.radius + tree.radius + 0.35);
    }
  });

  it('thins only stones that block nothing, by the detail table', () => {
    const counts = LEVELS.map((level) => selectScatterPopulation(rocks, level));
    for (const selection of counts) expect(selection.obstacles).toEqual(rocks.filter((rock) => rock.radius > 0));
    expect(counts[0]!.rocks.length).toBeLessThan(counts[1]!.rocks.length);
    expect(counts[1]!.rocks.length).toBeLessThan(counts[2]!.rocks.length);
    expect(counts[2]!.rocks).toEqual(rocks);
    for (const [index, level] of LEVELS.entries()) for (const rock of rocks) {
      const kept = counts[index]!.rocks.includes(rock);
      expect(kept).toBe(rock.contact !== undefined || rock.radius > 0 || rock.kind === 'stack' || rock.decorationRank < DETAIL_KEEP.stones[level]);
    }
  });

  it('registers each obstacle once, with its solid', () => {
    const circles: string[] = [], meshes: unknown[] = [];
    registerScatterColliders(rocks, { circle: (id: string) => { circles.push(id); }, registerRockMesh: (mesh: unknown) => { meshes.push(mesh); } } as never);
    expect(circles).toEqual(rocks.filter((rock) => rock.radius > 0).map((rock) => rock.collisionId));
    expect(new Set(circles).size).toBe(circles.length);
    expect(meshes).toHaveLength(rocks.filter((rock) => rock.contact).length);
  });

  it('lays driftwood low on the sand and scrub above it, apart from each other', () => {
    const shore = createShoreDetailPopulation(terrain, exclusions, trees);
    expect(shore.length).toBeGreaterThan(5);
    expect(createShoreDetailPopulation(terrain, exclusions, trees)).toEqual(shore);
    const reach = (detail: (typeof shore)[number]) => (detail.kind === 'driftwood' ? detail.scale * 0.65 + 0.2 : detail.scale * 0.9);
    for (const detail of shore) {
      expect(detail.y).toBeGreaterThanOrEqual(0.18);
      expect(detail.y).toBeLessThanOrEqual(detail.kind === 'driftwood' ? 3.2 : 11.5);
      for (const other of shore) if (other !== detail) expect(Math.hypot(detail.x - other.x, detail.z - other.z)).toBeGreaterThanOrEqual(Math.min(reach(detail), reach(other)));
    }
  });
});

describe('the woodland floor', () => {
  it('is authored once, the same every time, with every kind', () => {
    expect(createForestFloorPopulation(terrain, exclusions, trees)).toEqual(floor);
    const kinds = new Set(floor.map((piece) => piece.kind));
    for (const kind of ['fern', 'shrub', 'moss', 'litter', 'log', 'fungi'] as const) expect(kinds.has(kind), kind).toBe(true);
    expect(new Set(floor.map((piece) => piece.id)).size).toBe(floor.length);
    for (const piece of floor) expect(piece.rank >= 0 && piece.rank < 1 && piece.scale > 0 && Number.isFinite(piece.y), piece.id).toBe(true);
  });

  it('thins by the detail table and never keeps a fungus without its log', () => {
    const selections = LEVELS.map((level) => selectForestFloorPopulation(floor, level));
    expect(selections[2]).toEqual(floor);
    expect(selections[0]!.length).toBeLessThan(selections[1]!.length);
    expect(selections[1]!.length).toBeLessThan(selections[2]!.length);
    for (const [index, level] of LEVELS.entries()) {
      const kept = selections[index]!, ids = new Set(kept.map((piece) => piece.id));
      for (const piece of kept) {
        expect(piece.rank).toBeLessThan(DETAIL_KEEP.woodlandFloor[level]);
        if (piece.parentLogId) expect(ids.has(piece.parentLogId), piece.id).toBe(true);
      }
    }
  });

  it('fades out sooner at lower detail', () => {
    expect(FOREST_FLOOR_DISTANCE.low.end).toBeLessThan(FOREST_FLOOR_DISTANCE.medium.end);
    expect(FOREST_FLOOR_DISTANCE.medium.end).toBeLessThan(FOREST_FLOOR_DISTANCE.high.end);
    for (const level of LEVELS) expect(FOREST_FLOOR_DISTANCE[level].start).toBeLessThan(FOREST_FLOOR_DISTANCE[level].end);
  });
});

describe('where plants may grow', () => {
  it('reads open ground, wet margins and shade from the world, with nothing under a tree trunk or in a stream', () => {
    const colliders = new Colliders();
    const trunk = { x: PLACES.deepwood.x + 3, z: PLACES.deepwood.z + 2, r: 0.5 };
    colliders.circle('tree:test', trunk.x, trunk.z, trunk.r);
    const habitat = new Habitat({ terrain, colliders, excl: exclusions });
    expect(habitat.trees).toEqual([trunk]);
    const sample = newSample();
    // A fresh sample is open, dry-neutral ground until the habitat fills it in.
    expect(sample).toEqual({ open: 1, wet: 0, dry: 0, wood: 0, slope: 0 });
    // A stream's own bed is not free for plants, and its bank is wetter than ground well away from water.
    const stream = STREAMS[0]!, mid = stream.points[Math.floor(stream.points.length / 2)]!;
    expect(waterDistance(mid.x, mid.z)).toBeLessThan(0);
    const centre = new Float64Array(1);
    waterDistance(mid.x, mid.z, centre);
    expect(centre[0]).toBeLessThan(0.5);
    habitat.sample(mid.x, mid.z, sample);
    expect(sample.open).toBeLessThan(0.05);
    for (const key of ['open', 'wet', 'dry', 'wood'] as const) expect(sample[key] >= 0 && sample[key] <= 1, key).toBe(true);
    // The trunk itself is no place for a plant; open meadow a few metres from the hamlet's edge is.
    expect(habitat.hardBlocked(trunk.x, trunk.z)).toBe(true);
    expect(habitat.hardBlocked(trunk.x + 3, trunk.z + 3)).toBe(false);
    expect(habitat.treesNear(trunk.x, trunk.z, 2)).toEqual([trunk]);
  });

  it('hashes to a stable value in [0, 1) and grows the woodland floor in colonies', () => {
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3));
    expect(hash3(1, 2, 3)).not.toBe(hash3(3, 2, 1));
    for (let n = 0; n < 200; n++) { const value = hash3(n, n * 7, -n); expect(value >= 0 && value < 1).toBe(true); }
    let low = 1, high = 0;
    for (let x = -280; x < -120; x += 9) for (let z = -120; z < 120; z += 9) { const colony = woodlandColonyAt(x, z); low = Math.min(low, colony); high = Math.max(high, colony); expect(colony >= 0 && colony <= 1).toBe(true); }
    expect(high - low).toBeGreaterThan(0.4);
  });
});
