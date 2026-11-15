import { smoothstep } from '../world/noise';

/**
 * The day's clock as the world reads it. One game minute passes per real second (CLOCK_RATE in game/constants.ts).
 * Everything that changes by night reads `nightness`, so the sky, the lanterns, sleepers, animals and the music agree.
 */

/** The sun is above the horizon between these hours. */
export const SUNRISE_HOUR = 6;
export const SUNSET_HOUR = 19;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Daylight, 0 to 1: dawn eases in from 05:30 to 07:00 and dusk out from 18:36 to 20:00. */
export function daylight(hour: number): number {
  return smoothstep(5.5, 7, hour) * (1 - smoothstep(18.6, 20, hour));
}

/**
 * The sun's angle along its arc (radians): 0 at sunrise in the east, π at sunset, and on round below the horizon by
 * night, so the day wraps without a jump.
 */
export function sunArcAngle(hour: number): number {
  return hour >= SUNRISE_HOUR && hour <= SUNSET_HOUR
    ? ((hour - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR)) * Math.PI
    : Math.PI + ((((hour - SUNSET_HOUR) % 24) + 24) % 24) / (24 - (SUNSET_HOUR - SUNRISE_HOUR)) * Math.PI;
}

/** How much night it is: 0 by day, 1 in full night, with half-light before dawn and after dusk. */
export function nightness(hour: number): number {
  return 1 - clamp01(daylight(hour) + smoothstep(4.8, 6.2, hour) * 0.5 * (hour < 12 ? 1 : 0) + (hour > 12 ? smoothstep(20.5, 18.8, hour) * 0.5 : 0));
}

/** When, and at how much night, each thing answers the dark. */
export const NIGHT = {
  /** The wanderer remarks on nightfall at this hour and on dawn at the other. */
  fallsAt: 20,
  liftsAt: 5,
  /** Above this nightness the music plays its night pieces. */
  music: 0.55,
  /** Above this the hamlet's ambient people have gone in to sleep. */
  sleepers: 0.75,
  /** Above this the seated cat may sleep instead of grooming. */
  catSleeps: 0.7,
  /** Lanterns glow in proportion to the nightness above this. */
  lanterns: 0.15,
} as const;

/** Whether one of the hamlet's silent people who sleeps has gone in for the night: then they are neither seen nor in anyone's way. */
export function goneInForTheNight(sleeps: boolean, nightness: number): boolean {
  return sleeps && nightness > NIGHT.sleepers;
}

/** Whether the hour falls in the wanderer's night, from nightfall round to dawn. */
export const isNightHour = (hour: number): boolean => hour >= NIGHT.fallsAt || hour < NIGHT.liftsAt;
