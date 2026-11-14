import { describe, expect, it } from 'vitest';
import { EnemyRoute } from '../../../src/core/rules/enemyRoute';
import type { Colliders } from '../../../src/core/world/colliders';
import type { V2 } from '../../../src/core/world/layout';
import type { NavGrid } from '../../../src/core/world/nav';
import type { Terrain } from '../../../src/core/world/terrain';

/** Flat open ground with one wall across x = 5 (for |z| < 3), and a navigation grid that knows the way round it. */
function world(options: { wall?: boolean; detour?: V2[] | null; cliffAt?: number } = {}) {
  let searches = 0;
  const colliders = {
    version: 0,
    cast: (x0: number, _z0: number, x1: number, z1: number) => (options.wall && Math.min(x0, x1) <= 5 && Math.max(x0, x1) >= 5 && Math.abs(z1) < 3 ? { t: 0 } : null),
  };
  const terrain = {
    groundAt: (x: number) => (options.cliffAt !== undefined && x > options.cliffAt ? 2 : 0),
    walkable: () => true,
  };
  const grid = { findPath: () => { searches++; return options.detour === undefined ? [{ x: 4, z: 4 }, { x: 6, z: 4 }, { x: 10, z: 0 }] : options.detour; } };
  const nav = { ...grid, forRadius: () => grid };
  return {
    ctx: { terrain: terrain as unknown as Terrain, colliders: colliders as unknown as Colliders, nav: nav as unknown as NavGrid },
    colliders,
    searches: () => searches,
  };
}

const from = { x: 0, z: 0 }, to = { x: 10, z: 0 };

describe('a hostile’s route to its target', () => {
  it('steers straight at the target in a world without a navigation grid', () => {
    const { ctx } = world();
    expect(new EnemyRoute().waypoint(from, to, 1 / 60, { terrain: ctx.terrain, colliders: ctx.colliders }, 0.35, 2)).toBe(to);
  });

  it('takes the straight line when the whole capsule sweep is clear, without a path search', () => {
    const { ctx, searches } = world();
    expect(new EnemyRoute().waypoint(from, to, 1 / 60, ctx, 0.35, 2)).toEqual(to);
    expect(searches()).toBe(0);
  });

  it('goes round a wall by the grid’s path, one clear leg at a time', () => {
    const { ctx, searches } = world({ wall: true });
    const route = new EnemyRoute();
    expect(route.waypoint(from, to, 1 / 60, ctx, 0.35, 2)).toEqual({ x: 4, z: 4 });
    expect(searches()).toBe(1);
    // Standing on the first waypoint, the next one is offered.
    expect(route.waypoint({ x: 4, z: 4 }, to, 1 / 60, ctx, 0.35, 2)).toEqual({ x: 6, z: 4 });
  });

  it('refuses a leg across a sudden drop or rise', () => {
    const { ctx } = world({ cliffAt: 5, detour: null });
    expect(new EnemyRoute().waypoint(from, to, 1 / 60, ctx, 0.35, 2)).toBeNull();
  });

  it('keeps only the legs it can physically walk, and reports no route when the first is blocked', () => {
    const blocked = world({ wall: true, detour: [{ x: 10, z: 0 }] });
    expect(new EnemyRoute().waypoint(from, to, 1 / 60, blocked.ctx, 0.35, 2)).toBeNull();
    const partial = world({ wall: true, detour: [{ x: 4, z: 0 }, { x: 10, z: 0 }] });
    const route = new EnemyRoute();
    expect(route.waypoint(from, to, 1 / 60, partial.ctx, 0.35, 2)).toEqual({ x: 4, z: 0 });
  });

  it('does not search again within three quarters of a second unless the scenery changes', () => {
    const { ctx, colliders, searches } = world({ wall: true });
    const route = new EnemyRoute();
    route.waypoint(from, to, 1 / 60, ctx, 0.35, 2);
    // The target moves well away: a new search is due, but not before the retry time has passed.
    const moved = { x: 10, z: 2.5 };
    for (let i = 0; i < 30; i++) route.waypoint(from, moved, 1 / 60, ctx, 0.35, 2);
    expect(searches()).toBe(1);
    for (let i = 0; i < 30; i++) route.waypoint(from, moved, 1 / 60, ctx, 0.35, 2);
    expect(searches()).toBe(2);
    // A door opening or a prop moving changes the colliders' version: the route is re-planned at once.
    colliders.version++;
    route.waypoint(from, moved, 1 / 60, ctx, 0.35, 2);
    expect(searches()).toBe(3);
  });

  it('plans again after being held up for more than 0.6 s', () => {
    const { ctx, searches } = world({ wall: true });
    const route = new EnemyRoute();
    route.waypoint(from, to, 1 / 60, ctx, 0.35, 2);
    for (let i = 0; i < 60; i++) { route.resolved(0, 0.05, 1 / 60); route.waypoint(from, to, 1 / 60, ctx, 0.35, 2); }
    expect(searches()).toBeGreaterThanOrEqual(2);
  });

  it('forgets its path on reset', () => {
    const { ctx, searches } = world({ wall: true });
    const route = new EnemyRoute();
    route.waypoint(from, to, 1 / 60, ctx, 0.35, 2);
    route.reset();
    route.waypoint(from, to, 1 / 60, ctx, 0.35, 2);
    expect(searches()).toBe(2);
  });
});
