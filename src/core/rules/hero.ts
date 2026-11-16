import { RIDE } from './riding';

/**
 * The wanderer's body in a fight and on the move: what each action costs and how long it takes, what he fights with,
 * how his stamina drains and returns, how a guarded blow is settled, and how he jumps, vaults, wades and swims.
 * The renderer's player (src/presentation/player.ts) reads these and owns only motion through the scene and the pose.
 */

export const STAMINA_MAX = 100;
export const STAMINA = {
  max: STAMINA_MAX,
  /** Spent per second running. A fresh meter supports about 133 seconds of uninterrupted exploration running. */
  sprintPerSecond: 0.75,
  /** A sprint ends at this much and leaves him winded. */
  sprintMin: 0.5,
  /** Spent per second at a hard crawl in water. */
  swimSprintPerSecond: 6,
  /** Recovered per second: rested, winded, and behind a held guard. */
  regen: 24,
  regenWinded: 16,
  regenGuarding: 6,
  /** Winded until the meter is back above this. */
  recoverAbove: 22,
  /** Seconds before recovery starts again after an attack, dodge or blocked blow; after running; after a jump. */
  pauseAfterAction: 0.7,
  pauseAfterSprint: 0.5,
  pauseAfterJump: 0.4,
} as const;

/** The saddled deer's walk and run under a rider (m/s), A70. */
export const MOUNT_WALK = RIDE.walk, MOUNT_RUN = RIDE.run;

/** Stamina each action takes. A blocked blow costs `blockHit`, scaled by GUARD. */
export const ACTION_COST = { light: 12, heavy: 30, dodge: 22, jump: 6, blockHit: 18 } as const;
/** Seconds each action lasts. */
export const ACTION_SECONDS = { light: 0.62, heavy: 1.05, dodge: 0.4, hurt: 0.38 } as const;
/** Portion of the action after which the blow lands. */
export const HIT_AT = { light: 0.45, heavy: 0.6 } as const;
/** A guard raised within this many seconds of the blow is a perfect block. */
export const PERFECT_BLOCK_WINDOW = 0.18;

/**
 * What the wanderer fights with (proposal). Like the Gothic heroes they arrive with nothing; fists are quick but weak and
 * short, and a guard of bare forearms softens a blow without turning it. The first blade lies in the wreck on the strand.
 */
export interface Arms {
  light: number;
  heavy: number;
  range: { light: number; heavy: number };
  arc: { light: number; heavy: number };
  dur: { light: number; heavy: number };
  cost: { light: number; heavy: number };
  /** Share of a blocked blow that still lands (fresh, tired); a perfect block with a blade parries. */
  guard: { fresh: number; tired: number; perfect: number | 'parry' };
}
export const FISTS: Arms = {
  light: 7,
  heavy: 15,
  range: { light: 1.6, heavy: 1.8 },
  arc: { light: 0.85, heavy: 1.0 },
  dur: { light: 0.5, heavy: 0.9 },
  cost: { light: 9, heavy: 24 },
  guard: { fresh: 0.6, tired: 0.85, perfect: 0.35 },
};
export const BLADE: Arms = {
  light: 19,
  heavy: 42,
  range: { light: 2.35, heavy: 2.7 },
  arc: { light: 1.05, heavy: 1.25 },
  dur: { light: ACTION_SECONDS.light, heavy: ACTION_SECONDS.heavy },
  cost: { light: ACTION_COST.light, heavy: ACTION_COST.heavy },
  guard: { fresh: 0.3, tired: 0.6, perfect: 'parry' },
};
/** Seconds without a fight before the blade goes back on the hip. */
export const SHEATHE_AFTER = 6;
/** A foe that has noticed him within this distance (m) keeps the blade drawn. */
export const ENGAGED_REACH = 18;

/** How a guard meets a blow. */
export const GUARD = {
  /** The blow must come from in front: the cosine between his facing and the way to the attacker exceeds this. */
  facing: 0.17,
  /** The steady-guard skill's share of a blocked blow's stamina cost. */
  steadyGuard: 0.6,
  /** A heavy blow costs this many times as much to block. */
  heavyCost: 1.6,
  /** With less than this share of the block's cost in hand, the guard is tired. */
  tiredBelow: 0.5,
} as const;

/** Whether a blow from `(dx, dz)` away meets a guard facing `(facingX, facingZ)`. */
export function blowFaced(dx: number, dz: number, facingX: number, facingZ: number): boolean {
  const d = Math.hypot(dx, dz) || 1;
  return (dx / d) * facingX + (dz / d) * facingZ > GUARD.facing;
}

export type GuardedHit =
  | { parried: true }
  | { parried: false; damage: number; cost: number; stamina: number; guardBroken: boolean };

/**
 * Settle a blow that lands on a raised guard. A blade raised within the perfect window turns it aside. Otherwise the
 * guard takes `ACTION_COST.blockHit` stamina (less with steady guard, more for a heavy blow), lets through the arms'
 * share of the damage (the perfect, tired or fresh share), and breaks under a heavy blow that empties the meter.
 */
