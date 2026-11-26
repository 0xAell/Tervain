/** Exact damped follow for a focus moving from start to end during this display frame. */
export function followAxis(camera: number, start: number, end: number, seconds: number, rate: number) {
  const interval = Math.max(0, seconds) * rate;
  if (!interval) return camera;
  const mix = -Math.expm1(-interval);
  return camera + (start - camera) * mix + (end - start) * (1 - mix / interval);
}
