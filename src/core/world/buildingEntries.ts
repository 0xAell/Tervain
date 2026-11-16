import { ARCHIVE_ROOM, BUILDINGS, type BuildingSpec } from './layout';

/**
 * A stone a body stands on or cargo rests on, as a rectangle in a building's own frame (x across its front, z out of
 * it), with its top above the building's ground. The terrain stands walkers on these and the physics rests cargo on
 * them, so both read them from here and cannot part.
 */
export interface LocalSupport { x: number; halfX: number; zMin: number; zMax: number; top: number }

/** How far a support's stone reaches below the lowest ground beneath it (m), so nothing slips under its edge. */
export const SUPPORT_FOOTING = 0.3;

/** Existing authored door positions, measured from the native procedural 0.0.7 buildings in their actual world frames.
 * Keeping them independent of decorative RNG lets stone steps, standing support and the visible doorway agree. */
const DOOR_OFFSETS: Record<string, number> = {
  reeve_house: -0.17631531, bakery: -0.50346279, inn: -0.74414015, mill: 0.18086243,
  house_a: -0.47555430, house_b: -0.58369432, house_c: -0.58805038, house_d: 0.67604438,
  house_e: 0.00125549, house_f: 0.36482004, sluice_hut: 0.36242398,
  quarry_office: 0.27918542, crew_bunks: 0.79872764, overlook_lodge: -0.54890063,
  fisher_house: -0.46805135, net_store: -0.32518170, keeper_cottage: 0.04913145,
};

export function buildingEntry(b: BuildingSpec) {
  return b.kind === 'shrine'
    ? { x: 0, y: 0.5, z: b.d / 2 + 0.05, w: 1.9, h: 3 }
    : { x: DOOR_OFFSETS[b.id] ?? 0, y: 0.4, z: b.d / 2 + 0.03, w: 1.05, h: 2.05 };
}

/** The same five terrain samples used by the rendered building foundation. */
export function buildingGround(heightAt: (x: number, z: number) => number, b: { x: number; z: number; w: number; d: number; yaw: number }) {
  let lo = Infinity, hi = -Infinity, sum = 0;
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const) {
    const lx = sx * b.w / 2, lz = sz * b.d / 2;
    const h = heightAt(b.x + lx * c + lz * s, b.z - lx * s + lz * c);
    lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h;
  }
  return { avg: sum / 5, lo, hi };
}

/**
 * The two stone treads before a closed building's door. The upper runs from the wall line out (A87 scout): the shrine's
 * door stands 2 cm proud of the others, and a tread begun from it left a strip of bare ground 0.8 m below the hall
 * floor that walkers at 30-60 Hz stopped at.
 */
export function buildingTreads(b: BuildingSpec): LocalSupport[] {
  const entry = buildingEntry(b);
  return [
    { x: entry.x, halfX: (entry.w + 0.7) / 2, zMin: Math.min(entry.z + 0.07, b.d / 2 + 0.1), zMax: entry.z + 0.77, top: entry.y + 0.08 },
    { x: entry.x, halfX: (entry.w + 0.9) / 2, zMin: entry.z + 0.71, zMax: entry.z + 1.21, top: entry.y * 0.5 },
  ];
}

/**
 * The enterable archive's own supports, tops above the ground at its centre: the forced rear entry's stone sill, the
 * front door's sill, and the plank floor between its walls. The first that holds a point is the one stood on.
 */
export function archiveSupports(archive: BuildingSpec): LocalSupport[] {
  const hd = archive.d / 2, wall = ARCHIVE_ROOM.wallThickness;
  return [
    { x: 0, halfX: ARCHIVE_ROOM.shutterHalfWidth, zMin: -hd - wall, zMax: -hd + wall, top: ARCHIVE_ROOM.shutterBottom },
    { x: 0, halfX: ARCHIVE_ROOM.doorHalfWidth, zMin: hd - wall, zMax: hd + wall + 0.2, top: ARCHIVE_ROOM.floorTop },
    { x: 0, halfX: archive.w / 2 - wall, zMin: -(hd - wall), zMax: hd - wall, top: ARCHIVE_ROOM.floorTop },
  ];
}

/** Whether a point in a building's frame stands on a support (within `slack` of its edge). */
export function onSupport(support: LocalSupport, lx: number, lz: number, slack = 0): boolean {
  return Math.abs(lx - support.x) <= support.halfX + slack && lz >= support.zMin - slack && lz <= support.zMax + slack;
}

/** Exterior stone treads of closed buildings. No roofs or interiors become walking supports by this rule. */
export function buildingStepSurfacesAt(x: number, z: number, heightAt: (x: number, z: number) => number): number[] {
  const surfaces: number[] = [];
  for (const b of BUILDINGS) {
    if (b.kind === 'archive') continue; // The enterable archive has its own measured sill and floor.
    const dx = x - b.x, dz = z - b.z;
    if (Math.hypot(dx, dz) > Math.hypot(b.w, b.d) / 2 + 1.8) continue;
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    let localTop: number | undefined;
    for (const tread of buildingTreads(b)) if (onSupport(tread, lx, lz)) localTop = Math.max(localTop ?? -Infinity, tread.top);
    if (localTop !== undefined) surfaces.push(buildingGround(heightAt, b).avg + localTop);
  }
  return surfaces;
}