export function resolveGuardedHit(input: { damage: number; heavy: boolean; arms: Arms; blockTime: number; stamina: number; steadyGuard: boolean }): GuardedHit {
  const { arms } = input;
  const perfect = input.blockTime < PERFECT_BLOCK_WINDOW;
  if (perfect && arms.guard.perfect === 'parry') return { parried: true };
  const cost = ACTION_COST.blockHit * (input.steadyGuard ? GUARD.steadyGuard : 1) * (input.heavy ? GUARD.heavyCost : 1);
  const tired = input.stamina < cost * GUARD.tiredBelow;
  const share = perfect && typeof arms.guard.perfect === 'number' ? arms.guard.perfect : tired ? arms.guard.tired : arms.guard.fresh;
  const stamina = Math.max(0, input.stamina - cost);
  return { parried: false, damage: Math.round(input.damage * share), cost, stamina, guardBroken: stamina <= 0 && input.heavy };
}

export interface StaminaState {
  stamina: number;
  /** Seconds left before recovery may start. */
  pause: number;
  /** Winded: no sprint, dodge or heavy blow until the meter recovers. */
  exhausted: boolean;
}

/**
 * One step of the stamina meter, written back into `state`. `drain` is what he is spending this step, if anything:
 * running, or a hard crawl in water. Otherwise the meter recovers once its pause has run out, slowly behind a guard.
 * Returns true while a sprint has run the meter down, which ends the sprint.
 */
export function staminaStep(state: StaminaState, dt: number, drain: 'run' | 'swim' | null, guarding: boolean): boolean {
  let winded = false;
  if (drain) {
    state.stamina = Math.max(0, state.stamina - (drain === 'swim' ? STAMINA.swimSprintPerSecond : STAMINA.sprintPerSecond) * dt);
    state.pause = STAMINA.pauseAfterSprint;
    if (state.stamina <= STAMINA.sprintMin) { state.exhausted = true; winded = true; }
  } else if (state.pause <= 0) {
    state.stamina = Math.min(STAMINA.max, state.stamina + (guarding ? STAMINA.regenGuarding : state.exhausted ? STAMINA.regenWinded : STAMINA.regen) * dt);
  }
  if (state.exhausted && state.stamina > STAMINA.recoverAbove) state.exhausted = false;
  return winded;
}

/** A dodge: metres a second at its start, easing to rest over ACTION_SECONDS.dodge, untouchable for `iframes` seconds. */
export const DODGE = { speed: 13, iframes: 0.3 } as const;
/** A jump leaves the ground at this speed (m/s) under this gravity (m/s²). */
export const JUMP_SPEED = 5.4;
export const GRAVITY = 17;
/** The highest ledge he steps onto without a jump, and the drop he follows down without leaving the ground (m). */
export const STEP_HEIGHT = 0.8;
export const GROUND_FOLLOW_DROP = 0.5;
/** Ground steeper than this rise over run gives no firm footing: he begins to slide. */
export const FIRM_FOOTING_SLOPE = 0.95;
/** How quickly his velocity answers the stick (per second): swimming, on firm ground, sliding, in the air. */
export const MOVE_RESPONSE = { swim: 3.2, ground: 13.3, sliding: 2.2, air: 2.8 } as const;

/**
 * Fence vault (A125). `reach`: how far before the rail a jump still becomes a vault. A player presses jump as the fence
 * comes up, a stride or two away; at 0.85 m the press fell short and he jumped into the rail (playtest 5). `seconds`
 * is the time over a rail taken from 0.6 m; a vault from further back takes proportionally longer. `facing`: how directly
 * across the rail the requested movement must point (any approach that crosses it, not a glancing stroll along it).
 */
export const VAULT = { reach: 1.9, facing: 0.2, land: 0.7, step: 0.6, seconds: 0.55 } as const;

/** Water deeper than this lifts the wanderer off the bed into a swim; he finds his feet again below SWIM_EXIT. */
export const SWIM_DEPTH = 1.35;
export const SWIM_EXIT = 1.15;
/** How far below the surface a swimmer's feet hang: chest under, head above. */
export const SWIM_FLOAT = 1.25;
/** Breaststroke and a hard crawl (m/s); the hard pace spends stamina. */
export const SWIM_SPEED = 1.45;
export const SWIM_SPRINT = 2.3;
/**
 * Wading: water slows the legs from `from` metres deep, easing over `span` metres more to `slowest` of the walking pace
 * at the waist, where the wade ends and the swim takes over (`SWIM_EXIT`).
 */
export const WADE = { from: 0.1, span: 1.05, slowest: 0.5 };
/** Walking pace kept in water `depth` metres deep: legs push water from the shins up, and a waist-deep wade halves it. */
export function wadeFactor(depth: number): number {
  const t = Math.min(1, Math.max(0, (depth - WADE.from) / WADE.span));
  return 1 - (1 - WADE.slowest) * t * t * (3 - 2 * t);
}
