import { bankPlants } from './riverHabitat';
import { passesRails } from './crossing';
import { campShelter, buildingSprite } from './settlement';
import { toBuildingLocal } from '../core/world/interiors';
import { crossedDoor, doorOpen, siteAtPoint } from './doorways';
import type { WorldState } from '../core/game/types';
import { wetPoint, waterProfile, riverStones } from './water';
import { coastX, shoreDistance } from '../core/world/coast';
import { roadWeight, realmRadius } from '../core/world/terrain';
import {
  ARRIVAL_WRECK,
  ARRIVAL_SIGN,
  FOREST_WAYMARKERS,
  FOREST_RUIN,
  BUILDINGS,
  BENCHES,
  BELL,
  FIELDS,
  FOREST_REGION,
  HUNTER_CAMP,
  LANTERNS,
  LIGHTHOUSE,
  NOTICEBOARD,
  PLACES,
  QUARRY_BOULDERS,
  SLUICE,
  WAGON,
  WELL,
  WORLD,
  type BuildingSpec,
  type V2,
} from '../core/world/layout';
import type { PlaceId } from '../core/game/types';

export const CELL = 4;
export const PROJECTION = 6;
export const tileSpan = CELL * 2 * PROJECTION;
export function project(x: number, z: number) {
  return { x: (x - z) * PROJECTION, y: ((x + z) * PROJECTION) / 2 };
}
export function unproject(x: number, y: number): V2 {
  return { x: (y + x / 2) / PROJECTION, z: (y - x / 2) / PROJECTION };
}
export const distance = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export function random(x: number, z: number, salt = 0) {
  let value = Math.imul(Math.floor(x), 73856093) ^ Math.imul(Math.floor(z), 19349663) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
export function buildingLocal(p: V2, b: BuildingSpec) {
  return toBuildingLocal(b, p.x, p.z);
}
export const inBuilding = siteAtPoint;
export function enteredThroughDoor(from: V2, to: V2, access: boolean | WorldState) {
  const a = inBuilding(from),
    b = inBuilding(to);
  if (a === b) return true;
  for (const site of [a, b]) {
    if (!site) continue;
    const door = crossedDoor(from, to, site);
    if (!door || (typeof access === 'boolean' ? site.id === 'archive' && !access : !doorOpen(door, access)))
      return false;
  }
  return true;
}
export function waterAt(x: number, z: number) {
  return wetPoint(x, z)?.kind ?? null;
}
export function groundAt(x: number, z: number) {
  return waterAt(x, z) ?? dryGroundAt(x, z);
}
export function dryGroundAt(x: number, z: number, lane = roadWeight(x, z)) {
  if (lane > 0.36) return 'trail';
  if (shoreDistance(x, z) < 15 + 2 * Math.sin(z * 0.2)) return 'sand';
  if (FIELDS.some((f) => Math.abs(f.x - x) < f.w / 2 && Math.abs(f.z - z) < f.d / 2)) return 'field';
  if (Math.hypot(x - 88, z + 23) < 20 || realmRadius(x, z) > 1.03) return 'rock';
  if (Math.hypot(x - 3, z - 9) < 12) return 'stone';
  if (
    x > FOREST_REGION.minX &&
    x < FOREST_REGION.maxX &&
    z > FOREST_REGION.minZ &&
    z < FOREST_REGION.maxZ &&
    Math.hypot(x + 82, z - 34) > 26
  )
    return 'woodland';
  return 'grass';
}
export function navigable(from: V2, to: V2, open: boolean | WorldState) {
  return (
    to.x > WORLD.minX + 1 &&
    to.x < WORLD.maxX - 1 &&
    to.z > WORLD.minZ + 1 &&
    to.z < WORLD.maxZ - 1 &&
    realmRadius(to.x, to.z) < 1.01 &&
    passesRails(from, to) &&
    enteredThroughDoor(from, to, open)
  );
}
export const placeList = Object.entries(PLACES) as [PlaceId, (typeof PLACES)[PlaceId]][];
export function location(p: V2): PlaceId {
  return placeList.reduce((best, entry) =>
    distance(p, entry[1]) / entry[1].r < distance(p, best[1]) / best[1].r ? entry : best
  )[0];
}

export interface Scenery extends V2 {
  key: string;
  width: number;
  building?: BuildingSpec;
  flip?: boolean;
  phase?: number;
  submerged?: number;
}
export function scenery() {
  const list: Scenery[] = [];
  const put = (key: string, p: V2, width: number) => list.push({ x: p.x, z: p.z, key, width });
  for (const b of [...BUILDINGS, campShelter])
    list.push({ ...b, key: buildingSprite[b.kind], width: (b.w + b.d) * PROJECTION, building: b });
  // The stern rests at the tide line; the salvage remains reachable at the inland end of the wreck.
  put('wreck', { x: coastX(ARRIVAL_WRECK.z) - 0.9, z: ARRIVAL_WRECK.z }, 143);
  for (const [z, offshore, width] of [
    [16, 5, 42],
    [21, 8, 24],
    [40, 10, 56],
    [64, 4, 34],
    [-35, 6, 36],
    [90, 7, 55],
  ] as const)
    put('tide_rocks', { x: coastX(z) - offshore, z }, width);
  for (const [i, s] of riverStones.entries()) {
    const k = random(s.x * 3, s.z * 3, 501),
      key = k < 0.34 ? 'rill_slab' : k < 0.62 ? 'rill_pebbles' : 'rill_boulder';
    list.push({
      ...s,
      key,
      flip: i % 3 === 0,
      submerged: wetPoint(s.x, s.z)?.kind === 'river' ? (key === 'rill_pebbles' ? 0.12 : 0.17 + k * 0.1) : 0,
    });
  }
  for (const plant of bankPlants) list.push({ ...plant });
  put('driftwood', { x: coastX(35) - 0.2, z: 35 }, 43);
  put('driftwood', { x: coastX(7) + 3, z: 7 }, 35);
  put('reeds', { x: -12.6, z: -93 }, 23);
  put('tide_rocks', { x: -11.9, z: -95.5 }, 28);
  put('sign', ARRIVAL_SIGN, 37);
  put('beacon', LIGHTHOUSE, 114);
  put('table', HUNTER_CAMP, 33);
  put('fire', { x: HUNTER_CAMP.x + 2, z: HUNTER_CAMP.z + 1 }, 23);
  put('fire', { x: -86, z: 34 }, 25);
  put('ruin', FOREST_RUIN, 95);
  put('well', WELL, 41);
  put('bell', BELL, 40);
  put('board', NOTICEBOARD, 40);
  put('sluice', SLUICE.gateCenter, 73);
  put('cart', WAGON, 62);
  for (const p of QUARRY_BOULDERS) put('rockpile', p, p.width * 8);
  for (const p of FOREST_WAYMARKERS) put('marker', p, 25);
  for (const p of LANTERNS) put('lantern', p, 20);
  for (const p of Object.values(BENCHES)) put('seat', p, 34);
  for (let x = WORLD.minX; x < WORLD.maxX; x += 6)
    for (let z = WORLD.minZ; z < WORLD.maxZ; z += 6) {
      const p = { x: x + random(x, z, 11) * 5, z: z + random(x, z, 21) * 5 };
      const g = groundAt(p.x, p.z),
        r = random(x, z, 92);
      if (
        g === 'sea' ||
        g === 'shallows' ||
        g === 'river' ||
        g === 'pool' ||
        g === 'trail' ||
        g === 'stone' ||
        g === 'field' ||
        inBuilding(p)
      )
        continue;
      if (BUILDINGS.some((b) => distance(b, p) < Math.max(b.w, b.d) * 1.02) || distance(p, ARRIVAL_WRECK) < 8)
        continue;
      const bank = waterProfile(p.x, p.z);
      if (bank && bank.course !== 'ocean' && bank.bank < 0) {
        continue;
      }
      const wood = g === 'woodland',
        beach = g === 'sand';
      if (r < (wood ? 0.7 : g === 'grass' ? 0.095 : 0) && roadWeight(p.x, p.z) < 0.08) {
        const trees = ['pine', 'oak', 'fir', 'birch'];
        put(trees[Math.floor(random(x, z, 1) * 4)]!, p, (wood ? 58 : 48) + random(x, z, 2) * 36);
      } else if (r > (beach ? 0.51 : 0.62)) {
        const k = random(x, z, 34);
        put(
          beach
            ? k < 0.32
              ? 'tide_rocks'
              : 'reeds'
            : g === 'rock' || k < 0.35
              ? 'rockpile'
              : k > 0.84
                ? 'flowers'
                : g === 'grass'
                  ? k > 0.61
                    ? 'rill_fern'
                    : 'rill_spirea'
                  : 'brush',
          p,
          10 + random(x, z, 23) * (g === 'rock' ? 42 : 19)
        );
      }
    }
  return list;
}
