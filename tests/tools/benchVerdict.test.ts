import { describe, expect, it } from 'vitest';
// @ts-expect-error Tool modules run directly in Node.
import { benchVerdict, STEADY_SHARE } from '../../tools/bench-verdict.mjs';

const summary = (missed: number | undefined, median = 16.7, p95 = 18, frames = 600) => ({ frames, interval: { median, p95, p99: p95, worst: p95, missed } });
const report = (whole: number | undefined, segments: number[], pixelRatio = 1.5) => ({ pixelRatio, whole: summary(whole), segments: segments.map((m, i) => summary(m, 16 + i, 18 + i)) });

describe("the benchmark's 60 Hz verdict", () => {
  it('holds when fewer than one frame in a hundred missed a refresh, and names the hardest segment', () => {
    const v = benchVerdict(report(0.004, [0, 0.01, 0.002]));
    expect(STEADY_SHARE).toBe(0.01);
    expect(v.steady).toBe(true);
    expect(v.line).toContain('60 Hz held: 0.4 % of 600 frames missed a refresh');
    expect(v.line).toContain('hardest segment 1: 1.0 % missed, median 17.0 ms, p95 19.0 ms');
    expect(v.line).toContain('pixel ratio at the end 1.5');
  });

  it('does not hold at one frame in a hundred or more, and says the pixel ratio the render scale ended at', () => {
    const v = benchVerdict(report(0.01, [0.03, 0], 1.05));
    expect(v.steady).toBe(false);
    expect(v.line).toContain('60 Hz not held: 1.0 %');
    expect(v.line).toContain('hardest segment 0: 3.0 % missed');
    expect(v.line).toContain('pixel ratio at the end 1.05');
  });

  it('says so when the build measured does not count missed refreshes', () => {
    expect(benchVerdict(report(undefined, [])).steady).toBeNull();
  });
});
