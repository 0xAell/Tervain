import { expect, it } from 'vitest';
// @ts-expect-error Tool modules run directly in Node.
import { programKind, ROOM_STOPS, tally, tourSummary } from '../../tools/shader-programs.mjs';
// @ts-expect-error Tool modules run directly in Node.
import { ROUTE_STOPS } from '../../tools/frame-passes.mjs';

// Three r186's own cache keys (renderer.info.programs), cut after the parameters: a world material, the same kind of
// material on the menu, and a full-screen pass that has no lights.
const WORLD = 'physical,STANDARD,,highp,srgb-linear,306,128,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,true,false,0,,0,2,6,0,0,1,0,0,1,0,0,0,0,1,0,0,0,0,8391761,8520707';
const MENU = 'physical,STANDARD,,highp,srgb-linear,306,1024,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,true,false,0,,0,1,3,0,0,1,0,0,1,0,0,0,0,1,0,0,0,0,8388624,8520707';
const QUAD = '0,1,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,false,false,0,,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,8388608,8523776';

it('reads a program\'s shader and the lights it was made for from three\'s cache key', () => {
  expect(programKind(WORLD)).toEqual({ shader: 'physical', lights: '2 directional, 6 point, 1 hemisphere' });
  expect(programKind(MENU)).toEqual({ shader: 'physical', lights: '1 directional, 3 point, 1 hemisphere' });
  expect(programKind(QUAD)).toEqual({ shader: '0', lights: 'no lights' });
  expect(programKind('a raw shader with no parameters')).toEqual({ shader: 'a raw shader with no parameters', lights: 'unknown' });
});

it('counts programs by kind, the most first', () => {
  expect(tally([WORLD, MENU, WORLD, QUAD], (k: { lights: string }) => k.lights)).toEqual([
    ['2 directional, 6 point, 1 hemisphere', 2], ['1 directional, 3 point, 1 hemisphere', 1], ['no lights', 1],
  ]);
});

it('accounts for every program made during a tour: by a preparation, inside a draw, or neither', () => {
  const before = ['a', 'b'], after = ['a', 'b', 'c', 'd', 'e'];
  expect(tourSummary({ before, after, fromCompile: 2, inDraw: [{ stop: 4, key: 'e' }] })).toEqual({
    firstView: 2, duringTour: 3, prepared: 2, inDraw: 1, unaccounted: 0,
  });
  expect(tourSummary({ before, after, fromCompile: 1, inDraw: [] }).unaccounted).toBe(2);
});

it('tours the benchmark route\'s thirteen stops, then the shrine hall and the inn', () => {
  expect(ROUTE_STOPS).toHaveLength(13);
  expect(ROUTE_STOPS[0]).toEqual([[-268, 27, 3], [-243, 22, 2]]);
  expect(ROOM_STOPS.map(([at]: number[][]) => at!.slice(0, 2))).toEqual([[-28, -106], [-4, 30]]);
});
