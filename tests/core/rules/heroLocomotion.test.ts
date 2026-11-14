import { describe, expect, it } from 'vitest';
import { HERO_GUARD_SPEED, HERO_RUN_CYCLE, HERO_RUN_SPEED, HERO_RUN_THRESHOLD, HERO_STRIDE_FIT, HERO_WALK_CYCLE, HERO_WALK_SPEED } from '../../../src/core/rules/heroLocomotion';

describe('the wanderer’s paces', () => {
  it('walks at 1.65 m/s and runs at 5.85 m/s', () => {
    expect(HERO_WALK_SPEED).toBe(1.65);
    expect(HERO_RUN_SPEED).toBe(5.85);
  });

  it('switches gait halfway between the two and guards at 65% of a walk', () => {
    expect(HERO_RUN_THRESHOLD).toBeCloseTo((1.65 + 5.85) / 2, 12);
    expect(HERO_WALK_SPEED).toBeLessThan(HERO_RUN_THRESHOLD);
    expect(HERO_RUN_THRESHOLD).toBeLessThan(HERO_RUN_SPEED);
    expect(HERO_GUARD_SPEED).toBeCloseTo(1.65 * 0.65, 12);
  });

  it('covers a stride per gait cycle fitted to the clips: 25/24 s walking and 2/3 s running, shortened to the soles’ sweep', () => {
    expect(HERO_STRIDE_FIT).toEqual({ walk: 0.92, run: 0.945 });
    expect(HERO_WALK_CYCLE).toBeCloseTo(1.65 * (25 / 24) * 0.92, 12);
    expect(HERO_RUN_CYCLE).toBeCloseTo(5.85 * (2 / 3) * 0.945, 12);
    expect(HERO_RUN_CYCLE).toBeGreaterThan(HERO_WALK_CYCLE);
  });
});
