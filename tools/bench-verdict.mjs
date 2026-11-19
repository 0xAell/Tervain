/**
 * Whether a benchmark run held a steady 60 Hz (tools/bench.mjs). A frame shown later than 1.4 refreshes missed one, as
 * the game's own render scale counts it (renderScale.ts MISSED_MS); the run is steady when fewer than one frame in a
 * hundred missed, the share below which the render scale raises its resolution again. The run's segments are where it
 * was hardest: the one with the most missed frames, and the pixel ratio the run ended at (High asks for up to 1.5; the
 * render scale lowers it while frames are missed).
 */
export const STEADY_SHARE = 0.01;

/** `report`: the game's benchmark report (window.tervainBench). */
export function benchVerdict(report) {
  const whole = report.whole, missed = whole.interval.missed;
  if (typeof missed !== 'number') return { steady: null, line: 'this build does not count missed refreshes (before the benchmark verdict)' };
  let worst = -1;
  report.segments.forEach((s, i) => { if (worst < 0 || s.interval.missed > report.segments[worst].interval.missed) worst = i; });
  const steady = missed < STEADY_SHARE;
  const segment = worst >= 0 ? report.segments[worst] : null;
  const hardest = segment ? `hardest segment ${worst}: ${(segment.interval.missed * 100).toFixed(1)} % missed, median ${segment.interval.median.toFixed(1)} ms, p95 ${segment.interval.p95.toFixed(1)} ms` : 'no segments';
  return {
    steady,
    line: `60 Hz ${steady ? 'held' : 'not held'}: ${(missed * 100).toFixed(1)} % of ${whole.frames} frames missed a refresh (steady under ${STEADY_SHARE * 100} %) · ${hardest} · pixel ratio at the end ${report.pixelRatio}`,
  };
}
