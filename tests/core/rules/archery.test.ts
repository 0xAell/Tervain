import { describe, expect, it } from 'vitest';
import { HUNTING_ARROW_RANGE, SKINNING_REACH, WILDLIFE_RETRY_SECONDS, type AnimalHuntRecord } from '../../../src/core/game/hunting';
import {
  ArrowFlights, arrowMeets, arrowZone, bowAvailable, BowHand, coverAtBow, nearestCarcass, SHOT, shotTarget, SKINNING, skinningRefusal, skinningStance,
  SKULL_BAND, SKULLS, takesFright, woundedFleesFrom, type ArrowFlight, type Point3, type SceneryContact, type SkinningFacts,
} from '../../../src/core/rules/archery';
import { BOW } from '../../../src/core/rules/bow';

// A shot is decided in the core: these run it with plain numbers. No renderer, no meshes, no rays but the ones the
// test answers itself.

const p = (x: number, y: number, z: number): Point3 => ({ x, y, z });
const nothing = { scenery: () => null, animal: () => null };

describe('the draw', () => {
  it('is possible only with the bow in hand, on his feet, hands otherwise empty and nothing else being done', () => {
    const ready = { equipped: true, free: true, alive: true, swimming: false, riding: false, mounting: false, carrying: false };
    expect(bowAvailable(ready)).toBe(true);
    for (const change of [{ equipped: false }, { free: false }, { alive: false }, { swimming: true }, { riding: true }, { mounting: true }, { carrying: true }]) {
      expect(bowAvailable({ ...ready, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it('starts on a press, fills over the draw time while held, and the arrow leaves once after letting go', () => {
    const hand = new BowHand(), held = { pressed: false, held: true, aimHeld: false, arrows: 3 };
    expect(hand.step(1 / 60, { ...held, pressed: true })).toEqual({ started: true, empty: false, letGo: false, aiming: true });
    expect(hand.drawing).toBe(true);
    hand.step(BOW.drawSeconds / 2 - 1 / 60, held);
    expect(hand.drawFraction).toBeCloseTo(0.5, 6);
    hand.step(BOW.drawSeconds, held);
    expect(hand.drawFraction).toBe(1); // no further than full
    expect(hand.loose()).toBe(false); // still held
    expect(hand.step(1 / 60, { ...held, held: false })).toEqual({ started: false, empty: false, letGo: true, aiming: true });
    expect([hand.drawing, hand.releasePending, hand.busy]).toEqual([false, true, true]);
    expect(hand.loose()).toBe(true);
    expect([hand.loose(), hand.busy, hand.drawFraction]).toEqual([false, false, 0]);
  });

  it('looses on a click shorter than a step, and needs no minimum draw', () => {
    const hand = new BowHand();
    expect(hand.step(1 / 60, { pressed: true, held: false, aimHeld: false, arrows: 1 })).toEqual({ started: true, empty: false, letGo: true, aiming: true });
    expect(hand.loose()).toBe(true);
  });

  it('with no arrow says so on a press, and silently does nothing while the shot and the aim are only held', () => {
    const hand = new BowHand();
    expect(hand.step(1 / 60, { pressed: true, held: true, aimHeld: false, arrows: 0 })).toEqual({ started: false, empty: true, letGo: false, aiming: false });
    expect(hand.step(1 / 60, { pressed: false, held: true, aimHeld: true, arrows: 0 })).toEqual({ started: false, empty: false, letGo: false, aiming: true });
    // Holding both with an arrow draws without a new press.
    expect(hand.step(1 / 60, { pressed: false, held: true, aimHeld: true, arrows: 1 }).started).toBe(true);
    hand.cancel();
    expect([hand.drawing, hand.busy, hand.drawFraction]).toEqual([false, false, 0]);
  });
});

describe('what the arrow is aimed at', () => {
  const eye = p(0, 2, -3), muzzle = p(0, 1.5, 0), far = p(0, 2, 62);

  it('is the nearer of an animal and scenery on the camera’s ray, or the end of the range', () => {
    const animal = { distance: 20, point: p(0, 1, 17) }, wall = { distance: 30, point: p(0, 1, 27) };
    expect(shotTarget(eye, muzzle, far, wall, animal)).toEqual(animal.point);
    expect(shotTarget(eye, muzzle, far, { ...wall, distance: 12, point: p(0, 1, 9) }, animal)).toEqual(p(0, 1, 9));
    expect(shotTarget(eye, muzzle, far, null, animal)).toEqual(animal.point);
    expect(shotTarget(eye, muzzle, far, wall, null)).toEqual(wall.point);
    expect(shotTarget(eye, muzzle, far, null, null)).toBe(far);
  });

  it('is never his own cover: what the ray meets no further than the bow and a little is passed over', () => {
    const toBow = Math.hypot(0.5, 3);
    const post = { distance: toBow + SHOT.pastBow - 0.01, point: p(0, 1.6, 0.2) };
    expect(shotTarget(eye, muzzle, far, post, null)).toBe(far);
    expect(shotTarget(eye, muzzle, far, post, { distance: 20, point: p(0, 1, 17) })).toEqual(p(0, 1, 17));
    expect(shotTarget(eye, muzzle, far, { ...post, distance: toBow + SHOT.pastBow + 0.01 }, null)).toEqual(post.point);
  });
});

describe('who a shot frightens, and cover at the bow', () => {
  it('frightens huntable game that is about and alive or wounded, within the alarm; not pets, carcasses or game away', () => {
    const game = { huntable: true, returning: false };
    expect(takesFright(game, SHOT.alarm)).toBe(true);
    expect(takesFright({ ...game, status: 'injured' }, 3)).toBe(true);
    expect(takesFright(game, SHOT.alarm + 0.01)).toBe(false);
    expect(takesFright({ ...game, huntable: false }, 1), 'a pet or the mount').toBe(false);
    expect(takesFright({ ...game, returning: true }, 1), 'away on its way home').toBe(false);
    expect(takesFright({ ...game, status: 'dead' }, 1), 'a carcass').toBe(false);
    expect(takesFright({ ...game, status: 'skinned' }, 1)).toBe(false);
    expect(takesFright(game, 30, 40), 'a wider alarm').toBe(true);
  });

  it('stops the arrow at cover between his chest and the bow, traced from his chest', () => {
    const asked: [Point3, Point3][] = [];
    const post = { point: p(0.2, 1.3, 0.3) };
    expect(coverAtBow(p(0, 0, 0), p(0.3, 1.4, 0.5), (from, to) => { asked.push([from, to]); return post; })).toBe(post);
    expect(asked).toEqual([[p(0, SHOT.chest, 0), p(0.3, 1.4, 0.5)]]);
    expect(coverAtBow(p(0, 0, 0), p(0.3, 1.4, 0.5), () => null)).toBeNull();
  });

  it('lets game kept away by the hunter try again every second to come back', () => {
    expect(WILDLIFE_RETRY_SECONDS).toBe(1);
  });
});

describe('what a piece of flight meets', () => {
  const origin = p(0, 1.5, 0);

  it('is the nearer of an animal and scenery; an animal must be nearer by more than a hair', () => {
    const animal = { distance: 2, point: p(0, 1.5, 12), id: 'bear-a' }, tree: SceneryContact = { distance: 2.5, point: p(0, 1.5, 12.5), treeId: 'oak' };
    const both = { scenery: () => tree, animal: () => animal };
    expect(arrowMeets(p(0, 1.5, 10), p(0, 1.5, 13), origin, both)).toEqual({ point: animal.point, animal, lodge: false });
    expect(arrowMeets(p(0, 1.5, 10), p(0, 1.5, 13), origin, { ...both, animal: () => ({ ...animal, distance: 2.5 - SHOT.animalWins / 2 }) })).toEqual({ point: tree.point, treeId: 'oak' });
    expect(arrowMeets(p(0, 1.5, 10), p(0, 1.5, 13), origin, nothing)).toBeNull();
    expect(arrowMeets(p(0, 1.5, 10), p(0, 1.5, 10), origin, both)).toBeNull(); // no flight, no contact
  });

  it('strikes a person or a hostile without staying in them, and stays in anything else', () => {
    const person: SceneryContact = { distance: 1, point: p(0, 1.5, 11), actorId: 'village_baker' };
    expect(arrowMeets(p(0, 1.5, 10), p(0, 1.5, 13), origin, { ...nothing, scenery: () => person })).toEqual({ point: person.point, lodge: false });
    const wall: SceneryContact = { distance: 1, point: p(0, 1.5, 11) };
    const met = arrowMeets(p(0, 1.5, 10), p(0, 1.5, 13), origin, { ...nothing, scenery: () => wall })!;
    expect(met.lodge).not.toBe(false);
    expect(met.expired).toBeUndefined();
  });

  it('is nothing past its range: only the part of the last piece inside the range is traced, and then the arrow is gone', () => {
    const from = p(0, 1.5, HUNTING_ARROW_RANGE - 0.2), to = p(0, 1.5, HUNTING_ARROW_RANGE + 0.3);
    const traced: Array<{ to: Point3; reach: number }> = [];
    const met = arrowMeets(from, to, origin, {
      scenery: (_a, b) => { traced.push({ to: { ...b }, reach: 0 }); return null; },
      animal: (_a, _direction, reach) => { traced[0]!.reach = reach; return null; },
    })!;
    expect(met).toMatchObject({ lodge: false, expired: true });
    expect(Math.hypot(met.point.x - origin.x, met.point.y - origin.y, met.point.z - origin.z)).toBeCloseTo(HUNTING_ARROW_RANGE, 9);
    expect(traced[0]!.to.z).toBeCloseTo(HUNTING_ARROW_RANGE, 9);
    expect(traced[0]!.reach).toBeCloseTo(0.2, 9);
    // A wall just beyond the range is not struck in that piece; one just inside it is.
    const beyond = arrowMeets(from, to, origin, { ...nothing, scenery: (_a, b) => (b.z > HUNTING_ARROW_RANGE + 0.1 ? { distance: 0.4, point: p(0, 1.5, HUNTING_ARROW_RANGE + 0.2) } : null) })!;
    expect(beyond.expired).toBe(true);
    expect(arrowMeets(p(0, 1.5, HUNTING_ARROW_RANGE + 1), p(0, 1.5, HUNTING_ARROW_RANGE + 2), origin, nothing)).toMatchObject({ expired: true, lodge: false });
    expect(arrowMeets(from, to, undefined, nothing)).toMatchObject({ expired: true }); // an arrow nobody remembers loosing
    expect(arrowMeets(from, to, p(Infinity, Infinity, Infinity), nothing)).toMatchObject({ expired: true });
  });
});

describe('the flight', () => {
  const fly = (flights: ArrowFlights, seconds: number, hz: number, events: Partial<Parameters<ArrowFlights['step']>[2]> = {}, water?: Parameters<ArrowFlights['step']>[3]) => {
    for (let i = 0; i < Math.round(seconds * hz); i++) flights.step(1 / hz, () => null, { met: () => {}, gone: () => {}, ...events }, water);
  };

  it('follows the same arc under gravity at 30, 60 and 120 steps a second', () => {
    const ends = [30, 60, 120].map((hz) => {
      const flights = new ArrowFlights(p), shot = flights.launch(p(0, 4, 0), p(0, 0, 2), 38)!;
      fly(flights, 0.5, hz);
      return shot;
    });
    for (const shot of ends) {
      expect(shot.position.z).toBeCloseTo(19, 9);
      expect(shot.position.y).toBeCloseTo(4 - 0.5 * BOW.gravity * 0.25, 9);
      expect(shot.velocity.y).toBeCloseTo(-BOW.gravity * 0.5, 9);
      expect(shot.age).toBeCloseTo(0.5, 9);
    }
  });

  it('stops at what it meets, once, even in one long step, and is then no longer in the air', () => {
    const flights = new ArrowFlights(p), shot = flights.launch(p(0, 1.5, 0), p(0, 0, 1), 60)!;
    const met: Array<{ flight: ArrowFlight; point: Point3 }> = [];
    let sweeps = 0;
    const wall = (from: Point3, to: Point3) => { sweeps++; return from.z <= 7 && to.z >= 7 ? { point: p(0, 1.5, 7) } : null; };
    flights.step(0.25, wall, { met: (flight, contact) => { met.push({ flight, point: contact.point }); }, gone: () => {} });
    expect(met).toEqual([{ flight: shot, point: p(0, 1.5, 7) }]);
    expect([shot.position.x, shot.position.y, shot.position.z]).toEqual([0, 1.5, 7]);
    expect(sweeps).toBeGreaterThan(10); // traced in short pieces
    expect(sweeps).toBeLessThanOrEqual(Math.ceil(7 / 60 / SHOT.step) + 1);
    expect(flights.count).toBe(0);
    flights.step(0.5, wall, { met: () => { throw new Error('met twice'); }, gone: () => {} });
  });

  it('is gone when its time runs out, and when a newer arrow takes its place among the few that fly at once', () => {
    const flights = new ArrowFlights(p, 2), gone: number[] = [];
    const first = flights.launch(p(0, 1000, 0), p(0, 0, 1), 10)!, second = flights.launch(p(1, 1000, 0), p(0, 0, 1), 10)!;
    const third = flights.launch(p(2, 1000, 0), p(0, 0, 1), 10, (flight) => { gone.push(flight.id); })!;
    expect([gone, flights.count]).toEqual([[first.id], 2]);
    fly(flights, BOW.flightSeconds - 0.5, 60, { gone: (flight) => { gone.push(flight.id); } });
    expect(flights.count).toBe(2);
    fly(flights, 1, 60, { gone: (flight) => { gone.push(flight.id); } });
    expect(flights.count).toBe(0);
    expect(gone.slice(1).sort()).toEqual([second.id, third.id].sort());
    flights.launch(p(0, 1, 0), p(0, 0, 1), 10);
    flights.clear((flight) => { gone.push(flight.id); });
    expect([flights.count, gone.length]).toEqual([0, 4]);
  });

  it('refuses a direction or a speed that is none', () => {
    const flights = new ArrowFlights(p);
    expect(flights.launch(p(NaN, 0, 0), p(0, 0, 1), 10)).toBeNull();
    expect(flights.launch(p(0, 0, 0), p(0, 0, 0), 10)).toBeNull();
    expect(flights.launch(p(0, 0, 0), p(0, 0, 1), Infinity)).toBeNull();
    expect(flights.launch(p(0, 0, 0), p(0, 0, 1), 0)).toBeNull();
    expect(flights.count).toBe(0);
  });

  it('breaks the water’s surface once, is slowed there, and spent, floats', () => {
    const water = { sample: () => ({ surface: 0, flowX: 0, flowZ: 0 }) };
    const flights = new ArrowFlights(p), shot = flights.launch(p(0, 0.9, 0), p(0, -1, 1), 40)!;
    const entered: Array<{ point: Point3; speed: number }> = [], floated: ArrowFlight[] = [];
    fly(flights, 2, 60, { entered: (_flight, point, speed) => { entered.push({ point: { ...point }, speed }); }, floated: (flight) => { floated.push(flight); } }, water);
    expect(entered).toHaveLength(1);
    expect(entered[0]!.point.y).toBeCloseTo(0, 9); // at the surface, not at the end of the piece that crossed it
    expect(entered[0]!.speed).toBeGreaterThan(39);
    expect(floated).toEqual([shot]);
    expect(shot.wet).toBe(true);
    expect(Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z)).toBeLessThan(BOW.floatSpeed);
    expect(shot.position.y).toBeLessThan(0);
    expect(shot.position.y).toBeGreaterThan(-40 / BOW.waterDrag); // the water stopped it within its speed over the drag
    expect(flights.count).toBe(0);
  });

  it('loosed from under the water it is slowed from the first, with no surface broken', () => {
    const water = { sample: () => ({ surface: 1, flowX: 0, flowZ: 0 }) };
    const flights = new ArrowFlights(p), shot = flights.launch(p(0, 0.5, 0), p(0, 0, 1), 40)!;
    let entered = 0;
    fly(flights, 0.1, 60, { entered: () => { entered++; } }, water);
    expect([shot.wet, entered]).toEqual([true, 0]);
    expect(shot.velocity.z).toBeLessThan(40 * Math.exp(-BOW.waterDrag * 0.09));
  });

  it('does not break the surface under something it struck first', () => {
    const water = { sample: () => ({ surface: 0, flowX: 0, flowZ: 0 }) };
    const flights = new ArrowFlights(p);
    flights.launch(p(0, 0.8, 0), p(0, -1, 1), 40);
    let entered = 0, met = 0;
    const deck = (from: Point3, to: Point3) => (from.y >= 0.09 && to.y < 0.09 ? { point: p(0, 0.09, from.z) } : null);
    for (let i = 0; i < 12; i++) flights.step(1 / 60, deck, { met: () => { met++; }, gone: () => {}, entered: () => { entered++; } }, water);
    expect([met, entered]).toEqual([1, 0]);
  });
});

describe('which part was struck', () => {
  const stag = SKULLS.stag!;

  it('is the head within the skull’s band where the point moves with the head, and the body elsewhere', () => {
    expect(arrowZone('stag', 'deer', { height: stag.height, fromNose: stag.rear / 2, headShare: 0.9 })).toBe('head');
    expect(arrowZone('stag', 'deer', { height: stag.height - SKULL_BAND.below + 0.01, fromNose: stag.rear, headShare: SKULL_BAND.headShare })).toBe('head');
    expect(arrowZone('stag', 'deer', { height: stag.height - SKULL_BAND.below - 0.01, fromNose: 0.1, headShare: 0.9 })).toBe('body'); // the throat
    expect(arrowZone('stag', 'deer', { height: stag.height, fromNose: stag.rear + 0.01, headShare: 0.9 })).toBe('body'); // the neck
    expect(arrowZone('stag', 'deer', { height: stag.height, fromNose: 0.1, headShare: SKULL_BAND.headShare - 0.01 })).toBe('body');
    expect(arrowZone('bear-a', 'bear', { height: 0.4, fromNose: 0.6, headShare: 0 })).toBe('body');
  });

  it('is nothing on a deer’s antlers, which move with the head but are no part of it', () => {
    expect(arrowZone('stag', 'deer', { height: stag.height + SKULL_BAND.above + 0.01, fromNose: 0.1, headShare: 1 })).toBeNull();
    expect(arrowZone('deer-a', 'deer', { height: 0.95, fromNose: 0.2, headShare: 1 })).toBeNull();
    // No other animal is crowned: above a bear's skull is still the bear.
    expect(arrowZone('bear-a', 'bear', { height: SKULLS['bear-a']!.height + SKULL_BAND.above + 0.01, fromNose: 0.1, headShare: 1 })).toBe('body');
  });

  it('goes by the skull alone on a cat, whose face blends into its chest and neck', () => {
    const cat = SKULLS['cat-a']!;
    expect(arrowZone('cat-a', 'cat', { height: cat.height, fromNose: cat.rear / 2, headShare: 0 })).toBe('head');
    expect(arrowZone('wolf-a', 'wolf', { height: SKULLS['wolf-a']!.height, fromNose: 0.1, headShare: 0 })).toBe('body');
  });

  it('knows every model’s skull, and calls an unknown animal’s every part its body', () => {
    expect(Object.keys(SKULLS)).toHaveLength(19);
    for (const [model, skull] of Object.entries(SKULLS)) {
      expect(skull.height, model).toBeGreaterThan(0.5);
      expect(skull.height, model).toBeLessThan(0.9);
      expect(skull.rear, model).toBeGreaterThan(0.15);
      expect(skull.rear, model).toBeLessThan(0.4);
    }
    expect(arrowZone('unicorn', 'deer', { height: 0.99, fromNose: 0, headShare: 1 })).toBe('body');
  });

  it('sends a wounded animal with nothing else to flee away from a point behind it', () => {
    const from = woundedFleesFrom({ x: 10, z: 20 }, Math.PI / 2); // facing +x
    expect(from.x).toBeCloseTo(10 - SHOT.woundedFleesBehind, 9);
    expect(from.z).toBeCloseTo(20, 9);
  });
});

describe('the carcass to skin', () => {
  const lying = (x: number, z: number, status: AnimalHuntRecord['status'] = 'dead') => ({ record: { status, position: { x, y: 0, z } } });
  it('is the nearest one lying dead within reach of him on the ground, whatever its height', () => {
    const far = lying(SKINNING_REACH + 0.1, 0), near = lying(1, 1), nearer = lying(0.5, 0), wounded = lying(0.1, 0, 'injured');
    expect(nearestCarcass([far, near, nearer, wounded], { x: 0, z: 0 })).toEqual({ candidate: nearer, distance: 0.5 });
    expect(nearestCarcass([far, { record: null }, wounded], { x: 0, z: 0 })).toBeNull();
    // Height is the refusal's to judge, so the prompt can name the carcass and say it is too far.
    const below = { record: { status: 'dead' as const, position: { x: 1, y: -5, z: 0 } } };
    expect(nearestCarcass([below], { x: 0, z: 0 })?.candidate).toBe(below);
    // The first of two equally near is kept.
    const twin = lying(0.5, 0);
    expect(nearestCarcass([nearer, twin], { x: 0, z: 0 })?.candidate).toBe(nearer);
  });
});

describe('skinning', () => {
  const chest = { x: 0, z: 0 }, animal = { yaw: 0, width: 0.6 };

  it('puts the hunter out from the chest on his own side, clear of the fallen body, antlers and all', () => {
    const plain = skinningStance(chest, { x: 3, z: 0 }, animal, null, chest);
    expect(plain).toEqual({ x: Math.max(SKINNING.least, 0.3 + SKINNING.beside), z: 0 });
    const narrow = skinningStance(chest, { x: 0, z: -3 }, { yaw: 0, width: 0.2 }, null, chest);
    expect(narrow.z).toBeCloseTo(-SKINNING.least, 9);
    const sprawled = skinningStance(chest, { x: 3, z: 0 }, animal, { minX: -0.5, maxX: 1.4, minZ: -0.4, maxZ: 0.4 }, chest);
    expect(sprawled.x).toBeCloseTo(1.4 + SKINNING.clear + 0.01, 9);
    expect(sprawled.z).toBeCloseTo(0, 9);
  });

  it('keeps the stance within reach of where the carcass is recorded, however far its antlers lie', () => {
    const recorded = { x: -1, z: 0 };
    const stance = skinningStance(chest, { x: 5, z: 0 }, animal, { minX: -1, maxX: 3, minZ: -1, maxZ: 1 }, recorded);
    expect(Math.hypot(stance.x - recorded.x, stance.z - recorded.z)).toBeCloseTo(SKINNING_REACH - SKINNING.inside, 9);
    expect(stance.x).toBeGreaterThan(0);
  });

  it('stands him at the animal’s side when he is on top of it', () => {
    const stance = skinningStance(chest, { x: 0.05, z: 0.05 }, { yaw: Math.PI / 2, width: 0.6 }, null, chest);
    expect(stance.x).toBeCloseTo(0, 9);
    expect(stance.z).toBeCloseTo(-(0.3 + SKINNING.beside), 9);
  });

  const dead: AnimalHuntRecord = { status: 'dead', position: { x: 0, y: 0, z: 0 }, yaw: 0, atClock: 0 } as AnimalHuntRecord;
  const can = (): SkinningFacts => ({
    record: dead, knives: 1,
    hunter: { x: 0.7, y: 0, z: 0, alive: true, grounded: true, swimming: false, free: true, riding: false, mounting: false },
    carrying: false, bowBusy: false,
    carcass: () => ({ ready: true, stance: { x: 0.7, z: 0 }, target: { x: 0, y: 0.3, z: 0 } }),
    sight: () => null,
  });

  it('names the first thing in the way, in a fixed order, and nothing when he may', () => {
    expect(skinningRefusal(can())).toBeNull();
    const refused = (change: Partial<SkinningFacts>, hunter: Partial<SkinningFacts['hunter']> = {}, starting = true) =>
      skinningRefusal({ ...can(), ...change, hunter: { ...can().hunter, ...hunter } }, starting);
    expect(refused({ record: { ...dead, status: 'injured' } as AnimalHuntRecord, knives: 0 })).toBe('hunting.animal_alive');
    expect(refused({ record: undefined })).toBe('hunting.animal_alive');
    expect(refused({ knives: 0 }, { grounded: false })).toBe('hunting.need_knife');
    expect(refused({ carrying: true }, { swimming: true })).toBe('hunting.skin_need_footing');
    expect(refused({ carrying: true, bowBusy: true })).toBe('hunting.skin_put_down');
    expect(refused({ bowBusy: true }, { free: false })).toBe('hunting.skin_release_bow');
    expect(refused({}, { riding: true })).toBe('hunting.skin_busy');
    expect(refused({}, { mounting: true })).toBe('hunting.skin_busy');
    expect(refused({ carcass: () => null })).toBe('hunting.skin_wait');
    expect(refused({ carcass: () => ({ ...can().carcass()!, ready: false }) })).toBe('hunting.skin_wait');
    expect(refused({}, { x: 0.7 + SKINNING.stanceSlack + 0.01 })).toBe('hunting.too_far');
    expect(refused({ carcass: () => ({ ...can().carcass()!, stance: { x: 5, z: 0 } }) }, { x: SKINNING_REACH + 0.5 })).toBe('hunting.too_far');
  });

  it('does not ask how the carcass lies until everything before it allows', () => {
    let asked = 0;
    const facts = { ...can(), knives: 0, carcass: () => { asked++; return can().carcass(); } };
    expect([skinningRefusal(facts), asked]).toEqual(['hunting.need_knife', 0]);
  });

  it('is blocked by what stands between his eye and the cut, but not by the carcass itself', () => {
    const sighted: Array<{ from: Point3; to: Point3 }> = [];
    const facts = { ...can(), sight: (from: Point3, to: Point3) => { sighted.push({ from, to }); return { distance: 0.2 }; } };
    expect(skinningRefusal(facts)).toBe('hunting.skin_blocked');
    expect(sighted[0]!.from.y).toBeCloseTo(SKINNING.eye, 9);
    expect(sighted[0]!.to.y).toBeCloseTo(0.3 + SKINNING.lift, 9);
    const span = Math.hypot(0.7, SKINNING.eye - 0.3 - SKINNING.lift);
    expect(skinningRefusal({ ...can(), sight: () => ({ distance: span - SKINNING.slack + 0.001 }) })).toBeNull(); // the hide itself
    expect(skinningRefusal({ ...can(), sight: () => ({ distance: span - SKINNING.slack - 0.001 }) })).toBe('hunting.skin_blocked');
  });

  it('once begun, goes on with full hands or a drawn bow not asked about, but still needs footing and reach', () => {
    expect(skinningRefusal({ ...can(), carrying: true, bowBusy: true, hunter: { ...can().hunter, free: false } }, false)).toBeNull();
    expect(skinningRefusal({ ...can(), hunter: { ...can().hunter, grounded: false } }, false)).toBe('hunting.skin_need_footing');
  });
});
