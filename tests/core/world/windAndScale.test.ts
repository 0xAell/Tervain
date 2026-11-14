import { describe, expect, it } from 'vitest';
import { CONIFER_MAX_SCALE, HORIZON_CONIFER_SCALE, ORCHARD_MAX_SCALE, ORCHARD_SCALE, PALM_MAX_SCALE, PALM_SCALE } from '../../../src/core/world/treeScale';
import { REALM_WIND } from '../../../src/core/world/wind';

describe('the realm’s wind', () => {
  it('blows in off the sea to the west, as a unit direction, gusting above its steady strength', () => {
    const [x, z] = REALM_WIND.direction;
    expect(Math.hypot(x, z)).toBeCloseTo(1, 2);
    expect(x).toBeGreaterThan(0);
    expect(REALM_WIND.gust).toBeGreaterThan(REALM_WIND.steady);
    expect(REALM_WIND.speed).toBeGreaterThan(0);
  });
});

describe('planted tree sizes', () => {
  it('derives each largest size from its range', () => {
    expect(ORCHARD_MAX_SCALE).toBe(ORCHARD_SCALE.min + ORCHARD_SCALE.span);
    expect(CONIFER_MAX_SCALE).toBe(HORIZON_CONIFER_SCALE.min + HORIZON_CONIFER_SCALE.span);
    expect(PALM_MAX_SCALE).toBe(PALM_SCALE.min + PALM_SCALE.span);
    for (const range of [ORCHARD_SCALE, HORIZON_CONIFER_SCALE, PALM_SCALE]) { expect(range.min).toBeGreaterThan(0); expect(range.span).toBeGreaterThan(0); }
  });
});
