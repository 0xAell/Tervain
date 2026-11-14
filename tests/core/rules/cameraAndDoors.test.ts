import { describe, expect, it } from 'vitest';
import { AIM_VIEW, CAMERA, ROOM_CAMERA } from '../../../src/core/rules/camera';
import { DOORS } from '../../../src/core/rules/doors';

describe('the follow camera', () => {
  it('starts inside its zoom and tilt limits', () => {
    expect(CAMERA.distance).toBeGreaterThanOrEqual(CAMERA.minDistance);
    expect(CAMERA.distance).toBeLessThanOrEqual(CAMERA.maxDistance);
    expect(CAMERA.pitch).toBeGreaterThan(CAMERA.minPitch);
    expect(CAMERA.pitch).toBeLessThan(CAMERA.maxPitch);
  });

  it('can look well up at the lighthouse and the crowns, and nearly straight down', () => {
    expect(CAMERA.minPitch).toBeLessThan(-0.5);
    expect(CAMERA.maxPitch).toBeLessThan(Math.PI / 2);
  });

  it('draws in over his shoulder to aim, closer than any free zoom', () => {
    expect(AIM_VIEW.boom).toBeLessThan(CAMERA.minDistance);
    expect(AIM_VIEW.right).toBeGreaterThan(0);
  });

  it('enters a room sooner than it leaves it, so a doorway does not flicker', () => {
    expect(ROOM_CAMERA.enter).toBeLessThan(ROOM_CAMERA.leave);
    expect(ROOM_CAMERA.hold).toBeGreaterThan(ROOM_CAMERA.enter);
    expect(ROOM_CAMERA.ceilingClearance).toBeGreaterThan(0);
  });
});

describe('house doors', () => {
  it('open square into the room, quicker than they close, and wait before closing', () => {
    expect(DOORS.swing).toBeCloseTo(Math.PI / 2, 12);
    expect(DOORS.opening).toBeLessThan(DOORS.closing);
    expect(DOORS.linger).toBeGreaterThan(DOORS.opening);
    expect(DOORS.reach).toBe(2.4);
  });
});
