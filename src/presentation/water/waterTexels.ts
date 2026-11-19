import { mulberry32 } from '../../core/world/noise';

/**
 * The texels of the water's small detail (waterTextures.ts): plain arrays, made without three so that a worker can make
 * them while a journey's other files load (A68) and hand them over. Each texture is RGBA, one byte a channel.
 */

/** Texels across each texture. */
export const RIPPLE_SIZE = 256, FOAM_SIZE = 512, CAUSTIC_SIZE = 256;

/** The three textures' texels, in the order waterTextures builds them. */
export interface WaterTexels { ripples: Uint8Array; foam: Uint8Array; caustics: Uint8Array }

/** Make every texel of the three textures: the same bytes wherever they are made. */
export function makeWaterTexels(): WaterTexels {
  return { ripples: rippleTexels(), foam: foamTexels(), caustics: causticTexels() };
}

export interface Wave { kx: number; kz: number; amp: number; phase: number }

/** A periodic height field on a square tile: waves whose wave vectors lie on the tile lattice, amplitude by spectrum. */
function periodicWaves(count: number, seed: number, minK: number, maxK: number, falloff: number) {
  const rnd = mulberry32(seed);
  const waves: Wave[] = [];
  while (waves.length < count) {
    const kx = Math.round((rnd() * 2 - 1) * maxK), kz = Math.round((rnd() * 2 - 1) * maxK);
    const k = Math.hypot(kx, kz);
    if (k < minK || k > maxK) continue;
    waves.push({ kx, kz, amp: Math.pow(k, -falloff) * (0.6 + 0.4 * rnd()), phase: rnd() * Math.PI * 2 });
  }
  return waves;
}

export interface WaveTable { wave: Wave; from: number; at: Float64Array }

/**
 * One wave's sine or cosine at every texel of an n-texel tile, by lattice step. The angle at texel (i, j) is
 * ((kx·i + kz·j) / n)·2π + phase, the same for every texel of the same integer step kx·i + kz·j: the textures look it
 * up at `at[step - from]` instead of working it out per texel, to the same bits, with several times fewer calls (a 512²
 * tile reaches at most 41,000 steps of a wave, where it has 262,144 texels).
 */
export function waveTable(wave: Wave, n: number, f: (angle: number) => number): WaveTable {
  const last = n - 1;
  return table(wave, f, Math.min(0, wave.kx * last) + Math.min(0, wave.kz * last), Math.max(0, wave.kx * last) + Math.max(0, wave.kz * last),
    (step) => (step / n) * Math.PI * 2 + wave.phase);
}

/**
 * The same at the points (i + 0.5) / per of each axis, where the caustics' photons leave the surface: kx·x + kz·z is then
 * exactly step / (2·per) for the odd step kx·(2i + 1) + kz·(2j + 1), `per` being a power of two.
 */
export function centredWaveTable(wave: Wave, n: number, per: number, f: (angle: number) => number): WaveTable {
  if (!Number.isInteger(Math.log2(per))) throw new Error('A centred wave table needs a power of two of points per texel');
  const last = 2 * n * per - 1;
  return table(wave, f, Math.min(wave.kx, wave.kx * last) + Math.min(wave.kz, wave.kz * last), Math.max(wave.kx, wave.kx * last) + Math.max(wave.kz, wave.kz * last),
    (step) => ((step / (2 * per)) / n) * Math.PI * 2 + wave.phase);
}

function table(wave: Wave, f: (angle: number) => number, from: number, to: number, angle: (step: number) => number): WaveTable {
  const at = new Float64Array(to - from + 1);
  for (let step = from; step <= to; step++) at[step - from] = f(angle(step));
  return { wave, from, at };
}

/** RG: slopes d/dx, d/dz (0.5 = flat); B: height; A: unused. */
function rippleTexels(): Uint8Array {
  const n = RIPPLE_SIZE;
  const waves = periodicWaves(72, 1301, 2, 34, 1.15);
  const sines = waves.map((w) => waveTable(w, n, Math.sin)), cosines = waves.map((w) => waveTable(w, n, Math.cos));
  const h = new Float32Array(n * n), sx = new Float32Array(n * n), sz = new Float32Array(n * n);
  let maxSlope = 0, minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let y = 0, gx = 0, gz = 0;
    for (let k = 0; k < waves.length; k++) {
      const w = waves[k]!, step = w.kx * i + w.kz * j, sine = sines[k]!, cosine = cosines[k]!;
      y += w.amp * sine.at[step - sine.from]!;
      const d = w.amp * cosine.at[step - cosine.from]! * Math.PI * 2;
      gx += d * w.kx; gz += d * w.kz;
    }
    const id = j * n + i;
    h[id] = y; sx[id] = gx; sz[id] = gz;
    maxSlope = Math.max(maxSlope, Math.abs(gx), Math.abs(gz));
    minH = Math.min(minH, y); maxH = Math.max(maxH, y);
  }
  const data = new Uint8Array(n * n * 4);
  for (let id = 0; id < n * n; id++) {
    data[id * 4] = Math.round((0.5 + 0.5 * sx[id]! / maxSlope) * 255);
    data[id * 4 + 1] = Math.round((0.5 + 0.5 * sz[id]! / maxSlope) * 255);
    data[id * 4 + 2] = Math.round(((h[id]! - minH) / (maxH - minH)) * 255);
    data[id * 4 + 3] = 255;
  }
  return data;
}

