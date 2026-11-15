import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_ARCHETYPES } from '../../../src/core/content/enemies';
import {
  ACTION_SECONDS, BLADE, ENGAGED_REACH, FIRM_FOOTING_SLOPE, FISTS, GRAVITY, GROUND_FOLLOW_DROP, JUMP_SPEED, MOUNT_RUN, MOUNT_WALK, MOVE_RESPONSE,
  SHEATHE_AFTER, STEP_HEIGHT,
} from '../../../src/core/rules/hero';
import { HERO_RUN_SPEED, HERO_WALK_SPEED } from '../../../src/core/rules/heroLocomotion';
import { RIDE } from '../../../src/core/rules/riding';

const tuning = JSON.parse(readFileSync(new URL('../../../data/game/tuning.json', import.meta.url), 'utf8')) as {
  hero: { sheatheAfter: number; engagedReach: number; stepHeight: number; groundFollowDrop: number; firmFootingSlope: number; moveResponse: Record<string, number> };
  riding: { ride: { walk: number; run: number } };
};

describe('the ground under the wanderer', () => {
  it('lets him step onto a ledge he could not clear by jumping only just, and follow a smaller drop down', () => {
    const apex = JUMP_SPEED ** 2 / (2 * GRAVITY);
    expect(STEP_HEIGHT).toBe(0.8);
    expect(STEP_HEIGHT).toBeLessThan(apex);
    expect(GROUND_FOLLOW_DROP).toBe(0.5);
    // A drop he follows without leaving the ground is one he could also step back up.
    expect(GROUND_FOLLOW_DROP).toBeLessThan(STEP_HEIGHT);
  });

  it('gives firm footing up to a slope of about 43 degrees', () => {
    expect(FIRM_FOOTING_SLOPE).toBe(0.95);
    const degrees = Math.atan(FIRM_FOOTING_SLOPE) * 180 / Math.PI;
    expect(degrees).toBeGreaterThan(40);
    expect(degrees).toBeLessThan(47);
  });

  it('answers the stick fastest on firm ground and slowest while sliding', () => {
    expect(MOVE_RESPONSE).toEqual({ swim: 3.2, ground: 13.3, sliding: 2.2, air: 2.8 });
    expect(MOVE_RESPONSE.ground).toBeGreaterThan(MOVE_RESPONSE.swim);
    expect(MOVE_RESPONSE.swim).toBeGreaterThan(MOVE_RESPONSE.air);
    expect(MOVE_RESPONSE.air).toBeGreaterThan(MOVE_RESPONSE.sliding);
    // On firm ground he reaches most of a new velocity within a quarter of a second.
    expect(1 - Math.exp(-MOVE_RESPONSE.ground * 0.25)).toBeGreaterThan(0.95);
  });
});

describe('the drawn blade', () => {
  it('stays out while a foe that has noticed him is near, well beyond any blow and any foe\'s notice', () => {
    expect(ENGAGED_REACH).toBe(18);
    for (const arms of [FISTS, BLADE]) expect(ENGAGED_REACH).toBeGreaterThan(arms.range.heavy * 4);
    for (const kind of Object.values(ENEMY_ARCHETYPES)) expect(ENGAGED_REACH).toBeGreaterThan(kind.notice);
  });

  it('goes back on the hip only after a calm far longer than any action', () => {
    expect(SHEATHE_AFTER).toBe(6);
    expect(SHEATHE_AFTER).toBeGreaterThan(Math.max(...Object.values(ACTION_SECONDS)) * 4);
  });
});

describe('the saddled deer under a rider', () => {
  it('walks and runs at the riding rule\'s paces, each faster than the wanderer on foot', () => {
    expect(MOUNT_WALK).toBe(RIDE.walk);
    expect(MOUNT_RUN).toBe(RIDE.run);
    expect(MOUNT_RUN).toBeGreaterThan(MOUNT_WALK);
    expect(MOUNT_WALK).toBeGreaterThan(HERO_WALK_SPEED);
    expect(MOUNT_RUN).toBeGreaterThan(HERO_RUN_SPEED);
  });
});

describe('the exported tuning', () => {
  it('carries the same footing, stance and mount numbers as the rules', () => {
    expect(tuning.hero.stepHeight).toBe(STEP_HEIGHT);
    expect(tuning.hero.groundFollowDrop).toBe(GROUND_FOLLOW_DROP);
    expect(tuning.hero.firmFootingSlope).toBe(FIRM_FOOTING_SLOPE);
    expect(tuning.hero.moveResponse).toEqual(MOVE_RESPONSE);
    expect(tuning.hero.sheatheAfter).toBe(SHEATHE_AFTER);
    expect(tuning.hero.engagedReach).toBe(ENGAGED_REACH);
    expect(tuning.riding.ride.walk).toBe(MOUNT_WALK);
    expect(tuning.riding.ride.run).toBe(MOUNT_RUN);
  });
});
