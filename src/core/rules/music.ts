import { MUSIC, type MusicEntry, type MusicId, type MusicOrigin } from '../content/music';
import type { GameEvent, PlaceId } from '../game/types';
import { FOREST_REGION, PLACES } from '../world/layout';
import { villageCover } from './soundscape';

/**
 * The in-world score, decided without any audio objects. Gothic-like pacing: a piece for the mood of the place plays
 * once, then the world is left to itself for a while (the art direction asks for quiet intervals); a threat brings in
 * a low pulsing loop, a fight the battle loop, and when it is over the world falls quiet again. Short stings mark a
 * discovered place, a step of the story, a victory and a fall.
 *
 * Two voices share the score: pieces generated from prompts, and pieces composed in code around one Tervain theme
 * (`origin: 'composed'`). The first time a mood is heard, its own arrangement of the theme plays; a fight keeps one
 * voice from warning to battle; each region announces itself with the theme's opening in its own instruments.
 *
 * Moods: `vale` (Rillford and the hamlet, the ford, the mill, the sluice, the quarry by day), `wild` (the strand, the
 * deepwood, the overlook, Lantern Point, the Cut), `sacred` (the spring shrine and the archive), `night` (anywhere after
 * dark, except sacred ground).
 */

export type Mood = 'vale' | 'wild' | 'sacred' | 'night';
export type Threat = 'none' | 'alert' | 'combat';
export type Region = 'coast' | 'wood' | 'vale' | 'stone' | 'sacred' | 'light';

export interface MusicContext {
  /** The world is running (not a menu, not the fall). */
  active: boolean;
  x: number;
  z: number;
  night: boolean;
  threat: Threat;
  /** Music is playing in the world itself (the inn's tune): the score keeps quiet rather than play over it. */
  diegetic?: boolean;
  /** Runtime streams report their actual end; omitted by offline callers using manifest durations. */
  pieceFinished?: boolean;
}

export type MusicAction =
  | { t: 'piece'; id: MusicId; fadeIn: number }
  | { t: 'loop'; id: MusicId; fadeIn: number }
  | { t: 'stop'; fadeOut: number }
  | { t: 'sting'; id: MusicId };

type Origin = MusicOrigin;

const entries = Object.entries(MUSIC) as [MusicId, MusicEntry][];
const ids = (pick: (e: MusicEntry) => boolean) => entries.filter(([, e]) => pick(e)).map(([id]) => id);
export const PLAYLISTS: Record<Mood, MusicId[]> = {
  vale: ids((e) => e.kind === 'piece' && e.mood === 'vale'),
  wild: ids((e) => e.kind === 'piece' && e.mood === 'wild'),
  sacred: ids((e) => e.kind === 'piece' && e.mood === 'sacred'),
  night: ids((e) => e.kind === 'piece' && e.mood === 'night'),
};
export const THREAT_LOOPS: Record<'alert' | 'combat', MusicId[]> = {
  alert: ids((e) => e.kind === 'loop' && e.mood === 'danger'),
  combat: ids((e) => e.kind === 'loop' && e.mood === 'combat'),
};

/** Which region's motif greets each place on first discovery. */
export const PLACE_REGION: Record<PlaceId, Region> = {
  shore: 'coast', deepwood: 'wood', overlook: 'wood', lantern_point: 'light', rillford: 'vale', ford: 'vale',
  sluice: 'vale', quarry: 'stone', the_cut: 'stone', spring_shrine: 'sacred', archive: 'sacred',
};
export const REGION_STING: Record<Region, MusicId> = {
  coast: 'place_coast', wood: 'place_wood', vale: 'place_vale', stone: 'place_stone', sacred: 'place_sacred', light: 'place_light',
};

const SACRED = [PLACES.spring_shrine, PLACES.archive];

export function moodAt(x: number, z: number, night: boolean): Mood {
  if (SACRED.some((p) => Math.hypot(p.x - x, p.z - z) < p.r * 1.15)) return 'sacred';
  if (night) return 'night';
  // Settled ground, Rillford or the hamlet behind the strand, has the vale's music wherever it lies.
  if (villageCover(x, z) > 0.5) return 'vale';
  // West of the vale lies the open coast and the deepwood; the Cut is wild ground east of the quarry.
  if (x < FOREST_REGION.maxX + 10) return 'wild';
  if (Math.hypot(PLACES.the_cut.x - x, PLACES.the_cut.z - z) < PLACES.the_cut.r * 1.6) return 'wild';
  return 'vale';
}

/**
 * How dangerous the moment is: an engaged enemy closing in or fighting nearby means combat; one that has noticed the
 * player farther off, or is hunting them from a distance, means alert.
 */
