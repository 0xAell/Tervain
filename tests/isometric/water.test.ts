import { describe, expect, it } from 'vitest';
import { coastX } from '../../src/core/world/coast';
import { buildingEntry } from '../../src/core/world/buildingEntries';
import { BUILDINGS, DECKS, frontOf } from '../../src/core/world/layout';
import { SPRING_BASIN } from '../../src/core/world/water/spring';
import { foamCell } from '../../src/isometric/foam';
import { project } from '../../src/isometric/projection';
import { coastalRocks, passesRocks, quarryRocks, rockApproach } from '../../src/isometric/waterObstacles';
import { visibleWaterImpacts, waterImpactAt } from '../../src/isometric/waterImpact';
import { seaClock, seaPhases, surfaceHeight, floatHeight } from '../../src/isometric/swell';
import {
  bridgeShade,
  crossings,
  crossingPoint,
  deckHeight,
  passesRails,
  pickDeck,
} from '../../src/isometric/crossing';
import { roadWeight } from '../../src/core/world/terrain';
import {
  onBridge,
  waterProfile,
  wetPoint,
  waveFrame,
  riverVelocity,
  rippleAt,
} from '../../src/isometric/water';

describe('isometric water', () => {
  it('distinguishes the intertidal shelf from the playable ocean', () => {
    const z = 18,
      edge = coastX(z);
    expect(wetPoint(edge + 0.8, z)).toBeNull();
    expect(waterProfile(edge + 0.8, z)?.bank).toBeCloseTo(-0.8, 2);
    expect(wetPoint(edge - 0.4, z)?.kind).toBe('shallows');
    expect(wetPoint(edge - 7, z)?.kind).toBe('sea');
    expect(waterProfile(edge + 4, z)).toBeNull();
  });
  it('follows river bends downstream from the sluice, including the quarry branch', () => {
    const main = wetPoint(37, 0)!;
    expect(main.course).toBe('main');
    expect(wetPoint(41, 14)!.along).toBeGreaterThan(main.along);
    expect(wetPoint(60, -30)!.along).toBeGreaterThan(wetPoint(48, -31)!.along);
    expect(wetPoint(-13, 4)?.course).toBe('village');
    expect(wetPoint(SPRING_BASIN.x, SPRING_BASIN.z)?.kind).toBe('pool');
    expect(onBridge(DECKS[0]!)).toBe(true);
    expect(onBridge({ x: 36, z: 7 })).toBe(false);
  });
  it('joins the quarry road on dry banks and puts its bents in the current', () => {
    const bridge = crossings[0]!;
    for (const sign of [-1, 1]) {
      const end = crossingPoint(bridge, sign * bridge.halfLength, 0);
      expect(wetPoint(end.x, end.z)).toBeNull();
      expect(roadWeight(end.x, end.z)).toBeGreaterThan(0.95);
      expect(deckHeight(bridge, sign * bridge.halfLength)).toBeCloseTo(0);
      for (const sill of bridge.sills) {
        const post = crossingPoint(bridge, sill, sign * (bridge.halfWidth - 0.16));
        expect(wetPoint(post.x, post.z)?.course).toBe('main');
      }
    }
    for (const along of [-0.85, 0, 0.85]) {
      const s = along * bridge.halfLength,
        p = crossingPoint(bridge, s, 0.43),
        offset = (deckHeight(bridge, s) * 8) / 6;
      const hit = pickDeck({ x: p.x - offset, z: p.z - offset }, 6);
      expect(hit.x).toBeCloseTo(p.x, 3);
      expect(hit.z).toBeCloseTo(p.z, 3);
    }
    expect(deckHeight(bridge, 0)).toBeGreaterThan(1);
    expect(bridgeShade(bridge.x, bridge.z)).toBeGreaterThan(0.6);
    const side = crossingPoint(bridge, 0, bridge.halfWidth + 0.65);
    expect(onBridge(side)).toBe(false);
    expect(passesRails(bridge, side)).toBe(false);
    expect(passesRails(crossingPoint(bridge, -bridge.halfLength - 1, 0), bridge)).toBe(true);
  });
  it('keeps the widened channels off the village doorsteps and preserves the spring basin', () => {
    for (const home of BUILDINGS) {
      const door = buildingEntry(home);
      for (const out of [0, 0.65, 1.18]) {
        const p = frontOf(home, out, door.x);
        expect(wetPoint(p.x, p.z), home.id).toBeNull();
      }
    }
    expect(wetPoint(SPRING_BASIN.x, SPRING_BASIN.z)?.kind).toBe('pool');
  });
  it('carries higher releases downstream and damps an expanding footfall outside the wavefront', () => {
    const wet = wetPoint(37.6, 4.1)!,
      low = { main: 0.1, village: 0.1, quarry: 0.1, spring: 0.1 };
    const a = riverVelocity(wet, low),
      b = riverVelocity(wet, { ...low, main: 0.9 });
    expect(b.x * wet.tx + b.z * wet.tz).toBeGreaterThan(0);
    expect(Math.hypot(b.x, b.z)).toBeGreaterThan(Math.hypot(a.x, a.z) * 2);
    const ring = { x: 37, z: 4, radius: 1.2, amplitude: 0.8, course: 1 };
    expect(rippleAt(ring, 38.2, 4)!.dx).toBeGreaterThan(0);
    expect(rippleAt(ring, 35.8, 4)!.dx).toBeLessThan(0);
    expect(rippleAt(ring, 39.4, 4)).toBeUndefined();
  });
  it('damps buoyancy at shore and advances the same world-anchored waves for the swimmer', () => {
    const phases = seaPhases(-292, 15, 10);
    expect(floatHeight(-292, 15, 10, 2)).toBeCloseTo(surfaceHeight(phases, seaClock(2)) * 2.7, 8);
    expect(floatHeight(-292, 15, 0, 2)).toBe(0);
    expect(floatHeight(-292, 15, 10, 2)).not.toBeCloseTo(floatHeight(-292, 15, 10, 2.7), 2);
    expect(Math.abs(floatHeight(-292, 15, 10, 2))).toBeLessThanOrEqual(2.7);
  });
  it('breaks a crest on the incident side of an offshore rock and shelters its lee', () => {
    const rock = coastalRocks[0]!;
    const p = project(rock.x, rock.z);
    const flow = { main: 0.5, village: 0.4, quarry: 0.7, spring: 0.3 };
    const impact = (t: number) =>
      visibleWaterImpacts(p.x - 48, p.y - 48, 96, 96, t, flow, []).find(
        (o) => o.x === rock.x && o.z === rock.z
      )!;
    const when = Array.from({ length: 160 }, (_, i) => i / 30).find((t) => impact(t).age < 0.11)!;
    const hit = impact(when),
      rim = rock.radius + 0.08 + hit.age * 2.85,
      front = { x: rock.x - hit.tx * rim, z: rock.z - hit.tz * rim },
      back = { x: rock.x + hit.tx * rim, z: rock.z + hit.tz * rim };
    const reflected = waterImpactAt(hit, front.x, front.z, 0.72)!;
    expect(reflected.foam).toBeGreaterThan(0.6);
    expect(Math.hypot(reflected.x, reflected.y)).toBeGreaterThan(1);
    expect(waterImpactAt(hit, back.x, back.z, 0.72)!.shelter).toBeGreaterThan(0.4);
    expect(waterImpactAt(impact(when + 1.9), front.x, front.z, 0.72)!.foam).toBeLessThan(0.25);
  });
  it('blocks a walking segment through a boulder and keeps the approach outside its footprint', () => {
    const quarryEdge = quarryRocks.reduce((a, b) => (a.x + a.radius > b.x + b.radius ? a : b));
    for (const rock of [coastalRocks[0]!, quarryEdge]) {
      const a = { x: rock.x + rock.radius + 1, z: rock.z },
        b = { x: rock.x - rock.radius - 1, z: rock.z };
      expect(passesRocks(a, b)).toBe(false);
      expect(passesRocks(rock, a)).toBe(true);
      const approach = rockApproach(rock, a)!;
      expect(passesRocks(a, approach)).toBe(true);
      expect(Math.hypot(approach.x - rock.x, approach.z - rock.z)).toBeGreaterThan(rock.radius);
    }
  });
  it('wraps its foam field and plays irregular-length painted wave sequences without a loop cut', () => {
    expect(foamCell(-3, 21)).toBe(foamCell(125, 149));
    expect([0, 1, 2, 3, 4, 5, 6].map((t) => waveFrame(t, 4))).toEqual([0, 1, 2, 3, 2, 1, 0]);
    expect(waveFrame(-1, 4)).toBe(1);
    expect(waveFrame(22, 1)).toBe(0);
  });
});
