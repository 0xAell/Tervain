/**
 * The wanderer's shadow from fewer of his own triangles (GPU frame cost, 2026-11). His body is 150,000 triangles, skinned
 * by dual quaternions in every pass that draws it, and the sun's shadow map drew all of them every daytime frame: a
 * fifth of that map's triangles on the benchmark route (docs/perf/AIR-CUTS.md). The map's texels are 3.4 cm across on
 * High (140 m at 4096 px) and a receiver looks its shadow up 7.5 cm out along its normal, so triangles within 2 mm of
 * his surface cast the same shadow. meshoptimizer's simplifier chooses fewer triangles over the same vertices, moving
 * none: the skeleton, the skin weights, the dual-quaternion depth material and his picture stay as they are.
 */
export const HERO_SHADOW_TRIANGLES = 15_000;
/** The coarser triangles stay within this distance (m) of his surface. */
export const HERO_SHADOW_ERROR = 0.002;

/** The part of meshoptimizer's simplifier used here (`meshoptimizer/simplifier`). */
export interface ShadowSimplifier {
  simplify(indices: Uint32Array, positions: Float32Array, stride: number, targetIndexCount: number, targetError: number, flags?: 'ErrorAbsolute'[]): [Uint32Array, number];
}

/**
 * Triangles over the same vertices, at most HERO_SHADOW_TRIANGLES of them, none farther than HERO_SHADOW_ERROR from the
 * surface (whichever comes first), and the error reached, in metres.
 */
export function shadowIndex(simplifier: ShadowSimplifier, indices: Uint32Array, positions: Float32Array): { indices: Uint32Array; error: number } {
  const [out, error] = simplifier.simplify(indices, positions, 3, HERO_SHADOW_TRIANGLES * 3, HERO_SHADOW_ERROR, ['ErrorAbsolute']);
  return { indices: out, error };
}
