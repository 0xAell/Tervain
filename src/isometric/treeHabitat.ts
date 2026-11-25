import { forestClearingDistance } from '../core/world/forest';
import { toBuildingLocal } from '../core/world/interiors';
import {
  ARRIVAL_WRECK,
  FIELD_FENCE_MARGIN,
  HUNTER_CAMP,
  LANTERNS,
  PLACES,
  ROADS,
  SLUICE,
  WAGON,
  type V2,
} from '../core/world/layout';
import { distToPolylineWithin, realmRadius } from '../core/world/terrain';
import { waterProfile } from './channels';
import { crossingLocal, crossings } from './crossing';
import { sites } from './doorways';
import { fieldAt, onBeach, onQuarry } from './landCover';
import { terrainHeight, terrainSlope } from './relief';
import { onFootpath } from './settlement';

export const isTree = (key: string) => /^(pine|birch|oak|fir|rill_willow|rill_alder)$/.test(key);
export const trunkRadius = (p: { width: number }) => Math.max(0.22, p.width / 125);
const openSites = [
  { ...ARRIVAL_WRECK, radius: 10 },
  { ...HUNTER_CAMP, radius: 6.4 },
  { ...WAGON, radius: 6.4 },
  { ...SLUICE.control, radius: 4.6 },
  { x: 3, z: 9, radius: 10 },
  { ...PLACES.overlook, radius: 6 },
  ...LANTERNS.map((p) => ({ ...p, radius: 1 })),
];

/** Leave a section of the verge clear for a tree's roots and low crown. Large trees stand farther back. */
export function treeSetback(width: number) {
  return 0.42 + width / 28;
}
export function nearRoad(p: V2, margin: number) {
  return ROADS.some((road) => {
    const limit = road.width / 2 + 1.4 + margin;
    return distToPolylineWithin(p.x, p.z, road.points, limit) < limit;
  });
}

/** Ordinary trees and the planted willows use the same clearances and physical ground. */
export function canRootTree(p: V2, width: number) {
  const { x, z } = p,
    clearance = treeSetback(width);
  if (
    realmRadius(x, z) > 0.99 ||
    onBeach(x, z, clearance + 1.2) ||
    onQuarry(x, z, clearance) ||
    fieldAt(x, z, clearance + FIELD_FENCE_MARGIN) ||
    nearRoad(p, clearance) ||
    onFootpath(x, z, clearance + 0.34) ||
    forestClearingDistance(x, z) < clearance
  )
    return false;
  const wet = waterProfile(x, z);
  if (wet && wet.bank > -clearance - 0.8) return false;
  for (const bridge of crossings) {
    const { s, t } = crossingLocal(bridge, x, z);
    if (Math.abs(s) < bridge.halfLength + clearance && Math.abs(t) < bridge.halfWidth + clearance)
      return false;
  }
  for (const site of sites) {
    if (Math.abs(x - site.x) + Math.abs(z - site.z) > site.w + site.d + 2 * clearance + 4) continue;
    const l = toBuildingLocal(site, x, z);
    if (
      Math.abs(l.x) < site.w / 2 + clearance &&
      l.z > -site.d / 2 - clearance &&
      l.z < site.d / 2 + clearance + 2.3
    )
      return false;
  }
  if (openSites.some((at) => Math.hypot(x - at.x, z - at.z) < at.radius + clearance)) return false;
  if (terrainHeight(x, z) < 0.22 || terrainSlope(x, z) > 0.74) return false;
  // A flat triangle at the root can still end abruptly inside the trunk's footprint.
  const roots = trunkRadius({ width }) + 0.28;
  return (
    terrainSlope(x + roots, z) <= 0.88 &&
    terrainSlope(x - roots, z) <= 0.88 &&
    terrainSlope(x, z + roots) <= 0.88 &&
    terrainSlope(x, z - roots) <= 0.88
  );
}
