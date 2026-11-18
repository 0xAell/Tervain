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
 * Reduce over the existing vertices until the target triangle count or bind-pose error limit is reached. The
 * simplifier's reported error is expressed in metres.
 */
export function shadowIndex(simplifier: ShadowSimplifier, indices: Uint32Array, positions: Float32Array,
  targetTriangles = HERO_SHADOW_TRIANGLES, maxError = HERO_SHADOW_ERROR): { indices: Uint32Array; error: number } {
  const [out, error] = simplifier.simplify(indices, positions, 3, targetTriangles * 3, maxError, ['ErrorAbsolute']);
  return { indices: out, error };
}
