import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game/game';
import { reviveState } from '../../src/core/game/revive';
import { fromBuildingLocal } from '../../src/core/world/interiors';
import type { V2 } from '../../src/core/world/layout';
import { doorways, doorsById, frontDoor, sites } from '../../src/isometric/doorways';
import { enteredThroughDoor, navigable } from '../../src/isometric/land';
import {
  floorPlan,
  passageLanding,
  roomCanMove,
  roomUnproject,
  roomProject,
  type FloorPlan,
} from '../../src/isometric/roomPlans';
import { indoorTargets, outsideReturn, targetDistance } from '../../src/isometric/roomTargets';
import { Valley } from '../../src/isometric/simulation';

function reachable(plan: FloorPlan) {
  const initial = passageLanding(plan),
    step = 0.6,
    key = (i: number, j: number) => i + ',' + j;
  const visited = new Set([key(0, 0)]),
    points = [{ ...initial, i: 0, j: 0 }];
  for (let n = 0; n < points.length; n++) {
    const p = points[n]!;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const i = p.i + di,
        j = p.j + dj,
        id = key(i, j);
      if (visited.has(id)) continue;
      const next = { x: initial.x + i * step, z: initial.z + j * step, i, j };
      if (!roomCanMove(plan, p, next)) continue;
      visited.add(id);
      points.push(next);
    }
  }
  return points;
}
describe('walkable household interiors', () => {
  it.each(sites)('$id connects each fixture and passage on all three floors', (site) => {
    for (const level of ['ground', 'loft', 'cellar'] as const) {
      const plan = floorPlan(site, level),
        points = reachable(plan);
      expect(points.length).toBeGreaterThan(350);
      for (const t of indoorTargets(plan, passageLanding(plan), [])) {
        const accessible = points.some(
          (p) => Math.hypot(p.x - t.approach.x, p.z - t.approach.z) < 0.65 && roomCanMove(plan, p, t.approach)
        );
        expect(accessible, site.id + '/' + level + ' ' + t.id + ' ' + t.label).toBe(true);
        expect(targetDistance(t, t.approach, plan)).toBeLessThanOrEqual(t.reach);
      }
      for (const room of plan.rooms)
        expect(points.some((p) => p.x > room.x0 + 0.8 && p.x < room.x1 - 0.8)).toBe(true);
      for (const f of plan.fixtures) expect(roomCanMove(plan, { x: f.x, z: f.z + 2 }, f)).toBe(false);
      const wall = plan.rooms[1].x1;
      expect(
        roomCanMove(plan, { x: wall - 0.75, z: plan.gap + 2 }, { x: wall + 0.75, z: plan.gap + 2 })
      ).toBe(false);
      const pos = { x: 3, z: -4 },
        s = roomProject(pos);
      expect(roomUnproject(s.x, s.y)).toEqual(pos);
    }
  });
  it('shows all actual exterior approaches, enters through their marked sills and comes back through the same entrance', () => {
    const v = new Valley(new Game());
    v.game.state.locationChanges.archive_door = 'open';
    v.game.state.locationChanges.archive_shutter = 'forced';
    expect(v.targets().filter((t) => t.door).length).toBe(doorways.length);
    for (const door of doorways) {
      v.game.setPlayerTransform(door.outside.x, 0, door.outside.z, 0);
      const t = v.targets().find((t) => t.door === door)!;
      expect(targetDistance(t, door.outside)).toBeLessThan(t.reach);
      const inward = { x: door.sill.x - door.outside.x, z: door.sill.z - door.outside.z };
      const hit = { x: door.sill.x + inward.x * 0.32, z: door.sill.z + inward.z * 0.32 };
      expect(navigable(door.outside, hit, v.game.state), door.id).toBe(true);
      for (let i = 0; i < 30 && !v.room; i++) v.step(0.04, inward.x, inward.z, false);
      expect(v.room?.site.id, door.id).toBe(door.site.id);
      v.usePassage(v.room!.passages.find((p) => p.kind === 'up')!);
      const restored = new Valley(new Game(reviveState(JSON.parse(JSON.stringify(v.game.state)))!));
      expect(restored.room?.level).toBe('loft');
      expect(restored.position).toEqual(v.position);
      v.usePassage(v.room!.passages.find((p) => p.kind === 'down')!);
      v.usePassage(v.room!.passages.find((p) => p.kind === 'down')!);
      expect(v.room?.level).toBe('cellar');
      v.usePassage(v.room!.passages.find((p) => p.kind === 'up')!);
      v.usePassage(v.room!.passages.find((p) => p.kind === 'outside')!);
      expect(v.room).toBeUndefined();
      expect(v.position.x).toBeCloseTo(outsideReturn(door).x);
      expect(v.position.z).toBeCloseTo(outsideReturn(door).z);
    }
  });
  it('lets a walking player cross stairs and the exit without a menu or an immediate return trip', () => {
    const valley = new Valley(new Game()),
      door = doorsById.get('house_a/front')!;
    valley.enterDoor(door);
    for (const target of ['loft', 'ground', 'cellar', 'ground', 'outside'] as const) {
      const stair = valley.room!.passages.find((p) =>
        target === 'outside' ? p.kind === 'outside' : p.target === target
      )!;
      const dir = target === 'outside' ? 1 : -1;
      Object.assign(valley.player.interior!, { x: stair.x, z: stair.z - dir * 1.1 });
      const initial = valley.roomKey;
      for (let i = 0; i < 20 && valley.roomKey === initial; i++) valley.step(0.04, 0, dir, false);
      expect(valley.room?.level ?? 'outside').toBe(target);
      for (let i = 0; i < 3; i++) valley.step(0.04, 0, dir, false);
      expect(valley.room?.level ?? 'outside').toBe(target);
    }
  });

  it('migrates legacy footprint saves, keeps the two archive locks independent and bars a solid wall', () => {
    const g = new Game(),
      door = doorsById.get('archive/front')!,
      rear = doorsById.get('archive/shutter')!;
    const center: V2 = door.site;
    const cross = (p: typeof door) => enteredThroughDoor(p.outside, center, g.state);
    g.setPlayerTransform(center.x, 0, center.z, 0);
    expect(new Valley(g).room).toBeUndefined();
    expect(cross(door)).toBe(false);
    expect(cross(rear)).toBe(false);
    g.state.locationChanges.archive_shutter = 'forced';
    expect(cross(door)).toBe(false);
    expect(cross(rear)).toBe(true);
    g.setPlayerTransform(center.x, 0, center.z, 0);
    const v = new Valley(g);
    expect(v.room?.site).toBe(door.site);
    expect(v.player.interior?.rear).toBe(true);
    const side = fromBuildingLocal(door.site, door.site.w / 2 + 1, 0);
    expect(enteredThroughDoor(side, center, g.state)).toBe(false);
  });
  it('shares stored items between floors of one house, preserves them across saves, and consumes crafting ingredients once', () => {
    const g = new Game(),
      v = new Valley(g),
      home = sites[0]!;
    expect(g.dispatch({ t: 'roomStorage', direction: 'withdraw', item: 'iron_scrap' }).ok).toBe(false);
    v.enterDoor(frontDoor(home));
    const supplies = { t: 'pickup', pickupId: 'room_test_supplies', item: 'iron_scrap', qty: 1 } as const;
    expect(g.dispatch(supplies).ok).toBe(true);
    expect(g.dispatch(supplies).ok).toBe(false);
    const transfer = (direction: 'deposit' | 'withdraw') =>
      g.dispatch({ t: 'roomStorage', direction, item: 'iron_scrap' }).ok;
    expect(transfer('deposit')).toBe(true);
    expect(transfer('deposit')).toBe(false);
    v.changeFloor('loft');
    expect(transfer('withdraw')).toBe(true);
    expect(transfer('withdraw')).toBe(false);
    const craft = { t: 'roomCraft', recipe: 'fletch' } as const;
    expect(g.dispatch(craft).ok).toBe(true);
    expect(g.dispatch(craft).ok).toBe(false);
    expect(g.state.inventory.arrow).toBe(4);
    expect(g.dispatch({ t: 'roomStorage', direction: 'deposit', item: 'arrow' }).ok).toBe(true);
    v.leaveRoom();
    v.enterDoor(frontDoor(sites[1]!));
    expect(g.dispatch({ t: 'roomStorage', direction: 'withdraw', item: 'arrow' }).ok).toBe(false);
    expect(reviveState(JSON.parse(JSON.stringify(g.state)))!.facts['room_store:' + home.id + ':arrow']).toBe(
      1
    );
  });
});
