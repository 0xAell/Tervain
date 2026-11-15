import type { NpcId } from '../game/types';

/**
 * Rules of the journey as a whole: when it is saved, what happens when the wanderer falls, where he comes back, what
 * counts as danger nearby, who can witness a trespass, and the drought bell. The app (src/app.ts) owns the loop that
 * applies them.
 */

/** The journey is saved on its own this often (real seconds), and counts as begun once it has lasted as long. */
export const AUTOSAVE_SECONDS = 90;

/** A blow that lands freezes the simulation for a moment (seconds). */
export const HIT_STOP = { heavy: 0.07, light: 0.04 } as const;

export const DEATH = {
  /** Seconds the fallen view is held before he rises at the last safe place. */
  fadeSeconds: 3.6,
  /** His foes move at this share of their pace meanwhile. */
  foePace: 0.25,
  /** He rises with this much health restored and a full stamina meter. */
  heal: 100,
} as const;

/** A foe that has noticed him within this distance (m) is a threat: no riding, trading or resting beside it. */
export const THREAT_REACH = 14;

/** Whether no noticed, living foe is within THREAT_REACH of `(x, z)`. */
export function noThreatNear(x: number, z: number, foes: Iterable<{ alive: boolean; engaged: boolean; x: number; z: number }>): boolean {
  for (const foe of foes) if (foe.alive && foe.engaged && Math.hypot(foe.x - x, foe.z - z) < THREAT_REACH) return false;
  return true;
}

/** The place he returns to moves with him, but never to within this distance (m) of a living foe or an undefeated post. */
export const CHECKPOINT_CLEARANCE = 18;

/**
 * Whether `(x, z)` may become the place he returns to. It is asked at the moments respawnAfter lists (session.ts):
 * entering a journey, which starts again from the strand, discovering a place, and the journey saving itself because
 * something happened. The timed autosave does not ask it.
 */
export function checkpointAllowed(x: number, z: number, livingFoes: Iterable<{ x: number; z: number }>, undefeatedPosts: Iterable<{ x: number; z: number }>): boolean {
  for (const foe of livingFoes) if (Math.hypot(foe.x - x, foe.z - z) < CHECKPOINT_CLEARANCE) return false;
  for (const post of undefeatedPosts) if (Math.hypot(post.x - x, post.z - z) < CHECKPOINT_CLEARANCE) return false;
  return true;
}

/** Fallen through the ground: this far below it (m) for this long (s), he is set back on safe ground. */
export const UNDER_WORLD = { depth: 1.2, seconds: 0.35 } as const;

/** Only the shrine's keepers can witness a trespass at the archive, from within this distance (m), awake and in sight. */
export const WITNESSES: readonly NpcId[] = ['shrine_warden', 'spring_steward'];
export const WITNESS_REACH = 15;

/** Whether this resident, `distance` from the act, could have seen it; line of sight is the caller's to check. */
export function couldWitness(id: NpcId, distance: number, present: boolean, asleep: boolean, available: boolean): boolean {
  return present && !asleep && available && WITNESSES.includes(id) && distance <= WITNESS_REACH;
}

/** Two residents' talk is overheard from within this distance of the midpoint between them (m). */
export const OVERHEAR_REACH = 16;
/** Residents within this distance (m) are asked what they are about to say, so the lines are ready. */
export const SPEECH_SOON_REACH = 30;
/** Below this share of his health the wanderer's breath gives out. */
export const WOUNDED_BELOW = 0.3;

/** The drought bell: thought of first this long into a sitting (s), then rung this often (s) while the drought holds, heard out to `reach` (m), strikes this far apart (ms). */
export const DROUGHT_BELL = { first: 3, every: 42, reach: 220, strikeGapMs: 1400, allClearGapMs: 600, strikes: 2, allClearStrikes: 3 } as const;

/** Seconds until the bell is next thought of: its interval while the drought holds, and as good as never otherwise (it is asked again when the world changes). */
export function bellWait(drought: boolean): number {
  return drought ? DROUGHT_BELL.every : 9999;
}

/** How loud the bell is `distance` metres away, 0 to 1. */
export const bellGain = (distance: number): number => Math.max(0, 1 - distance / DROUGHT_BELL.reach);
