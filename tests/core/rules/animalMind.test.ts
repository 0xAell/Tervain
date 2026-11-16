import { beforeAll, describe, expect, it } from 'vitest';
import { ANIMALS, ANIMAL_CALL_REACH, ANIMAL_GESTURE_SECONDS, ANIMAL_SENSES, type AnimalClip, type AnimalDefinition } from '../../../src/core/content/animals';
import { ANIMAL_BEHAVIOUR } from '../../../src/core/rules/animalBehaviour';
import { AnimalMind, Wildlife, type AnimalBodyFacts, type AnimalPoint, type WildlifeFacts } from '../../../src/core/rules/animalMind';
import { animalNavigationColliders, findAnimalSite, type AnimalSite } from '../../../src/core/rules/animalNavigation';
import { buildStaticColliders, type Colliders } from '../../../src/core/world/colliders';
import { Terrain } from '../../../src/core/world/terrain';

// What an animal does is decided in the core: these run a herd on the core alone, each animal with a body that is a
// point, a height and a list of motions. No model, no skeleton, no renderer.

let terrain: Terrain, colliders: Colliders;
beforeAll(() => { terrain = new Terrain(); colliders = animalNavigationColliders(buildStaticColliders(terrain)); }, 120_000);

const CLIPS: AnimalClip[] = ['Idle', 'Walk', 'Run', 'Alert', 'Call', 'Graze', 'Groom', 'Sleep'];
interface Body extends AnimalBodyFacts { motions: AnimalClip[]; mind?: AnimalMind }

/** A herd of the given animals, each at a home the navigation rule finds for it. */
function herdOf(definitions: readonly AnimalDefinition[], facts: Partial<WildlifeFacts> = {}) {
  const gone = new Set<AnimalMind>(), dead = new Set<AnimalMind>();
  const herd = new Wildlife(terrain, colliders, { present: (mind) => !gone.has(mind), dead: (mind) => dead.has(mind), ...facts });
  const occupied: AnimalSite[] = [];
  const minds = definitions.map((definition, index) => {
    const home = findAnimalSite(definition, 0.6, terrain, colliders, occupied, 1.2); occupied.push(home);
    const body: Body = { position: { x: home.x, y: terrain.heightAt(home.x, home.z), z: home.z }, height: 1.2, motions: [],
      transition: (clip) => { body.motions.push(clip); },
      facing: () => body.mind!.yaw };
    const mind = new AnimalMind(definition, home, index, body, herd);
    body.mind = mind;
    return mind;
  });
  return { herd, minds, gone, dead };
}
const far: AnimalPoint = { x: 400, y: 0, z: 400 };
const wild = (species: string) => ANIMALS.filter((definition) => definition.species === species && !definition.tame && !definition.seated);
const steps = (mind: AnimalMind, seconds: number, focus: AnimalPoint, each?: () => void) => { for (let t = 0; t < seconds; t += 0.05) { mind.step(0.05, focus, 0); each?.(); } };

