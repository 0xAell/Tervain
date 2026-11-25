import type { V2 } from '../core/world/layout';
import type { RoomTarget } from './roomTargets';

export type FieldSound =
  | 'bow_draw'
  | 'bow_release'
  | 'arrow_flesh'
  | 'arrow_ground'
  | 'skinning_complete'
  | 'block'
  | 'hit';
export type Gesture = 'pet' | 'gather' | 'sit' | 'stir' | 'dress' | 'work' | 'read';
export interface Activity {
  kind: Gesture;
  target: RoomTarget;
  room: string;
  duration: number;
  elapsed: number;
  contact: number;
  finish?: () => void;
}
export const gestureLabels: Record<Gesture, string> = {
  pet: 'Petting',
  gather: 'Gathering',
  sit: 'Seated',
  stir: 'Cooking',
  dress: 'Skinning',
  work: 'Working',
  read: 'Reading',
};
export const DRAW_TIME = 0.42;
export const SWING_TIME = 0.48;
export const SWING_CONTACT = (SWING_TIME * 4) / 7;
export interface Contact extends V2 {
  height: number;
  dx: number;
  dz: number;
  born: number;
  kind: 'blade' | 'guard' | 'body' | 'earth';
}
export const RELEASE_TIME = 0.34;
export const ARROW_RANGE = 45;
export const ARROW_SPEED = 39;
export interface Draw {
  phase: 'draw' | 'hold' | 'loose';
  elapsed: number;
  released: boolean;
  grade?: number;
  direction: V2;
  head?: string;
}
export function arrowLift(travelled: number) {
  const range = travelled / ARROW_RANGE;
  return 20 * (1 - 0.55 * range) + 3 * Math.sin(Math.PI * range);
}
export interface Arrow extends V2 {
  launchHeight: number;
  grade: number;
  direction: V2;
  travelled: number;
  head?: string;
}
export function unit(x: number, z: number): V2 {
  const length = Math.hypot(x, z);
  return length > 0.0001 ? { x: x / length, z: z / length } : { x: 0, z: 1 };
}
/** First contact along a swept segment, measured in world units. */
export function firstContact(start: V2, direction: V2, distance: number, centre: V2, radius: number) {
  const dx = centre.x - start.x,
    dz = centre.z - start.z;
  const forward = dx * direction.x + dz * direction.z;
  const side = Math.abs(dx * direction.z - dz * direction.x);
  if (side > radius || forward < -radius) return Infinity;
  const reach = Math.sqrt(Math.max(0, radius * radius - side * side));
  if (forward + reach < 0) return Infinity;
  const first = Math.max(0, forward - reach);
  return first <= distance ? first : Infinity;
}
