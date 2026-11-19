import { describe, expect, it } from 'vitest';
import { ARRIVAL_ROUTE, FOREST_SWALE, LANTERN_ROUTE, PALISADE, ROADS, STREAMS, WORLD, type V2 } from '../../src/core/world/layout';
import { distToPolyline, distToPolylineWithin } from '../../src/core/world/terrain';

/**
 * The bounded distance the terrain's clearance, relief and grades and the ground's wetness use (distToPolylineWithin):
 * nearer than its reach it is distToPolyline's distance to the bit; farther, it is at least the reach, measured
 * or not, so a smoothstep ending at the reach, or a test against it, comes out the same.
 */
const polylines: [string, readonly V2[]][] = [
  ...ROADS.map((road, i) => [`road ${i}`, road.points] as [string, readonly V2[]]),
  ...STREAMS.map((stream) => [`stream ${stream.id}`, stream.points] as [string, readonly V2[]]),
  ['palisade', PALISADE.points],
  ['arrival route', ARRIVAL_ROUTE],
  ['lantern route', LANTERN_ROUTE],
  ['forest swale', FOREST_SWALE.points],
];

describe('the bounded distance to a polyline', () => {
  it.each(polylines)('is the measured distance under its reach and at least the reach beyond it (%s)', (_name, points) => {
    let near = 0, far = 0;
    for (const reach of [0.5, 7, 12, 30]) {
      for (let z = WORLD.minZ; z <= WORLD.maxZ; z += 3.7) {
        for (let x = WORLD.minX; x <= WORLD.maxX; x += 3.7) {
          const measured = distToPolyline(x, z, points as V2[]).d, within = distToPolylineWithin(x, z, points, reach);
          if (measured < reach) { expect(Object.is(within, measured)).toBe(true); near++; }
          else { expect(within >= reach).toBe(true); far++; }
        }
      }
    }
    // Both sides of every reach are exercised.
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
  });

  it('measures a point right at its reach, where the bounds alone cannot tell', () => {
    // A straight segment along x: points at the reach's distance beside it, and a hair farther.
    const line: V2[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
    expect(distToPolylineWithin(5, 7, line, 7)).toBe(7);
    expect(distToPolylineWithin(5, -7, line, 7)).toBe(7);
    expect(distToPolylineWithin(5, 7 + 1e-3, line, 7)).toBe(Infinity);
    expect(distToPolylineWithin(-3, 4, line, 7)).toBe(5);
  });
});
