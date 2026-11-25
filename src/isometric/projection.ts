import type { V2 } from '../core/world/layout';

export const PROJECTION = 6;
export const risePixels = 8;

/** Orthographic view of a world-space point. Its third coordinate is metres above the water datum. */
export function project(x: number, z: number, height = 0) {
  return { x: (x - z) * PROJECTION, y: (x + z) * PROJECTION * 0.5 - height * risePixels };
}
export function unproject(x: number, y: number): V2 {
  return { x: (y + x * 0.5) / PROJECTION, z: (y - x * 0.5) / PROJECTION };
}
