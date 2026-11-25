import { shoreDistance } from '../core/world/coast';
import type { V2 } from '../core/world/layout';

/** A wind sea, a longer ground swell and a short cross chop, all in world metres.
 * Byte phases let the floor, floating actors and reflected silhouettes sample the same surface. */
const sine = Float32Array.from({ length: 256 }, (_, i) => Math.sin((i * Math.PI) / 128));
const phase = (cycles: number) => Math.floor(cycles * 256) & 255;
export const sinPhase = (p: number) => sine[p & 255]!;
export const cosPhase = (p: number) => sine[(p + 64) & 255]!;

export function seaPhases(x: number, z: number, depth: number) {
  // Shallow-water wavelengths contract as the wavefront approaches the beach.
  const shoal = Math.max(0, 7 - depth);
  const a = phase(
    x * 0.06 +
      z * 0.02 +
      0.17 * Math.sin(z * 0.152 + x * 0.039) +
      0.093 * Math.sin(z * 0.32 - x * 0.12) -
      shoal * 0.037
  );
  const b = phase(x * 0.097 - z * 0.062 + 0.19 * Math.sin(x * 0.133 + z * 0.072));
  const c = phase(x * 0.12 + z * 0.16 + 0.14 * Math.cos(x * 0.21 - z * 0.13));
  const d = phase(z * 0.039 - x * 0.017 + 0.21 * Math.cos(z * 0.081 + x * 0.048));
  return (a | (b << 8) | (c << 16) | (d << 24)) >>> 0;
}

/** Gradient of the primary swell's phase and its sample on the windward face of an obstacle. */
export function incomingSwell(p: V2, radius: number, bank: number) {
  const a = 0.17 * Math.cos(p.z * 0.152 + p.x * 0.039),
    b = 0.093 * Math.cos(p.z * 0.32 - p.x * 0.12),
    shoaling = bank < 7 ? 0.037 : 0,
    dx = 0.06 + a * 0.039 - b * 0.12 - shoaling,
    dz = 0.02 + a * 0.152 + b * 0.32,
    length = Math.hypot(dx, dz),
    tx = dx / length,
    tz = dz / length,
    x = p.x - tx * radius,
    z = p.z - tz * radius;
  return { tx, tz, phase: seaPhases(x, z, -shoreDistance(x, z)) };
}

/** Metres below the surface. Channel floors flatten towards the thalweg, with exposed gravel near the bank. */
export function bedDepth(bank: number, halfWidth: number, ocean: boolean, grain: number) {
  const distance = Math.max(0, bank);
  if (ocean) return Math.min(5.5, distance * 0.34) * (0.91 + grain * 0.18);
  const section = Math.min(1, distance / Math.max(0.8, halfWidth)),
    bowl = section * (2 - section);
  return Math.min(2.65, 0.54 + halfWidth * 0.38) * bowl * (0.83 + 0.32 * grain);
}
export function seaClock(time: number) {
  return [phase(time * 0.192), phase(time * 0.255), phase(time * 0.352), phase(time * 0.042)] as const;
}
export function surfaceHeight(phases: number, time: ReturnType<typeof seaClock>) {
  return (
    0.58 * sinPhase(phases - time[0]) +
    0.31 * sinPhase((phases >>> 8) - time[1]) +
    0.11 * sinPhase((phases >>> 16) - time[2])
  );
}
export function floatHeight(x: number, z: number, depth: number, time: number) {
  return surfaceHeight(seaPhases(x, z, depth), seaClock(time)) * Math.min(1, depth / 4) * 2.7;
}
