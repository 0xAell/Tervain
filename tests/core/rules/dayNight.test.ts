import { describe, expect, it } from 'vitest';
import { daylight, isNightHour, NIGHT, nightness, sunArcAngle, SUNRISE_HOUR, SUNSET_HOUR } from '../../../src/core/rules/dayNight';

describe('daylight and night', () => {
  it('is full day from 07:00 to 18:36 and full night from 20:30 to 04:48', () => {
    for (const hour of [7, 9, 12, 15, 18.6]) { expect(daylight(hour)).toBe(1); expect(nightness(hour)).toBe(0); }
    for (const hour of [20.5, 22, 0, 2, 4.8]) { expect(daylight(hour)).toBe(0); expect(nightness(hour)).toBe(1); }
  });

  it('passes through half-light before dawn and after dusk, never jumping', () => {
    let previous = nightness(0);
    for (let hour = 0; hour <= 24; hour += 1 / 60) {
      const now = nightness(hour % 24);
      expect(now).toBeGreaterThanOrEqual(0); expect(now).toBeLessThanOrEqual(1);
      expect(Math.abs(now - previous)).toBeLessThan(0.05);
      previous = now;
    }
    expect(nightness(5.5)).toBeGreaterThan(0.2); expect(nightness(5.5)).toBeLessThan(1);
    expect(nightness(19.5)).toBeGreaterThan(0.2); expect(nightness(19.5)).toBeLessThan(1);
  });

  it('grows lighter through the morning and darker through the evening', () => {
    for (let hour = 4.8; hour < 7; hour += 0.1) expect(nightness(hour + 0.1)).toBeLessThanOrEqual(nightness(hour));
    for (let hour = 18.6; hour < 20.5; hour += 0.1) expect(nightness(hour + 0.1)).toBeGreaterThanOrEqual(nightness(hour));
  });

  it('agrees on midnight from either side of the clock', () => {
    expect(nightness(24)).toBe(nightness(0));
  });
});

describe('the sun’s arc', () => {
  it('rises at 06:00, stands highest at 12:30 and sets at 19:00', () => {
    expect(sunArcAngle(SUNRISE_HOUR)).toBe(0);
    expect(sunArcAngle((SUNRISE_HOUR + SUNSET_HOUR) / 2)).toBeCloseTo(Math.PI / 2, 12);
    expect(sunArcAngle(SUNSET_HOUR)).toBeCloseTo(Math.PI, 12);
  });

  it('goes on round below the horizon by night and wraps at midnight without a jump', () => {
    expect(sunArcAngle(19.001)).toBeCloseTo(Math.PI, 2);
    expect(sunArcAngle(23.999)).toBeCloseTo(sunArcAngle(0.001), 2);
    expect(sunArcAngle(5.999)).toBeCloseTo(2 * Math.PI, 2);
    for (let hour = 19.1; hour < 29.9; hour += 0.1) expect(sunArcAngle((hour + 0.1) % 24)).toBeGreaterThan(sunArcAngle(hour % 24));
  });
});

describe('what answers the dark', () => {
  it('counts the wanderer’s night from 20:00 round to 05:00', () => {
    for (const hour of [20, 23, 0, 4.99]) expect(isNightHour(hour)).toBe(true);
    for (const hour of [5, 12, 19.99]) expect(isNightHour(hour)).toBe(false);
  });

  it('lights the lanterns first, then turns the music, then sends the cat and the hamlet to sleep', () => {
    expect(NIGHT.lanterns).toBeLessThan(NIGHT.music);
    expect(NIGHT.music).toBeLessThan(NIGHT.catSleeps);
    expect(NIGHT.catSleeps).toBeLessThan(NIGHT.sleepers);
    expect(nightness(NIGHT.fallsAt)).toBeGreaterThan(NIGHT.sleepers);
  });
});
