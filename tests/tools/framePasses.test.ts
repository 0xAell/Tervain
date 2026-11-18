import { expect, it } from 'vitest';
// @ts-expect-error Tool modules run directly in Node.
import { frameSummary, median, routeSummary, table, totals } from '../../tools/frame-passes.mjs';

type Draw = { pass: string; module: string; calls: number; triangles: number };
type Tally = Record<string, { calls: number; triangles: number }>;
const draw = (pass: string, module: string, triangles: number, calls = 1): Draw => ({ pass, module, calls, triangles });

it('adds a frame\'s draws up by pass and by part of the world, the most triangles first', () => {
  const frame = [
    draw('screen', 'forest', 600_000), draw('screen', 'terrain', 90_000), draw('shadow map 4096²', 'forest', 400_000),
    draw('screen', 'forest', 300_000), draw('reflection 512×512', 'forest', 50_000), draw('screen', 'groundcover', 0, 0),
  ];
  const summary = frameSummary(frame) as { calls: number; triangles: number; passes: Tally; modules: Tally; byPass: Record<string, Tally> };
  expect([summary.calls, summary.triangles]).toEqual([5, 1_440_000]);
  expect(Object.keys(summary.passes)).toEqual(['screen', 'shadow map 4096²', 'reflection 512×512']);
  expect(summary.passes.screen).toEqual({ calls: 3, triangles: 990_000 });
  expect(summary.modules.forest).toEqual({ calls: 4, triangles: 1_350_000 });
  expect(summary.byPass['shadow map 4096²']).toEqual({ forest: { calls: 1, triangles: 400_000 } });
  // A draw of no triangles (a skipped instance batch) is kept, after the rest.
  expect(Object.keys(summary.byPass.screen!)).toEqual(['forest', 'terrain', 'groundcover']);
  expect(totals([], () => 'all')).toEqual({});
});

it('takes the route\'s medians, counting a pass or part a view lacks as none', () => {
  const views = [
    frameSummary([draw('screen', 'forest', 100), draw('shadow map', 'forest', 50)]),
    frameSummary([draw('screen', 'forest', 300), draw('screen', 'sea', 10)]),
    frameSummary([draw('screen', 'forest', 200), draw('shadow map', 'forest', 70)]),
  ];
  const route = routeSummary(views) as { views: number; calls: number; triangles: number; passes: Tally; modules: Tally };
  expect(route.views).toBe(3);
  expect([route.calls, route.triangles]).toEqual([2, 270]);
  expect(route.passes['shadow map']).toEqual({ calls: 1, triangles: 50 });
  expect(route.modules.sea).toEqual({ calls: 0, triangles: 0 });
  expect(Object.keys(route.modules)).toEqual(['forest', 'sea']);
  expect(median([3, 1, 2, 4])).toBe(2.5);
  expect(median([])).toBeNaN();
});

it('prints a table of draws and millions of triangles, at most as many rows as asked', () => {
  const text: string = table({ screen: { calls: 212, triangles: 2_415_000 }, 'shadow map 4096²': { calls: 61, triangles: 980_000 }, sky: { calls: 2, triangles: 4 } }, 2);
  const rows = text.split('\n');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatch(/^ {2}screen\s+212 draws\s+2\.42 M triangles$/);
  expect(rows[1]).toMatch(/^ {2}shadow map 4096²\s+61 draws\s+0\.98 M triangles$/);
});
