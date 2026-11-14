import type { EnemyArchetype } from '../content/enemies';

/**
 * How a hostile notices, pursues, strikes and gives up. The scene's EnemyActor (src/presentation/actors.ts) runs the
 * states idle → alert → chase → telegraph → strike → recover, with stagger, return and dead; these are its numbers
 * and its decisions, free of the rig.
 */
export const HOSTILE = {
  /** Closer than this it notices the wanderer whichever way it faces (m); further off, only within the half-angle (rad). */
  sightNear: 4.5,
  sightHalfAngle: 1.25,
  /** Seconds it stands alert, growling, before it charges. */
  alert: 0.55,
  /** It gives up a chase this far past its leash (m), or beyond this many times its notice distance. */
  leashSlack: 6,
  loseFactor: 2.2,
  /** It closes to this share of its reach before winding up. */
  approach: 0.7,
  /** The wind-up follows the target for this share of its length, so a sidestep works. */
  trackShare: 0.45,
  /** The blow is judged at this share of the strike's length. */
  blowAt: 0.5,
  /** The blow lands within reach plus this (m), in front within this cosine. */
  blowSlack: 0.5,
  blowCos: 0.35,
  /** A heavy striker lunges at this speed while striking (m/s). */
  lunge: 7,
  /** After recovering it chases again within this many times its notice distance. */
  rechaseFactor: 2,
  /** Seconds staggered by a heavy blow, by a light one, and by a parried strike of its own. */
  staggerHeavy: 0.85,
  staggerLight: 0.3,
  staggerParried: 1.1,
  /** A staggered hostile is pushed back at this speed (m/s). */
  knockback: 2.2,
  /** It walks home at this share of its pace, regaining this much health a second. */
  returnPace: 0.7,
  returnHeal: 12,
  /** Returning, it turns on the wanderer again within this share of its notice distance. */
  returnNotice: 0.6,
  /** It is home within this distance of its post (m). */
  home: 1,
} as const;

export type HostileState = 'idle' | 'alert' | 'chase' | 'telegraph' | 'strike' | 'recover' | 'stagger' | 'return' | 'dead';

/** Whether an idle hostile notices a living target `distance` away, `angleOff` radians off its facing, `fromPost` from its post. */
export function hostileNotices(archetype: EnemyArchetype, leash: number, distance: number, angleOff: number, fromPost: number, sightBlocked: boolean): boolean {
  if (distance >= archetype.notice) return false;
  const seen = distance < HOSTILE.sightNear || angleOff < HOSTILE.sightHalfAngle;
  return seen && !sightBlocked && fromPost < leash;
}

/** Whether a chase is abandoned: the target is dead, too far from the post, or too far ahead. */
export function hostileGivesUp(archetype: EnemyArchetype, leash: number, targetAlive: boolean, distance: number, fromPost: number): boolean {
  return !targetAlive || fromPost > leash + HOSTILE.leashSlack || distance > archetype.notice * HOSTILE.loseFactor;
}

/** Whether the blow, judged mid-strike, lands on a target `distance` away at cosine `cos` off the striker's facing. */
export function hostileBlowLands(archetype: EnemyArchetype, distance: number, cos: number, targetAlive: boolean): boolean {
  return distance < archetype.reach + HOSTILE.blowSlack && cos > HOSTILE.blowCos && targetAlive;
}

/** What follows recovery from a strike. */
export function afterRecovery(archetype: EnemyArchetype, distance: number, targetAlive: boolean): 'chase' | 'return' {
  return distance < archetype.notice * HOSTILE.rechaseFactor && targetAlive ? 'chase' : 'return';
}

/** Whether a returning hostile turns on the target again. */
export function hostileTurnsBack(archetype: EnemyArchetype, leash: number, targetAlive: boolean, distance: number, fromPost: number): boolean {
  return targetAlive && distance < archetype.notice * HOSTILE.returnNotice && fromPost < leash;
}

/**
 * What a blow from the wanderer does to a living hostile with `hp` left: it dies, staggers, or takes the damage and
 * keeps its swing. A committed swing is not free to interrupt; a heavy blow staggers even a wind-up.
 */
export function hostileStruck(hp: number, state: HostileState, damage: number, heavy: boolean): { hp: number; killed: boolean; stagger: number | null } {
  const left = hp - damage;
  if (left <= 0) return { hp: left, killed: true, stagger: null };
  const interrupts = heavy || (state !== 'telegraph' && state !== 'strike');
  return { hp: left, killed: false, stagger: interrupts ? (heavy ? HOSTILE.staggerHeavy : HOSTILE.staggerLight) : null };
}
