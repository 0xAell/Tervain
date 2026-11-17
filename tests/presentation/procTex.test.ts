import { describe, expect, it } from 'vitest';
import { fbmField, pnoise } from '../../src/presentation/procTex';

// fbmField hashes each lattice corner once for the rows that share it instead of four times a pixel. It must give the
// field the per-pixel sum of pnoise gives, to the bit: the faces, the menu's materials, the bark and the ground are
// painted from it, and a test of the pixels would not show a change of a unit in the last place.
function reference(n: number, px: number, py: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const v = j / n;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      let amp = 0.5, sum = 0, norm = 0, fx = px, fy = py;
      for (let o = 0; o < octaves; o++) {
        sum += pnoise(u, v, fx, fy, seed + o * 31) * amp;
        norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
      }
      out[j * n + i] = sum / norm;
    }
  }
  return out;
}

const same = (a: Float32Array, b: Float32Array) => Buffer.from(a.buffer).equals(Buffer.from(b.buffer));

describe('fractal noise fields', () => {
  it.each([
    // The periods and octaves the game paints with (faces, people, the menu's materials and artwork).
    [64, 6, 6, 3, 101], [64, 48, 48, 1, 102], [64, 128, 128, 1, 103], [64, 96, 8, 2, 104], [64, 8, 8, 3, 7], [64, 32, 32, 2, 8],
    [96, 2, 6, 2, 9], [64, 24, 24, 3, 11], [64, 70, 70, 2, 12], [64, 90, 90, 2, 13], [64, 3, 3, 3, 14], [64, 5, 50, 3, 15],
    // Odd sizes, periods past the field's size, many octaves and a seed of 0.
    [37, 6, 6, 3, 1], [50, 200, 3, 4, 0], [16, 1, 1, 6, 2],
  ])('n %i, periods %i x %i, %i octaves, seed %i: the per-pixel sum to the bit', (n, px, py, octaves, seed) => {
    expect(same(fbmField(n, px, py, octaves, seed), reference(n, px, py, octaves, seed))).toBe(true);
  });

  it('keeps the per-pixel sum for periods that are not whole', () => {
    expect(same(fbmField(32, 2.5, 3.25, 2, 5), reference(32, 2.5, 3.25, 2, 5))).toBe(true);
  });
});
