import { describe, expect, it } from 'vitest';
import { CLOCK_RATE, RITE_CALM_MIN } from '../../../src/core/game/constants';
import { createInitialState } from '../../../src/core/game/state';
import type { WorldState } from '../../../src/core/game/types';
import { STAMINA_MAX } from '../../../src/core/rules/hero';
import { AUTOSAVE_SECONDS, DEATH, HIT_STOP, UNDER_WORLD } from '../../../src/core/rules/journey';
import { RESIDENT } from '../../../src/core/rules/resident';
import {
  AFLOAT, archiveClosesBehind, archiveDoorAttempt, archiveOpen, autosaveDue, AWAITED_MOUNT_REACH, awaitedMountLapsed, belowTheWorld, buriedOnEntry, clockDue, CLOCK_TICK_MINUTES, ENTRY,
  fallRemaining, hitStopFor, journeyBegun, mayMount, mustDismount, objectiveKey, objectivePlace, placesReached, recoversFromUnderWorld, riteReady, SAFE_PLACE_RINGS, safePlace, savedMount,
  SHAKE, STANDING_BODY, standingBodies, TIMED_WORK, trustedPropTop, underWorldSeconds, type PlacingWorld,
} from '../../../src/core/rules/session';
import { PLACES, SPAWN } from '../../../src/core/world/layout';

// A sitting's rules, on the core alone: no loop, no scene, no storage.

describe('time in a sitting', () => {
  it('hands the clock its minutes in ticks of at least half a minute, and loses none', () => {
    let owed = 0, given = 0, ticks = 0;
    for (let i = 0; i < 600; i++) {
      owed += (1 / 60) * CLOCK_RATE;
      const due = clockDue(owed);
      if (due > 0) { given += due; ticks++; owed = 0; expect(due).toBeGreaterThanOrEqual(CLOCK_TICK_MINUTES); }
    }
    expect(given + owed).toBeCloseTo(10 * CLOCK_RATE, 9);
    expect(ticks).toBeGreaterThan(15);
    expect(ticks).toBeLessThanOrEqual(20);
    expect(owed).toBeLessThan(CLOCK_TICK_MINUTES);
    expect([clockDue(CLOCK_TICK_MINUTES - 0.001), clockDue(CLOCK_TICK_MINUTES), clockDue(7)]).toEqual([0, CLOCK_TICK_MINUTES, 7]);
  });

  it('saves the journey when its count runs out, every so often', () => {
    let remaining = AUTOSAVE_SECONDS, saves = 0;
    for (let i = 0; i < Math.round(AUTOSAVE_SECONDS * 2.5 * 60); i++) {
      remaining -= 1 / 60;
      if (autosaveDue(remaining)) { remaining = AUTOSAVE_SECONDS; saves++; }
    }
    expect(saves).toBe(2);
    expect([autosaveDue(0.01), autosaveDue(0), autosaveDue(-0.01)]).toEqual([false, true, true]);
  });

  it('calls a journey begun once anything in it is worth keeping', () => {
    const fresh = () => createInitialState();
    expect(journeyBegun(fresh(), false)).toBe(false);
    expect(journeyBegun(fresh(), true)).toBe(true); // the satchel's notes were edited
    const begun: Array<(s: WorldState) => void> = [
      (s) => { s.quest.phase = 'noticed' as WorldState['quest']['phase']; },
      (s) => { (s.evidence as Record<string, unknown>).dry_ditch = { via: 'observation' }; },
      (s) => { s.grants.anything = true; },
      (s) => { s.locationChanges['pickup:wreck_sword'] = 'taken'; },
      (s) => { s.quickSlots[0] = 'bread' as WorldState['quickSlots'][number]; },
      (s) => { s.equippedWeapon = 'rusted_sword'; },
      (s) => { (s.hunting as Record<string, unknown>)['deer-a'] = { status: 'injured' }; },
      (s) => { s.mapMarker = { x: 1, z: 2 } as WorldState['mapMarker']; },
      (s) => { s.playSeconds = AUTOSAVE_SECONDS + 1; },
    ];
    for (const change of begun) { const s = fresh(); change(s); expect(journeyBegun(s, false), change.toString()).toBe(true); }
    const s = fresh();
    s.playSeconds = AUTOSAVE_SECONDS; s.locationChanges.archive_door = 'open';
    expect(journeyBegun(s, false)).toBe(false); // a door is not a provision, and the first minute and a half is not a journey
  });

  it('saves him in the saddle he sits or the one a load promised, and afoot otherwise', () => {
    expect(savedMount('deer', null)).toBe('deer');
    expect(savedMount(undefined, 'deer')).toBe('deer');
    expect(savedMount(null, undefined)).toBeNull();
  });
});

