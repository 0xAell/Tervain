import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { initializePhysics } from '../../src/physics/initialize';
import { Game } from '../../src/core/game/game';
import { reviveState } from '../../src/core/game/revive';
import { BENCHES, SPAWN } from '../../src/core/world/layout';
import { Valley } from '../../src/isometric/simulation';
import { PropPhysics, angleOf } from '../../src/isometric/propPhysics';
import { propsNear, roomProps, staticRoom } from '../../src/isometric/propCatalogue';
import { sites, frontDoor } from '../../src/isometric/doorways';
import { floorPlan, roomRisePixels } from '../../src/isometric/roomPlans';
import { buildRoom, outdoorTile, tileSize } from '../../src/isometric/propSurfaces';
import { bridgePiers, coastalRocks } from '../../src/isometric/waterObstacles';
import { pierHalfWidth } from '../../src/isometric/crossing';
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
  it('keeps dry loose stones in place when the coast loads', () => {
    const v = journey(), w = v.props!;
    const stones = [...w.objects]
      .filter((p) => p.spec.key === 'rockpile' && !wetPoint(p.x, p.z) && Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 30)
      .map((stone) => ({ stone, x: stone.x, y: stone.y, z: stone.z }));
    expect(stones.length).toBeGreaterThan(2);
    advance(v, 2.5);
    for (const { stone, x, y, z } of stones)
      expect(Math.hypot(stone.x - x, stone.y - y, stone.z - z), stone.spec.id).toBeLessThan(0.02);
    w.checkpoint();
    expect(v.game.state.physicalObjects.some((pose) => stones.some(({ stone }) => stone.spec.id === pose.id))).toBe(false);
  });
  it('supports dropped objects on each individual tread above and below the hall slab', () => {
    const plan = floorPlan(sites.find((s) => s.id === 'house_a')!, 'ground');
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      buildRoom(world, plan);
      world.step();
      const surface = (x: number, z: number) => {
        const hit = world.castRay(new RAPIER.Ray({ x, y: 8, z }, { x: 0, y: -1, z: 0 }), 20, true);
        expect(hit).toBeTruthy();
        return 8 - hit!.timeOfImpact;
      };
      for (const stair of plan.stairs) {
        for (const t of stair.treads)
          expect(surface(stair.passage.x, (t.start + t.end) / 2)).toBeCloseTo(t.height / roomRisePixels, 4);
        expect(surface(stair.x1 + 0.28, (stair.z0 + stair.z1) / 2)).toBeCloseTo(0);
      }
    } finally {
      world.free();
    }
  });
  it('routes the approach to a staircase around the movable hall table', () => {
    const v = journey();
    v.enterDoor(frontDoor(sites.find((s) => s.id === 'house_a')!));
    advance(v, 0.3);
    const table = [...v.props!.objects].find((p) => p.spec.key === 'table')!;
    const a = { x: table.x, z: table.z + 1.65 },
      b = { x: table.x, z: table.z - 1.65 };
    expect(v.canWalk(a, b)).toBe(false);
    const side = table.x + table.spec.hx + 0.9;
    expect(v.canWalk({ x: side, z: a.z }, { x: side, z: b.z })).toBe(true);
  });
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
    advance(v, 0.98);
    expect(w.waterRipples().some((r) => r.course === 1 && r.amplitude > 0.25)).toBe(true);
    advance(v, 3.22, 1 / 30);
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
  it('stops drifting bodies at exposed rock and the bridge footings', () => {
    for (const obstacle of [coastalRocks[0]!, bridgePiers[0]!]) {
      const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
      try {
        outdoorTile(world, Math.floor(obstacle.x / tileSize), Math.floor(obstacle.z / tileSize));
        const yaw = 'yaw' in obstacle ? obstacle.yaw : 0,
          dx = Math.cos(yaw),
          dz = -Math.sin(yaw),
          radius = 'yaw' in obstacle ? pierHalfWidth : obstacle.radius;
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(obstacle.x - dx * (radius + 0.8), 0.4, obstacle.z - dz * (radius + 0.8))
            .setLinvel(4 * dx, 0, 4 * dz)
            .setCcdEnabled(true)
        );
        world.createCollider(RAPIER.ColliderDesc.ball(0.15), body);
        for (let i = 0; i < 38; i++) world.step();
        const p = body.translation(),
          v = body.linvel();
        expect((p.x - obstacle.x) * dx + (p.z - obstacle.z) * dz).toBeLessThan(-radius + 0.06);
        expect(v.x * dx + v.z * dz).toBeLessThan(0.5);
      } finally {
        world.free();
      }
    }
  });
  it('keeps pathfinding from shoving a crate, then responds to a bounded manual push and an aimed toss', () => {
    const v = journey(),
      w = v.props!;
    advance(v, 0.45);
    const box = w.object('strand/small-crate')!,
      old = { x: box.x, z: box.z };
    moveTo(v, box.x, box.z + 1.4);
    expect(v.canWalk(v.position, { x: box.x, z: box.z - 1.4 })).toBe(false);
    for (let i = 0; i < 34; i++) v.step(1 / 60, 0, -1, true, false);
    expect(Math.hypot(box.x - old.x, box.z - old.z)).toBeLessThan(0.04);
    let topSpeed = 0;
    for (let i = 0; i < 34; i++) {
      const { x, z } = box;
      v.step(1 / 60, 0, -1, true);
      topSpeed = Math.max(topSpeed, Math.hypot(box.x - x, box.z - z) * 60);
    }
    expect(topSpeed).toBeLessThan(2.3);
    expect(Math.hypot(box.x - old.x, box.z - old.z)).toBeGreaterThan(0.2);
    moveTo(v, box.x - 0.68, box.z + 1.3);
    expect(v.grabProp(box.spec.id)).toBe(true);
    advance(v, 0.45);
    const cast = { x: box.x, z: box.z };
    v.startAttack({ x: box.x - 3, z: box.z });
    expect(w.held).toBeUndefined();
    advance(v, 1 / 60);
    expect(box.x).toBeLessThan(cast.x - 0.085);
    expect(box.z).toBeCloseTo(cast.z, 2);
    advance(v, 0.65);
    expect(Math.hypot(box.x - cast.x, box.z - cast.z)).toBeGreaterThan(1);
  });
  it('drops a moving, turning jar straight down when the player lets go', () => {
    const v = journey(), w = v.props!;
    advance(v, 0.3);
    const jar = w.object('strand/jar')!;
    moveTo(v, jar.x - 1.55, jar.z - 0.7);
    expect(v.grabProp(jar.spec.id)).toBe(true);
    w.turn(3);
    advance(v, 0.26);
    for (let i = 0; i < 9; i++) v.step(1 / 60, -1, 0, false);
    const { x, y, z, rotation } = jar;
    w.release();
    advance(v, 1 / 60);
    expect(jar.y).toBeLessThan(y);
    expect(Math.hypot(jar.x - x, jar.z - z)).toBeLessThan(0.001);
    expect(angleOf(jar.rotation)).toBeCloseTo(angleOf(rotation), 3);
  });
  it('lets a falling barrel dislodge a crate it actually hits', () => {
    const game = new Game();
    const at = propsNear(SPAWN, 4).find((p) => p.id === 'strand/small-crate')!;
    game.state.physicalObjects.push({
      id: 'loose_barrel_0',
      space: 'vale',
      position: { x: at.x + 0.63, y: supportHeight(at) + 3.1, z: at.z },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    const v = journey(game), box = v.props!.object(at.id)!;
    const { x, z } = box;
    advance(v, 0.4);
    expect(Math.hypot(box.x - x, box.z - z)).toBeLessThan(0.01);
    advance(v, 0.6);
    expect(Math.hypot(box.x - x, box.z - z)).toBeGreaterThan(0.012);
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
    advance(v, 0.45);
    expect(Math.hypot(w.held!.x - old.x, w.held!.z - old.z)).toBeLessThan(0.04);
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
