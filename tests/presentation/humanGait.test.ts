import { describe, expect, it } from 'vitest';
import { HERO_RUN_CYCLE, HERO_WALK_CYCLE } from '../../src/core/rules/heroLocomotion';
import { RUN_STEP, WALK_STEP, walkingFoot } from '../../src/presentation/human/gait';

const thigh = 0.45, shin = 0.42;
type Step = typeof WALK_STEP | typeof RUN_STEP;

function ankleAt(t: number, step: Step, reach: number = step.reach, stature = 1) {
  const lower = -0.17 * stature;
  const { hip, knee } = walkingFoot(t, step, reach * stature, lower, 0, stature);
  return {
    z: (-thigh * Math.sin(hip) - shin * Math.sin(hip + knee)) * stature,
    y: (thigh + shin - thigh * Math.cos(hip) - shin * Math.cos(hip + knee)) * stature + lower,
  };
}

describe('authored human steps', () => {
  it.each([[WALK_STEP, HERO_WALK_CYCLE], [RUN_STEP, HERO_RUN_CYCLE]] as const)(
    'holds the supporting sole at floor height as the moving root passes it', (step, cycle) => {
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const phase = step.contact * fraction;
        const ankle = ankleAt(phase, step);
        expect(ankle.y).toBeCloseTo(0, 6);
        // At cruising speed a boot moves less than a centimetre in world space while supporting the body.
        expect(Math.abs(phase * cycle + ankle.z - step.reach)).toBeLessThan(0.01);
      }
    },
  );

  it('lifts the returning boot clear, reaches farther at a run, and eases down at low speed', () => {
    for (const step of [WALK_STEP, RUN_STEP]) {
      const midSwing = (1 + step.contact) / 2;
      expect(ankleAt(midSwing, step).y).toBeCloseTo(step.lift, 6);
      expect(ankleAt(midSwing, step, 0).y).toBeCloseTo(0, 6);
      expect(ankleAt(midSwing, step, step.reach, 0.92).y).toBeCloseTo(0.92 * step.lift, 6);
    }
    expect(RUN_STEP.lift).toBeGreaterThan(WALK_STEP.lift * 2);
  });

  it('reverses the lateral leg for sidesteps and rolls from heel through flat sole to toe', () => {
    const foot = (t: number, direction = 0) => walkingFoot(t, WALK_STEP, WALK_STEP.reach, -0.13, direction, 1);
    expect(foot(0).pitch).toBeLessThan(0);
    expect(foot(WALK_STEP.contact / 2).pitch).toBe(0);
    expect(foot(WALK_STEP.contact).pitch).toBeGreaterThan(0);
    expect(foot(0, Math.PI / 2).side).toBeGreaterThan(0.3);
    expect(foot(0, -Math.PI / 2).side).toBeCloseTo(-foot(0, Math.PI / 2).side, 6);
    expect(foot(1)).toEqual(foot(0));
  });
});
