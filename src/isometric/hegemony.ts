import { buildingEntry } from '../core/world/buildingEntries';
import { toBuildingLocal } from '../core/world/interiors';
import { BUILDINGS, FIELDS, HUNTER_CAMP, PLACES, SLUICE, WAGON, WELL, frontOf, type V2 } from '../core/world/layout';
import { realmRadius, roadWeight } from '../core/world/terrain';
import { waterProfile } from './channels';
import { crossings, crossingLocal, crossingPoint } from './crossing';
import { risePixels } from './projection';
import { terrainHeight } from './relief';
import { onFootpath } from './settlement';

type Post = 'standard_court' | 'standard_watch';
export type StandardKey = Post | 'standard_wall';
export const standardSize = {
  standard_court: { width: 36, height: 58, radius: 0.29 },
  standard_watch: { width: 28, height: 49, radius: 0.23 },
  standard_wall: { width: 24, height: 27, radius: 0 },
} satisfies Record<StandardKey, { width: number; height: number; radius: number }>;
export const isHegemonyStandard = (key: string): key is StandardKey => Object.hasOwn(standardSize, key);
export interface Standard extends V2 {
  key: StandardKey;
  width: number;
  phase: number;
  chart?: boolean;
  lift?: number;
  elevation?: number;
  flip?: boolean;
}

const distance = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const phaseAt = (p: V2) => ((p.x * 47 + p.z * 23) & 15) + 3;
const dryStandingGround = (p: V2) => {
  if (roadWeight(p.x, p.z) > 0.14 || onFootpath(p.x, p.z) || realmRadius(p.x, p.z) > 0.98) return false;
  if ((waterProfile(p.x, p.z)?.bank ?? -10) > -0.62) return false;
  for (const bridge of crossings) {
    const { s, t } = crossingLocal(bridge, p.x, p.z);
    if (Math.abs(s) < bridge.halfLength + 0.4 && Math.abs(t) < bridge.halfWidth + 1.2) return false;
  }
  for (const b of BUILDINGS) {
    if (Math.abs(p.x - b.x) + Math.abs(p.z - b.z) > b.w + b.d + 10) continue;
    const local = toBuildingLocal(b, p.x, p.z);
    if (Math.abs(local.x) < b.w / 2 + 1.25 && local.z > -b.d / 2 - 1 && local.z < b.d / 2 + 2.35)
      return false;
  }
  for (const f of FIELDS) {
    const local = toBuildingLocal(f, p.x, p.z);
    if (Math.abs(local.x) < f.w / 2 + 0.65 && Math.abs(local.z) < f.d / 2 + 0.65) return false;
  }
  return ![WELL, WAGON, HUNTER_CAMP, SLUICE.control].some((point) => distance(p, point) < 2.2);
};

const standards: Standard[] = [];
function setPost(key: Post, point: V2) {
  if (!dryStandingGround(point)) return false;
  const phase = phaseAt(point);
  standards.push({ ...point, key, width: standardSize[key].width, chart: true, phase, flip: phase % 2 === 1 });
  return true;
}
function landmark(key: Post, center: V2, offsets: readonly (readonly [number, number])[]) {
  for (const [x, z] of offsets) if (setPost(key, { x: center.x + x, z: center.z + z })) return;
}

// Each post belongs to a maintained landmark: beacon, waystation, sluice or bridge approach.
landmark('standard_watch', PLACES.lantern_point, [
  [2.2, 9],
  [5, 11.4],
  [3, 3.4],
]);
landmark('standard_watch', WAGON, [
  [-4.6, 2.3],
  [1.2, 5.4],
  [5.2, 3],
]);
landmark('standard_watch', SLUICE.control, [
  [-6.9, -0.4],
  [-6.4, 0.1],
  [-7.4, -0.9],
]);
const [footbridge] = crossings;
if (footbridge) {
  const bank = footbridge.halfLength + 1.6;
  const verge = footbridge.halfWidth + 1.8;
  if (!setPost('standard_court', crossingPoint(footbridge, bank, verge)))
    setPost('standard_court', crossingPoint(footbridge, bank, -verge));
}

const wallSites = new Set(['reeve_house', 'shrine_hall', 'quarry_office']);
for (const b of BUILDINGS) {
  if (!wallSites.has(b.id)) continue;
  const key = 'standard_wall',
    side = buildingEntry(b).x > 0 ? -1 : 1,
    outside = frontOf(b, 0.3, side * (b.w * 0.5 - 1.3)),
    size = standardSize[key],
    eave = Math.round(b.h * risePixels),
    width = Math.min(size.width, Math.floor(((eave - 3) * size.width) / size.height));
  standards.push({
    ...outside,
    key,
    width,
    phase: phaseAt(outside),
    flip: b.yaw > 0.4,
    elevation: terrainHeight(b.x, b.z),
    lift: eave - Math.round((size.height * width) / size.width),
    chart: b.id !== 'reeve_house',
  });
}

export const hegemonyStandards: readonly Standard[] = standards;
