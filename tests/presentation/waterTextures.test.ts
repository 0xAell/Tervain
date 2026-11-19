import { expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/world/noise';
import { centredWaveTable, waveTable, type Wave } from '../../src/presentation/water/waterTexels';

// The water's textures look each wave's sine and cosine up by lattice step instead of working it out per texel. The
// tables must give every texel the value its own angle gives, to the bit, or the textures change.

const waves = (seed: number, maxK: number): Wave[] => {
  const random = mulberry32(seed), out: Wave[] = [{ kx: 0, kz: 5, amp: 1, phase: 1 }, { kx: -7, kz: 0, amp: 1, phase: 2 }, { kx: 0, kz: 0, amp: 1, phase: 3 }];
  while (out.length < 14) out.push({ kx: Math.round((random() * 2 - 1) * maxK), kz: Math.round((random() * 2 - 1) * maxK), amp: 1, phase: random() * Math.PI * 2 });
  return out;
};

it('gives every texel of a tile the sine and cosine of its own angle, to the bit', () => {
  const n = 256;
  let compared = 0, differing = 0;
  for (const wave of waves(5, 40)) for (const f of [Math.sin, Math.cos]) {
    const { from, at } = waveTable(wave, n, f);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, compared++) {
      if (at[wave.kx * i + wave.kz * j - from] !== f(((wave.kx * i + wave.kz * j) / n) * Math.PI * 2 + wave.phase)) differing++;
    }
  }
  expect(differing).toBe(0);
  expect(compared).toBe(14 * 2 * 256 * 256);
});

it('gives every photon between texel centres the cosine of its own angle, to the bit', () => {
  const n = 64, photons = 4;
  let differing = 0;
  for (const wave of waves(9, 5)) {
    const { from, at } = centredWaveTable(wave, n, photons, Math.cos);
    for (let j = 0; j < n * photons; j++) for (let i = 0; i < n * photons; i++) {
      const x = (i + 0.5) / photons, z = (j + 0.5) / photons;
      if (at[wave.kx * (2 * i + 1) + wave.kz * (2 * j + 1) - from] !== Math.cos(((wave.kx * x + wave.kz * z) / n) * Math.PI * 2 + wave.phase)) differing++;
    }
  }
  expect(differing).toBe(0);
  // Between texel centres the sum is exact only for a power of two of photons.
  expect(() => centredWaveTable({ kx: 1, kz: 2, amp: 1, phase: 0 }, n, 3, Math.cos)).toThrow(/power of two/);
});
