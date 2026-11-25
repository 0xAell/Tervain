import { BUILDINGS, FOREST_RUIN, LIGHTHOUSE, type BuildingSpec, type V2 } from '../core/world/layout';
import { buildingEntry } from '../core/world/buildingEntries';
import { fromBuildingLocal, toBuildingLocal } from '../core/world/interiors';
import type { WorldState } from '../core/game/types';
import { campShelter } from './settlement';

const tower: BuildingSpec = {
  id: 'lantern_tower',
  kind: 'keeper',
  ...LIGHTHOUSE,
  w: 5.4,
  d: 5.4,
  yaw: 0,
  wall: 'stone',
  roof: 'hip',
};
const ruin: BuildingSpec = {
  id: 'forest_ruin',
  kind: 'shrine',
  ...FOREST_RUIN,
  w: 8.2,
  d: 6.8,
  h: 4,
  wall: 'stone',
  roof: 'hip',
};
export const sites = [...BUILDINGS, campShelter, tower, ruin];
export const sitesById = new Map(sites.map((s) => [s.id, s]));

export interface Doorway {
  id: string;
  site: BuildingSpec;
  sill: V2;
  outside: V2;
  rear: boolean;
  halfWidth: number;
}
function makeDoor(site: BuildingSpec, rear = false): Doorway {
  const entry = buildingEntry(site),
    sign = rear ? -1 : 1;
  const x = rear ? 0 : entry.x,
    z = (sign * site.d) / 2;
  return {
    id: site.id + (rear ? '/shutter' : '/front'),
    site,
    rear,
    sill: fromBuildingLocal(site, x, z),
    outside: fromBuildingLocal(site, x, z + sign * 1.6),
    halfWidth: rear ? 0.95 : entry.w / 2 + 0.22,
  };
}
export const doorways = sites.flatMap((site) =>
  site.id === 'archive' ? [makeDoor(site), makeDoor(site, true)] : [makeDoor(site)]
);
export const doorsById = new Map(doorways.map((door) => [door.id, door]));
export const frontDoor = (site: BuildingSpec) => doorsById.get(site.id + '/front')!;
export function doorOpen(door: Doorway, state: WorldState) {
  return (
    door.site.id !== 'archive' ||
    (door.rear
      ? state.locationChanges.archive_shutter === 'forced'
      : state.locationChanges.archive_door === 'open')
  );
}
export function siteAtPoint(p: V2) {
  return sites.find((b) => {
    if (Math.abs(p.x - b.x) + Math.abs(p.z - b.z) > b.w + b.d) return false;
    const l = toBuildingLocal(b, p.x, p.z);
    return Math.abs(l.x) < b.w / 2 && Math.abs(l.z) < b.d / 2;
  });
}
/** Walking, pointing and the exterior artwork all use the same authored threshold. */
export function crossedDoor(from: V2, to: V2, site: BuildingSpec) {
  const a = toBuildingLocal(site, from.x, from.z),
    b = toBuildingLocal(site, to.x, to.z);
  if (a.z === b.z) return undefined;
  for (const door of doorways) {
    if (door.site !== site) continue;
    const z = ((door.rear ? -1 : 1) * site.d) / 2,
      t = (z - a.z) / (b.z - a.z);
    if (t < -0.0001 || t > 1.0001) continue;
    const x = door.rear ? 0 : buildingEntry(site).x;
    if (Math.abs(a.x + (b.x - a.x) * t - x) <= door.halfWidth) return door;
  }
}
