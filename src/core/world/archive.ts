import { ARCHIVE_ROOM, bySpec } from './layout';

/**
 * The archive as a room one can be shut in: where its floor is, when a body still stands in its doorway, and which
 * of its openings stand closed. A sealed archive never closes around someone inside it.
 */

/** The archive's floor, in the world (m): its centre and half its width and depth. */
export const ARCHIVE_FLOOR = { x: -46, z: -102, halfWidth: 3.6, halfDepth: 3.1 } as const;

/** Whether a point is on the archive's floor. */
export function insideArchive(x: number, z: number): boolean {
  return Math.abs(x - ARCHIVE_FLOOR.x) < ARCHIVE_FLOOR.halfWidth && Math.abs(z - ARCHIVE_FLOOR.z) < ARCHIVE_FLOOR.halfDepth;
}

/**
 * Inside, or with any part of a body of `radius` still in the door's or the shutter's opening. A sealed archive
 * closes only behind someone clear of both: counted out mid-doorway, the closing door pushed him back in, again and
 * again.
 */
export function occupiesArchive(x: number, z: number, radius: number): boolean {
  if (insideArchive(x, z)) return true;
  const b = bySpec('archive'), t = ARCHIVE_ROOM.wallThickness, dx = Math.abs(x - b.x), dz = Math.abs(z - b.z);
  return dz > b.d / 2 - t - radius && dz < b.d / 2 + t + radius
    && dx < (z > b.z ? ARCHIVE_ROOM.doorHalfWidth : ARCHIVE_ROOM.shutterHalfWidth) + radius;
}

/**
 * Which of the archive's openings stand as walls: its door when locked, its shutter unless forced, and neither while
 * someone occupies the room. Whoever holds the colliders applies it, again once he has stepped out.
 */
export function archiveBarriers(door: string, shutter: string, occupied: boolean): { door: boolean; shutter: boolean } {
  return { door: door === 'locked' && !occupied, shutter: shutter !== 'forced' && !occupied };
}
