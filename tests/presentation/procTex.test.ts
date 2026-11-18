import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { fbmField, pnoise, voronoi } from '../../src/presentation/procTex';

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

describe('periodic Worley distances and site colours', () => {
  // Reference bytes from the direct nine-neighbour calculation, including toroidal seams
  // of a non-square field and exact nearest-site ties on a single-row lattice.
  it.each([
    { n: 37, x: 7, y: 10, seed: 126, jitter: 0.96, digest: 'cc010abae244b0e940006fd8119d001a384631ede772b7df76b741fd8ec0a024' },
    { n: 36, x: 3, y: 1, seed: 13, jitter: 0, digest: 'b332b85b977f7654b4d16817175bfb571353037411b206c4901e65e68e3a9909' },
  ])('preserves both distances and their site ID for $x × $y cells', ({ n, x, y, seed, jitter, digest }) => {
    const field = voronoi(n, x, seed, jitter, y);
    const hash = createHash('sha256');
    for (const floats of [field.f1, field.f2, field.id]) hash.update(Buffer.from(floats.buffer));
    expect(hash.digest('hex')).toBe(digest);
  });
});
