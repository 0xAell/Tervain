import { fbmField } from './procTex';

/**
 * The three noise fields every bark of one size is painted from (treeTextures.ts): its warp, its fine grain and its low
 * mottling. Plain arrays from seeded noise, made without three so that a worker can make them (woodTexels.ts).
 */
export interface BarkFields { warp: Float32Array; fine: Float32Array; low: Float32Array }

export function makeBarkFields(n: number): BarkFields {
  // The close detail tile contains new, finer grain rather than a larger interpolation
  // of the old 256px texture. Both resolutions are deterministic and periodic.
  return { warp: fbmField(n, 4, 6, 3, 201), fine: fbmField(n, n >= 512 ? 128 : 40, n >= 512 ? 84 : 40, 3, 202), low: fbmField(n, 3, 5, 3, 203) };
}