describe('a blow and a fall', () => {
  it('holds the world still a little longer for a heavy blow', () => {
    expect([hitStopFor(true), hitStopFor(false)]).toEqual([HIT_STOP.heavy, HIT_STOP.light]);
    expect(HIT_STOP.heavy).toBeGreaterThan(HIT_STOP.light);
  });

  it('holds the fallen view for its time, then he rises', () => {
    let remaining: number = DEATH.fadeSeconds, steps = 0;
    while (remaining !== 0 && steps < 1000) { steps++; remaining = fallRemaining(remaining, 1 / 60); }
    expect(steps / 60).toBeCloseTo(DEATH.fadeSeconds, 1);
    expect(fallRemaining(0.01, 1)).toBe(0); // never below nothing
    expect(DEATH.heal).toBeGreaterThan(0);
    expect(STAMINA_MAX).toBe(100);
  });
});

describe('where he may be set down', () => {
  const world = (over: Partial<{ ground: (x: number, z: number) => number; walkable: (x: number, z: number) => boolean; blocked: (x: number, z: number) => boolean;
    water: PlacingWorld['waterAt']; open: { i: number; j: number } | null }> = {}): PlacingWorld => {
    const ground = over.ground ?? (() => 0);
    return {
      terrain: { groundAt: ground, supportAt: ground, walkable: (x: number, z: number) => (over.walkable ?? (() => true))(x, z) } as PlacingWorld['terrain'],
      colliders: { blocked: (x: number, z: number) => (over.blocked ?? (() => false))(x, z) } as PlacingWorld['colliders'],
      waterAt: over.water,
      nav: { nearestOpen: (_x: number, _z: number, rings?: number) => { expect(rings).toBe(SAFE_PLACE_RINGS); return over.open === undefined ? { i: 3, j: 4 } : over.open; }, cellCenter: (i: number, j: number) => ({ x: i * 10, z: j * 10 }) },
    };
  };

  it('is where he was, if he can stand there', () => {
    expect(safePlace(world(), 5, 6, 0)).toEqual({ x: 5, z: 6, y: 0 });
    expect(safePlace(world({ ground: () => 2 }), 5, 6)).toEqual({ x: 5, z: 6, y: 2 });
  });

  it('is where he swam, afloat: under the surface by his depth, never above it nor beneath the ground', () => {
    const lake = world({ walkable: () => false, water: () => ({ depth: 3, surface: 0 }), ground: () => -3 });
    expect(safePlace(lake, 5, 6)).toEqual({ x: 5, z: 6, y: -AFLOAT.feetBelow, afloat: true });
    expect(safePlace(lake, 5, 6, -2)).toEqual({ x: 5, z: 6, y: -2, afloat: true }); // as deep as he was saved
    expect(safePlace(lake, 5, 6, 4).y).toBe(-AFLOAT.headroom); // never above the water
    expect(safePlace(lake, 5, 6, -9).y).toBe(-3); // never under the bed
  });

  it('is the nearest open ground where he can neither stand nor swim, and the strand failing that', () => {
    const shallow = world({ walkable: () => false, water: () => ({ depth: AFLOAT.depth - 0.1, surface: 0 }), ground: () => -0.8 });
    expect(safePlace(shallow, 5, 6)).toEqual({ x: 30, z: 40, y: -0.8 });
    const walled = world({ walkable: () => false, blocked: () => true, water: () => ({ depth: 3, surface: 0 }), ground: () => -3 });
    expect(safePlace(walled, 5, 6).afloat).toBeUndefined(); // deep water inside something solid is no place to swim
    expect(safePlace(world({ walkable: () => false, open: null }), 5, 6)).toEqual({ x: SPAWN.x, z: SPAWN.z, y: 0 });
  });

  it('trusts a loose thing he was saved standing on only if it is still under his feet', () => {
    expect(trustedPropTop(null, 1)).toBeNull();
    expect(trustedPropTop(1 + ENTRY.propSupport - 0.01, 1)).toBeCloseTo(1.11, 9); // the crate he was saved on
    expect(trustedPropTop(1 - ENTRY.propSupport + 0.01, 1)).toBeCloseTo(0.89, 9);
    expect(trustedPropTop(1 + ENTRY.propSupport + 0.01, 1)).toBeNull(); // a crate that is somewhere else now
  });

  it('never lets him enter buried under land that changed, unless he swims or is in the archive', () => {
    const dry = { afloat: false, inArchive: false };
    expect(buriedOnEntry(1, 1 + ENTRY.buried + 0.01, dry)).toBe(true);
    expect(buriedOnEntry(1, 1 + ENTRY.buried - 0.01, dry)).toBe(false);
    expect(buriedOnEntry(1, 5, { ...dry, afloat: true })).toBe(false); // a swimmer is below the bank
    expect(buriedOnEntry(1, 5, { ...dry, inArchive: true })).toBe(false); // the archive's floor is below the hill
  });

  it('notices him standing beneath the land for a moment, unless he swims, rides or is in the archive', () => {
    const under = { y: -UNDER_WORLD.depth - 0.1, ground: 0, swimming: false, inArchive: false, riding: false };
    expect(belowTheWorld(under)).toBe(true);
    expect(belowTheWorld({ ...under, y: -UNDER_WORLD.depth + 0.1 })).toBe(false);
    for (const change of [{ swimming: true }, { inArchive: true }, { riding: true }]) expect(belowTheWorld({ ...under, ...change })).toBe(false);
    const dt = UNDER_WORLD.seconds * 0.6;
    let seconds = underWorldSeconds(0, dt, true);
    expect(recoversFromUnderWorld(seconds)).toBe(false);
    seconds = underWorldSeconds(seconds, dt, false); // a moment above starts the count again
    expect(seconds).toBe(0);
    seconds = underWorldSeconds(underWorldSeconds(seconds, dt, true), dt, true);
    expect(recoversFromUnderWorld(seconds)).toBe(true);
  });

  it('discovers a place on coming within its reach, once', () => {
    const [id, place] = Object.entries(PLACES)[0]! as [keyof typeof PLACES, { x: number; z: number; r: number }];
    expect(placesReached({}, place.x, place.z)).toContain(id);
    expect(placesReached({ [id]: true }, place.x, place.z)).not.toContain(id);
    expect(placesReached({}, place.x + place.r + 0.1, place.z)).not.toContain(id);
    expect(placesReached({}, 1e6, 1e6)).toEqual([]);
  });

  it('counts residents and hostiles as bodies in the way while they are about and alive', () => {
    const bodies = standingBodies(
      [{ id: 'village_baker', x: 1, y: 2, z: 3, solid: true }, { id: 'mill_hand', x: 4, y: 5, z: 6, solid: true }, { id: 'reeve', x: 0, y: 0, z: 0, solid: false }],
      (id) => id !== 'mill_hand',
      [{ id: 'bandit_road', x: 7, y: 8, z: 9, radius: 0.45, alive: true }, { id: 'thornback', x: 0, y: 0, z: 0, radius: 0.8, alive: false }]);
    expect(bodies).toEqual([
      { id: 'person:village_baker', x: 1, y: 2, z: 3, radius: RESIDENT.radius, height: STANDING_BODY.height, active: true },
      { id: 'person:mill_hand', x: 4, y: 5, z: 6, radius: RESIDENT.radius, height: STANDING_BODY.height, active: false },
      { id: 'person:reeve', x: 0, y: 0, z: 0, radius: RESIDENT.radius, height: STANDING_BODY.height, active: false },
      { id: 'enemy:bandit_road', x: 7, y: 8, z: 9, radius: 0.45, height: STANDING_BODY.height, active: true },
      { id: 'enemy:thornback', x: 0, y: 0, z: 0, radius: 0.8, height: STANDING_BODY.height, active: false },
    ]);
  });
});

