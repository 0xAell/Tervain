import { shoreDistance } from '../core/world/coast';
import { deepwoodCover, forestClearingCover, forestOpeningCover } from '../core/world/forest';
import { toBuildingLocal } from '../core/world/interiors';
import { FIELDS, FOREST_REGION, INLAND_HAMLET, PLACES } from '../core/world/layout';
import { smoothstep } from '../core/world/noise';
import { realmRadius } from '../core/world/terrain';

export function onBeach(x: number, z: number, margin = 0) {
  return x < -220 + margin && shoreDistance(x, z) < 15 + 2 * Math.sin(z * 0.2) + margin;
}
export function fieldAt(x: number, z: number, margin = 0) {
  for (const field of FIELDS) {
    if (Math.abs(x - field.x) + Math.abs(z - field.z) > field.w + field.d + margin * 2) continue;
    const p = toBuildingLocal(field, x, z);
    if (Math.abs(p.x) < field.w / 2 + margin && Math.abs(p.z) < field.d / 2 + margin) return field;
  }
}
export function onQuarry(x: number, z: number, margin = 0) {
  return Math.hypot(x - PLACES.quarry.x, z - (PLACES.quarry.z + 1)) < 20 + margin;
}
export function woodlandCover(x: number, z: number) {
  if (
    x <= FOREST_REGION.minX ||
    x >= FOREST_REGION.maxX ||
    z <= FOREST_REGION.minZ ||
    z >= FOREST_REGION.maxZ
  )
    return 0;
  const wood = deepwoodCover(x, z);
  if (!wood) return 0;
  const hamlet = Math.hypot(x - INLAND_HAMLET.x, z - INLAND_HAMLET.z);
  return wood * forestClearingCover(x, z) * forestOpeningCover(x, z) * smoothstep(22, 43, hamlet);
}

/** The surface under roads and woodland litter. The chart and the ground tiles use these same masks. */
export function landMaterial(x: number, z: number) {
  if (onBeach(x, z)) return 'sand';
  if (fieldAt(x, z)) return 'field';
  if (onQuarry(x, z) || realmRadius(x, z) > 1.03) return 'rock';
  if (Math.hypot(x - 3, z - 9) < 12) return 'stone';
  return 'grass';
}
