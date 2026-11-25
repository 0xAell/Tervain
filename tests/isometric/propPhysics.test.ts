import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initializePhysics } from '../../src/physics/initialize';
import { Game } from '../../src/core/game/game';
import { reviveState } from '../../src/core/game/revive';
import { BENCHES, SPAWN } from '../../src/core/world/layout';
import { Valley } from '../../src/isometric/simulation';
import { PropPhysics, angleOf } from '../../src/isometric/propPhysics';
import { propsNear, roomProps, staticRoom } from '../../src/isometric/propCatalogue';
import { sites, frontDoor } from '../../src/isometric/doorways';
import { floorPlan } from '../../src/isometric/roomPlans';
import { wetPoint, riverVelocity } from '../../src/isometric/water';
import { worldView } from '../../src/core/game/worldView';
import { supportHeight } from '../../src/isometric/relief';

beforeAll(initializePhysics);
const worlds: PropPhysics[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});
function journey(game = new Game()) {
  const v = new Valley(game),
    w = new PropPhysics(() => game.state);
  worlds.push(w);
  v.enableProps(w);
  return v;
}
function advance(v: Valley, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds - 1e-7; t += step) v.step(Math.min(step, seconds - t), 0, 0, false);
}
function moveTo(v: Valley, x: number, z: number) {
  if (v.room) Object.assign(v.position, { x, z });
  else v.game.setPlayerTransform(x, supportHeight({ x, z }), z, v.player.yaw);
  advance(v, 0.15);
}
describe('loose objects in the playable vale', () => {
  it('stocks every storey, keeps service furniture usable and has one body for each loose fixture', () => {
    let count = 0;
    const ids = new Set<string>();
    for (const site of sites)
      for (const level of ['ground', 'loft', 'cellar'] as const) {
        const plan = floorPlan(site, level),
          props = roomProps(site.id + '/' + level),
          fixed = staticRoom(plan);
        expect(props.length).toBeGreaterThan(2);
        for (const p of props) {
          expect(ids.has(p.id)).toBe(false);
          ids.add(p.id);
          if (p.fixture) expect(fixed.fixtures).not.toContain(p.fixture);
        }
        expect(fixed.passages).toEqual(plan.passages);
        count++;
      }
    expect(count).toBe(66);
    expect(propsNear(SPAWN, 4).some((s) => s.id === 'strand/jar')).toBe(true);
  });
  it('picks up a jar, turns it, places it on a crate and loads the same stack', () => {
    const v = journey(),
      w = v.props!;
    advance(v, 0.3);
    const jar = w.object('strand/jar')!,
      crate = w.object('strand/small-crate')!;
    moveTo(v, jar.x - 1.55, jar.z - 0.7);
    expect(v.grabProp(jar.spec.id)).toBe(true);
    w.turn(2);
    advance(v, 0.8);
    expect(jar.y).toBeGreaterThan(v.player.y + 1.42);
    expect(angleOf(jar.rotation)).toBeGreaterThan(0.48);
    expect(w.placeAt(crate)).toBe(true);
    advance(v, 1.1);
    expect(Math.hypot(jar.x - crate.x, jar.z - crate.z)).toBeLessThan(0.55);
    expect(jar.y - crate.y).toBeCloseTo((crate.spec.height + jar.spec.height) / 2, 1);
    w.checkpoint();
    const v2 = journey(new Game(reviveState(JSON.parse(JSON.stringify(v.game.state)))!));
    advance(v2, 0.25);
    const loaded = v2.props!.object(jar.spec.id)!;
    expect(loaded.x).toBeCloseTo(jar.x, 1);
    expect(loaded.y).toBeCloseTo(jar.y, 1);
  });
  it('carries a single object over a threshold and stairs, releases it and restores its new storey', () => {
    const v = journey(),
      w = v.props!;
    advance(v, 0.2);
    const jar = w.object('strand/jar')!;
    moveTo(v, jar.x - 1.1, jar.z + 0.85);
    expect(v.grabProp(jar.spec.id)).toBe(true);
    const site = sites.find((s) => s.id === 'house_a')!;
    v.enterDoor(frontDoor(site));
    advance(v, 0.4);
    expect(w.held?.spec.id).toBe(jar.spec.id);
    v.changeFloor('loft');
    advance(v, 0.3);
    expect(w.held?.spec.id).toBe(jar.spec.id);
    w.release();
    advance(v, 0.6);
    w.checkpoint();
    expect(v.game.state.physicalObjects.find((s) => s.id === jar.spec.id)?.space).toBe('house_a/loft');
    v.changeFloor('ground');
    expect(w.object(jar.spec.id)).toBeUndefined();
    v.leaveRoom();
    moveTo(v, SPAWN.x, SPAWN.z);
    expect(w.object(jar.spec.id)).toBeUndefined();
    v.enterDoor(frontDoor(site));
    v.changeFloor('loft');
    expect(w.object(jar.spec.id)).toBeTruthy();
  });
  it('floats timber in the flowing river, sinks earthenware and recreates displaced objects after streaming', () => {
    const g = new Game(),
      water = { x: 32, z: -16 },
      jar = { x: 34, z: -15 };
    for (const [id, p] of [
      ['strand/wood-crate', water],
      ['strand/jar', jar],
    ] as const)
      g.state.physicalObjects.push({
        id,
        space: 'vale',
        position: { ...p, y: 2.5 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      });
    g.setPlayerTransform(24, 0, -16, 0);
    const v = journey(g),
      w = v.props!,
      contacts: string[] = [];
    w.onContact = (m) => contacts.push(m);
    const flow = riverVelocity(wetPoint(water.x, water.z)!, worldView(g.state).flow);
    advance(v, 4.2, 1 / 30);
    const wood = w.object('strand/wood-crate')!,
      clay = w.object('strand/jar')!;
    expect(wood.wet).toBeGreaterThan(0.15);
    expect(wood.wet).toBeLessThan(0.8);
    expect((wood.x - water.x) * flow.x + (wood.z - water.z) * flow.z).toBeGreaterThan(0.2);
    expect(clay.y).toBeLessThan(wood.y - 0.6);
    expect(contacts).toContain('splash');
    const x = wood.x,
      z = wood.z;
    moveTo(v, SPAWN.x, SPAWN.z);
    expect(w.object(wood.spec.id)).toBeUndefined();
    moveTo(v, 24, -16);
    expect(w.object(wood.spec.id)!.x).toBeCloseTo(x, 0);
    expect(w.object(wood.spec.id)!.z).toBeCloseTo(z, 0);
  });
  it('shoves a free crate with the character and releases a tossed object into contacts', () => {
    const v = journey(),
      w = v.props!;
    advance(v, 0.45);
    const box = w.object('strand/small-crate')!,
      old = { x: box.x, z: box.z };
    moveTo(v, box.x, box.z + 1.4);
    for (let i = 0; i < 34; i++) v.step(1 / 60, 0, -1, false);
    expect(Math.hypot(box.x - old.x, box.z - old.z)).toBeGreaterThan(0.2);
    moveTo(v, box.x - 0.68, box.z + 1.3);
    expect(v.grabProp(box.spec.id)).toBe(true);
    advance(v, 0.45);
    const cast = { x: box.x, z: box.z };
    v.startAttack({ x: box.x - 3, z: box.z + 3 });
    expect(w.held).toBeUndefined();
    advance(v, 0.65);
    expect(Math.hypot(box.x - cast.x, box.z - cast.z)).toBeGreaterThan(1);
  });
  it('drags a heavy bench along the ground and still offers sitting at its new position', () => {
    const v = journey();
    const bench = BENCHES.square;
    moveTo(v, bench.x + 0.05, bench.z + 1.75);
    const w = v.props!,
      seat = v.targets().find((t) => t.id === 'bench/square')!;
    expect(v.grabProp(seat.prop)).toBe(true);
    expect(w.grip?.drag).toBe(true);
    const old = { ...w.held! };
    for (let i = 0; i < 80; i++) v.step(1 / 60, 0, 1, false);
    w.release();
    advance(v, 0.5);
    const t = v.targets().find((t) => t.id === seat.id)!;
    expect(Math.hypot(t.at.x - old.x, t.at.z - old.z)).toBeGreaterThan(0.5);
    moveTo(v, t.at.x + 0.3, t.at.z + 1.7);
    v.interactField(t);
    expect(v.activity?.kind).toBe('sit');
  });
});
