import { describe, expect, it } from 'vitest';
import { Terrain } from '../../../src/core/world/terrain';
import { WaterWorld } from '../../../src/core/world/water/waterWorld';

// The water clock drives the swell he swims and wades in, not only the one drawn.
describe('the water clock', () => {
  const targets = { spring: 1, main: 1, village: 0.6, quarry: 0.5 };
  const offshore = { x: -340, z: 30 };

  it('runs the swell, and under reduced motion holds it still for play as for the eye, while the flows still ease', () => {
    const water = new WaterWorld(new Terrain());
    water.update(1, targets);
    expect(water.time).toBe(1);
    const before = water.sea(offshore.x, offshore.z)!.surface, main = water.flows.main;
    for (let i = 0; i < 20; i++) water.update(0.1, targets, true);
    expect(water.time, 'the clock holds').toBe(1);
    expect(water.sea(offshore.x, offshore.z)!.surface, 'so does the surface he swims on').toBe(before);
    expect(water.flows.main, 'the quest’s flows still ease').toBeGreaterThan(main);
    for (let i = 0; i < 20; i++) water.update(0.1, targets);
    expect(water.time).toBeCloseTo(3, 9);
    expect(water.sea(offshore.x, offshore.z)!.surface).not.toBe(before);
  });
});
