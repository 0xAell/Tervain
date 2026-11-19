import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/core/world/layout';
import { LandHorizon } from '../../src/presentation/water/landHorizon';

const nx = (WORLD.maxX - WORLD.minX) / WORLD.cell, nz = (WORLD.maxZ - WORLD.minZ) / WORLD.cell;

/** A height field over the world's grid, as the terrain keeps one. */
function field(height: (x: number, z: number) => number) {
  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) heights[j * (nx + 1) + i] = height(WORLD.minX + i * WORLD.cell, WORLD.minZ + j * WORLD.cell);
  return { heights, nx, nz };
}

/** The ground as drawn: Terrain.heightAt's triangles; no ground past the world's edge. */
function groundAt(f: ReturnType<typeof field>, x: number, z: number): number {
  if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return -Infinity;
  const gx = (x - WORLD.minX) / WORLD.cell, gz = (z - WORLD.minZ) / WORLD.cell;
  const i = Math.min(nx - 1, Math.floor(gx)), j = Math.min(nz - 1, Math.floor(gz)), fx = gx - i, fz = gz - j, w = nx + 1;
  const ha = f.heights[j * w + i]!, hb = f.heights[j * w + i + 1]!, hc = f.heights[(j + 1) * w + i]!, hd = f.heights[(j + 1) * w + i + 1]!;
  return fx + fz <= 1 ? ha + fx * (hb - ha) + fz * (hc - ha) : hd + (1 - fx) * (hc - hd) + (1 - fz) * (hb - hd);
}

/** Whether the ground stands above the line from the eye to the point anywhere along it (marched every 10 cm). */
function blocked(f: ReturnType<typeof field>, eye: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }): boolean {
  const steps = Math.ceil(Math.hypot(p.x - eye.x, p.z - eye.z) / 0.1);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (groundAt(f, eye.x + (p.x - eye.x) * t, eye.z + (p.z - eye.z) * t) > eye.y + (p.y - eye.y) * t) return true;
  }
  return false;
}

const box = (x0: number, x1: number, z0: number, z1: number, y0 = -2.2, y1 = 2.72) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

describe('what the land hides from an eye', () => {
  // A ridge 20 m high across the world at x -200..-190, with a notch 10 m wide at z -5..5.
  const ridge = field((x, z) => (x >= -200 && x <= -190 && Math.abs(z) > 5 ? 20 : 0));
  const eye = { x: -100, y: 3, z: 0 };

  it('sees the sea over flat ground', () => {
    const flat = new LandHorizon(field(() => 0));
    expect(flat.hides(eye, box(-300, -280, 20, 40))).toBe(false);
  });

  it('hides a box behind a ridge, and not one whose top clears it', () => {
    const horizon = new LandHorizon(ridge);
    expect(horizon.hides(eye, box(-300, -280, 20, 40))).toBe(true);
    // From x -100 at 3 m, the ridge's crest 90 m off stands 17 m up: 200 m away a box would need to reach 40 m.
    expect(horizon.hides(eye, box(-300, -280, 20, 40, -2.2, 45))).toBe(false);
  });

  it('sees through a notch in the ridge, and hides what the notch does not open onto', () => {
    const horizon = new LandHorizon(ridge);
    expect(horizon.hides(eye, box(-300, -280, -3, 3))).toBe(false);
    expect(horizon.hides(eye, box(-300, -280, -40, -20))).toBe(true);
  });

  it('never hides a box the eye stands over, nor one past land it cannot vouch for', () => {
    const horizon = new LandHorizon(ridge);
    expect(horizon.hides({ x: -290, y: 3, z: 30 }, box(-300, -280, 20, 40))).toBe(false);
    // Out beyond the world's southern edge, the line of sight leaves the ground the field holds before the ridge.
    expect(horizon.hides({ x: -100, y: 3, z: 160 }, box(-300, -280, 300, 320))).toBe(false);
  });

  it('follows the eye: from on top of the ridge the box is seen', () => {
    const horizon = new LandHorizon(ridge);
    expect(horizon.hides(eye, box(-300, -280, 20, 40))).toBe(true);
    expect(horizon.hides({ x: -195, y: 23, z: 30 }, box(-300, -280, 20, 40))).toBe(false);
    expect(horizon.hides(eye, box(-300, -280, 20, 40))).toBe(true);
  });

  it('says "hidden" only where the ground blocks every line of sight to the box', () => {
    // Rolling hills and a valley floor at sea level; eyes and boxes all over the world.
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let hidden = 0, seen = 0;
    for (let world = 0; world < 6; world++) {
      const hills = Array.from({ length: 8 }, () => ({ x: WORLD.minX + random() * (WORLD.maxX - WORLD.minX), z: WORLD.minZ + random() * (WORLD.maxZ - WORLD.minZ), h: 4 + random() * 30, r: 15 + random() * 60 }));
      const f = field((x, z) => Math.max(-3, ...hills.map((hill) => hill.h * Math.exp(-((x - hill.x) ** 2 + (z - hill.z) ** 2) / hill.r ** 2))) - 1);
      const horizon = new LandHorizon(f);
      for (let n = 0; n < 60; n++) {
        const ex = WORLD.minX + random() * (WORLD.maxX - WORLD.minX), ez = WORLD.minZ + random() * (WORLD.maxZ - WORLD.minZ);
        const e = { x: ex, y: Math.max(0, groundAt(f, ex, ez)) + 1 + random() * 6, z: ez };
        for (let m = 0; m < 8; m++) {
          const bx = WORLD.minX - 60 + random() * (WORLD.maxX - WORLD.minX + 120), bz = WORLD.minZ - 60 + random() * (WORLD.maxZ - WORLD.minZ + 120);
          const size = 4 + random() * 40, b = box(bx, bx + size, bz, bz + size);
          if (!horizon.hides(e, b)) { seen++; continue; }
          hidden++;
          // Every point of the box sampled on a 2 m grid over its top and its bottom: each one behind the ground.
          for (let x = b.min.x; x <= b.max.x + 1e-9; x += Math.max(2, size / 6)) for (let z = b.min.z; z <= b.max.z + 1e-9; z += Math.max(2, size / 6)) {
            for (const y of [b.min.y, b.max.y]) expect(blocked(f, e, { x, y, z })).toBe(true);
          }
        }
      }
    }
    // Both answers came up often enough to mean something.
    expect(hidden).toBeGreaterThan(100);
    expect(seen).toBeGreaterThan(100);
  });
});