describe('the deer', () => {
  it('is gone to only afoot, alive, with the world running', () => {
    const can = { playing: true, riding: false, mounting: false, alive: true };
    expect(mayMount(can)).toBe(true);
    for (const change of [{ playing: false }, { riding: true }, { mounting: true }, { alive: false }]) expect(mayMount({ ...can, ...change })).toBe(false);
  });

  it('waits for a rider loaded in the saddle only while he waits for it', () => {
    const waiting = { riding: false, mounting: false, alive: true, swimming: false, strayed: AWAITED_MOUNT_REACH };
    expect(awaitedMountLapsed(waiting)).toBe(false);
    for (const change of [{ riding: true }, { mounting: true }, { alive: false }, { swimming: true }, { strayed: AWAITED_MOUNT_REACH + 0.01 }]) {
      expect(awaitedMountLapsed({ ...waiting, ...change }), JSON.stringify(change)).toBe(true);
    }
  });

  it('puts a rider down for death, deep water, a fall or a missing deer, but not for a blow', () => {
    const seated = { alive: true, swimming: false, state: 'free', grounded: true, deerHere: true };
    expect(mustDismount(seated)).toBe(false);
    expect(mustDismount({ ...seated, state: 'hurt' })).toBe(false);
    for (const change of [{ alive: false }, { swimming: true }, { state: 'dodge' }, { state: 'dead' }, { grounded: false }, { deerHere: false }]) {
      expect(mustDismount({ ...seated, ...change }), JSON.stringify(change)).toBe(true);
    }
  });
});

