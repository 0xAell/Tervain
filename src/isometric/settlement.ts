import { BUILDINGS, HUNTER_CAMP, ROADS, type V2, type BuildingSpec } from '../core/world/layout';
import { buildingEntry, buildingTreads } from '../core/world/buildingEntries';
import { fromBuildingLocal, toBuildingLocal } from '../core/world/interiors';
import { wetPoint } from './channels';
import { mix, rgba } from './waterPalette';

export const buildingSprite: Record<BuildingSpec['kind'], string> = {
  house: 'house',
  mill: 'mill',
  shrine: 'shrine',
  archive: 'archive',
  office: 'office',
  hut: 'hut',
  inn: 'inn',
  bakery: 'bakery',
  reeve: 'house',
  bunks: 'bunks',
  lodge: 'house',
  fisher: 'hut',
  store: 'bunks',
  keeper: 'house',
};
export const campShelter: BuildingSpec = {
  id: 'hunter_lean_to',
  kind: 'hut',
  x: HUNTER_CAMP.x - 3,
  z: HUNTER_CAMP.z + 2,
  w: 4.1,
  d: 3.5,
  h: 2.5,
  yaw: 0.18,
  roof: 'lean',
  wall: 'timber',
};
const buildings = [...BUILDINGS, campShelter];
const pieces = ROADS.flatMap((r) => r.points.slice(1).map((b, i) => ({ a: r.points[i]!, b })));
const distance = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
function closest(a: V2, b: V2, x: number, z: number) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return { x: a.x + t * dx, z: a.z + t * dz };
}
function clearPath(a: V2, b: V2) {
  const n = Math.ceil(distance(a, b));
  for (let k = 0; k <= n; k++) {
    const t = k / (n || 1),
      x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t;
    if (wetPoint(x, z)) return false;
    for (const room of buildings) {
      if (Math.abs(x - room.x) + Math.abs(z - room.z) > room.w + room.d + 2) continue;
      const l = toBuildingLocal(room, x, z);
      if (Math.abs(l.x) < room.w / 2 + 0.55 && Math.abs(l.z) < room.d / 2 + 0.55) return false;
    }
  }
  return true;
}
function approach(b: BuildingSpec) {
  const door = buildingEntry(b),
    at = (x: number, z: number) => fromBuildingLocal(b, x, z);
  const sill = at(door.x, door.z),
    porch = at(door.x, door.z + 1.95),
    routes: V2[][] = [[porch]];
  for (const sign of [-1, 1]) {
    const side = sign * (b.w / 2 + 1.5),
      corner = at(side, door.z + 1.95);
    routes.push([porch, corner], [porch, corner, at(side, -b.d / 2 - 1.5)]);
  }
  let best = Infinity,
    result = [sill, porch, at(door.x, door.z + 3.3)];
  for (const chain of routes) {
    const end = chain[chain.length - 1]!;
    let cost = 0;
    if (
      !chain.slice(1).every((p, i) => {
        cost += distance(chain[i]!, p);
        return clearPath(chain[i]!, p);
      })
    )
      continue;
    for (const seg of pieces) {
      const dest = closest(seg.a, seg.b, end.x, end.z);
      const d = distance(end, dest) + cost;
      if (d >= best || d > 42 || !clearPath(end, dest)) continue;
      best = d;
      result = [sill, ...chain, dest];
    }
  }
  return result;
}
interface Yard {
  b: BuildingSpec;
  c: number;
  s: number;
  treads: ReturnType<typeof buildingTreads>;
}
interface Path {
  a: V2;
  b: V2;
  radius: number;
}
interface Cell {
  yards: Yard[];
  paths: Path[];
}
const cells = new Map<number, Cell>();
const bin = (x: number, z: number) => (Math.floor(x / 8) + 512) * 1024 + Math.floor(z / 8) + 512;
function cover(x0: number, z0: number, x1: number, z1: number, put: (c: Cell) => void) {
  for (let x = Math.floor(x0 / 8) * 8; x <= x1; x += 8)
    for (let z = Math.floor(z0 / 8) * 8; z <= z1; z += 8) {
      const key = bin(x, z),
        c = cells.get(key) ?? { yards: [], paths: [] };
      put(c);
      cells.set(key, c);
    }
}
for (const b of buildings) {
  const yard = { b, c: Math.cos(b.yaw), s: Math.sin(b.yaw), treads: buildingTreads(b) };
  const r = Math.hypot(b.w, b.d) / 2 + 2.7;
  cover(b.x - r, b.z - r, b.x + r, b.z + r, (c) => c.yards.push(yard));
  const pts = approach(b);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      end = pts[i]!,
      path = { a, b: end, radius: b.kind === 'shrine' || b.kind === 'inn' ? 1.04 : 0.76 };
    cover(
      Math.min(a.x, end.x) - 2,
      Math.min(a.z, end.z) - 2,
      Math.max(a.x, end.x) + 2,
      Math.max(a.z, end.z) + 2,
      (c) => c.paths.push(path)
    );
  }
}
const sat = (n: number) => Math.min(1, Math.max(0, n));
const soilShade = rgba(57, 54, 41),
  joint = rgba(61, 64, 55),
  slab = rgba(143, 137, 113),
  edgeLight = rgba(167, 158, 132);
/** Dress the existing biome with worn ground, wall contact and actual door treads at world-pixel resolution. */
export const yardAt = (x: number, z: number) => cells.get(bin(x, z));
export function yardPixel(
  cell: Cell,
  x: number,
  z: number,
  base: number,
  trail: number,
  stone: number,
  grain: number
) {
  let wear = 0,
    contact = 0;
  const noise = 0.13 * Math.sin(x * 2.9 + z * 1.7) + 0.12 * Math.cos(z * 3.5 - x * 1.4) + grain * 0.09;
  for (const path of cell.paths) {
    const p = closest(path.a, path.b, x, z),
      d = distance(p, { x, z });
    wear = Math.max(wear, sat((path.radius + 0.34 + noise - d) / 0.7) * 0.78);
  }
  for (const yard of cell.yards) {
    const { b, c, s } = yard,
      dx = x - b.x,
      dz = z - b.z,
      lx = dx * c - dz * s,
      lz = dx * s + dz * c;
    const u = Math.abs(lx) - b.w / 2,
      v = Math.abs(lz) - b.d / 2,
      edge = Math.max(u, v);
    if (edge > 2.25) continue;
    const drain = Math.hypot(Math.max(u, 0), Math.max(v, 0));
    wear = Math.max(wear, sat((1.37 + noise * 1.9 - drain) / 1.45) * 0.53);
    contact = Math.max(contact, sat((0.75 - drain + noise * 0.4) / 0.78) * 0.48);
    for (const tread of yard.treads) {
      const across = lx - tread.x,
        along = lz - tread.zMin;
      if (Math.abs(across) > tread.halfX || along < 0 || lz > tread.zMax) continue;
      const lip = tread.zMax - lz;
      const flag = (across + tread.halfX + (tread.top > 0.3 ? 0.17 : 0.44)) % 0.86;
      const mark = lip < 0.13 || flag < 0.081 ? joint : along < 0.12 || lip < 0.22 ? edgeLight : slab;
      return mix(stone, mark, lip < 0.13 ? 189 : 157);
    }
  }
  return mix(mix(base, trail, wear * 256), soilShade, contact * 256);
}
