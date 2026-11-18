import { describe, expect, it } from 'vitest';
import { JumpMotion, poseJump } from '../../src/presentation/human/jump';
import { ANGLE_KEYS } from '../../src/presentation/characters';
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

describe('the native human jump', () => {
  const angles = () => Object.fromEntries(ANGLE_KEYS.map(key => [key, 0]));
  it('changes the lead knee with the push-off foot and keeps a ledge fall distinct from a jump', () => {
    const pose = (stride: number, launched: boolean, amp = 1) => {
      const motion = new JumpMotion(), a = angles();
      motion.update(1/60, false, launched ? 5 : -.2, stride);
      poseJump(a, motion.update(1/60, false, 0, stride)!, 1, amp);
      return a;
    };
    const left = pose(0, true), right = pose(.5, true);
    expect(left.legL).toBeLessThan(left.legR! - .7);
    expect(right.legR).toBeCloseTo(left.legL!, 8);
    expect(right.kneeL).toBeCloseTo(left.kneeR!, 8);
    expect(left.armRx).toBeLessThan(left.armLx!);
    expect(pose(0, false).kneeL).toBeLessThan(left.kneeL! - .4);
    expect(Math.abs(pose(0, true, .6).armRx!)).toBeLessThan(Math.abs(left.armRx!));
  });

  it.each([30, 60, 120])('takes landing weight through the knees without sending the planted ankle underground at %i Hz', hz => {
    const motion = new JumpMotion(), dt = 1/hz;
    motion.update(dt, false, -5.4, 0);
    const contact = () => {
      const a = angles(); a.legL = -.18; a.kneeL = .34; a.soleL = -.16;
      const ankle = () => [a.lower! - thigh * Math.cos(a.legL!) - shin * Math.cos(a.legL! + a.kneeL!),
        -thigh * Math.sin(a.legL!) - shin * Math.sin(a.legL! + a.kneeL!)];
      const [y,z] = ankle(), jump = motion.update(dt, true, 0, 0);
      if (jump) poseJump(a, jump, 0, 1);
      expect(ankle()[0]).toBeCloseTo(y!, 8); expect(ankle()[1]).toBeCloseTo(z!, 8);
      expect(a.legL! + a.kneeL! + a.soleL!).toBeCloseTo(0, 8);
      return -a.lower!;
    };
    const drop = Array.from({length: Math.ceil(.34 * hz)}, contact);
    expect(Math.max(...drop)).toBeGreaterThan(.14);
    expect(drop.at(-1)).toBeCloseTo(0, 8);
    motion.update(dt, false, -6, 0); motion.reset();
    expect(motion.update(dt, true, 0, 0)).toBeUndefined();
  });
});
