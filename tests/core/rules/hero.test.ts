import { describe, expect, it } from 'vitest';
import {
  ACTION_COST, ACTION_SECONDS, BLADE, blowFaced, DODGE, FISTS, GRAVITY, GUARD, HIT_AT, JUMP_SPEED, PERFECT_BLOCK_WINDOW, resolveGuardedHit,
  STAMINA, STAMINA_MAX, staminaStep, SWIM_DEPTH, SWIM_EXIT, SWIM_SPEED, SWIM_SPRINT, VAULT, wadeFactor, type StaminaState,
} from '../../../src/core/rules/hero';

const meter = (stamina: number, pause = 0, exhausted = false): StaminaState => ({ stamina, pause, exhausted });

describe('the stamina meter', () => {
  it('drains running at 0.75 a second and holds recovery off for half a second', () => {
    const state = meter(100);
    expect(staminaStep(state, 1, 'run', false)).toBe(false);
    expect(state).toEqual({ stamina: 99.25, pause: STAMINA.pauseAfterSprint, exhausted: false });
  });

  it('lasts about 133 seconds of running from full', () => {
    const state = meter(STAMINA_MAX);
    let seconds = 0;
    while (!staminaStep(state, 1 / 60, 'run', false)) seconds += 1 / 60;
    expect(seconds).toBeGreaterThan(131);
    expect(seconds).toBeLessThan(134);
    expect(state.exhausted).toBe(true);
  });

  it('drains eight times as fast at a hard crawl in water', () => {
    const state = meter(100);
    staminaStep(state, 1, 'swim', false);
    expect(state.stamina).toBe(100 - STAMINA.swimSprintPerSecond);
  });

  it('recovers at 24 a second once the pause has run out, and not before', () => {
    const waiting = meter(50, 0.2);
    staminaStep(waiting, 0.1, null, false);
    expect(waiting.stamina).toBe(50);
    const resting = meter(50, 0);
    staminaStep(resting, 0.5, null, false);
    expect(resting.stamina).toBe(62);
    const full = meter(99, 0);
    staminaStep(full, 1, null, false);
    expect(full.stamina).toBe(STAMINA_MAX);
  });

  it('recovers at 6 a second behind a guard and 16 a second while winded', () => {
    const guarding = meter(50);
    staminaStep(guarding, 1, null, true);
    expect(guarding.stamina).toBe(56);
    const winded = meter(0, 0, true);
    staminaStep(winded, 1, null, false);
    expect(winded).toEqual({ stamina: 16, pause: 0, exhausted: true });
  });

  it('stays winded until the meter is back above 22', () => {
    const state = meter(21.9, 0, true);
    staminaStep(state, 0.001, null, false);
    expect(state.exhausted).toBe(true);
    staminaStep(state, 0.01, null, false);
    expect(state.stamina).toBeGreaterThan(STAMINA.recoverAbove);
    expect(state.exhausted).toBe(false);
  });

  it('ends a sprint at half a point and reports it every step until then', () => {
    const state = meter(0.6);
    expect(staminaStep(state, 0.2, 'run', false)).toBe(true);
    expect(state.exhausted).toBe(true);
    expect(staminaStep(state, 0.2, 'run', false)).toBe(true);
  });
});

