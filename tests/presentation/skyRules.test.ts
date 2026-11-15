import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sunArcAngle } from '../../src/core/rules/dayNight';
import { moonDirection, SKY_LIGHT, sunDirection } from '../../src/core/rules/sky';
import { smoothstep } from '../../src/core/world/noise';
import { DAY_FILL_LIFT, DAY_SUN_SCALE, FOG_DUSK_DIM, FOG_NIGHT_THICKEN, LOW_SUN_SHADOW } from '../../src/presentation/sky';

// The sun's and the moon's places were computed with the renderer's vectors before they moved to the core. The
// core's arithmetic must give the very same numbers, so the light and every shadow fall exactly where they did.

describe('the core’s sun and moon against the renderer’s vectors', () => {
  it('gives bit-identical directions at every tenth of a minute of the day', () => {
    const sun = new THREE.Vector3(), moon = new THREE.Vector3();
    for (let step = 0; step <= 14400; step++) {
      const hour = step / 600;
      // The sun as the scene computed it.
      const angle = sunArcAngle(hour);
      sun.set(Math.cos(angle) * 0.95, Math.max(0.02, Math.sin(angle)) * 0.9 + 0.08, -0.32).normalize();
      const low = Math.max(1 - smoothstep(5.6, 6.0, hour), smoothstep(19.0, 19.4, hour));
      if (low > 0) sun.y = Math.max(0.03, sun.y * (1 - 0.6 * low));
      sun.normalize();
      const core = sunDirection(hour);
      if (core.x !== sun.x || core.y !== sun.y || core.z !== sun.z) expect({ hour, ...core }).toEqual({ hour, x: sun.x, y: sun.y, z: sun.z });
      // The moon as the scene computed it.
      const moonHour = (hour + 6) % 24, moonAngle = (moonHour / 12) * Math.PI;
      const lift = 0.1 * Math.min(1, Math.sin(Math.min(Math.PI, Math.max(0, moonAngle))) * 4);
      moon.set(Math.cos(moonAngle) * 0.9, Math.sin(moonAngle) * 0.78 + lift, 0.34).normalize();
      const coreMoon = moonDirection(hour);
      if (coreMoon.x !== moon.x || coreMoon.y !== moon.y || coreMoon.z !== moon.z) expect({ hour, ...coreMoon }).toEqual({ hour, x: moon.x, y: moon.y, z: moon.z });
    }
    expect(sunDirection(13).y).toBeGreaterThan(0.9);
  });

  it('names the same balance of light the scene exports', () => {
    expect([DAY_FILL_LIFT, DAY_SUN_SCALE, LOW_SUN_SHADOW, FOG_DUSK_DIM, FOG_NIGHT_THICKEN]).toEqual([3.5, 0.88, 0.78, 0.35, 0.0006]);
    expect(SKY_LIGHT).toMatchObject({ dayFillLift: 3.5, daySunScale: 0.88, lowSunShadow: 0.78, fogDuskDim: 0.35, fogNightThicken: 0.0006, fogDensity: 0.0019, moon: 0x9ab0e8, moonStrength: 0.5, shadowFadeFrom: 0.12, shadowFadeOver: 0.06, lowSunFrom: 0.12, lowSunTo: 0.4, fillWithSkyImage: 0.78 });
  });
});
