/**
 * How much decoration a build draws. Placement is authored once, at full detail; a lower level thins only what blocks
 * nothing, so the world a player walks through is the same at every level.
 */
export type Detail = 'low' | 'medium' | 'high';

/** The share of nonblocking decoration kept at each level, by family. */
export const DETAIL_KEEP = {
  /** Pebbles and small stones that are not obstacles. */
  stones: { low: 0.55, medium: 0.8, high: 1 },
  /** Ferns, shrubs, moss, litter, logs and fungi on the woodland floor. */
  woodlandFloor: { low: 0.38, medium: 0.68, high: 1 },
} as const satisfies Record<string, Record<Detail, number>>;
