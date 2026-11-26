import { canClimb } from './relief';
import { PROJECTION } from './projection';
import { passesFixtures, villageFixtures, warmingFire } from './villageFixtures';
import { bankPlants } from './riverHabitat';
import { hegemonyStandards } from './hegemony';
import { landMaterial, woodlandCover } from './landCover';
import { canRootTree, isTree } from './treeHabitat';
import { passesRails } from './crossing';
import { campShelter, buildingSprite, onFootpath } from './settlement';
import { forestStandAt } from '../core/world/forestStands';
import { fbm, smoothstep } from '../core/world/noise';
import { toBuildingLocal } from '../core/world/interiors';
import { crossedDoor, doorOpen, siteAtPoint } from './doorways';
import type { WorldState } from '../core/game/types';
import { wetPoint, waterProfile } from './channels';
import {
  coastalRocks,
  quarryRocks,
  riverStones,
  springRock,
  strandWreck,
  passesRocks,
  type StoneObstacle,
} from './waterObstacles';
import { coastX } from '../core/world/coast';
import { roadWeight, realmRadius } from '../core/world/terrain';
import {
  ARRIVAL_WRECK,
  ARRIVAL_SIGN,
  FOREST_WAYMARKERS,
  FOREST_RUIN,
  BUILDINGS,
  BENCHES,
  COOKFIRES,
  BELL,
  HUNTER_CAMP,
  LANTERNS,
  LIGHTHOUSE,
  NOTICEBOARD,
  PLACES,
  QUARRY_BOULDERS,
  SLUICE,
  WAGON,
  WAGON_TALLY,
  WELL,
  WORLD,
  type BuildingSpec,
  type V2,
} from '../core/world/layout';
import type { PlaceId } from '../core/game/types';

