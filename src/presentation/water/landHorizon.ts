import { WORLD } from '../../core/world/layout';

interface Point { x: number; y: number; z: number }
interface Box { min: Point; max: Point }

/** Azimuth bins, a degree wide; where a degree cannot vouch for a box, its halves are tried, down to an eighth. */
const BIN = Math.PI / 180;
const FINEST = 3;
/** The land is measured outward from a metre off, in segments half a metre deep near the eye and 2 % of the distance beyond. */
const STARTS: Float64Array = (() => {
  const out = [1];
  while (out[out.length - 1]! < 20000) { const d = out[out.length - 1]!; out.push(d + Math.max(0.5, d * 0.02)); }
  return Float64Array.from(out);
})();
/** Segment n runs from STARTS[n] to STARTS[n + 1]. */
const SEGMENTS = STARTS.length - 1;
/** Below the height field's float rounding: the land is taken this much lower than its lowest corner. */
const MARGIN = 0.05;
/** A box must lie this far (as a slope) below the land to count as hidden. */
const CLEAR = 1e-4;

/** One bin's measure of the land, from the current eye. */
interface Bin {
  /** The eye it was measured from (LandHorizon.generation). */
  eye: number;
  /** Segments measured so far, and for each, the steepest slope the land is known to reach this far out. */
  count: number;
  readonly steepest: Float64Array;
  /** A segment that rose above a box last time: the first to measure again from a new eye, and its slope from this one. */
  witness: number;
  witnessSlope: number;
  /** The bin's edges (cosines and sines) and how far its arc bulges, a fraction of the distance. */
  readonly c0: number;
  readonly s0: number;
  readonly c1: number;
  readonly s1: number;
  readonly bulge: number;
}

/**
 * What the land hides from an eye. The terrain is drawn exactly as its height field (`Terrain.heightAt` follows the
 * rendered triangles, and nothing displaces them), so a cell's lowest corner bounds the ground drawn over it from below,
 * and a table of those minima bounds any region. Seen from the eye, each degree of azimuth is measured outward in
 * segments: the lowest ground in a segment's sector stands somewhere along every azimuth of the degree, so the slope up
 * to it (from the eye, at the distance that makes it least steep) is one the land surely rises to there. A box is hidden
 * when, in every degree its footprint spans, some segment nearer than the box rises above the slope to the box's
 * highest point. A degree that cannot show it is tried as two halves, and so on down to an eighth.
 *
 * Only the terrain counts (trees, buildings and the distant coast are left out, and the land beyond the world's edge
 * is taken as absent), and every bound errs toward seeing: the answer is "hidden" only where the land surely hides it.
 * Measures are kept for as long as the eye stays put; once it moves, each bin first measures again the segment that
 * last rose above a box, which usually still does.
 */
export class LandHorizon {
  /** Level k: the lowest corner within each square of 2^k by 2^k terrain cells, at every cell it can start from. */
  private readonly levels: Float32Array[] = [];
  private readonly nx: number;
  private readonly nz: number;
  /** The bins measured, by level and then by bin. */
  private readonly bins = Array.from({ length: FINEST + 1 }, () => new Map<number, Bin>());
  private generation = 0;
  private eyeX = NaN;
  private eyeY = NaN;
  private eyeZ = NaN;
  /** Beyond this distance from the eye there is no terrain in any direction. */
  private reach = 0;

