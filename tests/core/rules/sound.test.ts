import { describe, expect, it } from 'vitest';
import { MUSIC, type MusicId } from '../../../src/core/content/music';
import { eventSting, fightWon, moodAt, MUSIC_PACING, MusicDirector, PLACE_REGION, PLAYLISTS, REGION_STING, THREAT_LOOPS, threatFrom } from '../../../src/core/rules/music';
import {
  BEDS, bedTargets, dawn, dayness, EMITTER_CLIPS, emitterRuleIds, emitterRuleTable, EmitterScheduler, forestCover, MILL_SOUND, QUARRY_SOUND,
  roomFloorSurface, seaProximity, villageCover, type ListenerState, type WorldSoundState,
  seaBedNearness,
} from '../../../src/core/rules/soundscape';
import { coastX } from '../../../src/core/world/coast';
import { PLACES } from '../../../src/core/world/layout';

// The score's director and the world's sound are rules of the game: which piece answers a place, a threat and a
// moment, and what is heard where and when. They run here without a renderer or an audio device.

const world = (over: Partial<WorldSoundState> = {}): WorldSoundState => ({ hour: 12, nightness: 0, flows: { main: 1, village: 1, quarry: 1 }, millTurning: true, quarryWorking: true, ...over });
const at = (x: number, z: number, over: Partial<ListenerState> = {}): ListenerState => ({ x, y: 2, z, indoors: false, ...over });
const sequence = (values: number[]) => { let n = 0; return () => values[n++ % values.length]!; };

describe('the score’s catalogue', () => {
  const entries = Object.entries(MUSIC) as [MusicId, (typeof MUSIC)[MusicId]][];

  it('gives every piece a purpose, an origin and a length', () => {
    expect(entries.length).toBeGreaterThanOrEqual(30);
    for (const [id, entry] of entries) {
      expect(['piece', 'loop', 'sting'], id).toContain(entry.kind);
      expect(['generated', 'composed'], id).toContain(entry.origin);
      expect(entry.duration, id).toBeGreaterThan(3);
      // A piece is for a place's mood, a loop for a threat, a sting for a moment or a place.
      if (entry.kind === 'piece') expect(['vale', 'wild', 'sacred', 'night'], id).toContain(entry.mood);
      if (entry.kind === 'loop') expect(['danger', 'combat'], id).toContain(entry.mood);
      if (entry.kind === 'sting') expect(['sting', 'place'], id).toContain(entry.mood);
    }
  });

  it('has music for every mood and threat, with a composed piece in each, and a motif for every region', () => {
    for (const mood of ['vale', 'wild', 'sacred', 'night'] as const) {
      expect(PLAYLISTS[mood].length, mood).toBeGreaterThanOrEqual(2);
      expect(PLAYLISTS[mood].some((id) => MUSIC[id].origin === 'composed'), mood).toBe(true);
    }
    for (const level of ['alert', 'combat'] as const) {
      expect(THREAT_LOOPS[level].some((id) => MUSIC[id].origin === 'composed'), level).toBe(true);
      expect(THREAT_LOOPS[level].some((id) => MUSIC[id].origin === 'generated'), level).toBe(true);
    }
    for (const place of Object.keys(PLACES) as (keyof typeof PLACES)[]) expect(MUSIC[REGION_STING[PLACE_REGION[place]]].mood, place).toBe('place');
  });
});

