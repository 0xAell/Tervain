import { expect, it } from 'vitest';
// @ts-expect-error Tool modules run directly in Node.
import { median, stageTimes, summary } from '../../tools/load-stages.mjs';

type Stage = { phase: string; start: number; seconds: number };

it('times each stage from its first update to the next stage\'s, and the last to the screen lifting', () => {
  // Milliseconds of the page clock; the click at 1000. An update before the click (the menu's) is not the journey's.
  const updates = [
    { t: 900, phase: 'prepare' }, { t: 1010, phase: 'prepare' }, { t: 1500, phase: 'residents' }, { t: 2600, phase: 'models' },
    { t: 3000, phase: 'textures' }, { t: 3100, phase: 'models' }, { t: 5000, phase: 'terrain' }, { t: 9000, phase: 'graphics' }, { t: 9500, phase: 'graphics' },
  ];
  const stages: Stage[] = stageTimes(updates, 1000, 12000);
  expect(stages.map((s) => s.phase)).toEqual(['prepare', 'residents', 'models', 'textures', 'terrain', 'graphics']);
  expect(stages.map((s) => s.start)).toEqual([0.01, 0.5, 1.6, 2, 4, 8]);
  expect(stages.map((s) => s.seconds)).toEqual([0.49, 1.1, 0.4, 2, 4, 3]);
});

it('takes the middle of the runs, or the mean of the middle two, and skips runs without the value', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(median([NaN, 5])).toBe(5);
  expect(median([])).toBeNaN();
});

it('sums up each URL\'s runs as stage medians, with a dash for a stage a URL never showed', () => {
  const run = (url: string, woodland: number, total: number, extra = false) => ({ url, total, stages: [
    { phase: 'terrain', start: 10, seconds: 2 }, { phase: 'woodland', start: 12, seconds: woodland }, ...(extra ? [{ phase: 'physics', start: 20, seconds: 1 }] : []),
  ] });
  const text: string = summary([run('a', 10, 30), run('b', 7, 26, true), run('a', 11, 31), run('b', 8, 27, true), run('a', 12, 29), run('c', 9, 28)]);
  const rows = text.split('\n');
  expect(rows[0]).toMatch(/^stage\s+url 1\s+url 2\s+url 3$/);
  expect(rows[1]).toMatch(/^terrain\s+2\.0\s+2\.0\s+2\.0$/);
  expect(rows[2]).toMatch(/^woodland\s+11\.0\s+7\.5\s+9\.0$/);
  expect(rows[3]).toMatch(/^physics\s+–\s+1\.0\s+–$/);
  expect(rows[4]).toMatch(/^total\s+30\.0\s+26\.5\s+28\.0$/);
  expect(text).toContain('url 1: a (3 runs, medians in seconds)');
  expect(text).toContain('url 2: b (2 runs, medians in seconds)');
  expect(text).toContain('url 3: c (1 run, medians in seconds)');
});