/** R: bubbly foam cells; G: torn lace and streaks; B: fine sparkle; A: a smooth coverage noise for breaking up edges. */
function foamTexels(): Uint8Array {
  const n = FOAM_SIZE;
  const rnd = mulberry32(2207);
  // Worley points on a periodic grid of cells (two scales).
  const grid = (cells: number) => {
    const pts: [number, number][] = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + rnd() * 0.7) / cells, (j + 0.15 + rnd() * 0.7) / cells]);
    return { cells, pts };
  };
  const big = grid(14), small = grid(38);
  const worley = (g: { cells: number; pts: [number, number][] }, u: number, v: number) => {
    const ci = Math.floor(u * g.cells), cj = Math.floor(v * g.cells);
    let f1 = Infinity, f2 = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + g.cells) % g.cells, jj = (cj + dj + g.cells) % g.cells;
      const p = g.pts[jj * g.cells + ii]!;
      // Wrap the feature point into this neighbourhood.
      const px = p[0] + Math.floor((ci + di) / g.cells) * 1, pz = p[1] + Math.floor((cj + dj) / g.cells) * 1;
      const d = Math.hypot((px - u) * g.cells, (pz - v) * g.cells);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2] as const;
  };
  const lace = periodicWaves(40, 3307, 3, 40, 0.9).map((w) => waveTable(w, n, Math.sin));
  const cover = periodicWaves(18, 3313, 1, 7, 1.4).map((w) => waveTable(w, n, Math.sin));
  const data = new Uint8Array(n * n * 4);
  const laceVals = new Float32Array(n * n), coverVals = new Float32Array(n * n);
  let lMin = Infinity, lMax = -Infinity, cMin = Infinity, cMax = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let l = 0, c = 0;
    for (const { wave: w, from, at } of lace) l += w.amp * at[w.kx * i + w.kz * j - from]!;
    for (const { wave: w, from, at } of cover) c += w.amp * at[w.kx * i + w.kz * j - from]!;
    laceVals[j * n + i] = l; coverVals[j * n + i] = c;
    lMin = Math.min(lMin, l); lMax = Math.max(lMax, l); cMin = Math.min(cMin, c); cMax = Math.max(cMax, c);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, v = (j + 0.5) / n;
    const [b1, b2] = worley(big, u, v);
    const [s1, s2] = worley(small, u, v);
    // Bubbles: bright rims where two cells meet, filled centres fading out.
    const rim = 1 - Math.min(1, (b2 - b1) * 3.2);
    const fine = 1 - Math.min(1, (s2 - s1) * 2.6);
    const bubbles = Math.min(1, rim * 0.75 + fine * 0.45 + Math.max(0, 0.35 - b1) * 0.8);
    const l = (laceVals[j * n + i]! - lMin) / (lMax - lMin);
    // Lace: narrow ridges of the turbulence, torn by the small cells.
    const ridge = Math.pow(1 - Math.abs(l * 2 - 1), 3) * (0.55 + 0.45 * fine);
    const sparkle = s1 < 0.14 ? 1 - s1 / 0.14 : 0;
    const id = (j * n + i) * 4;
    data[id] = Math.round(bubbles * 255);
    data[id + 1] = Math.round(Math.min(1, ridge) * 255);
    data[id + 2] = Math.round(sparkle * 255);
    data[id + 3] = Math.round(((coverVals[j * n + i]! - cMin) / (cMax - cMin)) * 255);
  }
  return data;
}

/** Single channel (R): caustic light, by photon counting through a periodic surface. */
function causticTexels(): Uint8Array {
  const n = CAUSTIC_SIZE;
  const waves = periodicWaves(9, 4409, 1, 5, 1.2);
  const counts = new Float32Array(n * n);
  const photons = 4;
  const depth = 0.9 * n;
  const cosines = waves.map((w) => centredWaveTable(w, n, photons, Math.cos));
  for (let j = 0; j < n * photons; j++) for (let i = 0; i < n * photons; i++) {
    const x = (i + 0.5) / photons, z = (j + 0.5) / photons;
    let gx = 0, gz = 0;
    for (const { wave: w, from, at } of cosines) {
      const d = w.amp * at[w.kx * (2 * i + 1) + w.kz * (2 * j + 1) - from]! * Math.PI * 2 / n;
      gx += d * w.kx; gz += d * w.kz;
    }
    // Snell's law, small angles: light leaves the surface bent by a quarter of the slope (water's 1.33).
    const lx = x - gx * depth * 0.25 * 3, lz = z - gz * depth * 0.25 * 3;
    const ix = ((Math.floor(lx) % n) + n) % n, iz = ((Math.floor(lz) % n) + n) % n;
    counts[iz * n + ix]! += 1;
  }
  // Soften by one texel, then normalise so the mean is mid-grey and the web is bright.
  const blur = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += counts[((j + dj + n) % n) * n + ((i + di + n) % n)]! * (di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1);
    blur[j * n + i] = s / 16;
  }
  const mean = photons * photons;
  const data = new Uint8Array(n * n * 4);
  for (let id = 0; id < n * n; id++) {
    const v = Math.min(1, Math.max(0, (blur[id]! / mean - 0.55) / 2.6));
    data[id * 4] = data[id * 4 + 1] = data[id * 4 + 2] = Math.round(Math.pow(v, 0.8) * 255);
    data[id * 4 + 3] = 255;
  }
  return data;
}
