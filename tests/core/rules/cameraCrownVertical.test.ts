import { expect, it } from 'vitest';
import { CROWN_FLOOR, CROWN_MIN_BOOM, crownBoom, type CameraCrown } from '../../../src/core/rules/cameraCrowns';

it.each([-20, 30])('does not sample a crown wholly outside the boom height range (centre %s)', (y) => {
  const c: CameraCrown = { x: 0, y, z: 3, h: 5, v: 3.5, floor: -30 };
  let horizontalReads = 0;
  Object.defineProperty(c, 'x', { get() { horizontalReads++; return 0; } });
  const allowed = crownBoom({ x: 0, y: 1.6, z: 0 }, { x: 0, y: .5, z: Math.sqrt(.75) }, 6.2, [c]);
  expect(allowed).toBe(6.2);
  expect(horizontalReads).toBe(0);
});

it('leaves head room under a crown: a boom below the crown floor keeps its length, one above it is pulled in', () => {
  expect(CROWN_FLOOR).toBe(2.6);
  // A wide crown hanging over level ground at height 0, its floor the head room above that ground.
  const crown: CameraCrown = { x: 0, y: 3, z: 3, h: 5, v: 3.5, floor: CROWN_FLOOR };
  const level = { x: 0, y: 0, z: 1 };
  // At eye height the boom runs under the floor, so the crown does not hold the camera.
  expect(crownBoom({ x: 0, y: 1.6, z: -6 }, level, 6.2, [crown])).toBe(6.2);
  // The same boom just above the floor enters the crown's core and is shortened, never below the minimum.
  const raised = crownBoom({ x: 0, y: CROWN_FLOOR + 0.2, z: -6 }, level, 6.2, [crown]);
  expect(raised).toBeLessThan(6.2);
  expect(raised).toBeGreaterThanOrEqual(CROWN_MIN_BOOM);
  // A crown that reaches the ground (no head room) holds the eye-height boom too.
  expect(crownBoom({ x: 0, y: 1.6, z: -6 }, level, 6.2, [{ ...crown, floor: 0 }])).toBeLessThan(6.2);
});