  constructor(terrain: { readonly heights: Float32Array; readonly nx: number; readonly nz: number }) {
    const { heights, nx, nz } = terrain;
    this.nx = nx; this.nz = nz;
    // Level 0: one value a terrain cell, its lowest corner.
    let level = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      level[j * nx + i] = Math.min(heights[a]!, heights[a + 1]!, heights[a + nx + 1]!, heights[a + nx + 2]!);
    }
    this.levels.push(level);
    // Squares that may start at any cell (a sparse table), so that a region's minimum never takes in a whole aligned
    // block around it.
    for (let size = 2; size <= Math.min(nx, nz); size *= 2) {
      const half = size / 2, pw = nx - half + 1, w = nx - size + 1, h = nz - size + 1, next = new Float32Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        next[j * w + i] = Math.min(level[j * pw + i]!, level[j * pw + i + half]!, level[(j + half) * pw + i]!, level[(j + half) * pw + i + half]!);
      }
      level = next;
      this.levels.push(level);
    }
  }

  /** True only if the land hides every point of the box from the eye. */
  hides(eye: Point, box: Box): boolean {
    if (eye.x !== this.eyeX || eye.y !== this.eyeY || eye.z !== this.eyeZ) this.moveTo(eye);
    const ex = eye.x, ez = eye.z;
    const near = Math.hypot(Math.max(box.min.x - ex, 0, ex - box.max.x), Math.max(box.min.z - ez, 0, ez - box.max.z));
    // Standing over the box (or nearly), its footprint surrounds the eye's own column.
    if (!(near >= 2)) return false;
    const far = Math.hypot(Math.max(Math.abs(box.min.x - ex), Math.abs(box.max.x - ex)), Math.max(Math.abs(box.min.z - ez), Math.abs(box.max.z - ez)));
    // The slope up to the box's highest point: its top, at the distance that makes it steepest.
    const rise = box.max.y - eye.y;
    const above = rise / (rise >= 0 ? near : far) + CLEAR;
    // The segments that end nearer than the box.
    let last = -1;
    for (let lo = 0, hi = SEGMENTS - 1; lo <= hi;) {
      const mid = (lo + hi) >> 1;
      if (STARTS[mid + 1]! < near - 1e-3) { last = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (last < 0) return false;
    // The footprint's azimuths, about the direction to its centre (the eye stands outside it, so they span under half a turn).
    const centre = Math.atan2((box.min.z + box.max.z) / 2 - ez, (box.min.x + box.max.x) / 2 - ex);
    let from = Infinity, to = -Infinity;
    for (let c = 0; c < 4; c++) {
      let a = Math.atan2((c & 2 ? box.max.z : box.min.z) - ez, (c & 1 ? box.max.x : box.min.x) - ex) - centre;
      a -= Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
      from = Math.min(from, a); to = Math.max(to, a);
    }
    const lo = centre + from, hi = centre + to;
    const first = Math.floor((lo + Math.PI) / BIN), end = Math.floor((hi + Math.PI) / BIN);
    for (let b = first; b <= end; b++) if (!this.covers(0, b, last, above, lo, hi)) return false;
    return true;
  }

  private moveTo(eye: Point) {
    this.eyeX = eye.x; this.eyeY = eye.y; this.eyeZ = eye.z;
    this.generation++;
    let reach = 0;
    for (const x of [WORLD.minX, WORLD.maxX]) for (const z of [WORLD.minZ, WORLD.maxZ]) reach = Math.max(reach, Math.hypot(x - eye.x, z - eye.z));
    this.reach = reach;
  }

  /**
   * Whether the land rises above the slope along every azimuth the bin (unwrapped, at `level`) shares with lo..hi
   * (unwrapped radians): over the whole bin, or else over each of its halves that meets the range, down to the finest.
   */
  private covers(level: number, bin: number, k: number, above: number, lo: number, hi: number): boolean {
    if (this.rises(level, bin, k, above)) return true;
    if (level === FINEST) return false;
    const width = BIN / (1 << (level + 1));
    for (const child of [bin * 2, bin * 2 + 1]) {
      const t0 = -Math.PI + child * width;
      if (t0 > hi || t0 + width < lo) continue;
      if (!this.covers(level + 1, child, k, above, lo, hi)) return false;
    }
    return true;
  }

  /**
   * Whether some segment among 0..k of the bin rises above the slope along every azimuth of the bin. Segments are
   * measured outward only as far as a question needs, and kept while the eye stays put.
   */
  private rises(level: number, bin: number, k: number, above: number): boolean {
    const bins = 360 << level, key = ((bin % bins) + bins) % bins, store = this.bins[level]!;
    let state = store.get(key);
    if (!state) {
      const width = BIN / (1 << level), t0 = -Math.PI + key * width, t1 = t0 + width;
      state = { eye: -1, count: 0, steepest: new Float64Array(SEGMENTS), witness: -1, witnessSlope: -Infinity,
        c0: Math.cos(t0), s0: Math.sin(t0), c1: Math.cos(t1), s1: Math.sin(t1), bulge: 1 - Math.cos(width / 2) };
      store.set(key, state);
    }
    if (state.eye !== this.generation) {
      state.eye = this.generation; state.count = 0;
      // A new eye: the segment that rose last time, measured again from here, usually still does.
      state.witnessSlope = state.witness >= 0 ? this.slope(state, state.witness) : -Infinity;
    }
    if (state.witness >= 0 && state.witness <= k && state.witnessSlope > above) return true;
    let n = state.count;
    const steepest = state.steepest;
    if (n > 0 && steepest[Math.min(n - 1, k)]! > above) return true;
    if (n > k) return false;
    let run = n > 0 ? steepest[n - 1]! : -Infinity;
    for (; n <= k; n++) {
      const slope = this.slope(state, n);
      run = Math.max(run, slope);
      steepest[n] = run;
      if (slope > above) { state.count = n + 1; state.witness = n; state.witnessSlope = slope; return true; }
    }
    state.count = n;
    return false;
  }

  /**
   * A slope the land surely rises to along every azimuth of the bin within segment n: the lowest ground in the segment's
   * sector, seen from the eye at the distance that makes it least steep (farthest above the eye, nearest below it).
   */
  private slope(bin: Bin, n: number): number {
    const dA = STARTS[n]!, dB = STARTS[n + 1]!;
    if (dA > this.reach) return -Infinity;
    const { c0, s0, c1, s1 } = bin, ex = this.eyeX, ez = this.eyeZ;
    // The sector, boxed by its four corners and widened past the arc's bulge.
    const pad = dB * bin.bulge + 0.01;
    const low = this.lowest(
      ex + Math.min(dA * c0, dA * c1, dB * c0, dB * c1) - pad, ez + Math.min(dA * s0, dA * s1, dB * s0, dB * s1) - pad,
      ex + Math.max(dA * c0, dA * c1, dB * c0, dB * c1) + pad, ez + Math.max(dA * s0, dA * s1, dB * s0, dB * s1) + pad,
    ) - MARGIN - this.eyeY;
    return low / (low >= 0 ? dB : dA);
  }

  /** The lowest the terrain is drawn within the rectangle, or -Infinity where it reaches past the world's edge. */
  private lowest(x0: number, z0: number, x1: number, z1: number): number {
    if (x0 < WORLD.minX || z0 < WORLD.minZ || x1 > WORLD.maxX || z1 > WORLD.maxZ) return -Infinity;
    const nx = this.nx, nz = this.nz;
    const i0 = Math.min(nx - 1, Math.floor((x0 - WORLD.minX) / WORLD.cell)), i1 = Math.min(nx - 1, Math.floor((x1 - WORLD.minX) / WORLD.cell));
    const j0 = Math.min(nz - 1, Math.floor((z0 - WORLD.minZ) / WORLD.cell)), j1 = Math.min(nz - 1, Math.floor((z1 - WORLD.minZ) / WORLD.cell));
    // Squares as large as the region's shorter side allows, stepped along it and set back from its far edges: they cover
    // the region and nothing outside it.
    const sx = i1 - i0 + 1, sz = j1 - j0 + 1;
    const k = Math.min(this.levels.length - 1, 31 - Math.clz32(Math.min(sx, sz))), size = 1 << k;
    const level = this.levels[k]!, w = nx - size + 1, ie = i1 - size + 1, je = j1 - size + 1;
    let m = Infinity;
    for (let j = j0; ; j += size) {
      const jj = Math.min(j, je);
      for (let i = i0; ; i += size) {
        const ii = Math.min(i, ie);
        m = Math.min(m, level[jj * w + ii]!);
        if (ii >= ie) break;
      }
      if (jj >= je) break;
    }
    return m;
  }
}
