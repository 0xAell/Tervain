import { describe, expect, it } from 'vitest';
import {
  CARGO_STEP, CARRY, carryForce, carryLift, carryOrigin, carryRank, handsForCargo, holdPoint, keepsHold, throwImpulse, throwSpin, withinCarry, CARGO_BODY, SURFACE_FRICTION,
} from '../../../src/core/rules/cargo';
import { GRAVITY, STEP_HEIGHT } from '../../../src/core/rules/hero';

// Carrying loose cargo, on plain numbers: no physics engine.

describe('carrying loose cargo', () => {
  const feet = { x: 0, y: 0, z: 0 }, origin = carryOrigin(feet);

  it('reaches from the shoulder for what is near, at about that height and ahead of him', () => {
    expect(origin).toEqual({ x: 0, y: CARRY.shoulder, z: 0 });
    expect(carryRank(origin, { x: 0, y: CARRY.shoulder, z: 1 }, 0)).toBeCloseTo(1, 9); // straight ahead: its distance
    expect(carryRank(origin, { x: 0, y: CARRY.shoulder, z: CARRY.reach + 0.01 }, 0)).toBeNull();
    expect(carryRank(origin, { x: 0, y: CARRY.shoulder + CARRY.vertical + 0.01, z: 0.5 }, 0)).toBeNull();
    expect(carryRank(origin, { x: 0, y: CARRY.shoulder, z: -1 }, 0)).toBeNull(); // behind him
    expect(carryRank(origin, { x: 1, y: CARRY.shoulder, z: 0 }, Math.PI / 2)).toBeCloseTo(1, 9); // ahead again once he turns
    const off = Math.acos(CARRY.ahead);
    expect(carryRank(origin, { x: Math.sin(off - 0.01), y: CARRY.shoulder, z: Math.cos(off - 0.01) }, 0)).not.toBeNull();
    expect(carryRank(origin, { x: Math.sin(off + 0.01), y: CARRY.shoulder, z: Math.cos(off + 0.01) }, 0)).toBeNull();
  });

  it('takes the nearer of two things, and the one before him over one as near but off to the side', () => {
    const ahead = carryRank(origin, { x: 0, y: CARRY.shoulder, z: 1.5 }, 0)!;
    const nearer = carryRank(origin, { x: 0, y: CARRY.shoulder, z: 1.0 }, 0)!;
    const aside = carryRank(origin, { x: 1.5 * Math.sin(1), y: CARRY.shoulder, z: 1.5 * Math.cos(1) }, 0)!;
    expect(nearer).toBeLessThan(ahead);
    expect(aside).toBeGreaterThan(ahead);
    expect(aside - ahead).toBeCloseTo((1 - Math.cos(1)) * CARRY.sidePenalty, 9);
  });

  it('holds it ahead of him at the shoulder, lower as the view tilts down', () => {
    expect(holdPoint(feet, 0, 0)).toEqual({ x: 0, y: CARRY.shoulder, z: CARRY.holdAhead });
    const down = holdPoint({ x: 2, y: 1, z: 3 }, Math.PI / 2, Math.PI / 6);
    expect(down.x).toBeCloseTo(2 + CARRY.holdAhead, 9);
    expect(down.y).toBeCloseTo(1 + CARRY.shoulder - 0.5 * CARRY.holdPitch, 9);
    expect(down.z).toBeCloseTo(3, 9);
    expect([withinCarry(CARRY.dropBeyond), withinCarry(CARRY.dropBeyond + 0.01)]).toEqual([true, false]);
  });

  it('draws it to the hold point with a pull that is damped and bounded, and bears its weight', () => {
    expect(carryForce(0.5, 0, 2)).toBeCloseTo(0.5 * CARRY.pull * 2, 9);
    expect(carryForce(0, 1, 2)).toBeCloseTo(-CARRY.damp * 2, 9);
    expect(carryForce(100, 0, 2)).toBe(CARRY.pullMax * 2);
    expect(carryForce(-100, 0, 2)).toBe(-CARRY.pullMax * 2);
    expect(carryLift(3)).toBe(3 * GRAVITY);
  });

  it('throws it along his facing, higher as the view tilts up, with a little spin', () => {
    const level = throwImpulse(0, 0, 2);
    expect(level).toEqual({ x: 0, y: CARRY.throwUp * 2, z: CARRY.throwAhead * 2 });
    expect(throwImpulse(0, -0.5, 2).y).toBeGreaterThan(level.y); // the view up: a higher throw
    expect(throwImpulse(0, 0.5, 2).y).toBeLessThan(level.y);
    expect(throwImpulse(Math.PI / 2, 0, 1).x).toBeCloseTo(CARRY.throwAhead, 9);
    expect(throwSpin(2)).toEqual({ x: 2 * CARRY.spin.x, y: 2 * CARRY.spin.y, z: 2 * CARRY.spin.z });
  });

  it('is let fall by anything else he does, and is no business of a rider', () => {
    expect([keepsHold('free'), keepsHold('light'), keepsHold('dodge'), keepsHold('hurt'), keepsHold('channel'), keepsHold('dead')]).toEqual([true, false, false, false, false, false]);
    expect(handsForCargo({ riding: false, mounting: false })).toBe(true);
    expect(handsForCargo({ riding: true, mounting: false })).toBe(false);
    expect(handsForCargo({ riding: false, mounting: true })).toBe(false);
  });

  it('can be stepped onto as high as anything else', () => {
    expect(CARGO_STEP.height).toBe(STEP_HEIGHT);
    expect(CARGO_STEP.width).toBeGreaterThan(0);
  });
});

describe('how loose cargo moves', () => {
  it('slides, bounces and settles by the core\u2019s numbers, pushed by the wanderer\u2019s weight', () => {
    expect(CARGO_BODY).toEqual({ friction: 0.72, restitution: 0.08, linearDamping: 0.12, angularDamping: 0.35, pusherMass: 80 });
    // A shove's bounce is small beside its grip, and turning dies away faster than travel.
    expect(CARGO_BODY.restitution).toBeLessThan(CARGO_BODY.friction / 4);
    expect(CARGO_BODY.angularDamping).toBeGreaterThan(CARGO_BODY.linearDamping);
  });

  it('slides on surfaces whose friction is the core’s too: rock grips most, the wanderer’s body least', () => {
    expect(SURFACE_FRICTION).toEqual({ ground: 0.85, rock: 0.9, built: 0.8, wanderer: 0.25 });
    // Averaged with a barrel's own, the ground holds it better than the wanderer's body does, so a shove carries it on.
    expect((CARGO_BODY.friction + SURFACE_FRICTION.ground) / 2).toBeGreaterThan((CARGO_BODY.friction + SURFACE_FRICTION.wanderer) / 2);
    expect(SURFACE_FRICTION.rock).toBeGreaterThan(SURFACE_FRICTION.ground);
  });
});