describe('the score’s pacing', () => {
  it('measures a threat by the table’s distances', () => {
    const enemy = (d: number, state = 'chase') => [{ x: d, z: 0, alive: true, engaged: true, state }];
    expect(threatFrom(enemy(MUSIC_PACING.combatWithin - 0.1), 0, 0)).toBe('combat');
    expect(threatFrom(enemy(MUSIC_PACING.combatWithin + 0.1), 0, 0)).toBe('alert');
    expect(threatFrom(enemy(MUSIC_PACING.alertWithin + 0.1), 0, 0)).toBe('none');
    // One that has only noticed the wanderer warns, however near.
    expect(threatFrom(enemy(2, 'alert'), 0, 0)).toBe('alert');
  });

  it('waits, plays, then leaves the world quiet for the table’s spans', () => {
    const director = new MusicDirector(sequence([0]));
    const ctx = { active: true, x: PLACES.rillford.x, z: PLACES.rillford.z, night: false, threat: 'none' as const };
    expect(moodAt(ctx.x, ctx.z, false)).toBe('vale');
    expect(director.update(0.1, ctx)).toEqual([]);
    // With the random source at 0, the first wait is its shortest.
    expect(director.update(MUSIC_PACING.firstWait[0] - 0.2, ctx)).toEqual([]);
    const started = director.update(0.3, ctx);
    expect(started).toEqual([{ t: 'piece', id: 'theme_vale', fadeIn: MUSIC_PACING.fade.piece }]);
    // The piece runs its length, then the quiet lasts at least the shortest span before the next.
    expect(director.update(MUSIC[director.current!].duration + 0.1, ctx)).toEqual([]);
    expect(director.phase).toBe('wait');
    expect(director.update(MUSIC_PACING.quietAfterPiece[0] - 0.5, ctx)).toEqual([]);
    expect(director.update(1, ctx)[0]).toMatchObject({ t: 'piece' });
  });

  it('holds a fight’s music a moment after it ends, and a warning’s less', () => {
    for (const [threat, hold] of [['combat', MUSIC_PACING.combatHold], ['alert', MUSIC_PACING.alertHold]] as const) {
      const director = new MusicDirector(sequence([0.5]));
      const ctx = { active: true, x: 0, z: 0, night: false };
      expect(director.update(0.1, { ...ctx, threat })[0]).toMatchObject({ t: 'loop', fadeIn: threat === 'combat' ? MUSIC_PACING.fade.combat : MUSIC_PACING.fade.alert });
      expect(director.update(hold - 0.1, { ...ctx, threat: 'none' })).toEqual([]);
      expect(director.update(0.2, { ...ctx, threat: 'none' })).toEqual([{ t: 'stop', fadeOut: MUSIC_PACING.fade.calm }]);
    }
  });
});

describe('the world’s sound', () => {
  it('sets a level for exactly the beds it names, everywhere', () => {
    expect(new Set(BEDS).size).toBe(BEDS.length);
    for (const [x, z] of [[-260, 0], [-120, -40], [0, 0], [92, -26], [-28, -106]] as const) {
      const targets = bedTargets(at(x, z), world());
      expect(Object.keys(targets).sort()).toEqual([...BEDS].sort());
      for (const bed of BEDS) expect(Number.isFinite(targets[bed].gain) && targets[bed].gain >= 0, `${bed} at ${x},${z}`).toBe(true);
    }
  });

  it('places the mill and the quarry where they are heard from, only while they work', () => {
    const mill = bedTargets(at(MILL_SOUND.x + 3, MILL_SOUND.z), world()).mill;
    expect(mill.gain).toBeGreaterThan(0.5);
    expect(mill.at).toMatchObject({ x: MILL_SOUND.x, z: MILL_SOUND.z });
    expect(bedTargets(at(MILL_SOUND.x + 3, MILL_SOUND.z), world({ millTurning: false })).mill.gain).toBe(0);
    const quarry = bedTargets(at(QUARRY_SOUND.x + 10, QUARRY_SOUND.z), world()).quarry;
    expect(quarry.gain).toBeGreaterThan(0.5);
    expect(quarry.at).toMatchObject({ x: QUARRY_SOUND.x, z: QUARRY_SOUND.z });
    expect(bedTargets(at(QUARRY_SOUND.x + 10, QUARRY_SOUND.z), world({ quarryWorking: false })).quarry.gain).toBe(0);
  });

  it('knows the village, the wood and the sea by place, and the day by the sky', () => {
    expect(villageCover(PLACES.rillford.x, PLACES.rillford.z)).toBeGreaterThan(0.9);
    expect(villageCover(PLACES.deepwood.x, PLACES.deepwood.z)).toBe(0);
    expect(forestCover(PLACES.deepwood.x, PLACES.deepwood.z)).toBeGreaterThan(0.5);
    expect(forestCover(PLACES.rillford.x, PLACES.rillford.z)).toBeLessThan(0.2);
    expect(seaProximity(PLACES.shore.x, PLACES.shore.z)).toBeGreaterThan(seaProximity(PLACES.quarry.x, PLACES.quarry.z));
    expect(dayness(world({ nightness: 0 }))).toBe(1);
    expect(dayness(world({ nightness: 1 }))).toBe(0);
    expect(dayness(world({ nightness: 0.25 }))).toBeCloseTo(0.75, 9);
    expect(dawn(6.2)).toBe(1);
    expect(dawn(12)).toBe(0);
  });

  it('lists every call with its clip, its spacing and its level', () => {
    const table = emitterRuleTable();
    expect(table.map((rule) => rule.id)).toEqual(emitterRuleIds());
    expect(new Set(table.map((rule) => rule.clip))).toEqual(new Set(EMITTER_CLIPS));
    for (const rule of table) {
      expect(rule.every[0], rule.id).toBeGreaterThan(0);
      expect(rule.every[1], rule.id).toBeGreaterThanOrEqual(rule.every[0]);
      expect(rule.gain > 0 && rule.gain <= 1, rule.id).toBe(true);
      // A burst is spaced; a single call is not.
      expect(rule.gap === null, rule.id).toBe(rule.burst === null);
    }
  });

  it('calls only with the listed clips, the same for a given random source', () => {
    const run = () => {
      const scheduler = new EmitterScheduler(sequence([0.13, 0.71, 0.42, 0.9, 0.05]));
      const out: string[] = [];
      for (let step = 0; step < 400; step++) for (const event of scheduler.update(0.5, at(PLACES.deepwood.x, PLACES.deepwood.z), world({ hour: 6.2 }))) out.push(`${event.rule}:${event.clip}`);
      return out;
    };
    const calls = run();
    expect(calls.length).toBeGreaterThan(10);
    expect(run()).toEqual(calls);
    for (const call of calls) expect(EMITTER_CLIPS as readonly string[]).toContain(call.split(':')[1]);
  });

  it('floors a room with boards, and the shrine hall with stone', () => {
    const room = (kind: string) => ({ rooms: { at: () => ({ building: { kind } }) } }) as unknown as Parameters<typeof roomFloorSurface>[0];
    expect(roomFloorSurface(room('house'), 0, 0)).toBe('deck');
    expect(roomFloorSurface(room('shrine'), 0, 0)).toBe('stone');
    expect(roomFloorSurface({}, 0, 0)).toBeNull();
    expect(roomFloorSurface({ rooms: { at: () => null } } as unknown as Parameters<typeof roomFloorSurface>[0], 0, 0)).toBeNull();
  });
});