describe('an animal’s life, on the core alone', () => {
  it('begins at its home grazing or idle, the same on every start', () => {
    const first = herdOf(ANIMALS).minds, again = herdOf(ANIMALS).minds;
    expect(first.map((mind) => [mind.yaw, mind.rest, mind.callIn, mind.state])).toEqual(again.map((mind) => [mind.yaw, mind.rest, mind.callIn, mind.state]));
    for (const mind of first) {
      expect(['Graze', 'Idle']).toContain(mind.state);
      expect(mind.rest).toBeGreaterThanOrEqual(ANIMAL_BEHAVIOUR.firstRest[0]);
      expect((mind.body as Body).motions).toEqual([mind.state]);
    }
    // The first calls are staggered so the valley does not call at once.
    expect(new Set(first.map((mind) => Math.round(mind.callIn))).size).toBeGreaterThan(first.length / 2);
  });

  it('grazes only if its kind does: a deer settles to graze or stand, a wolf only ever to stand', () => {
    const { minds } = herdOf([...wild('deer').slice(0, 1), ...wild('wolf').slice(0, 1)]), [deer, wolf] = minds as [AnimalMind, AnimalMind];
    const deerStates = new Set<string>(), wolfStates = new Set<string>();
    for (let i = 0; i < 200; i++) { deer.settle(); deerStates.add(deer.state); wolf.settle(); wolfStates.add(wolf.state); }
    expect([...deerStates].sort()).toEqual(['Graze', 'Idle']);
    expect([...wolfStates]).toEqual(['Idle']);
    expect(deer.motions.has('Graze')).toBe(true); expect(wolf.motions.has('Graze')).toBe(false);
  });

  it('wanders within its range with nobody near, and never leaves it', () => {
    const { minds } = herdOf(wild('deer').slice(0, 1)), deer = minds[0]!;
    let walked = 0, farthest = 0;
    steps(deer, 240, far, () => {
      const p = deer.body.position;
      farthest = Math.max(farthest, Math.hypot(p.x - deer.home.x, p.z - deer.home.z));
      if (deer.state === 'Walk') walked++;
    });
    expect(walked).toBeGreaterThan(20);
    expect(farthest).toBeGreaterThan(1);
    expect(farthest).toBeLessThanOrEqual(deer.definition.roam + 0.02);
    expect((deer.body as Body).motions).toContain('Walk');
    expect((deer.body as Body).motions).not.toContain('Run');
  });

  it('walks and runs at its own pace, whatever its body, and holds a call for the gesture’s length', () => {
    // Its pace is the core's: the body that draws it has no say in how fast it goes.
    const { minds } = herdOf(wild('deer').slice(0, 1)), deer = minds[0]!;
    let walked = 0;
    for (let t = 0; t < 60; t += 0.05) walked = Math.max(walked, deer.step(0.05, far, 0)?.speed ?? 0);
    expect(walked).toBeCloseTo(deer.definition.walk, 3);
    const p = deer.body.position, hunter: AnimalPoint = { x: p.x + ANIMAL_SENSES.deer.flee * 0.5, y: p.y, z: p.z };
    let ran = 0;
    for (let t = 0; t < 3; t += 0.05) ran = Math.max(ran, deer.step(0.05, hunter, 0)?.speed ?? 0);
    expect(ran).toBeCloseTo(deer.definition.run, 3);
    // A call is held for the gesture's length, no longer: then it rests.
    const wolf = herdOf(wild('wolf').slice(0, 1)).minds[0]!;
    const listener: AnimalPoint = { x: wolf.body.position.x + ANIMAL_CALL_REACH.wolf / 2, y: 0, z: wolf.body.position.z };
    let called = -1, settled = -1;
    for (let t = 0; t < 400 && settled < 0; t += 0.05) {
      wolf.step(0.05, listener, 0);
      if (called < 0 && wolf.state === 'Call') called = t;
      else if (called >= 0 && wolf.state !== 'Call') settled = t;
    }
    expect(called).toBeGreaterThanOrEqual(0);
    expect(settled - called).toBeGreaterThanOrEqual(Math.max(ANIMAL_BEHAVIOUR.callSeconds, ANIMAL_GESTURE_SECONDS.Call));
    expect(settled - called).toBeLessThan(Math.max(ANIMAL_BEHAVIOUR.callSeconds, ANIMAL_GESTURE_SECONDS.Call) + ANIMAL_BEHAVIOUR.gestureSlack + 0.1);
    // Nobody within its reach, it does not call at all.
    const lonely = herdOf(wild('wolf').slice(0, 1)).minds[0]!;
    const beyond: AnimalPoint = { x: lonely.home.x + ANIMAL_CALL_REACH.wolf + lonely.definition.roam + 5, y: 0, z: lonely.home.z };
    for (let t = 0; t < 200; t += 0.05) { lonely.step(0.05, beyond, 0); expect(lonely.state).not.toBe('Call'); }
  });

  it('runs from someone who comes too near, away from them, and the herd runs with it', () => {
    const { minds } = herdOf(wild('deer')), [deer, ...others] = minds;
    const p = deer!.body.position, flee = ANIMAL_SENSES.deer.flee;
    const hunter: AnimalPoint = { x: p.x + flee * 0.6, y: p.y, z: p.z };
    const before = Math.hypot(p.x - hunter.x, p.z - hunter.z);
    steps(deer!, 6, hunter);
    expect((deer!.body as Body).motions).toContain('Run');
    expect(Math.hypot(p.x - hunter.x, p.z - hunter.z)).toBeGreaterThan(before);
    // Its own kind within the herd's reach take the alarm; none of another kind would.
    const near = others.filter((other) => Math.hypot(other.body.position.x - deer!.home.x, other.body.position.z - deer!.home.z) < 24);
    for (const other of near) expect(other.alarm).not.toBeNull();
  });

  it('stands and watches someone at a distance, then goes back to its rest', () => {
    const { minds } = herdOf(wild('boar').slice(0, 1)), boar = minds[0]!, speeds = ANIMAL_SENSES.boar;
    const watcher: AnimalPoint = { x: boar.body.position.x + (speeds.notice + speeds.flee) / 2, y: boar.body.position.y, z: boar.body.position.z };
    boar.step(0.05, watcher, 0);
    expect(boar.state).toBe('Alert');
    // It turns to face them.
    steps(boar, 3, watcher);
    const heading = Math.atan2(watcher.x - boar.body.position.x, watcher.z - boar.body.position.z);
    expect(Math.abs(Math.atan2(Math.sin(heading - boar.yaw), Math.cos(heading - boar.yaw)))).toBeLessThan(0.2);
  });

  it('calls now and then with one of its two calls, once per call', () => {
    const { minds } = herdOf(wild('wolf').slice(0, 1)), wolf = minds[0]!;
    const listener: AnimalPoint = { x: wolf.body.position.x + 40, y: 0, z: wolf.body.position.z };
    const calls: number[] = [];
    for (let t = 0; t < 400 && calls.length < 3; t += 0.05) { const step = wolf.step(0.05, listener, 0); if (step?.call) calls.push(step.call); }
    expect(calls.length).toBe(3);
    for (const call of calls) expect([1, 2]).toContain(call);
    expect((wolf.body as Body).motions.filter((clip) => clip === 'Call').length).toBeGreaterThanOrEqual(3);
  });

  it('does nothing while it is gone or dead, runs when a shot is loosed near it, and settles somewhere new when it returns', () => {
    const { herd, minds, gone, dead } = herdOf(wild('deer').slice(0, 1)), deer = minds[0]!;
    dead.add(deer);
    expect(deer.step(0.05, far, 0)).toBeNull();
    dead.delete(deer); gone.add(deer);
    expect(deer.step(0.05, far, 0)).toBeNull();
    gone.delete(deer);
    const shot = { x: deer.body.position.x + 6, z: deer.body.position.z };
    deer.startled(shot);
    expect(deer.alarm).toMatchObject({ x: shot.x, z: shot.z });
    expect(['Run', 'Alert']).toContain(deer.state);
    // Back after being gone, with the hunter far away: a new place in its range, idle, with nothing left of the alarm.
    herd.hunter = { x: far.x, z: far.z };
    expect(deer.resettle(true)).toBe(true);
    expect(deer.alarm).toBeNull();
    expect(Math.hypot(deer.body.position.x - deer.home.x, deer.body.position.z - deer.home.z)).toBeLessThanOrEqual(deer.definition.roam);
    expect(['Idle', 'Graze']).toContain(deer.state);
    // With the hunter standing on its range, a returning animal waits.
    herd.hunter = { x: deer.home.x, z: deer.home.z };
    expect(deer.resettle(true)).toBe(false);
  });

  it('carries a rider where he steers, at his pace, and takes up its own life again when let go', () => {
    const mount = ANIMALS.find((definition) => definition.tame)!, { minds } = herdOf([mount]), deer = minds[0]!;
    const at = { x: deer.home.x + 2, z: deer.home.z + 1, yaw: 1.2, speed: 0 };
    expect(deer.carry(at)).toBe('Idle');
    expect([deer.body.position.x, deer.body.position.z, deer.yaw]).toEqual([at.x, at.z, at.yaw]);
    expect(deer.carry({ ...at, speed: ANIMAL_BEHAVIOUR.rideWalk + 0.1 })).toBe('Walk');
    expect(deer.carry({ ...at, speed: -(ANIMAL_BEHAVIOUR.rideRun + 0.1) })).toBe('Run');
    deer.settle();
    expect(['Idle', 'Graze']).toContain(deer.state);
    expect(deer.path).toEqual([]);
  });

  it('walks round the others, the people and whoever is near', () => {
    const { herd, minds } = herdOf(wild('deer').slice(0, 2));
    herd.people = [{ id: 'person:baker', x: 1, y: 0, z: 2, radius: 0.4, height: 1.8, active: true }, { id: 'person:away', x: 0, y: 0, z: 0, radius: 0.4, height: 1.8, active: false }];
    const extras = herd.extrasFor(minds[0]!, { x: 5, y: 1, z: 5 });
    expect(extras.map((extra) => extra.id)).toEqual([`animal:${minds[1]!.definition.id}`, 'person:baker', 'wildlife:player']);
    expect(CLIPS).toContain(minds[0]!.state);
  });
});
