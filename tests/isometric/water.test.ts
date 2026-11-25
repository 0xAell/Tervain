import { describe, expect, it } from 'vitest';
import { coastX } from '../../src/core/world/coast';
import { DECKS } from '../../src/core/world/layout';
import { SPRING_BASIN } from '../../src/core/world/water/spring';
import { foamCell } from '../../src/isometric/foam';
import { seaClock, seaPhases, surfaceHeight, floatHeight } from '../../src/isometric/swell';
import { onBridge, waterProfile, wetPoint, waveFrame } from '../../src/isometric/water';

describe('isometric water', () => {
  it('distinguishes the intertidal shelf from the playable ocean', () => {
    const z = 18,
      edge = coastX(z);
    expect(wetPoint(edge + 0.8, z)).toBeNull();
    expect(waterProfile(edge + 0.8, z)?.bank).toBeCloseTo(-0.8, 2);
    expect(wetPoint(edge - 0.4, z)?.kind).toBe('shallows');
    expect(wetPoint(edge - 7, z)?.kind).toBe('sea');
    expect(waterProfile(edge + 4, z)).toBeNull();
  });
  it('follows river bends downstream from the sluice, including the quarry branch', () => {
    const main = wetPoint(37, 0)!;
    expect(main.course).toBe('main');
    expect(wetPoint(41, 14)!.along).toBeGreaterThan(main.along);
    expect(wetPoint(60, -30)!.along).toBeGreaterThan(wetPoint(48, -31)!.along);
    expect(wetPoint(-13, 4)?.course).toBe('village');
    expect(wetPoint(SPRING_BASIN.x, SPRING_BASIN.z)?.kind).toBe('pool');
    expect(onBridge(DECKS[0]!)).toBe(true);
    expect(onBridge({ x: 36, z: 7 })).toBe(false);
  });
  it('damps buoyancy at shore and advances the same world-anchored waves for the swimmer', () => {
    const phases = seaPhases(-292, 15, 10);
    expect(floatHeight(-292, 15, 10, 2)).toBeCloseTo(surfaceHeight(phases, seaClock(2)) * 2.7, 8);
    expect(floatHeight(-292, 15, 0, 2)).toBe(0);
    expect(floatHeight(-292, 15, 10, 2)).not.toBeCloseTo(floatHeight(-292, 15, 10, 2.7), 2);
    expect(Math.abs(floatHeight(-292, 15, 10, 2))).toBeLessThanOrEqual(2.7);
  });
  it('wraps its foam field and plays irregular-length painted wave sequences without a loop cut', () => {
    expect(foamCell(-3, 21)).toBe(foamCell(125, 149));
    expect([0, 1, 2, 3, 4, 5, 6].map((t) => waveFrame(t, 4))).toEqual([0, 1, 2, 3, 2, 1, 0]);
    expect(waveFrame(-1, 4)).toBe(1);
    expect(waveFrame(22, 1)).toBe(0);
  });
});