export function threatFrom(enemies: readonly { x: number; z: number; alive: boolean; engaged: boolean; state: string }[], x: number, z: number): Threat {
  let threat: Threat = 'none';
  for (const e of enemies) {
    if (!e.alive || !e.engaged) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < MUSIC_PACING.combatWithin && e.state !== 'alert' && e.state !== 'return') return 'combat';
    if (d < MUSIC_PACING.alertWithin) threat = 'alert';
  }
  return threat;
}

/**
 * The score's pacing, in seconds. A piece is followed by a long quiet; the first piece of a session waits a little; a
 * piece for another mood gives way only when the new mood has held; a fight's music holds a moment after its end.
 */
/**
 * The sting a happening earns: a step of the story, a skill learned or a worker brought out the quest's; a place found
 * its own. The valley settling has the bell instead, and everything else no sting.
 */
export function eventSting(event: GameEvent): { kind: 'quest' } | { kind: 'discover'; place: PlaceId } | null {
  if (event.t === 'phase') return event.phase === 'settled' ? null : { kind: 'quest' };
  if (event.t === 'skill' || event.t === 'worker_rescued') return { kind: 'quest' };
  if (event.t === 'place') return { kind: 'discover', place: event.id };
  return null;
}

/** The fight is won, and its sting plays, when a foe falls and no other is still alive and on him. */
export function fightWon<F extends { alive: boolean; engaged: boolean }>(fallen: F, foes: readonly F[]): boolean {
  return !foes.some((foe) => foe !== fallen && foe.alive && foe.engaged);
}

export const MUSIC_PACING = {
  quietAfterPiece: [35, 80], firstWait: [8, 18], moodSettle: 8, combatHold: 4, alertHold: 1.5,
  /** After the inn's tune, the score waits at least this long before a piece. */
  afterDiegetic: 20,
  quietAfterThreat: [12, 24], quietAfterVictory: [14, 26], quietAfterGivingWay: 4.5, retryWithoutPiece: 30,
  /** How near an engaged enemy means a fight, and how near one that has noticed the player means a warning (m). */
  combatWithin: 16, alertWithin: 34,
  /** Fades (s): a piece in, a warning in, a battle in, and out for a menu, the inn, calm and sacred ground. */
  fade: { piece: 2.5, alert: 2.2, combat: 0.8, menu: 1.2, diegetic: 3, calm: 3, sacred: 4, victory: 1.5, fall: 0.4 },
  /** The share of story stings played in their composed form. */
  composedShare: 2 / 3,
} as const;
const QUIET_AFTER_PIECE: readonly [number, number] = MUSIC_PACING.quietAfterPiece;
const FIRST_WAIT: readonly [number, number] = MUSIC_PACING.firstWait;
const MOOD_SETTLE = MUSIC_PACING.moodSettle;
const COMBAT_HOLD = MUSIC_PACING.combatHold;
const AFTER_DIEGETIC = MUSIC_PACING.afterDiegetic;

type State =
  | { s: 'off' }
  | { s: 'wait'; left: number }
  | { s: 'piece'; id: MusicId; mood: Mood; left: number; offMood: number }
  | { s: 'threat'; level: 'alert' | 'combat'; calm: number };

export class MusicDirector {
  private state: State = { s: 'off' };
  private last: MusicId | null = null;
  private readonly heard = new Set<Mood>();
  /** Flips at each encounter; the first fight of a session hears the composed music. */
  private fightVoice: Origin = 'generated';
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  get phase(): State['s'] {
    return this.state.s;
  }

  get current(): MusicId | null {
    return this.state.s === 'piece' ? this.state.id : null;
  }

  private range([a, b]: readonly [number, number]): number {
    return a + (b - a) * this.random();
  }

  private pick(mood: Mood): MusicId | null {
    const list = PLAYLISTS[mood].length ? PLAYLISTS[mood] : PLAYLISTS.wild;
    if (!list.length) return null;
    // The first time a mood is heard, its own arrangement of the theme: the place's voice before its variations.
    if (!this.heard.has(mood)) {
      this.heard.add(mood);
      const own = list.find((id) => MUSIC[id].origin === 'composed');
      if (own) return own;
    }
    const choices = list.length > 1 ? list.filter((id) => id !== this.last) : list;
    return choices[Math.floor(this.random() * choices.length)] ?? null;
  }

  private readonly loopTurns = new Map<string, number>();

  /** A fight keeps one voice: a composed warning leads to the composed battle. Within a voice the takes come in turn. */
  private loopFor(level: 'alert' | 'combat'): MusicId {
    const list = THREAT_LOOPS[level];
    const voice = list.filter((id) => MUSIC[id].origin === this.fightVoice);
    const pool = voice.length ? voice : list;
    const key = `${level}.${this.fightVoice}`;
    const turn = this.loopTurns.get(key) ?? 0;
    this.loopTurns.set(key, turn + 1);
    return pool[turn % pool.length]!;
  }

