import { describe, expect, it } from 'vitest';
import { MAP_MARKER_BOUNDS } from '../../src/core/game/map';
import { FIELDS, PLACES, ROADS } from '../../src/core/world/layout';
import { coastX } from '../../src/core/world/coast';
import { roadWeight } from '../../src/core/world/terrain';
import { waterProfile } from '../../src/isometric/channels';
import { scenery } from '../../src/isometric/land';
import { fieldAt, onBeach, woodlandCover } from '../../src/isometric/landCover';
import { terrainSlope } from '../../src/isometric/relief';
import { onFootpath } from '../../src/isometric/settlement';
import { isTree, treeSetback, trunkRadius } from '../../src/isometric/treeHabitat';
import { chartMarker, chartPoint } from '../../src/isometric/valeMap';
import { canGrowGrass } from '../../src/isometric/meadow';
import { windFrame, windPhase } from '../../src/isometric/wind';

describe('the vale landscape', () => {
  it('keeps wild grass out of the travelled lanes, sand, channels and planted fields', () => {
    for (const road of ROADS) for (const p of road.points) expect(canGrowGrass(p.x, p.z)).toBe(false);
    for (const field of FIELDS) expect(canGrowGrass(field.x, field.z)).toBe(false);
    expect(canGrowGrass(coastX(35) + 4, 35)).toBe(false);
    expect(canGrowGrass(32, -16)).toBe(false);
    const meadow = Array.from({ length: 16 }, (_, i) => canGrowGrass(-178 + i, -28));
    expect(meadow.some(Boolean)).toBe(true);
  });

  it('advances the same gust through the vale and wraps every sprite sequence', () => {
    expect(windPhase(-160, 16, 5)).toBeGreaterThan(windPhase(-140, 16, 5));
    expect(windPhase(-140, 16, 5.4)).toBeGreaterThan(windPhase(-140, 16, 5));
    expect(windFrame(-1 / 16, 16)).toBe(15);
    expect(windFrame(1, 16)).toBe(0);
    expect(windFrame(-1, 5, 2)).toBe(2);
  });

  it('keeps tree footprints off the roads, footpaths, beaches, floodwater and cultivated plots', () => {
    const trees = scenery().filter((p) => isTree(p.key));
    expect(trees.some((p) => p.key === 'rill_willow' || p.key === 'rill_alder')).toBe(true);
    expect(trees.filter((p) => woodlandCover(p.x, p.z) > 0.4).length).toBeGreaterThan(100);
    for (const tree of trees) {
      const r = treeSetback(tree.width);
      for (let k = 0; k < 12; k++) {
        const angle = (k * Math.PI) / 6,
          x = tree.x + r * Math.cos(angle),
          z = tree.z + r * Math.sin(angle);
        const at = tree.key + ' at ' + [tree.x, tree.z].join(', ');
        expect(roadWeight(x, z), at).toBeLessThan(0.08);
        expect(onFootpath(x, z), at).toBe(false);
        expect(onBeach(x, z), at).toBe(false);
        expect(waterProfile(x, z)?.bank ?? -10, at).toBeLessThan(-0.26);
        expect(fieldAt(x, z), at).toBeUndefined();
      }
      expect(terrainSlope(tree.x, tree.z)).toBeLessThanOrEqual(0.74);
      expect(terrainSlope(tree.x + trunkRadius(tree), tree.z)).toBeLessThanOrEqual(0.88);
    }
  });

  it('pins the same world position the chart plots', () => {
    for (const p of Object.values(PLACES)) {
      const point = chartPoint(p, 450, 264),
        mark = chartMarker(point.x, point.y, 450, 264);
      expect(mark.x).toBeCloseTo(p.x, 8);
      expect(mark.z).toBeCloseTo(p.z, 8);
    }
    expect(chartMarker(0, 0, 450, 264)).toEqual({
      x: MAP_MARKER_BOUNDS.minX,
      z: MAP_MARKER_BOUNDS.minZ,
    });
  });
});
