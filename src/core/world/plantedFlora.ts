import type { FloraTree } from './flora';
import { PLANTED_ROWS, PLANTED_WITH } from './plantedForest.trees';

export { PLANTED_WITH };

/**
 * The forest the web build plants (plantedForest.ts) to the bit, each tree as the planting makes it (flora.ts's
 * FloraTree), planted with the models and flags the web build uses by default (PLANTED_WITH). A web build that plants
 * with those takes these trees instead of planting again (presentation/flora.ts): planting builds every supplied tree a
 * generated one replaces, only to measure where it would stand. Each world takes its own copies. A module of its own, so
 * the game takes these rows without the floor's or the export's.
 */
export const PLANTED_FLORA: readonly Readonly<FloraTree>[] = PLANTED_ROWS.map(
  ([sp, v, x, y, z, s, yaw, tint, radius, collisionId, decorationRank, , age, groveId, standId, familyRole, assetId]) => ({
    sp, v, x, y, z, s, yaw, tint, radius, collisionId, decorationRank, ...(age ? { age } : {}), ...(groveId ? { groveId } : {}),
    ...(standId ? { standId } : {}), ...(familyRole ? { familyRole } : {}), ...(assetId ? { assetId } : {}),
  }));
