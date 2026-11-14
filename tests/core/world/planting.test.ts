import { describe, expect, it } from 'vitest';
import { Exclusions, streamDistance } from '../../../src/core/world/exclusions';
import { createFloraPopulation, registerFloraColliders, SPECIES, type FloraTree } from '../../../src/core/world/flora';
import { Colliders } from '../../../src/core/world/colliders';
import { BUILDINGS, ROADS, SPAWN, SPRING_POOL, STRAND, STREAMS, WORLD } from '../../../src/core/world/layout';
import { Terrain } from '../../../src/core/world/terrain';

const terrain = new Terrain();
const exclusions = new Exclusions(terrain);
const population = createFloraPopulation(terrain, exclusions);

describe('ground that planting keeps clear', () => {
  it('covers every building, the roads, the landing and the strand', () => {
    for (const building of BUILDINGS) expect(exclusions.blocked(building.x, building.z)).toBe(true);
    for (const road of ROADS) for (const point of road.points) expect(exclusions.blocked(point.x, point.z)).toBe(true);
    expect(exclusions.blocked(SPAWN.x, SPAWN.z)).toBe(true);
    expect(exclusions.blocked(STRAND.x, STRAND.z)).toBe(true);
  });

  it('widens with padding', () => {
    const road = ROADS[0]!, point = road.points[0]!, next = road.points[1]!;
    const along = Math.hypot(next.x - point.x, next.z - point.z);
    // A point just beside the road's edge, square to its first leg.
    const side = { x: point.x + (next.x - point.x) / 2 - (next.z - point.z) / along * (road.width / 2 + 6), z: point.z + (next.z - point.z) / 2 + (next.x - point.x) / along * (road.width / 2 + 6) };
    if (!exclusions.blocked(side.x, side.z)) expect(exclusions.blocked(side.x, side.z, 8)).toBe(true);
  });

  it('measures the distance to the nearest stream or the spring pool', () => {
    const point = STREAMS[0]!.points[0]!;
    expect(streamDistance(point.x, point.z)).toBeLessThanOrEqual(0.001);
    expect(streamDistance(SPRING_POOL.x, SPRING_POOL.z)).toBeLessThanOrEqual(-SPRING_POOL.r + 0.001);
    expect(streamDistance(WORLD.minX, WORLD.minZ)).toBeGreaterThan(20);
  });
});

describe('where every tree stands', () => {
  it('plants the same forest every time', () => {
    const again = createFloraPopulation(new Terrain(), new Exclusions(terrain));
    expect(again).toHaveLength(population.length);
    const key = (tree: FloraTree) => `${tree.sp}:${tree.x.toFixed(3)}:${tree.z.toFixed(3)}:${tree.s.toFixed(4)}:${tree.yaw.toFixed(4)}`;
    expect(again.map(key)).toEqual(population.map(key));
  });

  it('plants over nine hundred trees and shrubs of the known species', () => {
    expect(population.length).toBeGreaterThan(900);
    expect(population.length).toBeLessThan(1100);
    const kinds = new Set(population.map((tree) => tree.sp));
    for (const species of kinds) expect(SPECIES).toContain(species);
    for (const species of ['oak', 'birch', 'pine', 'fir'] as const) expect(kinds.has(species)).toBe(true);
    for (const tree of population) {
      expect(Number.isFinite(tree.x) && Number.isFinite(tree.y) && Number.isFinite(tree.z)).toBe(true);
      expect(tree.s).toBeGreaterThan(0);
    }
  });

  it('gives every blocking trunk a stable collision id and registers it as an obstacle', () => {
    const obstacles = population.filter((tree) => tree.radius > 0);
    expect(obstacles.length).toBeGreaterThan(500);
    const ids = obstacles.map((tree) => tree.collisionId);
    expect(ids.every((id) => typeof id === 'string' && id.startsWith('tree:'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const colliders = new Colliders();
    registerFloraColliders(population, colliders);
    expect(colliders.all).toHaveLength(obstacles.length);
    const first = obstacles[0]!;
    expect(colliders.blocked(first.x, first.z, 0.1)).toBe(true);
  });
});
