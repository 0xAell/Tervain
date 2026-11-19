/**
 * The canopies' leaf-cluster atlas at full size, the level its coverage-preserving mips are made from (canopy.ts
 * `canopyAtlasTexture`). It depends on nothing a world chooses, and is made without three so that a worker can make it
 * while the main thread builds the terrain (woodTexels.ts).
 */

export interface CanopyAtlasLevel { width: number; height: number; data: Uint8Array }

/** Small stable PRNG (mulberry32). */
export function canopyRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three's `MathUtils.smoothstep`, to the bit: the atlas was painted with it. */
function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  x = (x - min) / (max - min);
  return x * x * (3 - 2 * x);
}

/**
 * A procedural atlas of `cells` x `cells` dense leaf clusters: many small pointed leaves in olive greens, the back leaves
 * darker than the front, thinning toward the cluster's rim so its edge is soft. Pixel rows run from v = 0 upward.
 */
export function canopyAtlas(size: number, cells: number, seed: number): CanopyAtlasLevel {
  const random = canopyRandom(seed);
  const data = new Uint8Array(size * size * 4);
  // Background colour under the leaves (alpha 0) is a dark green, so filtered edges never pick up white or black.
  for (let i = 0; i < size * size; i++) { data[i * 4] = 52; data[i * 4 + 1] = 66; data[i * 4 + 2] = 30; }
  const cell = size / cells;
  for (let cv = 0; cv < cells; cv++) for (let cu = 0; cu < cells; cu++) {
    const cx = (cu + 0.5) * cell, cy = (cv + 0.5) * cell, R = cell * 0.47;
    const leaves = 340;
    for (let l = 0; l < leaves; l++) {
      const depth = l / leaves; // drawn back to front
      const rr = R * Math.sqrt(random()) * (0.55 + 0.45 * (1 - depth * 0.4));
      const ang = random() * Math.PI * 2;
      const lx = cx + Math.cos(ang) * rr, ly = cy + Math.sin(ang) * rr;
      const rim = rr / R;
      // Leaves point roughly outward from the cluster's stem, with scatter.
      const heading = ang + (random() - 0.5) * 1.6;
      const len = cell * (0.075 + random() * 0.05) * (1 - 0.3 * rim), wid = len * (0.36 + random() * 0.14);
      const hx = Math.cos(heading), hy = Math.sin(heading);
      const shade = 0.68 + 0.42 * depth + (random() - 0.5) * 0.2;
      const hue = random();
      const base = [84 + hue * 40, 112 + hue * 30 + random() * 14, 40 + random() * 20];
      const fade = 1 - 0.55 * smoothstep(rim, 0.62, 1.0);
      // Only the pixels the leaf can cover are visited. A sample covers only within half the leaf's length along it and
      // half its width across it, so within |hx|·len/2 + |hy|·wid/2 of its centre in x (hx and hy swapped in y); a
      // pixel's samples sit a quarter and three quarters into it, and the extra pixel keeps rounding out of it. A square
      // of len + 2 each way, five times as many pixels, was visited before; the atlas comes out the same, byte for byte.
      const ex = (Math.abs(hx) * len + Math.abs(hy) * wid) / 2 + 1, ey = (Math.abs(hy) * len + Math.abs(hx) * wid) / 2 + 1;
      const x0 = Math.max(0, Math.floor(lx - ex)), x1 = Math.min(size - 1, Math.ceil(lx + ex));
      const y0 = Math.max(0, Math.floor(ly - ey)), y1 = Math.min(size - 1, Math.ceil(ly + ey));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let cover = 0, along = 0, across = 0;
        for (let sub = 0; sub < 4; sub++) {
          const px = x + 0.25 + 0.5 * (sub & 1) - lx, py = y + 0.25 + 0.5 * (sub >> 1) - ly;
          const u = (px * hx + py * hy) / len, v = (-px * hy + py * hx) / wid; // u in -0.5..0.5 along the leaf
          const t = u + 0.5, side = Math.abs(v);
          // The leaf's half-width below never passes 0.5 (a sine to a power, halved), so a sample farther across lies
          // outside it: nearly half of all samples, whose width is not worked out. The atlas is the same, byte for byte.
          if (t <= 0 || t >= 1 || side >= 0.5) continue;
          const half = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75) * 0.5;
          if (side < half) { cover += 0.25; along += t * 0.25; across += side / Math.max(half, 1e-3) * 0.25; }
        }
        if (cover <= 0) continue;
        along /= cover; across /= cover;
        // A lighter midrib, a darker leaf edge and base.
        const light = shade * (0.82 + 0.18 * along) * (1.05 - 0.2 * across) * (across < 0.12 ? 1.12 : 1);
        const i = (y * size + x) * 4, a = cover * fade, prev = data[i + 3]! / 255;
        const outA = a + prev * (1 - a);
        for (let k = 0; k < 3; k++) {
          const c = Math.min(255, base[k]! * light);
          data[i + k] = outA > 0 ? (c * a + data[i + k]! * prev * (1 - a)) / outA : data[i + k]!;
        }
        data[i + 3] = Math.round(outA * 255);
      }
    }
  }
  return { width: size, height: size, data };
}
