import type { V2 } from '../core/world/layout';
import type { RoomTarget } from './roomTargets';
import { risePixels } from './projection';

export type FieldSound =
  | 'village_bell'
  | 'bucket_dry'
  | 'bucket_water'
  | 'rope_draw'
  | 'bow_draw'
  | 'bow_release'
  | 'bow_focus'
  | 'focused_release'
  | 'focused_hit'
  | 'sidestep'
  | 'thrust'
  | 'arrow_flesh'
  | 'arrow_ground'
  | 'skinning_complete'
  | 'blade_swing'
  | 'unarmed_swing'
  | 'parry'
  | 'counter_swing'
  | 'counter_hit'
  | 'blade_hit'
  | 'unarmed_hit'
  | 'enemy_windup'
  | 'player_hit'
  | 'enemy_down'
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
export const SWING_TIME = 0.42;
// The seven melee cels include an early release followed by the contact pose.
const contactProgress = 4 / 7;
export const SWING_RELEASE = (SWING_TIME * 3) / 7;
export const SWING_CONTACT = SWING_TIME * contactProgress;
export const SWING_BUFFER = 0.16;
export type { SwordStroke } from '../core/rules/valeCombat';
export const PARRY_WINDOW = 8 / 60;
export const COUNTER_WINDOW = 0.68;
export const ENEMY_SWING_TIME = 0.85;
export function enemyContactRemaining(heavy: boolean) {
  return ENEMY_SWING_TIME - (heavy ? 0.55 : 0.43);
}
export function meleeWarning(remaining: number, heavy: boolean, parryWindow: number) {
  const contact = enemyContactRemaining(heavy);
  const untilContact = remaining - contact;
  return {
    visible: untilContact > 0,
    ready: untilContact > 0 && untilContact <= parryWindow + 1e-9,
    progress: Math.max(0, Math.min(1, 1 - untilContact / (ENEMY_SWING_TIME - contact))),
  };
}
export function enemySwingProgress(remaining: number, heavy: boolean) {
  const contact = enemyContactRemaining(heavy);
  return remaining > contact
    ? (contactProgress * (ENEMY_SWING_TIME - remaining)) / (ENEMY_SWING_TIME - contact)
    : 1 - ((1 - contactProgress) * remaining) / contact;
}
export const CONTACT_TIME = 0.28;
export const DAMAGE_LABEL_TIME = 0.68;
export const DEFEAT_TIME = 0.92;
export interface Contact extends V2 {
  height: number;
  dx: number;
  dz: number;
  born: number;
  kind: 'blade' | 'guard' | 'parry' | 'counter' | 'body' | 'earth' | 'focused';
  damage?: number;
  heavy?: boolean;
  defeated?: boolean;
  actorId?: string;
}
export const RELEASE_TIME = 0.34;
export const ARROW_RANGE = 45;
export const ARROW_SPEED = 39;
export interface Draw {
  phase: 'draw' | 'hold' | 'loose';
  elapsed: number;
  released: boolean;
  focused?: boolean;
  grade?: number;
  aimDistance?: number;
  direction: V2;
  head?: string;
}
export function arrowLift(travelled: number) {
  const range = travelled / ARROW_RANGE;
  return 20 * (1 - 0.55 * range) + 3 * Math.sin(Math.PI * range);
}
export interface Arrow extends V2 {
  owner?: import('../core/game/types').EncounterId;
  focused?: boolean;
  launchHeight: number;
  grade: number;
  direction: V2;
  travelled: number;
  head?: string;
}
/** World height of the arrowhead at a distance from the original release point. */
export function arrowHeight(arrow: Arrow, travelled: number) {
  return arrow.launchHeight + travelled * arrow.grade + arrowLift(travelled) / risePixels;
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
