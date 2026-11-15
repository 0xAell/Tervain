import { describe, expect, it } from 'vitest';
import { daylight, nightness, SUNRISE_HOUR, SUNSET_HOUR } from '../../../src/core/rules/dayNight';
import { moonDirection, SKY_KEYS, SKY_LIGHT, skyKeysAt, sunDirection } from '../../../src/core/rules/sky';

// The look of the sky through the day is a table and three rules: which colours hold at which hour, where the sun
// stands and where the moon. They are checked here without a renderer.

const length = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

describe('the sky’s keys', () => {
  it('run from midnight to midnight in order, and the day closes on itself', () => {
    expect(SKY_KEYS[0]!.h).toBe(0);
    expect(SKY_KEYS.at(-1)!.h).toBe(24);
    for (let i = 1; i < SKY_KEYS.length; i++) expect(SKY_KEYS[i]!.h).toBeGreaterThan(SKY_KEYS[i - 1]!.h);
    const { h: _first, ...midnight } = SKY_KEYS[0]!, { h: _last, ...end } = SKY_KEYS.at(-1)!;
    expect(end).toEqual(midnight);
  });

  it('hold colours as 24-bit sRGB, coverage as a share and strengths that follow the sun', () => {
    for (const key of SKY_KEYS) {
      for (const colour of [key.top, key.horizon, key.sun, key.hemiSky, key.hemiGround, key.fog]) expect(Number.isInteger(colour) && colour >= 0 && colour <= 0xffffff, `${key.h}h`).toBe(true);
      expect(key.cover > 0 && key.cover < 1, `${key.h}h`).toBe(true);
      expect(key.sunI).toBeGreaterThanOrEqual(0);
      expect(key.hemiI).toBeGreaterThan(0.5);
    }
    // No sun at night, the strongest sun at midday, and a low sun at the day's ends.
    const strongest = SKY_KEYS.reduce((best, key) => (key.sunI > best.sunI ? key : best));
    expect(strongest.h).toBe(13);
    for (const key of SKY_KEYS) if (key.h <= 0 || key.h >= 22) expect(key.sunI).toBe(0);
  });

  it('blend between the two keys an hour lies between', () => {
    expect(skyKeysAt(0)).toMatchObject({ a: SKY_KEYS[0], b: SKY_KEYS[1], t: 0 });
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      const a = SKY_KEYS[i]!, b = SKY_KEYS[i + 1]!, middle = (a.h + b.h) / 2;
      expect(skyKeysAt(middle)).toEqual({ a, b, t: (middle - a.h) / (b.h - a.h) });
      expect(skyKeysAt(middle).t).toBeCloseTo(0.5, 12);
      // At a key's own hour the blend starts from it.
      if (i < SKY_KEYS.length - 2) expect(skyKeysAt(b.h)).toMatchObject({ a: b, t: 0 });
    }
    // The last moment of the day is the last key, reached from the one before.
    expect(skyKeysAt(24)).toMatchObject({ a: SKY_KEYS.at(-2), b: SKY_KEYS.at(-1), t: 1 });
    for (let hour = 0; hour <= 24; hour += 0.05) { const { t } = skyKeysAt(hour); expect(t >= 0 && t <= 1 + 1e-12, `${hour}`).toBe(true); }
  });
});

describe('the sun and the moon', () => {
  it('are unit directions at every hour, without a jump as the day wraps', () => {
    let lastSun = sunDirection(0), lastMoon = moonDirection(0);
    for (let hour = 0.01; hour <= 24.001; hour += 0.01) {
      const sun = sunDirection(hour % 24), moon = moonDirection(hour % 24);
      expect(length(sun)).toBeCloseTo(1, 12);
      expect(length(moon)).toBeCloseTo(1, 12);
      // A hundredth of an hour never turns either more than a degree and a half.
      expect(Math.acos(Math.min(1, sun.x * lastSun.x + sun.y * lastSun.y + sun.z * lastSun.z))).toBeLessThan(0.026);
      expect(Math.acos(Math.min(1, moon.x * lastMoon.x + moon.y * lastMoon.y + moon.z * lastMoon.z))).toBeLessThan(0.026);
      lastSun = sun; lastMoon = moon;
    }
  });

  it('put the sun high at midday, in the east in the morning and the west in the evening, and never below the land', () => {
    const noon = sunDirection((SUNRISE_HOUR + SUNSET_HOUR) / 2);
    expect(noon.y).toBeGreaterThan(0.9);
    expect(sunDirection(SUNRISE_HOUR + 1).x).toBeGreaterThan(0.5);
    expect(sunDirection(SUNSET_HOUR - 1).x).toBeLessThan(-0.5);
    for (let hour = 0; hour < 24; hour += 0.1) expect(sunDirection(hour).y).toBeGreaterThan(0);
    // It climbs through the morning, and by night it is held low for the night's own light.
    expect(daylight(13)).toBe(1);
    expect(noon.y).toBeGreaterThan(sunDirection(8).y);
    expect(sunDirection(8).y).toBeGreaterThan(sunDirection(1).y);
  });

  it('bring the moon across the night sky opposite the sun', () => {
    expect(moonDirection(0).y).toBeGreaterThan(0.7);
    expect(moonDirection(12).y).toBeLessThan(0);
    expect(moonDirection(19).x).toBeGreaterThan(0);
    expect(moonDirection(5).x).toBeLessThan(0);
    expect(nightness(0)).toBe(1);
  });
});

describe('the balance of the light', () => {
  it('keeps the daylight fill, the low sun’s shadow and the haze within sensible ranges', () => {
    expect(SKY_LIGHT.dayFillLift).toBeGreaterThan(1);
    expect(SKY_LIGHT.daySunScale > 0.5 && SKY_LIGHT.daySunScale < 1).toBe(true);
    expect(SKY_LIGHT.lowSunShadow > 0 && SKY_LIGHT.lowSunShadow < 1).toBe(true);
    expect(SKY_LIGHT.fogDuskDim > 0 && SKY_LIGHT.fogDuskDim < 1).toBe(true);
    // Night thickens the haze by less than half again.
    expect(SKY_LIGHT.fogNightThicken).toBeLessThan(SKY_LIGHT.fogDensity / 2);
    // The sun's shadow has faded out before the weakest sun of the keys that has any.
    const weakest = Math.min(...SKY_KEYS.filter((key) => key.sunI > 0).map((key) => key.sunI));
    expect(SKY_LIGHT.shadowFadeFrom).toBeGreaterThanOrEqual(weakest);
    expect(SKY_LIGHT.lowSunFrom).toBeLessThan(SKY_LIGHT.lowSunTo);
  });
});
