import { GRAVITY, STEP_HEIGHT } from './hero';

/**
 * Carrying loose cargo: what can be picked up, where it is held, when it is let fall, and how it is thrown. The cargo
 * itself (what there is, its mass, how it floats) is in world/physicalProps.ts. Whoever simulates the bodies asks
 * these and applies the forces.
 */
export const CARRY = {
  /** He reaches from this high above his feet (m). */
  shoulder: 1.3,
  /** A thing can be picked up within this far of that point (m), and no more than this far above or below it (m). */
  reach: 2.8,
  vertical: 1.8,
  /** ...and ahead of him: the cosine of its bearing off his facing is at least this. */
  ahead: 0.35,
  /** Of several, the nearest is taken, one off to the side counting as this much further (m) at a right angle. */
  sidePenalty: 1.3,
  /** It is held this far ahead of him (m), at his shoulder's height less this much (m) times the sine of the view's pitch. */
  holdAhead: 1.85,
  holdPitch: 0.65,
  /** Further than this from him (m), or out of his sight, it is let fall. */
  dropBeyond: 4.5,
  /** The pull to the hold point, per kilogram: this much force per metre, less this much per m/s, never more than this (N). */
  pull: 65,
  damp: 15,
  pullMax: 90,
  /** A throw, per kilogram: this much impulse ahead, and this much up less this much times the sine of the pitch. */
  throwAhead: 6.5,
  throwUp: 1.8,
  throwPitch: 3,
  /** ...with a little spin about each axis, per kilogram. */
  spin: { x: 0.12, y: 0.07, z: 0.06 },
} as const;

/** Cargo he walks onto: he steps up as high as onto anything else (m), over an edge at least this wide (m). */
export const CARGO_STEP = { height: STEP_HEIGHT, width: 0.25 } as const;

interface Point { x: number; y: number; z: number }

/** Where he reaches from. */
export function carryOrigin(feet: Point): Point {
  return { x: feet.x, y: feet.y + CARRY.shoulder, z: feet.z };
}

/**
 * How well placed a thing at `at` is to be picked up from `origin`, facing `yaw`: null when it is out of reach, too
 * far above or below, or not ahead of him; otherwise a rank, of which the lowest is taken. Whether something stands
 * in the way is the simulation's to answer.
 */
export function carryRank(origin: Point, at: Point, yaw: number): number | null {
  const dx = at.x - origin.x, dz = at.z - origin.z, distance = Math.hypot(dx, at.y - origin.y, dz);
  if (distance > CARRY.reach || Math.abs(at.y - origin.y) > CARRY.vertical) return null;
  const ahead = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.max(.01, Math.hypot(dx, dz));
  if (ahead < CARRY.ahead) return null;
  return distance + (1 - ahead) * CARRY.sidePenalty;
}

/** Where a carried thing is held: ahead of him along his facing, lower as the view tilts down. */
export function holdPoint(feet: Point, yaw: number, pitch: number): Point {
  return { x: feet.x + Math.sin(yaw) * CARRY.holdAhead, y: feet.y + CARRY.shoulder - Math.sin(pitch) * CARRY.holdPitch, z: feet.z + Math.cos(yaw) * CARRY.holdAhead };
}

/** Whether a carried thing this far from him (m) is still his to hold. */
export function withinCarry(distance: number): boolean {
  return distance <= CARRY.dropBeyond;
}

/** The force along one axis on a carried thing of `mass`, `delta` metres from where it is held and moving at `velocity` along it. */
export function carryForce(delta: number, velocity: number, mass: number): number {
  return Math.max(-CARRY.pullMax * mass, Math.min(CARRY.pullMax * mass, (delta * CARRY.pull - velocity * CARRY.damp) * mass));
}

/** The force that holds a carried thing up against its weight. */
export function carryLift(mass: number): number {
  return mass * GRAVITY;
}

/** The impulse of a throw along his facing, higher as the view tilts up. */
export function throwImpulse(yaw: number, pitch: number, mass: number): Point {
  return { x: Math.sin(yaw) * mass * CARRY.throwAhead, y: (CARRY.throwUp - Math.sin(pitch) * CARRY.throwPitch) * mass, z: Math.cos(yaw) * mass * CARRY.throwAhead };
}

/** The spin a throw gives. */
export function throwSpin(mass: number): Point {
  return { x: mass * CARRY.spin.x, y: mass * CARRY.spin.y, z: mass * CARRY.spin.z };
}

/** He keeps hold of a thing only while he does nothing else: a blow, a dodge, a flinch or timed work lets it fall. */
export function keepsHold(state: string): boolean {
  return state === 'free';
}

/** Nothing is picked up, or kept in hand, in the saddle or while getting up or down. A thing in hand comes before anything else he could act on. */
export function handsForCargo(facts: { riding: boolean; mounting: boolean }): boolean {
  return !facts.riding && !facts.mounting;
}
