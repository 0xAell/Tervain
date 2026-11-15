import { smoothstep } from '../world/noise';
import { sunArcAngle } from './dayNight';

/**
 * The sky through the day, as numbers: the colours of the air, the sun and the fill at keyed hours, where the sun and
 * the moon stand, and how the light is balanced. A renderer blends between the keys and draws; the look is decided
 * here. Colours are sRGB, written 0xRRGGBB.
 */

export interface SkyKey {
  /** Hour of the day, 0 to 24. */
  h: number;
  /** The sky straight up, and at the horizon. */
  top: number;
  horizon: number;
  /** The sun's light, and its strength. */
  sun: number;
  sunI: number;
  /** The fill from the sky and from the ground, and its strength. */
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  /** The haze. */
  fog: number;
  /** Cloud coverage 0..1. */
  cover: number;
}

export const SKY_KEYS: readonly SkyKey[] = [
  // A slate-blue diffuse floor keeps the route, roots and dark cloth readable
  // under crowns without replacing the night sky or introducing artificial lamps.
  { h: 0, top: 0x070b16, horizon: 0x141b2a, sun: 0x8fa0c8, sunI: 0.0, hemiSky: 0x9aafc8, hemiGround: 0x66758a, hemiI: 1.02, fog: 0x141b2a, cover: 0.55 },
  { h: 5.2, top: 0x1a2236, horizon: 0x5c5560, sun: 0xd89a68, sunI: 0.1, hemiSky: 0x8e9db5, hemiGround: 0x5d697d, hemiI: 0.9, fog: 0x5c5560, cover: 0.6 },
  { h: 6.5, top: 0x4f6f96, horizon: 0xc8a682, sun: 0xf0b078, sunI: 1.0, hemiSky: 0x8298b0, hemiGround: 0x4a4230, hemiI: 0.72, fog: 0xb8a58c, cover: 0.62 },
  // Pale blue air and warm mineral light separate roof/earth masses from cooler
  // shadow. This is a daylight material relationship, not a sepia or dark filter.
  { h: 9, top: 0x7794a8, horizon: 0xc1c6c2, sun: 0xffe6c4, sunI: 2.5, hemiSky: 0x8fa8bd, hemiGround: 0x4c4738, hemiI: 0.65, fog: 0xb5bfc0, cover: 0.52 },
  { h: 13, top: 0x718ea4, horizon: 0xbec8c6, sun: 0xffe9c8, sunI: 2.75, hemiSky: 0x8da8c1, hemiGround: 0x4c4838, hemiI: 0.67, fog: 0xb2bfc3, cover: 0.5 },
  { h: 17, top: 0x506f98, horizon: 0xc0b49d, sun: 0xffd19a, sunI: 2.3, hemiSky: 0x8b9fb9, hemiGround: 0x494031, hemiI: 0.64, fog: 0xacae9f, cover: 0.59 },
  { h: 18.8, top: 0x3d4a6c, horizon: 0xd08a5a, sun: 0xff8f52, sunI: 0.9, hemiSky: 0x7a7a94, hemiGround: 0x3e2e28, hemiI: 0.62, fog: 0xb8825e, cover: 0.66 },
  { h: 20.2, top: 0x161f3a, horizon: 0x5f4a5a, sun: 0xd0784c, sunI: 0.1, hemiSky: 0x8e9db5, hemiGround: 0x5d697d, hemiI: 0.9, fog: 0x4c4152, cover: 0.6 },
  { h: 22, top: 0x080d1c, horizon: 0x151c2e, sun: 0x8fa0c8, sunI: 0.0, hemiSky: 0x9aafc8, hemiGround: 0x66758a, hemiI: 1.02, fog: 0x151c2e, cover: 0.56 },
  { h: 24, top: 0x070b16, horizon: 0x141b2a, sun: 0x8fa0c8, sunI: 0.0, hemiSky: 0x9aafc8, hemiGround: 0x66758a, hemiI: 1.02, fog: 0x141b2a, cover: 0.55 },
];

/** The two keys an hour lies between, and how far it is from the first to the second (0..1). */
export function skyKeysAt(hour: number): { a: SkyKey; b: SkyKey; t: number } {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1]!.h) i++;
  const a = SKY_KEYS[i]!, b = SKY_KEYS[i + 1]!;
  return { a, b, t: (hour - a.h) / (b.h - a.h) };
}

/** How the light is balanced, apart from the keys. */
export const SKY_LIGHT = {
  /**
   * Daylight sky fill in shade (A137): the sky's share of the light grows by day so ground in a house's or a crown's
   * shadow keeps about two fifths of the sunlit ground's brightness, lit blue by the sky, instead of falling near
   * black. The sun gives back a little so the sunlit side keeps its exposure and the shadow keeps its shape.
   */
  dayFillLift: 3.5,
  daySunScale: 0.88,
  /** How much of the sun a shadow still holds when the sun is low (long shadows lit by a wide bright sky), A137. */
  lowSunShadow: 0.78,
  /** The sun's strength below which its shadow has faded out, and the span over which it fades in above that. */
  shadowFadeFrom: 0.12, shadowFadeOver: 0.06,
  /** The sun's height over which a low sun's shadow firms up to full. */
  lowSunFrom: 0.12, lowSunTo: 0.4,
  /** The moon's light: its colour, and its strength in the dead of night when it is high. */
  moon: 0x9ab0e8, moonStrength: 0.5,
  /** The haze: its density by day, how much thicker it is at night, and how far it dims toward the land's light from dusk. */
  fogDensity: 0.0019, fogNightThicken: 0.0006, fogDuskDim: 0.35,
  /** The fill's strength once the scene is also lit by its own image of the sky. */
  fillWithSkyImage: 0.78,
} as const;

interface Direction { x: number; y: number; z: number }
const unit = (x: number, y: number, z: number): Direction => {
  const scale = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
  return { x: x * scale, y: y * scale, z: z * scale };
};

/**
 * Where the sun stands at an hour (a unit direction; x east, y up, z south). It rises east-ish at 6 and sets at 19. By
 * night it goes on round below the horizon so the day wraps without a jump; beyond the day's ends it is held low, eased
 * in over a few minutes either side rather than switched (A70).
 */
export function sunDirection(hour: number): Direction {
  const angle = sunArcAngle(hour);
  const sun = unit(Math.cos(angle) * 0.95, Math.max(0.02, Math.sin(angle)) * 0.9 + 0.08, -0.32);
  const low = Math.max(1 - smoothstep(5.6, 6.0, hour), smoothstep(19.0, 19.4, hour));
  if (low > 0) sun.y = Math.max(0.03, sun.y * (1 - 0.6 * low));
  return unit(sun.x, sun.y, sun.z);
}

/**
 * Where the moon stands: it crosses the sky between 18:00 and 06:00 on the opposite side of the sun's arc. Its lift
 * fades out at the arc's ends, so it sets and rises without a flip (A70).
 */
export function moonDirection(hour: number): Direction {
  const moonHour = (hour + 6) % 24; // 0 at 18:00, 12 at 06:00
  const angle = (moonHour / 12) * Math.PI;
  const lift = 0.1 * Math.min(1, Math.sin(Math.min(Math.PI, Math.max(0, angle))) * 4);
  return unit(Math.cos(angle) * 0.9, Math.sin(angle) * 0.78 + lift, 0.34);
}
