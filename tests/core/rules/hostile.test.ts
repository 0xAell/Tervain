import { describe, expect, it } from 'vitest';
import { ENEMY_ARCHETYPES, ENEMY_IDLE_YAW, ENEMY_POST_YAW, ENEMY_VARIANT } from '../../../src/core/content/enemies';
import { afterRecovery, HOSTILE, hostileBlowLands, hostileGivesUp, hostileNotices, hostileStruck, hostileTurnsBack } from '../../../src/core/rules/hostile';
import { ENEMY_SPAWNS } from '../../../src/core/world/layout';

const bandit = ENEMY_ARCHETYPES.bandit, thornback = ENEMY_ARCHETYPES.thornback;

describe('the hostiles', () => {
  it('has an archetype for every post, and the creature is the tougher, harder-hitting one', () => {
    for (const spawn of ENEMY_SPAWNS) expect(ENEMY_ARCHETYPES[spawn.kind]).toBeDefined();
    expect(thornback).toMatchObject({ name: 'Thornback', hp: 110, damage: 20, heavy: true, radius: 0.85 });
    expect(bandit).toMatchObject({ name: 'Toll-jumper', hp: 55, damage: 11, heavy: false, radius: 0.4 });
    for (const archetype of [bandit, thornback]) {
      expect(archetype.reach).toBeLessThan(archetype.notice);
      expect(archetype.strike).toBeLessThan(archetype.wind);
    }
  });

  it('keeps each post’s facing and figure', () => {
    expect(ENEMY_IDLE_YAW).toBe(1.2);
    expect(ENEMY_POST_YAW).toEqual({ ford_bandit_b: 4.0 });
    expect(ENEMY_VARIANT).toEqual({ ford_bandit_b: 1 });
  });
});

describe('noticing the wanderer', () => {
  it('needs him within the notice distance, in sight, and the hostile within its leash', () => {
    expect(hostileNotices(bandit, 16, 11, 0.5, 0, false)).toBe(true);
    expect(hostileNotices(bandit, 16, 12, 0.5, 0, false)).toBe(false);
    expect(hostileNotices(bandit, 16, 11, 0.5, 0, true)).toBe(false);
    expect(hostileNotices(bandit, 16, 11, 0.5, 16, false)).toBe(false);
  });

  it('sees only ahead beyond 4.5 m, and all round within it', () => {
    expect(hostileNotices(bandit, 16, 8, HOSTILE.sightHalfAngle + 0.01, 0, false)).toBe(false);
    expect(hostileNotices(bandit, 16, 8, HOSTILE.sightHalfAngle - 0.01, 0, false)).toBe(true);
    expect(hostileNotices(bandit, 16, 4.4, Math.PI, 0, false)).toBe(true);
  });
});

describe('the chase', () => {
  it('is given up when the target dies, the leash plus six metres is passed, or he gets 2.2 notice distances ahead', () => {
    expect(hostileGivesUp(bandit, 16, true, 5, 10)).toBe(false);
    expect(hostileGivesUp(bandit, 16, false, 5, 10)).toBe(true);
    expect(hostileGivesUp(bandit, 16, true, 5, 22.1)).toBe(true);
    expect(hostileGivesUp(bandit, 16, true, bandit.notice * 2.2 + 0.1, 10)).toBe(true);
    expect(hostileGivesUp(bandit, 16, true, bandit.notice * 2.2, 22)).toBe(false);
  });

  it('resumes after a strike within twice the notice distance of a living target', () => {
    expect(afterRecovery(thornback, 19.9, true)).toBe('chase');
    expect(afterRecovery(thornback, 20, true)).toBe('return');
    expect(afterRecovery(thornback, 3, false)).toBe('return');
  });

  it('turns back on the way home only for a target close by and inside the leash', () => {
    expect(hostileTurnsBack(bandit, 16, true, bandit.notice * 0.6 - 0.1, 5)).toBe(true);
    expect(hostileTurnsBack(bandit, 16, true, bandit.notice * 0.6, 5)).toBe(false);
    expect(hostileTurnsBack(bandit, 16, true, 3, 16)).toBe(false);
    expect(hostileTurnsBack(bandit, 16, false, 3, 5)).toBe(false);
  });
});

describe('blows', () => {
  it('lands within reach plus half a metre, in front of the striker, on a living target', () => {
    expect(hostileBlowLands(bandit, bandit.reach + 0.49, 1, true)).toBe(true);
    expect(hostileBlowLands(bandit, bandit.reach + 0.5, 1, true)).toBe(false);
    expect(hostileBlowLands(bandit, 1, HOSTILE.blowCos, true)).toBe(false);
    expect(hostileBlowLands(bandit, 1, HOSTILE.blowCos + 0.01, true)).toBe(true);
    expect(hostileBlowLands(bandit, 1, 1, false)).toBe(false);
  });

  it('kills at zero health', () => {
    expect(hostileStruck(19, 'chase', 19, false)).toEqual({ hp: 0, killed: true, stagger: null });
    expect(hostileStruck(19, 'strike', 42, true)).toMatchObject({ killed: true });
  });

  it('staggers briefly from a light blow and longer from a heavy one', () => {
    expect(hostileStruck(55, 'chase', 19, false)).toEqual({ hp: 36, killed: false, stagger: HOSTILE.staggerLight });
    expect(hostileStruck(55, 'idle', 42, true)).toEqual({ hp: 13, killed: false, stagger: HOSTILE.staggerHeavy });
    expect(HOSTILE.staggerLight).toBeLessThan(HOSTILE.staggerHeavy);
    expect(HOSTILE.staggerHeavy).toBeLessThan(HOSTILE.staggerParried);
  });

  it('does not interrupt a committed swing with a light blow, but does with a heavy one', () => {
    for (const state of ['telegraph', 'strike'] as const) {
      expect(hostileStruck(55, state, 19, false)).toEqual({ hp: 36, killed: false, stagger: null });
      expect(hostileStruck(55, state, 19, true).stagger).toBe(HOSTILE.staggerHeavy);
    }
  });
});
