import * as THREE from 'three';
import { woodAnchor } from './canopy';

/**
 * Leaf islands (playtest 7): seen from below at dusk, a crown's leaf cards whose opaque leaves sit clear of every
 * branch read as masses floating in the sky. A card's quad can touch its neighbours while its opaque texels do not, so
 * cards are linked by their opaque coverage (alpha at or above the material's cut-off), not by their geometry.
 *
 * Run once on a tree template's leaf geometry at load: every chunk of linked cards with no opaque leaf within `reach`
 * of the wood is moved, whole, toward its nearest bough until it is (a chunk farther than `drop`, if given, is removed).
 */
export interface LeafCutout { uv: string; cutoff: number; alpha(u: number, v: number): number;
  /** Conservative texture hint: false only when the whole UV triangle is transparent. */
  mayHaveOpaque?(u0: number, v0: number, u1: number, v1: number, u2: number, v2: number): boolean }
export interface LeafIslandOptions { reach?: number; gap?: number; drop?: number }

export function anchorLeafIslands(leaf: THREE.BufferGeometry, wood: THREE.BufferGeometry | null, cutout: LeafCutout | null,
  options: LeafIslandOptions = {}): { islands: number; moved: number; dropped: number } {
  const reach = options.reach ?? 0.5, gap = options.gap ?? 0.6, drop = options.drop ?? Infinity;
  const p = leaf.getAttribute('position'), uv = cutout ? leaf.getAttribute(cutout.uv) : null;
  const result = { islands: 0, moved: 0, dropped: 0 };
  if (!wood || !p || p.count === 0 || (cutout && !uv)) return result;
  const index = leaf.index, triangles = Math.floor((index?.count ?? p.count) / 3), at = (t: number, k: number) => index ? index.getX(t * 3 + k) : t * 3 + k;
  // Each triangle's opaque coverage is its own part (a quad can touch its neighbour while its leaves do not).
  const finePatterns = new Map<string, number>();
  const edgeA = new THREE.Vector3(), edgeB = new THREE.Vector3();
  const N = 6, opaque = new Map<number, { box: THREE.Box3; samples: THREE.Vector3[]; triangles: number[] }>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3(), opaqueAt = new Map<string, number[]>();
  let triangle = 0;
  let part: { box: THREE.Box3; samples: THREE.Vector3[]; triangles: number[] } | undefined;
  // Bounds consume q immediately; retained samples clone it. Reuse one collector across all triangles.
  const add = (w0: number, w1: number, w2: number, keep: boolean, all = false) => {
    q.set(0, 0, 0).addScaledVector(a, w0).addScaledVector(b, w1).addScaledVector(c, w2);
    if (!part) { part = { box: new THREE.Box3(), samples: [], triangles: [triangle] }; opaque.set(triangle, part); }
    part.box.expandByPoint(q);
    if (keep && (all || part.samples.length < 6)) part.samples.push(q.clone());
  };
  for (let t = 0; t < triangles; t++) {
    triangle = t; part = undefined;
    const v0 = at(t, 0), v1 = at(t, 1), v2 = at(t, 2);
    a.fromBufferAttribute(p, v0); b.fromBufferAttribute(p, v1); c.fromBufferAttribute(p, v2);
    if (!cutout || !uv) { add(1, 0, 0, true); add(0, 1, 0, true); add(0, 0, 1, true); add(1 / 3, 1 / 3, 1 / 3, true); continue; }
    const u0 = uv.getX(v0), u1 = uv.getX(v1), u2 = uv.getX(v2), t0 = uv.getY(v0), t1 = uv.getY(v1), t2 = uv.getY(v2);
    // Cards reuse a few atlas cells: the opaque sample points of each distinct UV triangle are found once.
    const key = `${u0},${t0},${u1},${t1},${u2},${t2}`;
    let points = opaqueAt.get(key);
    if (!points) {
      points = [];
      for (let i = 0; i <= N; i++) for (let j = 0; i + j <= N; j++) {
        const w0 = i / N, w1 = j / N, w2 = 1 - w0 - w1;
        if (cutout.alpha(w0 * u0 + w1 * u1 + w2 * u2, w0 * t0 + w1 * t1 + w2 * t2) >= cutout.cutoff) points.push(i, j);
      }
      // Thin opaque needles can fall between the coarse samples. Search only empty UV patterns more finely.
      if (!points.length) {
        // A collapsed triangle cannot witness foliage, or seed a miss for a later real card sharing its UVs.
        if (edgeA.subVectors(b, a).cross(edgeB.subVectors(c, a)).lengthSq() === 0) continue;
        const hintedOpaque = cutout.mayHaveOpaque?.(u0, t0, u1, t1, u2, t2);
        if (hintedOpaque === false) { opaqueAt.set(key, points); continue; }
        for (let i = 0; i <= 48; i++) for (let j = 0; i + j <= 48; j++) {
          const w0 = i / 48, w1 = j / 48, w2 = 1 - w0 - w1;
          if (cutout.alpha(w0 * u0 + w1 * u1 + w2 * u2, w0 * t0 + w1 * t1 + w2 * t2) >= cutout.cutoff) points.push(i, j);
        }
        if (points.length) finePatterns.set(key, 48);
        // Match the audit's final witness search: an empty 48-grid can still miss a thin opaque needle.
        // Refine only a positive texture hint, and cache the resolution alongside its UV pattern.
        else if (hintedOpaque === true) {
          for (let i = 0; i <= 192; i++) for (let j = 0; i + j <= 192; j++) {
            const w0 = i / 192, w1 = j / 192, w2 = (192 - i - j) / 192;
            if (cutout.alpha(w0 * u0 + w1 * u1 + w2 * u2, w0 * t0 + w1 * t1 + w2 * t2) >= cutout.cutoff) points.push(i, j);
          }
          if (points.length) finePatterns.set(key, 192);
        }
      }
      opaqueAt.set(key, points);
    }
    const divisions = finePatterns.get(key) ?? N, fine = divisions !== N;
    for (let n = 0; n < points.length; n += 2) add(points[n]! / divisions, points[n + 1]! / divisions,
      1 - (points[n]! + points[n + 1]!) / divisions, fine || (points[n]! + points[n + 1]!) % 2 === 0, fine);
  }
  const list = [...opaque.values()];
  if (!list.length) return result;
  const anchor = woodAnchor(wood), hit = new THREE.Vector3(), centre = new THREE.Vector3();
  // A part touches the wood when an opaque sample is within `reach` (the box centre first rules most parts out).
  const touches = (part: (typeof list)[number]) => {
    part.box.getCenter(centre);
    const radius = part.box.min.distanceTo(part.box.max) / 2;
    const d = anchor(centre, hit, reach + radius, reach);
    if (d === Infinity) return false;
    return d <= reach || part.samples.some(q => anchor(q, hit, reach, reach) <= reach);
  };
  const nearestFrom = new THREE.Vector3(), nearestTo = new THREE.Vector3();
  const nearest = (part: (typeof list)[number], best: number) => {
    let d = best;
    // Preserve the centre-first search and tie ordering without allocating an array and three vectors per part.
    for (let n = -1; n < part.samples.length; n++) {
      const q = n < 0 ? part.box.getCenter(centre) : part.samples[n]!;
      const e = anchor(q, hit, d);
      if (e < d) { d = e; nearestFrom.copy(q); nearestTo.copy(hit); }
    }
    return d;
  };
  // Parts in a grid by their boxes grown by half the gap: parts within `gap` share a cell. Each cell lists its parts in
  // index order, as a linked list over typed arrays: a part taken into a chunk leaves every cell it is in at once, and
  // the lists are walked without a lookup (a quarter of the pass went to finding and emptying cells in maps of sets).
  // Sizes are never negative or NaN, so the typed array's own numeric sort puts them in the comparator's order.
  const sizes = Float64Array.from(list, part => Math.max(part.box.max.x - part.box.min.x, part.box.max.y - part.box.min.y, part.box.max.z - part.box.min.z)).sort();
  const cell = Math.max(gap, sizes[Math.floor(sizes.length / 2)]!), half = gap / 2;
  // Each part's cells, as ranges of cell coordinates, and the ranges of all of them.
  const span = new Float64Array(list.length * 6);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  list.forEach((part, i) => {
    const lo = part.box.min, hi = part.box.max, o = i * 6;
    span[o] = Math.floor((lo.x - half) / cell); span[o + 1] = Math.floor((lo.y - half) / cell); span[o + 2] = Math.floor((lo.z - half) / cell);
    span[o + 3] = Math.floor((hi.x + half) / cell); span[o + 4] = Math.floor((hi.y + half) / cell); span[o + 5] = Math.floor((hi.z + half) / cell);
    x0 = Math.min(x0, span[o]!); y0 = Math.min(y0, span[o + 1]!); z0 = Math.min(z0, span[o + 2]!);
    x1 = Math.max(x1, span[o + 3]!); y1 = Math.max(y1, span[o + 4]!); z1 = Math.max(z1, span[o + 5]!);
  });
  // A cell is named by its key below, which tells cells apart within 2048 of the origin on each axis; beyond that two
  // cells can share a key, and so a list. A crown within that range, as every tree's is, numbers its cells in a table.
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
  const table = x0 >= -2048 && y0 >= -2048 && z0 >= -2048 && x1 <= 2047 && y1 <= 2047 && z1 <= 2047 && nx * ny * nz <= 1 << 22
    ? new Int32Array(nx * ny * nz).fill(-1) : null;
  const cellIds = new Map<number, number>();
  let cells = 0;
  const memberCell: number[] = [], memberStart = new Int32Array(list.length + 1);
  for (let i = 0; i < list.length; i++) {
    const o = i * 6, first = memberStart[i] = memberCell.length;
    for (let x = span[o]!; x <= span[o + 3]!; x++) for (let y = span[o + 1]!; y <= span[o + 4]!; y++) for (let z = span[o + 2]!; z <= span[o + 5]!; z++) {
      if (table) {
        const at = ((x - x0) * ny + (y - y0)) * nz + (z - z0);
        let id = table[at]!;
        if (id < 0) table[at] = id = cells++;
        memberCell.push(id);
        continue;
      }
      const key = ((x + 2048) * 4096 + (y + 2048)) * 4096 + (z + 2048);
      let id = cellIds.get(key);
      if (id === undefined) cellIds.set(key, id = cells++);
      // Two cells sharing a key share a list: a part joins it once.
      if (memberCell.indexOf(id, first) < 0) memberCell.push(id);
    }
  }
  memberStart[list.length] = memberCell.length;
  const head = new Int32Array(cells).fill(-1), tail = new Int32Array(cells).fill(-1);
  const next = new Int32Array(memberCell.length).fill(-1), previous = new Int32Array(memberCell.length).fill(-1), memberPart = new Int32Array(memberCell.length);
  for (let i = 0; i < list.length; i++) for (let m = memberStart[i]!; m < memberStart[i + 1]!; m++) {
    const c = memberCell[m]!, last = tail[c]!;
    memberPart[m] = i;
    if (last < 0) head[c] = m; else { next[last] = m; previous[m] = last; }
    tail[c] = m;
  }
  const flat = new Float32Array(list.length * 6);
  list.forEach((part, i) => { part.box.min.toArray(flat, i * 6); part.box.max.toArray(flat, i * 6 + 3); });
  const gap2 = gap * gap;
  const visited = new Uint32Array(list.length);
  let visitId = 0;
  // The breadth-first caller consumes this list before asking for the next part's neighbours.
  const found: number[] = [];
  const neighbours = (i: number) => {
    if (++visitId === 0x100000000) { visited.fill(0); visitId = 1; }
    found.length = 0;
    const o = i * 6;
    const x0 = flat[o]!, y0 = flat[o + 1]!, z0 = flat[o + 2]!, x1 = flat[o + 3]!, y1 = flat[o + 4]!, z1 = flat[o + 5]!;
    for (let m = memberStart[i]!; m < memberStart[i + 1]!; m++) for (let e = head[memberCell[m]!]!; e >= 0; e = next[e]!) {
      const j = memberPart[e]!;
      // A pair can share several cells; retain only its first visit and original ordering.
      if (visited[j] === visitId) continue;
      visited[j] = visitId;
      const q = j * 6;
      const dx = Math.max(0, x0 - flat[q + 3]!, flat[q]! - x1), dy = Math.max(0, y0 - flat[q + 4]!, flat[q + 1]! - y1), dz = Math.max(0, z0 - flat[q + 5]!, flat[q + 2]! - z1);
      if (dx * dx + dy * dy + dz * dz <= gap2) found.push(j);
    }
    return found;
  };
  const taken = new Uint8Array(list.length);
  const take = (i: number) => {
    if (taken[i]) return false;
    taken[i] = 1;
    for (let m = memberStart[i]!; m < memberStart[i + 1]!; m++) {
      const before = previous[m]!, after = next[m]!;
      if (before < 0) head[memberCell[m]!] = after; else next[before] = after;
      if (after >= 0) previous[after] = before;
    }
    return true;
  };
  // Chunks of linked parts (through opaque coverage), then each chunk tested for a part touching the wood: nearest the
  // trunk axis (the template's origin) first, so the crown's main chunk is settled in a few tests.
  const chunks: number[][] = [];
  for (let i = 0; i < list.length; i++) {
    if (!take(i)) continue;
    const chunk = [i];
    for (let n = 0; n < chunk.length; n++) for (const j of neighbours(chunk[n]!)) if (take(j)) chunk.push(j);
    chunks.push(chunk);
  }
  const axis = list.map(part => { part.box.getCenter(centre); return Math.hypot(centre.x, centre.z); });
  const islands = chunks.filter(chunk => !chunk.sort((x, y) => axis[x]! - axis[y]!).some(i => touches(list[i]!)));
  const droppedTriangles = new Set<number>(), shifts = new Map<number, { shift: THREE.Vector3; chunk: number[] }>();
  for (const members of islands) {
    const near = { d: Infinity, from: new THREE.Vector3(), to: new THREE.Vector3() };
    for (const i of members) {
      const d = nearest(list[i]!, near.d);
      // A later part reuses the search scratch; retain this island's winning contact in its own vectors.
      if (d < near.d) { near.d = d; near.from.copy(nearestFrom); near.to.copy(nearestTo); }
    }
    if (near.d <= reach) continue;
    result.islands++;
    if (!Number.isFinite(near.d) || near.d > drop) {
      result.dropped++;
      for (const i of members) for (const t of list[i]!.triangles) droppedTriangles.add(t);
      continue;
    }
    // Move the chunk until its nearest opaque leaf is 0.8 reach from the bough.
    const shift = new THREE.Vector3().subVectors(near.to, near.from).multiplyScalar(1 - reach * 0.8 / near.d);
    for (const i of members) for (const t of list[i]!.triangles) shifts.set(t, { shift, chunk: members });
    result.moved++;
  }
  // Apply the moves. A vertex shared with a triangle that stays (or moves differently) is split off first.
  if (shifts.size) {
    const owner = new Map<number, THREE.Vector3 | null>();
    for (let t = 0; t < triangles; t++) {
      if (droppedTriangles.has(t)) continue;
      const shift = shifts.get(t)?.shift ?? null;
      for (let k = 0; k < 3; k++) { const v = at(t, k); const seen = owner.get(v); owner.set(v, seen === undefined || seen === shift ? shift : null); }
    }
    const names = Object.keys(leaf.attributes), clones: { from: number; shift: THREE.Vector3 }[] = [];
    const indices = Array.from({ length: triangles * 3 }, (_, i) => at(Math.floor(i / 3), i % 3));
    const cloneOf = new Map<string, number>();
    for (const [t, { shift }] of shifts) for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k]!;
      if (owner.get(v) === shift) continue;
      const key = `${v}:${shift.x},${shift.y},${shift.z}`;
      let copy = cloneOf.get(key);
      if (copy === undefined) { copy = p.count + clones.length; clones.push({ from: v, shift }); cloneOf.set(key, copy); }
      indices[t * 3 + k] = copy;
    }
    const total = p.count + clones.length;
    for (const name of names) {
      const attr = leaf.getAttribute(name), values = new Float32Array(total * attr.itemSize);
      for (let i = 0; i < p.count; i++) for (let k = 0; k < attr.itemSize; k++) values[i * attr.itemSize + k] = attr.getComponent(i, k);
      clones.forEach(({ from }, n) => { for (let k = 0; k < attr.itemSize; k++) values[(p.count + n) * attr.itemSize + k] = attr.getComponent(from, k); });
      if (name === 'position') {
        for (const [v, shift] of owner) if (shift) { values[v * 3]! += shift.x; values[v * 3 + 1]! += shift.y; values[v * 3 + 2]! += shift.z; }
        clones.forEach(({ shift }, n) => { const o = (p.count + n) * 3; values[o]! += shift.x; values[o + 1]! += shift.y; values[o + 2]! += shift.z; });
      }
      leaf.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
    }
    leaf.setIndex(indices);
  }
  if (droppedTriangles.size) {
    const keep: number[] = [];
    const index2 = leaf.index;
    for (let t = 0; t < triangles; t++) if (!droppedTriangles.has(t)) keep.push(...[0, 1, 2].map(k => index2 ? index2.getX(t * 3 + k) : t * 3 + k));
    leaf.setIndex(keep);
  }
  if (result.moved || result.dropped) { leaf.computeBoundingBox(); leaf.computeBoundingSphere(); }
  return result;
}
