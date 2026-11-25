/** The fixed colour ramps are mixed with the valley artwork and sky at native pixel resolution. */
export function rgba(r: number, g: number, b: number) {
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}
export function mix(a: number, b: number, weight: number) {
  const f = Math.max(0, Math.min(256, weight | 0)),
    inv = 256 - f;
  const rb = (((a & 0xff00ff) * inv + (b & 0xff00ff) * f) >>> 8) & 0xff00ff;
  const g = (((a & 0xff00) * inv + (b & 0xff00) * f) >>> 8) & 0xff00;
  return (0xff000000 | rb | g) >>> 0;
}
function ramp(stops: readonly number[][]) {
  return Uint32Array.from({ length: 32 }, (_, i) => {
    const v = (i / 31) * (stops.length - 1),
      j = Math.floor(v);
    const a = stops[j]!,
      b = stops[Math.min(j + 1, stops.length - 1)]!;
    return mix(rgba(a[0]!, a[1]!, a[2]!), rgba(b[0]!, b[1]!, b[2]!), (v - j) * 256);
  });
}
export const oceanRamp = ramp([
  [16, 40, 50],
  [20, 54, 66],
  [27, 72, 84],
  [35, 91, 99],
  [54, 115, 118],
  [84, 141, 139],
  [132, 164, 150],
]);
export const bankRamp = ramp([
  [52, 78, 74],
  [68, 101, 91],
  [86, 124, 109],
  [105, 143, 124],
  [139, 162, 136],
  [167, 177, 147],
]);
export const streamRamp = ramp([
  [25, 52, 91],
  [33, 80, 137],
  [35, 114, 160],
  [41, 146, 172],
  [68, 179, 182],
  [133, 217, 200],
  [202, 241, 209],
]);
export const poolRamp = ramp([
  [22, 58, 81],
  [27, 100, 124],
  [34, 148, 151],
  [87, 187, 170],
  [167, 219, 182],
]);
export const foamShade = rgba(147, 173, 151),
  foamLit = rgba(212, 221, 191),
  glint = rgba(186, 199, 174);