describe('the sea’s low bed', () => {
  it('is heard whole at the coast line and fades inland, more slowly than the surf', () => {
    const coast = coastX(0);
    expect(seaBedNearness(coast, 0)).toBe(1);
    expect(seaBedNearness(coast - 10, 0), 'out over the water').toBe(1);
    expect(seaBedNearness(coast + 95, 0)).toBeCloseTo(Math.exp(-1), 9);
    expect(seaBedNearness(coast + 40, 0)).toBeGreaterThan(seaBedNearness(coast + 80, 0));
  });
});

describe('the stings happenings earn', () => {
  it('plays the quest\u2019s for a step of the story, a skill or a worker brought out, and a place\u2019s own when it is found', () => {
    expect(eventSting({ t: 'phase', phase: 'committed' })).toEqual({ kind: 'quest' });
    expect(eventSting({ t: 'skill', id: 'steady_guard' })).toEqual({ kind: 'quest' });
    expect(eventSting({ t: 'worker_rescued', method: 'rope' })).toEqual({ kind: 'quest' });
    expect(eventSting({ t: 'place', id: 'ford' })).toEqual({ kind: 'discover', place: 'ford' });
  });

  it('leaves the valley\u2019s settling to the bell, and everything else without a sting', () => {
    expect(eventSting({ t: 'phase', phase: 'settled' })).toBeNull();
    expect(eventSting({ t: 'shortcut' })).toBeNull();
    expect(eventSting({ t: 'item', id: 'arrow', delta: 1 })).toBeNull();
  });

  it('wins the fight as a foe falls with no other still alive and on him', () => {
    const fallen = { alive: false, engaged: true }, onHim = { alive: true, engaged: true }, away = { alive: true, engaged: false }, dead = { alive: false, engaged: true };
    expect(fightWon(fallen, [fallen, away, dead])).toBe(true);
    expect(fightWon(fallen, [fallen, onHim])).toBe(false);
  });
});
