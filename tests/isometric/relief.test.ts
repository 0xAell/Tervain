import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game/game';
import { reviveState } from '../../src/core/game/revive';
import { fromBuildingLocal } from '../../src/core/world/interiors';
import { buildingTreads } from '../../src/core/world/buildingEntries';
import { sites, frontDoor } from '../../src/isometric/doorways';
import { crossings, crossingPoint, deckHeight } from '../../src/isometric/crossing';
import {
  groundProject,
  pickGround,
  pickSurface,
  terrainHeight,
  terrainTile,
  supportHeight,
  travelScale,
  canClimb,
  footingHeight,
} from '../../src/isometric/relief';
import { project, unproject, risePixels } from '../../src/isometric/projection';
import { houseSolid } from '../../src/isometric/houseSolid';
import {
  chamberLift,
  roomFoot,
  roomLift,
  pickRoomFloor,
  landingRun,
  landingSteps,
  floorPlan,
  roomRisePixels,
} from '../../src/isometric/roomPlans';
import { bedDepth } from '../../src/isometric/swell';
import { castOnLand, sunAt } from '../../src/isometric/sunlight';
import { Valley } from '../../src/isometric/simulation';

describe('the relief of Bellwether Vale', () => {
  it('rasterizes the same front face that a pointer hits, including where the quarry rim hides land behind it', () => {
    const c = groundProject({ x: 97, z: -40 }),
      left = Math.floor(c.x) - 45,
      top = Math.floor(c.y) - 45,
      size = 90;
    const tile = terrainTile(left, top, size);
    let hidden = 0,
      steep = 0;
    for (let v = 0; v < size; v += 2)
      for (let u = 0; u < size; u += 2) {
        const x = left + u,
          y = top + v,
          hit = pickGround(x, y),
          h = terrainHeight(hit.x, hit.z);
        expect(tile.elevation[v * size + u]).toBeCloseTo(h, 4);
        expect(groundProject(hit).y).toBeCloseTo(y, 5);
        if (tile.steepness[v * size + u]! > 95) steep++;
        for (let back = 0.25; back < h; back += 0.25) {
          const further = unproject(x, y + (h - back) * risePixels);
          if (terrainHeight(further.x, further.z) > h - back + 0.15) {
            hidden++;
            break;
          }
        }
      }
    expect(hidden).toBeGreaterThan(0);
    expect(steep).toBeGreaterThan(20);
    const edge = groundProject({ x: 100, z: -40 });
    expect(pickGround(edge.x, edge.y).x).toBeGreaterThanOrEqual(100 - 1e-6);
    expect(canClimb({ x: 94, z: -40 }, { x: 96, z: -40 })).toBe(false);
    expect(canClimb({ x: 96, z: -40 }, { x: 94, z: -40 })).toBe(true);
  });
  it('places bridges, house shells, treads and their shadows in the same world coordinates', () => {
    for (const b of crossings) {
      const at = crossingPoint(b, 0, 0),
        h = deckHeight(b, 0);
      expect(terrainHeight(at.x, at.z)).toBeCloseTo(0, 3);
      expect(supportHeight(at)).toBeCloseTo(h, 4);
      const s = project(at.x, at.z, h),
        hit = pickSurface(s.x, s.y);
      expect(hit.x).toBeCloseTo(at.x, 3);
      expect(hit.z).toBeCloseTo(at.z, 3);
    }
    for (const b of sites) {
      const mesh = houseSolid(b),
        floor = terrainHeight(b.x, b.z);
      expect(mesh.floor).toBeCloseTo(floor + footingHeight);
      expect(mesh.faces.filter((f) => f.skin === 'roof').length).toBeGreaterThan(0);
      expect(Math.max(...mesh.silhouette.map((v) => v.h))).toBeGreaterThan(mesh.floor + b.h);
      const t = buildingTreads(b)[1]!,
        p = fromBuildingLocal(b, t.x, (t.zMin + t.zMax) / 2),
        h = supportHeight(p);
      expect(h).toBeCloseTo(floor + t.top, 4);
    }
    const morning = sunAt(8),
      evening = sunAt(16);
    const p = { x: crossings[0]!.x, z: crossings[0]!.z, h: 6 };
    expect(castOnLand(p, morning).x).toBeGreaterThan(castOnLand(p, evening).x);
    expect(bedDepth(0.1, 4, false, 0.5)).toBeLessThan(bedDepth(3.5, 4, false, 0.5));
  });
  it('walks and saves at the visible elevation and climbs every intermediate landing on each storey', () => {
    const v = new Valley(new Game());
    const ridge = { x: 97, z: -40 };
    v.game.setPlayerTransform(ridge.x, 0, ridge.z, 0);
    v.step(1 / 60, 0, 0, false);
    expect(v.player.y).toBeCloseTo(terrainHeight(ridge.x, ridge.z));
    expect(v.player.y).toBeGreaterThan(3);
    let slow = 1;
    for (let x = 83; x < 112; x += 0.5) slow = Math.min(slow, travelScale(x, -40, 1, 0));
    expect(slow).toBeLessThan(0.84);
    const site = sites.find((b) => b.id === 'house_a')!;
    v.enterDoor(frontDoor(site));
    for (const level of ['ground', 'loft', 'cellar'] as const) {
      v.changeFloor(level);
      const plan = floorPlan(site, level),
        hall = plan.rooms[1];
      for (const [side, index] of [
        [-1, 0],
        [1, 2],
      ] as const) {
        const wall = side === -1 ? hall.x0 : hall.x1;
        for (let step = 0; step <= landingSteps; step++) {
          const p = {
            x: wall - side * (landingRun - ((step - 0.5) * landingRun) / landingSteps),
            z: plan.gap,
          };
          expect(roomLift(plan, p)).toBeCloseTo((chamberLift(plan, index) * step) / landingSteps);
          const s = roomFoot(plan, p),
            hit = pickRoomFloor(plan, s.x, s.y);
          expect(roomFoot(plan, hit).y).toBeCloseTo(s.y, 4);
        }
      }
      const point = { x: hall.x0 - 2, z: plan.gap };
      Object.assign(v.player.interior!, point);
      v.step(0, 0, 0, false);
      const floor = houseSolid(site).floor + { ground: 0, loft: 3.5, cellar: -3 }[level];
      expect(v.player.y).toBeCloseTo(floor + chamberLift(plan, 0) / roomRisePixels);
      expect(
        new Valley(new Game(reviveState(JSON.parse(JSON.stringify(v.game.state)))!)).player.y
      ).toBeCloseTo(v.player.y);
    }
    v.leaveRoom();
    expect(v.player.y).toBeCloseTo(supportHeight(v.player));
  });
});
