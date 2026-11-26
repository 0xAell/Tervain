import { describe, expect, it } from 'vitest';
import { AMBIENT_RESIDENTS } from '../../src/core/content/ambientPeople';
import { Game } from '../../src/core/game/game';
import { coastX } from '../../src/core/world/coast';
import { frontDoor, sitesById } from '../../src/isometric/doorways';
import { navigable } from '../../src/isometric/land';
import { waterline, wetPoint } from '../../src/isometric/water';
import { floorPlan, roomLift, stairRun } from '../../src/isometric/roomPlans';
import { strandResident } from '../../src/isometric/strandResidents';
import { RoomResidents } from '../../src/isometric/roomResidents';
import { indoorTargets } from '../../src/isometric/roomTargets';
import { Valley } from '../../src/isometric/simulation';

describe('visual continuity in the Vale', () => {
  it('wades continuously through the shore and the change to a swimming pose', () => {
    const bank = coastX(10);
    let previous = 0;
    for (let i = -1; i <= 500; i++) {
      const wet = wetPoint(bank - i / 100, 10);
      const depth = wet ? waterline(wet, wet.kind === 'sea') : 0;
      expect(depth).toBeGreaterThanOrEqual(previous);
      expect(depth - previous).toBeLessThan(0.002);
      previous = depth;
    }
    expect(previous).toBeCloseTo(0.46);
  });
  it('carries the body smoothly between physical treads in both directions on every storey', () => {
    const cottage = sitesById.get('house_a')!;
    for (const level of ['ground', 'loft', 'cellar'] as const) {
      const plan = floorPlan(cottage, level);
      for (const flight of plan.stairs) {
        let last = 0;
        for (let i = 0; i < 121; i++) {
          const at = { x: flight.passage.x, z: flight.passage.z + flight.direction * stairRun * i / 121 };
          const visual = roomLift(plan, at, true), solid = roomLift(plan, at);
          expect(Math.abs(visual - last)).toBeLessThan(0.6);
          expect(Math.abs(visual - solid)).toBeLessThan(2.6);
          last = visual;
        }
        expect(last).toBeCloseTo(flight.treads.at(-1)!.height);
      }
    }
  });
  it('keeps coastal residents on a continuous dry route until they pass their own sill', () => {
    for (const resident of AMBIENT_RESIDENTS.filter((r) => r.sleeps)) {
      const door = frontDoor(sitesById.get(resident.id === 'fireside' ? 'fisher_house' : 'net_store')!);
      let before = strandResident(resident, 20), lastDistance = Infinity;
      for (let i = 0; i <= 1800; i++) {
        const at = strandResident(resident, 20.5 + i / 3600);
        if (!at.visible) break;
        expect(Math.hypot(at.x - before.x, at.z - before.z)).toBeLessThan(0.027);
        expect(wetPoint(at.x, at.z)).toBeNull();
        expect(navigable(before, at, true)).toBe(true);
        before = at;
        lastDistance = Math.hypot(at.x - door.sill.x, at.z - door.sill.z);
      }
      expect(lastDistance).toBeLessThan(1);
      expect(strandResident(resident, 23).visible).toBe(0);
      expect(strandResident(resident, 6)).toMatchObject({ x: resident.x, z: resident.z, stand: 0 });
    }
  });
  it('keeps the conversation target with a resident walking from work to the stairs', () => {
    const v = new Valley(new Game()), a = v.actors.find(a => a.npc && !a.dead)!;
    const cottage = sitesById.get('house_a')!, plan = floorPlan(cottage, 'ground');
    Object.assign(a, { x: cottage.x, z: cottage.z, posture: 'work' });
    const house = new RoomResidents();
    const initial = [...house.view(plan, [a])][0]!;
    let previous = { ...initial.at }, moved = 0;
    a.posture = 'rest';
    for (let i = 0; i < 1400; i++) {
      const people = [...house.view(plan, [a], 1 / 60)];
      if (!people.length) break;
      const at = people[0]!.at;
      const delta = Math.hypot(at.x - previous.x, at.z - previous.z);
      expect(delta).toBeLessThan(0.03);
      expect(indoorTargets(plan, [a], people).find(t => t.npc === a.npc)?.at).toEqual(at);
      moved += delta;
      previous = { ...at };
    }
    expect(moved).toBeGreaterThan(4);
    expect([...house.view(plan, [a])]).toHaveLength(0);
    const stair = plan.stairs.find(s => s.passage.kind === 'up')!;
    expect(Math.abs(previous.z - stair.treads.at(-1)!.end)).toBeLessThan(0.25);
  });
  it('eases off a seat at the current position when movement interrupts it', () => {
    const v = new Valley(new Game()), bench = v.targets().find((t) => t.id === 'bench/square')!;
    v.game.setPlayerTransform(bench.approach.x, 0, bench.approach.z, 0);
    v.interactField(bench);
    for (let i = 0; i < 40; i++) v.step(1 / 60, 0, 0, false);
    const seated = v.displayPosition;
    v.step(1 / 60, 1, 0, false);
    expect(v.activity).toBeUndefined();
    expect(Math.hypot(v.displayPosition.x - seated.x, v.displayPosition.z - seated.z)).toBeLessThan(0.1);
    for (let i = 0; i < 30; i++) v.step(1 / 60, 0, 0, false);
    expect(v.displayPosition).toEqual(v.position);
  });
});