describe('the archive’s door, timed work and what the journey points to', () => {
  it('opens the archive with the borrowed key before the steward’s leave, and not at all once access is lost', () => {
    const s = createInitialState();
    expect(archiveDoorAttempt(s)).toEqual({ refused: 'locked' });
    s.facts.edda_permission = true;
    expect(archiveDoorAttempt(s)).toEqual({ opens: 'permission' });
    s.inventory.archive_key = 1;
    expect(archiveDoorAttempt(s)).toEqual({ opens: 'borrowed_key' });
    s.facts.archive_access_lost = true;
    expect(archiveDoorAttempt(s)).toEqual({ refused: 'withdrawn' });
  });

  it('can be seen into through an opened door or a forced shutter, and closes behind him once reported', () => {
    const s = createInitialState();
    expect([archiveOpen(s), archiveClosesBehind(s)]).toEqual([false, false]);
    s.locationChanges.archive_shutter = 'forced';
    expect(archiveOpen(s)).toBe(true);
    s.locationChanges.archive_shutter = 'sealed';
    expect([archiveOpen(s), archiveClosesBehind(s)]).toEqual([false, false]); // sealed, but nobody has reported it yet
    s.facts.archive_reported = true;
    expect(archiveClosesBehind(s)).toBe(true);
    s.locationChanges.archive_shutter = 'shut'; s.locationChanges.archive_door = 'open';
    expect([archiveOpen(s), archiveClosesBehind(s)]).toEqual([true, false]);
    s.locationChanges.archive_door = 'locked';
    expect(archiveClosesBehind(s)).toBe(true);
  });

  it('needs the rite taught and a reed to begin it, and takes its time over it and over the brace', () => {
    const s = createInitialState();
    expect(riteReady(s)).toBe(false);
    s.facts.rite_taught = true;
    expect(riteReady(s)).toBe(false);
    s.inventory.votive_reed = 1;
    expect(riteReady(s)).toBe(true);
    expect(TIMED_WORK).toEqual({ rite: 3.0, brace: 2.8 });
    expect(SHAKE.surge).toBeGreaterThan(SHAKE.jam);
    expect(RITE_CALM_MIN).toBeGreaterThan(0);
  });

  it('points to the investigation, and to the hunter’s camp while the hunt leads and he lacks its kit', () => {
    const s = createInitialState();
    expect(objectiveKey(s, 'hint.quest')).toBe('hint.quest');
    expect(objectivePlace(s, 'rillford')).toBe('rillford');
    expect(objectivePlace(s, null)).toBeNull();
    // Whatever the hunt's hint is for a given state, the two agree: its line leads, and only kit and arrows have a place.
    const hunting = createInitialState();
    hunting.inventory.hunting_bow = 1;
    hunting.equippedWeapon = 'hunting_bow' as WorldState['equippedWeapon'];
    const key = objectiveKey(hunting, 'hint.quest'), place = objectivePlace(hunting, 'rillford');
    if (key === 'hint.quest') expect(place).toBe('rillford');
    else expect(place).toBe(['hunting.objective.kit', 'hunting.objective.spare', 'hunting.objective.restock'].includes(key) ? 'deepwood' : null);
  });
});
