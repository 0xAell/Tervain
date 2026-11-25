import { sinPhase } from './swell';

/** World-locked caustic glints. At their peak the brightest pixel opens into a four-point star. */
export function riverSpark(x: number, y: number, time: number, grain: number) {
  const cx = Math.floor(x / 15),
    cy = Math.floor(y / 11),
    seed = ((cx * 73) ^ (cy * 151) ^ (cx * cy * 17)) & 255;
  const flare = sinPhase(seed + time * 43);
  if (flare < 0.47 || (seed & 3) === 0) return 0;
  const u = Math.abs(x - cx * 15 - 3 - (seed % 9)),
    v = Math.abs(y - cy * 11 - 2 - ((seed >>> 3) % 7));
  const peak = (flare - 0.47) / 0.53;
  if (!u && !v) return peak * (0.64 + 0.36 * grain);
  if ((u === 0 && v === 1) || (v === 0 && u <= 2))
    return Math.max(0, (peak - 0.67) * 2.4) * (u + v === 1 ? 0.85 : 0.46);
  return 0;
}
