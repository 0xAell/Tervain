import { describe, expect, it } from 'vitest';
import { HUNTING_ARROW_RANGE } from '../../../src/core/game/hunting';
import { arrowLaunchDirection, BOW } from '../../../src/core/rules/bow';

/** Fly an arrow from the origin along `direction` and return its height when it has travelled `distance` on the ground. */
function heightAt(direction: { x: number; y: number; z: number }, distance: number, speed = BOW.arrowSpeed): number {
  const horizontal = Math.hypot(direction.x, direction.z) * speed, t = distance / horizontal;
  return direction.y * speed * t - 0.5 * BOW.gravity * t * t;
}

describe('loosing an arrow', () => {
  it('aims a unit direction that carries the arrow through the target', () => {
    for (const [dx, dy, dz] of [[30, 0, 0], [0, 2, 40], [-20, -3, 25], [45, 6, -40]] as const) {
      const direction = arrowLaunchDirection(dx, dy, dz);
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 9);
      expect(heightAt(direction, Math.hypot(dx, dz))).toBeCloseTo(dy, 6);
      // It leaves along the line to the target on the ground.
      expect(Math.atan2(direction.x, direction.z)).toBeCloseTo(Math.atan2(dx, dz), 9);
    }
  });

  it('takes the low arc: a level shot at 30 m leaves two degrees above the horizontal', () => {
    const direction = arrowLaunchDirection(0, 0, 30);
    // sin(2θ) = g·d / v² for a level shot; the low solution is the small angle.
    expect(Math.asin(direction.y)).toBeCloseTo(Math.asin(BOW.gravity * 30 / (BOW.arrowSpeed * BOW.arrowSpeed)) / 2, 9);
    expect(Math.asin(direction.y) * 180 / Math.PI).toBeCloseTo(2, 1);
  });

  it('points straight at a target directly above or below, or beyond its reach', () => {
    expect(arrowLaunchDirection(0, 5, 0)).toEqual({ x: 0, y: 1, z: 0 });
    const far = arrowLaunchDirection(0, 0, 10_000);
    expect(far).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('reaches the bow’s whole range on the level', () => {
    const maxLevelRange = BOW.arrowSpeed * BOW.arrowSpeed / BOW.gravity;
    expect(maxLevelRange).toBeGreaterThan(HUNTING_ARROW_RANGE);
  });

  it('sinks slowly, stops quickly and floats in water', () => {
    expect(BOW.waterGravity).toBeLessThan(1);
    // After half a second of drag a full-speed arrow is slower than the speed at which it floats.
    expect(BOW.arrowSpeed * Math.exp(-BOW.waterDrag * 0.5)).toBeLessThan(BOW.floatSpeed);
    expect(BOW.maxLodged).toBeGreaterThanOrEqual(BOW.maxFlights);
  });
});