  update(dt: number, ctx: MusicContext): MusicAction[] {
    const out: MusicAction[] = [];
    if (!ctx.active) {
      if (this.state.s !== 'off') out.push({ t: 'stop', fadeOut: MUSIC_PACING.fade.menu });
      this.state = { s: 'off' };
      return out;
    }
    const mood = moodAt(ctx.x, ctx.z, ctx.night);
    const st = this.state;

    // A threat overrides everything else. A fight never steps back down to the warning loop while it lasts.
    if (ctx.threat !== 'none') {
      if (st.s !== 'threat') {
        // Each new encounter alternates the voice of its fight music.
        this.fightVoice = this.fightVoice === 'composed' ? 'generated' : 'composed';
        const combat = ctx.threat === 'combat';
        out.push({ t: 'loop', id: this.loopFor(combat ? 'combat' : 'alert'), fadeIn: combat ? MUSIC_PACING.fade.combat : MUSIC_PACING.fade.alert });
        this.state = { s: 'threat', level: ctx.threat, calm: 0 };
      } else {
        if (ctx.threat === 'combat' && st.level === 'alert') {
          out.push({ t: 'loop', id: this.loopFor('combat'), fadeIn: MUSIC_PACING.fade.combat });
          st.level = 'combat';
        }
        st.calm = 0;
      }
      return out;
    }

    if (ctx.diegetic && st.s !== 'threat') {
      // Music in the world itself (the inn): the score gives way and waits until it is over.
      if (st.s === 'piece') out.push({ t: 'stop', fadeOut: MUSIC_PACING.fade.diegetic });
      if (st.s !== 'wait' || st.left < AFTER_DIEGETIC) this.state = { s: 'wait', left: AFTER_DIEGETIC };
      return out;
    }

    switch (st.s) {
      case 'off':
        this.state = { s: 'wait', left: this.range(FIRST_WAIT) };
        break;
      case 'threat':
        st.calm += dt;
        if (st.calm >= (st.level === 'combat' ? COMBAT_HOLD : MUSIC_PACING.alertHold)) {
          out.push({ t: 'stop', fadeOut: MUSIC_PACING.fade.calm });
          this.state = { s: 'wait', left: this.range(MUSIC_PACING.quietAfterThreat) };
        }
        break;
      case 'wait':
        st.left -= dt;
        if (st.left <= 0) {
          const id = this.pick(mood);
          if (id) {
            this.last = id;
            out.push({ t: 'piece', id, fadeIn: MUSIC_PACING.fade.piece });
            this.state = { s: 'piece', id, mood, left: MUSIC[id].duration, offMood: 0 };
          } else st.left = MUSIC_PACING.retryWithoutPiece;
        }
        break;
      case 'piece':
        if (ctx.pieceFinished === undefined) st.left -= dt;
        // A piece for another mood finishes naturally unless the new mood holds for a while (entering a shrine).
        st.offMood = mood === st.mood ? 0 : st.offMood + dt;
        if (ctx.pieceFinished ?? st.left <= 0) this.state = { s: 'wait', left: this.range(QUIET_AFTER_PIECE) };
        else if (st.offMood > MOOD_SETTLE && (mood === 'sacred' || st.mood === 'sacred')) {
          out.push({ t: 'stop', fadeOut: MUSIC_PACING.fade.sacred });
          this.state = { s: 'wait', left: MUSIC_PACING.quietAfterGivingWay };
        }
        break;
    }
    return out;
  }

  /** The composed form two times in three; the generated one keeps some variety. */
  private either(composed: MusicId, generated: MusicId): MusicId {
    return this.random() < MUSIC_PACING.composedShare ? composed : generated;
  }

  /** A sting over the quiet: never over a fight. A discovery names its place, so its region can answer. */
  sting(kind: 'discover' | 'quest' | 'victory' | 'death', place?: PlaceId): MusicAction[] {
    if (kind === 'death') {
      this.state = { s: 'off' };
      return [{ t: 'stop', fadeOut: MUSIC_PACING.fade.fall }, { t: 'sting', id: this.either('sting_fall_theme', 'sting_death') }];
    }
    if (kind === 'victory') {
      const was = this.state;
      this.state = { s: 'wait', left: this.range(MUSIC_PACING.quietAfterVictory) };
      const id = this.either('sting_victory_theme', 'sting_victory');
      return was.s === 'threat' ? [{ t: 'stop', fadeOut: MUSIC_PACING.fade.victory }, { t: 'sting', id }] : [{ t: 'sting', id }];
    }
    if (this.state.s === 'threat') return [];
    if (kind === 'quest') return [{ t: 'sting', id: this.either('sting_quest_theme', 'sting_quest') }];
    if (place && PLACE_REGION[place]) return [{ t: 'sting', id: REGION_STING[PLACE_REGION[place]] }];
    return [{ t: 'sting', id: this.random() < 0.5 ? 'sting_discover' : 'sting_lute' }];
  }
}