describe('a blow on a raised guard', () => {
  const blow = { damage: 20, heavy: false, blockTime: 1, stamina: 100, steadyGuard: false };

  it('is turned aside by a blade raised within the perfect window, at no cost', () => {
    expect(resolveGuardedHit({ ...blow, arms: BLADE, blockTime: PERFECT_BLOCK_WINDOW - 0.01 })).toEqual({ parried: true });
    expect(resolveGuardedHit({ ...blow, arms: BLADE, blockTime: PERFECT_BLOCK_WINDOW })).toMatchObject({ parried: false });
  });

  it('is softened, never turned, by bare forearms: 35% lands on a perfect block, 60% fresh, 85% tired', () => {
    expect(resolveGuardedHit({ ...blow, arms: FISTS, blockTime: 0.05 })).toMatchObject({ parried: false, damage: 7 });
    expect(resolveGuardedHit({ ...blow, arms: FISTS })).toMatchObject({ damage: 12 });
    expect(resolveGuardedHit({ ...blow, arms: FISTS, stamina: 8 })).toMatchObject({ damage: 17 });
  });

  it('lets 30% through a fresh blade guard and 60% through a tired one', () => {
    expect(resolveGuardedHit({ ...blow, arms: BLADE })).toMatchObject({ damage: 6, cost: ACTION_COST.blockHit, stamina: 82, guardBroken: false });
    expect(resolveGuardedHit({ ...blow, arms: BLADE, stamina: 8.9 })).toMatchObject({ damage: 12, stamina: 0, guardBroken: false });
  });

  it('costs 1.6 times as much to block a heavy blow and 0.6 times with steady guard', () => {
    expect(resolveGuardedHit({ ...blow, arms: BLADE, heavy: true })).toMatchObject({ cost: ACTION_COST.blockHit * GUARD.heavyCost });
    expect(resolveGuardedHit({ ...blow, arms: BLADE, steadyGuard: true })).toMatchObject({ cost: ACTION_COST.blockHit * GUARD.steadyGuard });
  });

  it('breaks under a heavy blow that empties the meter, and only then', () => {
    expect(resolveGuardedHit({ ...blow, arms: BLADE, heavy: true, stamina: 20 })).toMatchObject({ stamina: 0, guardBroken: true });
    expect(resolveGuardedHit({ ...blow, arms: BLADE, heavy: false, stamina: 10 })).toMatchObject({ stamina: 0, guardBroken: false });
    expect(resolveGuardedHit({ ...blow, arms: BLADE, heavy: true, stamina: 60 })).toMatchObject({ guardBroken: false });
  });

  it('counts only when it comes from in front', () => {
    expect(blowFaced(0, 3, 0, 1)).toBe(true);
    expect(blowFaced(0, -3, 0, 1)).toBe(false);
    // A blow from the side, 80.2° off his facing, just meets the guard; from 81° it does not.
    expect(blowFaced(Math.sin(1.39), Math.cos(1.39), 0, 1)).toBe(true);
    expect(blowFaced(Math.sin(1.42), Math.cos(1.42), 0, 1)).toBe(false);
    expect(blowFaced(0, 0, 0, 1)).toBe(false);
  });
});

describe('what the wanderer fights with', () => {
  it('makes fists quicker, cheaper, shorter and weaker than the blade', () => {
    for (const kind of ['light', 'heavy'] as const) {
      expect(FISTS[kind]).toBeLessThan(BLADE[kind]);
      expect(FISTS.range[kind]).toBeLessThan(BLADE.range[kind]);
      expect(FISTS.dur[kind]).toBeLessThan(BLADE.dur[kind]);
      expect(FISTS.cost[kind]).toBeLessThan(BLADE.cost[kind]);
    }
    expect(BLADE.dur).toEqual({ light: ACTION_SECONDS.light, heavy: ACTION_SECONDS.heavy });
    expect(BLADE.cost).toEqual({ light: ACTION_COST.light, heavy: ACTION_COST.heavy });
    expect(BLADE.guard.perfect).toBe('parry');
  });

  it('lands a blow partway through its swing, and a heavy blow later than a light one', () => {
    expect(HIT_AT.light).toBeGreaterThan(0); expect(HIT_AT.heavy).toBeLessThan(1);
    expect(HIT_AT.heavy).toBeGreaterThan(HIT_AT.light);
  });
});

describe('moving', () => {
  it('jumps about 0.86 m high and dodges about 2.6 m', () => {
    expect(JUMP_SPEED * JUMP_SPEED / (2 * GRAVITY)).toBeCloseTo(0.858, 3);
    // The dodge eases linearly from its starting speed to rest over its duration.
    expect(DODGE.speed * ACTION_SECONDS.dodge / 2).toBeCloseTo(2.6, 6);
    expect(DODGE.iframes).toBeLessThan(ACTION_SECONDS.dodge);
  });

  it('keeps a full walking pace in the shallows and half of it waist deep', () => {
    expect(wadeFactor(0)).toBe(1);
    expect(wadeFactor(0.1)).toBe(1);
    expect(wadeFactor(0.625)).toBeCloseTo(0.75, 9);
    expect(wadeFactor(1.15)).toBeCloseTo(0.5, 9);
    expect(wadeFactor(3)).toBe(0.5);
    for (let depth = 0.1; depth < 1.15; depth += 0.05) expect(wadeFactor(depth + 0.05)).toBeLessThanOrEqual(wadeFactor(depth));
  });

  it('starts swimming deeper than he stops, so the shallows do not flicker between the two', () => {
    expect(SWIM_DEPTH).toBeGreaterThan(SWIM_EXIT);
    expect(SWIM_SPRINT).toBeGreaterThan(SWIM_SPEED);
  });

  it('vaults a fence from within 1.9 m of the rail', () => {
    expect(VAULT).toEqual({ reach: 1.9, facing: 0.2, land: 0.7, step: 0.6, seconds: 0.55 });
  });
});