export const CELL = 4;
export { project, unproject, PROJECTION } from './projection';
export const tileSpan = CELL * 2 * PROJECTION;
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
  const wet = waterAt(x, z);
  if (wet) return wet;
  if (roadWeight(x, z) > 0.36 || onFootpath(x, z)) return 'trail';
  const soil = landMaterial(x, z);
  return soil === 'grass' && woodlandCover(x, z) > 0.43 ? 'woodland' : soil;
}
export function navigable(from: V2, to: V2, open: boolean | WorldState, lift = 0) {
  return (
    to.x > WORLD.minX + 1 &&
    to.x < WORLD.maxX - 1 &&
    to.z > WORLD.minZ + 1 &&
    to.z < WORLD.maxZ - 1 &&
    realmRadius(to.x, to.z) < 1.01 &&
    passesRails(from, to) &&
    passesRocks(from, to, lift) &&
    passesFixtures(from, to, lift) &&
    canClimb(from, to) &&
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
  sprite?: string;
  width: number;
  building?: BuildingSpec;
  flip?: boolean;
  phase?: number;
  lift?: number;
  elevation?: number;
  paidKey?: string;
  submerged?: number;
  rock?: StoneObstacle;
}
let sceneryCache: Scenery[] | undefined;
const trees: Record<string, readonly string[]> = {
  pine: ['pine', 'pine--broad', 'pine--lean'],
  fir: ['fir', 'fir--young'],
  oak: ['oak', 'oak--lean'],
  birch: ['birch', 'birch--fork'],
};
const workedGround = [WELL, BELL, NOTICEBOARD, WAGON, ...LANTERNS, ...COOKFIRES, warmingFire, ...Object.values(BENCHES)];
export function scenery() {
  if (sceneryCache) return sceneryCache;
  const list: Scenery[] = [];
  const put = (key: string, p: V2, width: number, sprite?: string) => {
    const variants = trees[key];
    if (variants) sprite = variants[Math.floor(random(p.x, p.z, 155) * variants.length) % variants.length];
    list.push({ x: p.x, z: p.z, key, width: key === 'flowers' ? width * 0.6 : width, sprite });
  };
  for (const b of [...BUILDINGS, campShelter])
    list.push({ ...b, key: buildingSprite[b.kind], width: (b.w + b.d) * PROJECTION, building: b });
  // The stern rests at the tide line; the salvage remains reachable at the inland end of the wreck.
  put('wreck', strandWreck, strandWreck.width);
  for (const stone of [...coastalRocks, springRock]) list.push({ ...stone, key: 'tide_rocks', rock: stone });
  for (const [i, s] of riverStones.entries()) {
    const k = random(s.x * 3, s.z * 3, 501),
      key = k < 0.34 ? 'rill_slab' : k < 0.62 ? 'rill_pebbles' : 'rill_boulder';
    list.push({
      ...s,
      key,
      rock: s,
      flip: i % 3 === 0,
      submerged: wetPoint(s.x, s.z)?.kind === 'river' ? (key === 'rill_pebbles' ? 0.12 : 0.17 + k * 0.1) : 0,
    });
  }
  for (const plant of bankPlants) list.push({ ...plant });
  put('driftwood', { x: coastX(35) - 0.2, z: 35 }, 43);
  put('driftwood', { x: coastX(7) + 3, z: 7 }, 35);
  put('reeds', { x: -12.6, z: -93 }, 23);
  put('sign', ARRIVAL_SIGN, 24);
  put('beacon', LIGHTHOUSE, 61);
  put('table', HUNTER_CAMP, 33);
  for (const fire of COOKFIRES) put('fire', fire, 25, 'cookfire');
  put('fire', warmingFire, 20);
  put('ruin', FOREST_RUIN, 95);
  for (const fixture of villageFixtures) put(fixture.key, fixture.at, fixture.width);
  put('sluice', SLUICE.gateCenter, 73);
  put('cart', WAGON, 49);
  list.push({ ...WAGON_TALLY, key: 'chest', paidKey: 'room_open_chest', width: 21 });
  for (const p of QUARRY_BOULDERS) if (p.width * 8 < 30) put('rockpile', p, p.width * 8);
  for (const p of quarryRocks) list.push({ x: p.x, z: p.z, width: p.width, key: 'rockpile', rock: p });
  for (const p of FOREST_WAYMARKERS) put('marker', p, 16);
  for (const p of LANTERNS) put('lantern', p, 25);
  for (const p of Object.values(BENCHES)) put('seat', p, 34);
  list.push(...hegemonyStandards);
  const riversideTrees = bankPlants.filter((p) => isTree(p.key));
  for (let x = WORLD.minX; x < WORLD.maxX; x += 6)
    for (let z = WORLD.minZ; z < WORLD.maxZ; z += 6) {
      const p = { x: x + random(x, z, 11) * 5, z: z + random(x, z, 21) * 5 };
      const g = waterAt(p.x, p.z) ?? (roadWeight(p.x, p.z) > 0.36 ? 'trail' : landMaterial(p.x, p.z)),
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
      // Loose stones have persistent identities and can already be in a player's house.
      // Keep that stock; give rooted growth and new shore debris clearance around worked ground.
      const k = random(x, z, 34);
      const looseStone = g !== 'sand' && r > 0.62 && (g === 'rock' || k < 0.35);
      if (!looseStone && (onFootpath(p.x, p.z) || workedGround.some((at) => distance(at, p) < 2.25))) continue;
      if (hegemonyStandards.some((standard) => standard.lift === undefined && distance(standard, p) < 1.8))
        continue;
      const bank = waterProfile(p.x, p.z);
      if (bank && bank.course !== 'ocean' && bank.bank < 0) {
        continue;
      }
      const wood = g === 'grass' ? woodlandCover(p.x, p.z) : 0,
        beach = g === 'sand';
      if (g === 'grass' && r < 0.62) {
        const copse = smoothstep(0.05, 0.53, fbm(p.x / 35, p.z / 41, 2, 67)),
          density = Math.min(0.62, 0.022 + copse * 0.16 + wood * 0.86),
          width = 45 + wood * 12 + random(x, z, 2) * 34;
        if (
          r < density &&
          canRootTree(p, width) &&
          !riversideTrees.some((tree) => distance(tree, p) < (tree.width + width) / 28)
        ) {
          const source =
            wood > 0.25
              ? forestStandAt(p.x, p.z).sp
              : bank && bank.course !== 'ocean'
                ? 'birch'
                : copse > 0.58
                  ? 'oak'
                  : 'pine';
          // Tall fir sprites close the sheltered stands. The spreading pine silhouettes suit exposed ground.
          const shelter = fbm(p.x / 23 + 5, p.z / 25 - 4, 2, 183);
          const family =
            source === 'pine' && wood > 0.32 && shelter > -0.32
              ? 'fir'
              : source === 'oak' && wood > 0.24 && shelter > 0.22
                ? 'birch'
                : source;
          put(family, p, width);
        }
      } else if (r > (beach ? 0.82 : 0.62)) {
        put(
          beach
            ? k < 0.32
              ? 'tide_rocks'
              : bank && bank.course !== 'ocean' ? 'reeds' : 'driftwood'
            : g === 'rock' || k < 0.35
              ? 'rockpile'
              : k > 0.84
                ? 'flowers'
                : g === 'grass' && wood < 0.48
                  ? k > 0.61
                    ? 'rill_fern'
                    : 'rill_spirea'
                  : 'brush',
          p,
          10 + random(x, z, 23) * (g === 'rock' ? 42 : 19)
        );
      }
    }
  sceneryCache = list;
  return list;
}
