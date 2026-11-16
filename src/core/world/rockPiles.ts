import { coastX } from './coast';
import type { Colliders } from './colliders';
import type { Exclusions } from './exclusions';
import type { Terrain } from './terrain';

/**
 * How far the supplied weathered rock pile reaches from its centre at scale 1 (m): the farthest of its vertices across
 * the ground. tests/presentation/sourceRockPile.test.ts measures the model and fails if the two part.
 */
export const ROCK_PILE_REACH = 1.0186;

/**
 * Where a weathered rock pile may lie on the western shore: at `z`, `inland` metres east of the waterline there, at a
 * scale and a facing. Each is an accent the shore can do without.
 */
export const ROCK_PILE_CANDIDATES: readonly { z: number; inland: number; s: number; yaw: number }[] = [
  { z: -123, inland: 11, s: 1.2, yaw: 0.35 },
  { z: -84, inland: 10, s: 1.0, yaw: 1.85 },
  { z: -45, inland: 8, s: 0.9, yaw: 3.1 },
  { z: -8, inland: 8, s: 1.15, yaw: 4.65 },
  { z: 75, inland: 13, s: 1.1, yaw: 5.45 },
  { z: 139, inland: 15, s: 1.4, yaw: 2.4 },
];

/**
 * What a rock pile must leave clear (m): routes, places and interactions (the exclusions), anything already standing
 * (the colliders) and the piles already laid; and the ground it may lie on, above the tide and no steeper than `slope`.
 */
export const ROCK_PILE_CLEARANCE = { exclusions: 0.5, colliders: 0.4, apart: 0.4, aboveSea: 0.1, slope: 0.5 } as const;

export interface RockPile {
  id: string;
  x: number;
  z: number;
  s: number;
  yaw: number;
  /** Its reach at its scale (m): the circle it blocks as solid, climbable rock. */
  radius: number;
}

/**
 * The rock piles the shore keeps, in the order of their candidates. A candidate is never fitted in by moving anything
 * else: it is left out wherever it would claim a route, a place, a tree or a stone, lie in the water, or lean too far.
 */
export function coastalRockPiles(terrain: Pick<Terrain, 'heightAt' | 'slopeAt'>, exclusions: Pick<Exclusions, 'blocked'>,
  colliders: Pick<Colliders, 'blocked'>, reach = ROCK_PILE_REACH): RockPile[] {
  const clear = ROCK_PILE_CLEARANCE, kept: RockPile[] = [];
  for (const [index, candidate] of ROCK_PILE_CANDIDATES.entries()) {
    const x = coastX(candidate.z) + candidate.inland, z = candidate.z, radius = reach * candidate.s;
    if (exclusions.blocked(x, z, radius + clear.exclusions) || colliders.blocked(x, z, radius + clear.colliders)
      || terrain.heightAt(x, z) < clear.aboveSea || terrain.slopeAt(x, z) > clear.slope
      || kept.some((rock) => Math.hypot(rock.x - x, rock.z - z) < rock.radius + radius + clear.apart)) continue;
    kept.push({ id: `source-rock-pile:${index}`, x, z, s: candidate.s, yaw: candidate.yaw, radius });
  }
  return kept;
}
