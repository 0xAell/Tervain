import { BARKS } from '../content/npcs';
import { VOICE_LINE_SECONDS } from '../content/voiceLengths';
import { HERO_LINES, SCENE_REACH, SCENES, TALKS, VOICE_LINES, inHours, shown, type HeroCue, type Scene, type Speaker } from '../content/voice';
import { evalAll } from '../game/state';
import type { EncounterId, GameEvent, ItemId, NpcId, PlaceId, WorldState } from '../game/types';
import type { EnemySpawn } from '../world/layout';
import { OVERHEAR_REACH, WOUNDED_BELOW } from './journey';

/**
 * Who says what, and when (A53). People speak in the world, never in a window (A27): interacting with someone plays
 * the next exchange they have for the player, the hero's question first when there is one; the hero remarks on
 * places, a first blade, a beast, wounds and the bell. A speaker says one thing at a time, an exchange never talks
 * over the hero, and everything is timed by the game clock, so a pause holds the next line back.
 *
 * Nothing here plays a sound or draws a word: whoever does is told what to say and when (SpeechHooks), and says how
 * long a recorded line lasts.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Whether a resident stops walking to talk: always while an exchange or a scene holds them, and for a passing remark only
 * if they were already standing, since a remark is made on the move (A69). One who stops turns to whom they talk to.
 */
export function stopsToTalk(facts: { held: boolean; speaking: boolean; underway: boolean }): boolean {
  return facts.held || (facts.speaking && !facts.underway);
}

export interface SpeechHooks {
  /**
   * Plays a line (from a place in the world, when given) and returns its length in seconds, playable or not; null
   * when its voice is still loading and the line should wait a moment; undefined when it has no recording at all, and
   * the director gives it the time its words take to read.
   */
  say(line: string, at?: Vec3 | (() => Vec3)): number | null | undefined;
  /** Shows the spoken words for as long as they are heard. */
  caption(speaker: Speaker, text: string, seconds: number): void;
  /** Stops what a speaker is saying (a passing remark, when the player starts a conversation). */
  hush?(speaker: Speaker): void;
}

interface SpeechStep {
  line: string;
  where?: () => Vec3;
}

interface SpeechChain {
  cast: readonly NpcId[];
  remaining: SpeechStep[];
  /** An exchange stays pending while a line is loading, even past its estimated end. */
  pending: boolean;
  until: number;
  interaction: boolean;
  /** Mark an exchange heard when its answer starts, so an interrupted question can be asked again. */
  talk?: number;
  /** Player exchanges take turns, including when their first question has not loaded yet. */
  after?: SpeechChain;
}

interface Queued extends SpeechStep {
  at: number;
  chain?: SpeechChain;
  /** A remark of the hero's own waits for a conversation to finish, but not for ever. */
  remark?: { until: number; cue?: HeroCue; last?: number; turn?: number; once?: boolean };
  /** Times it has waited for its voice to load. */
  tries?: number;
}

/** How what is said is timed. */
export const SPEECH = {
  /** A breath between the question and the answer (s). */
  answerGap: 0.35,
  /** A line waits this long at a time for its voice (s), this many times, before it is shown without one. */
  loadWait: 0.25,
  loadTries: 12,
  /** A remark of the hero's waits for a conversation to end no longer than this (s), unless it can only ever be said once; it is tried again this long after the way is clear. */
  remarkWait: 20,
  remarkRetry: 0.6,
  /** Two residents begin a scene this long after it falls due (s). */
  sceneLead: 0.3,
  /** After a pause, the hero's remarks that were waiting hold off this long (s). */
  resumeDelay: 1.2,
  /** A line with no voice lasts this long (s), and as long again as its words at this many characters a second. */
  unvoiced: { least: 0.4, charactersPerSecond: 14 },
} as const;

const LOAD_TRIES = SPEECH.loadTries;
const ANSWER_GAP = SPEECH.answerGap;

export class SpeechDirector {
  private clock = 0;
  private queue: Queued[] = [];
  /** Talks heard this session, by their place in TALKS. */
  private readonly heard = new Set<number>();
  private readonly busy = new Map<Speaker, number>();
  /** Until when an exchange holds someone (a passing remark does not). */
  private readonly held = new Map<NpcId, number>();
  private readonly chains = new Set<SpeechChain>();
  private readonly turns = new Map<HeroCue, number>();
  private readonly cycles = new Map<NpcId, number>();
  /** The game day each scene was last overheard. */
  private readonly scenes = new Map<string, number>();
  private readonly said = new Set<HeroCue>();
  private readonly lastCue = new Map<HeroCue, number>();

  constructor(private readonly hooks: SpeechHooks) {}

  /** How long a line's recording lasts (s), if it has one: the core's table of the recordings (content/voiceLengths.ts). */
  protected recorded(line: string): number | undefined { return VOICE_LINE_SECONDS[line]; }

  /** Seconds until this speaker has finished what they are saying (0 when quiet). */
  busyFor(speaker: Speaker): number {
    const held = speaker === 'hero' ? 0 : this.held.get(speaker) ?? 0;
    return Math.max(0, Math.max(this.busy.get(speaker) ?? 0, held) - this.clock);
  }

  /** Seconds an exchange or a scene still holds this person (a passing remark does not hold anyone) (A69). */
  heldFor(npc: NpcId): number {
    return Math.max(0, (this.held.get(npc) ?? 0) - this.clock);
  }

  /** The current spoken line only. A listener stays in the exchange without gesturing through another person's turn. */
  speakingFor(speaker: Speaker): number {
    return Math.max(0, (this.busy.get(speaker) ?? 0) - this.clock);
  }

  /** The exchange someone would have with the player now: the first unheard one that applies, else a repeatable one. */
  nextTalk(npc: NpcId, state: WorldState): number | null {
    const i = this.peekTalk(npc, state);
    // Repeatable ones come round in turn, rather than always the first.
    if (i !== null && this.heard.has(i)) this.cycles.set(npc, (this.cycles.get(npc) ?? 0) + 1);
    return i;
  }

  private peekTalk(npc: NpcId, state: WorldState): number | null {
    const repeatable: number[] = [];
    for (let i = 0; i < TALKS.length; i++) {
      const t = TALKS[i]!;
      if (t.npc !== npc || !evalAll(state, t.when)) continue;
      if (!this.heard.has(i)) return i;
      if (t.again) repeatable.push(i);
    }
    if (!repeatable.length) return null;
    return repeatable[(this.cycles.get(npc) ?? 0) % repeatable.length]!;
  }

  /**
   * What someone may say soon, so the voice can be ready before it is wanted: their next exchange with the player
   * (the hero's question too), the remarks that apply at this hour, and their part in any scene that could start now.
   */
  soon(npc: NpcId, state: WorldState, hour: number): string[] {
    const out: string[] = [];
    const i = this.peekTalk(npc, state);
    if (i !== null) {
      const t = TALKS[i]!;
      if (t.ask) out.push(t.ask);
      out.push(t.reply);
    }
    for (const b of BARKS) if (b.npc === npc && (!b.hours || inHours(hour, b.hours)) && evalAll(state, b.when)) out.push(b.line);
    for (const s of SCENES) {
      if (s.cast.includes(npc) && inHours(hour, s.hours) && evalAll(state, s.when)) out.push(...s.lines.filter((id) => VOICE_LINES[id]?.speaker === npc));
    }
    return out;
  }

  /** Talk to someone: their next exchange, unless one is still under way. A passing remark gives way to it. */
  talk(npc: NpcId, where: () => Vec3, state: WorldState): boolean {
    if ((this.held.get(npc) ?? 0) > this.clock || this.queue.some((q) => VOICE_LINES[q.line]?.speaker === npc)) return false;
    const i = this.nextTalk(npc, state);
    if (i === null) return false;
    const t = TALKS[i]!;
    if (this.busyFor(npc) > 0) {
      this.hooks.hush?.(npc);
      this.busy.delete(npc);
    }
    const steps: SpeechStep[] = [];
    if (t.ask) steps.push({ line: t.ask });
    steps.push({ line: t.reply, where });
    this.enqueueChain([npc], steps, this.clock + this.busyFor('hero'), true, i);
    this.update(0);
    return true;
  }

  /** A passing remark: said now unless they are already speaking; the words show in a bubble, not a caption. */
  remark(npc: NpcId, line: string, at: Vec3 | (() => Vec3)): number {
    if (this.busyFor(npc) > 0 || !VOICE_LINES[line]) return 0;
    // Nor over a conversation or another resident (A96 scout): a bystander barked over the player's conversation, and two
    // barks overlapped. A passing remark may still come while the hero is talking to himself.
    if ([...this.held.values()].some((t) => t > this.clock) || [...this.busy].some(([who, t]) => who !== 'hero' && t > this.clock)) return 0;
    // A remark whose voice is not ready is simply not made; there will be another.
    const said = this.hooks.say(line, at);
    if (said === null) return 0;
    const seconds = said ?? this.length(line);
    this.busy.set(npc, this.clock + seconds);
    return seconds;
  }

  /** Whether two people may start a scene now: not overheard yet today, neither of them busy. */
  sceneDue(scene: Scene, day: number): boolean {
    if (this.scenes.get(scene.id) === day) return false;
    // Nor over the player's conversation with someone else, as remarks already wait (A104 scout: the square's evening
    // scene began over the hero's question to Darin).
    if ([...this.held.values()].some((t) => t > this.clock)) return false;
    return !scene.cast.some((n) => (this.held.get(n) ?? 0) > this.clock || this.busyFor(n) > 0 || this.queue.some((q) => VOICE_LINES[q.line]?.speaker === n));
  }

  /** Two people talk between themselves, each line from where its speaker stands. */
  scene(scene: Scene, day: number, where: (npc: NpcId) => Vec3): boolean {
    if (!this.sceneDue(scene, day)) return false;
    this.scenes.set(scene.id, day);
    const steps = scene.lines.map((id) => {
      const speaker = VOICE_LINES[id]!.speaker as NpcId;
      return { line: id, where: () => where(speaker) };
    });
    // Not over the hero (A96 scout): the quarry's scene began over his remark on reaching the quarry.
    const hero = this.busyFor('hero');
    this.enqueueChain(scene.cast, steps, this.clock + (hero > 0 ? hero + ANSWER_GAP : SPEECH.sceneLead), false);
    this.update(0);
    return true;
  }

  /**
   * The hero remarks on something. A cue is said once unless `again` allows it after a cooldown; a cue with several
   * lines takes them in turn. Never over another of the hero's lines.
   */
  hero(cue: HeroCue, { delay = 0, again = 0 }: { delay?: number; again?: number } = {}): boolean {
    const lines = HERO_LINES[cue];
    if (!lines?.length) return false;
    if (again > 0) {
      const last = this.lastCue.get(cue);
      if (last !== undefined && this.clock - last < again) return false;
    } else if (this.said.has(cue)) return false;
    if (delay === 0 && this.busyFor('hero') > 0) return false;
    const k = this.turns.get(cue) ?? 0;
    const last = this.lastCue.get(cue);
    this.turns.set(cue, k + 1);
    this.said.add(cue);
    this.lastCue.set(cue, this.clock);
    // What it was before, so a remark dropped unheard can be said again later (A71).
    this.queue.push({ at: this.clock + delay, line: lines[k % lines.length]!, remark: { until: this.clock + delay + SPEECH.remarkWait, cue, last, turn: k, once: again === 0 } });
    this.update(0);
    return true;
  }

  /** Advance the game clock and start the lines that are due. */
  update(dt: number) {
    this.clock += dt;
    for (const chain of this.chains) if (!chain.pending && chain.until <= this.clock) this.chains.delete(chain);
    this.syncHeld();
    this.queue.sort((a, b) => a.at - b.at);
    while (this.queue.length && this.queue[0]!.at <= this.clock + 1e-9) {
      const q = this.queue.shift()!;
      const line = VOICE_LINES[q.line];
      if (!line) continue;
      if (q.chain?.after) {
        const after = q.chain.after;
        if (after.pending || after.until + ANSWER_GAP > this.clock + 1e-9) {
          const at = after.pending ? this.clock + SPEECH.loadWait : after.until + ANSWER_GAP;
          this.defer(q, at);
          continue;
        }
        q.chain.after = undefined;
      }
      if (q.remark) {
        // Never over a conversation or over himself: later, while it is still worth saying.
        const free = Math.max(this.busy.get('hero') ?? 0, ...[...this.held.values()]);
        if (free > this.clock) {
          // A once-only remark waits as long as it must (A96 scout): its moment never comes again, so dropped it was lost.
          if (free + SPEECH.remarkRetry <= q.remark.until || q.remark.once) this.queue.push({ ...q, at: free + SPEECH.remarkRetry });
          else this.unsay(q);
          this.queue.sort((a, b) => a.at - b.at);
          continue;
        }
      }
      // The voice follows its speaker, who may walk on while saying it (A70).
      let seconds = this.hooks.say(q.line, q.where);
      if (seconds === undefined) seconds = this.length(q.line);
      if (seconds === null) {
        // Its voice is on its way: wait a moment, then go ahead without it if need be.
        if ((q.tries ?? 0) < LOAD_TRIES) {
          this.defer({ ...q, tries: (q.tries ?? 0) + 1 }, this.clock + SPEECH.loadWait);
          continue;
        }
        seconds = this.length(q.line);
      }
      const until = this.clock + seconds;
      this.busy.set(line.speaker, Math.max(this.busy.get(line.speaker) ?? 0, until));
      if (q.chain) {
        // Only schedule the next turn after this one starts. Loading and playback durations can both differ from
        // the estimate, so no answer or later scene line can overtake its predecessor.
        this.reserve(q.chain, this.clock, seconds);
        const next = q.chain.remaining.shift();
        if (next) this.queue.push({ ...next, at: until + ANSWER_GAP, chain: q.chain });
        else {
          q.chain.pending = false;
          q.chain.until = until;
          if (q.chain.talk !== undefined) this.heard.add(q.chain.talk);
        }
        this.syncHeld();
        this.queue.sort((a, b) => a.at - b.at);
      }
      this.hooks.caption(line.speaker, shown(line.text), seconds);
    }
  }

  /**
   * Forget the queue (a load, a new game, the title). What has been heard stays heard this session. A pause (a panel, a
   * hidden page, a fall) keeps the hero's once-only remarks still waiting: their moment does not come again (A96 scout).
   */
  clear({ keepRemarks = false }: { keepRemarks?: boolean } = {}) {
    // Forgetting scheduling metadata must also stop the sources belonging to the old session.
    for (const speaker of this.busy.keys()) this.hooks.hush?.(speaker);
    const kept = keepRemarks ? this.queue.filter((q) => q.remark?.once) : [];
    // A hero remark still waiting was never heard, so it is not yet said (A71).
    for (const q of this.queue.slice().reverse()) if (!kept.includes(q)) this.unsay(q);
    this.queue = kept.map((q) => ({ ...q, at: Math.max(q.at, this.clock + SPEECH.resumeDelay) }));
    this.busy.clear();
    this.held.clear();
    this.chains.clear();
  }

  /**
   * A new journey (A86 scout): forget the queue and everything heard and said, so its arrival remarks and each person's
   * first words are spoken again. A load keeps them (clear), as the same journey goes on.
   */
  forget() {
    this.clear();
    this.heard.clear(); this.turns.clear(); this.cycles.clear(); this.scenes.clear(); this.said.clear(); this.lastCue.clear();
  }

  /** Undo a hero remark's bookkeeping when it is dropped before it started (A71). */
  private unsay(q: Queued) {
    const cue = q.remark?.cue;
    if (cue === undefined) return;
    if (q.remark!.last === undefined) {
      this.said.delete(cue);
      this.lastCue.delete(cue);
    } else this.lastCue.set(cue, q.remark!.last);
    this.turns.set(cue, q.remark!.turn ?? 0);
  }

  private enqueueChain(cast: readonly NpcId[], steps: SpeechStep[], at: number, interaction: boolean, talk?: number) {
    const first = steps.shift();
    if (!first) return;
    const after = interaction ? [...this.chains].filter((c) => c.interaction && (c.pending || c.until > this.clock)).at(-1) : undefined;
    const chain: SpeechChain = { cast, remaining: steps, pending: true, until: at, interaction, after, talk };
    this.chains.add(chain);
    this.reserve(chain, Math.max(at, after?.until ?? at), this.length(first.line));
    this.queue.push({ ...first, at, chain });
  }

  private reserve(chain: SpeechChain, at: number, seconds: number) {
    chain.until = at + seconds + chain.remaining.reduce((sum, step) => sum + ANSWER_GAP + this.length(step.line), 0);
    this.syncHeld();
  }

  private syncHeld() {
    this.held.clear();
    for (const chain of this.chains) {
      const until = chain.pending ? Math.max(chain.until, this.clock + SPEECH.loadWait) : chain.until;
      for (const npc of chain.cast) this.held.set(npc, Math.max(this.held.get(npc) ?? 0, until));
    }
  }

  private defer(q: Queued, at: number) {
    if (q.chain) this.reserve(q.chain, at, this.length(q.line));
    this.queue.push({ ...q, at });
    this.queue.sort((a, b) => a.at - b.at);
  }

  private length(line: string): number {
    return this.recorded(line) ?? SPEECH.unvoiced.least + (VOICE_LINES[line]?.text.length ?? 0) / SPEECH.unvoiced.charactersPerSecond;
  }
}

/* ============================ When the occasions for speech come ============================ */

/** How long after its occasion the hero remarks on it (s). */
export const HERO_CUE_DELAY = {
  arrival: 3, arrivalBell: 11, dayPart: 1, inspect: 0.8, archive: 1.5, settled: 2, item: 0.6, place: 1.2, shortcut: 1, rite: 2, gate: 1, rescued: 2.5,
  beast: 0.7, victory: 0.8, respawn: 1,
} as const;
/** A remark that may come again does so no sooner than this (s): on his wounds, and on waking after a fall. */
export const HERO_CUE_AGAIN = { wounded: 40, respawn: 1 } as const;

/** Scenes to overhear are looked for this often (s). */
export const SCENE_CHECK_SECONDS = 0.5;

/** A passing remark's words stay above the speaker's head at least this long (ms), and this long after the voice ends. */
export const BUBBLE = { leastMs: 3600, tailMs: 800 } as const;

/**
 * What a witness to the forced shutter calls out, so the player knows he was seen: the shrine's warden shouts a voiced
 * line; anyone else only shows the waterkeeper's cry in a bubble, unvoiced.
 */
export function trespassOutcry(witness: NpcId): { voiced: true; line: 'tolan.bark.hey' } | { voiced: false; text: 'toast.warden.hey' } {
  return witness === 'shrine_warden' ? { voiced: true, line: 'tolan.bark.hey' } : { voiced: false, text: 'toast.warden.hey' };
}
export function bubbleMs(seconds: number): number {
  return Math.max(BUBBLE.leastMs, seconds * 1000 + BUBBLE.tailMs);
}

/** Nightfall and dawn are remarked on as they come: once each time the day turns, never on the first look at the sky. */
export function dayPartCue(wasNight: boolean | null, night: boolean): 'night' | 'dawn' | null {
  return wasNight !== null && night !== wasNight ? (night ? 'night' : 'dawn') : null;
}

/** His breath gives out as his health (a share, 0..1) falls through the wounded mark, while he lives. */
export function woundedNow(health: number, before: number, alive: boolean): boolean {
  return health < WOUNDED_BELOW && before >= WOUNDED_BELOW && alive;
}

/** What he says of a thing he comes by: the first blade has words of its own. */
export function itemCue(id: ItemId): HeroCue {
  return id === 'rusted_sword' ? 'blade' : (`item.${id}` as HeroCue);
}

/** A place is remarked on when it is discovered, but the archive's shelves only once it stands open. */
export function placeRemarked(place: PlaceId, archiveStandsOpen: boolean): boolean {
  return place !== 'archive' || archiveStandsOpen;
}

/** A remark the hero is to make, after its delay (s). */
export interface HeroRemark { cue: HeroCue; delay: number }

/**
 * What the hero says of something the story has just done: the valley settled, a reward or a find (each thing in it),
 * a place found (the archive only once it stands open), the shortcut and the rite, the gate braced or jammed, the
 * worker brought out. Everything else passes without a word from him.
 */
export function eventRemarks(event: GameEvent, facts: { archiveOpen: boolean }): HeroRemark[] {
  const d = HERO_CUE_DELAY;
  switch (event.t) {
    case 'phase': return event.phase === 'settled' ? [{ cue: 'settled', delay: d.settled }] : [];
    case 'grant': return (Object.keys(event.items) as ItemId[]).map((id) => ({ cue: `item.${id}` as HeroCue, delay: d.item }));
    case 'item': return event.delta > 0 ? [{ cue: itemCue(event.id), delay: d.item }] : [];
    case 'place': return placeRemarked(event.id, facts.archiveOpen) ? [{ cue: `place.${event.id}` as HeroCue, delay: d.place }] : [];
    case 'shortcut': return [{ cue: 'shortcut', delay: d.shortcut }];
    case 'rite': return [{ cue: 'rite', delay: d.rite }];
    case 'gate': return event.gate === 'stabilized' || event.gate === 'jammed' ? [{ cue: `gate.${event.gate}`, delay: d.gate }] : [];
    case 'worker_rescued': return [{ cue: 'rescued', delay: d.rescued }];
    default: return [];
  }
}

/** Things he gives up without a note: the brace he fits and the reed he offers, which the story marks, and arrows, spent by the dozen. */
export const UNNOTED_LOSSES: readonly ItemId[] = ['sluice_brace', 'votive_reed', 'arrow'];

/** A hostile's cry as it closes, and what he says to it: the Thornback growls and he names the beast; a toll-jumper shouts. */
export function warCry(kind: EnemySpawn['kind']): { cry: 'growl' | 'shout'; remark: HeroRemark | null } {
  return kind === 'thornback' ? { cry: 'growl', remark: { cue: 'beast', delay: HERO_CUE_DELAY.beast } } : { cry: 'shout', remark: null };
}

/** The foe whose fall clears the cut: he marks it as a victory, and the valley hears the cut is cleared. */
export const CLEARING_FOE: EncounterId = 'cut_creature';

/** What he says as a foe falls: a victory over the cut's creature, nothing over another. */
export function defeatRemark(id: EncounterId): HeroRemark | null {
  return id === CLEARING_FOE ? { cue: 'victory', delay: HERO_CUE_DELAY.victory } : null;
}

/** A resident as a scene needs to know them. */
export interface SceneResident { id: NpcId; x: number; z: number; hidden: boolean; asleep: boolean; underway: boolean }

/**
 * The scenes that could be overheard now, in their order: at their hours and with their conditions met, both people
 * here, awake, about and at their places (nobody is stopped mid-route to talk), within calling distance of each
 * other, and the listener near enough to the middle of them. Whether one begins is the director's to say.
 */
export function* scenesInEarshot<R extends SceneResident>(state: WorldState, hour: number, find: (id: NpcId) => R | undefined,
  listener: { x: number; z: number }): Generator<{ scene: Scene; a: R; b: R }> {
  for (const scene of SCENES) {
    if (!inHours(hour, scene.hours) || !evalAll(state, scene.when)) continue;
    const [a, b] = scene.cast.map((id) => find(id));
    if (!a || !b || a.hidden || b.hidden || a.asleep || b.asleep || !state.npcs[a.id].available || !state.npcs[b.id].available) continue;
    if (a.underway || b.underway) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) > SCENE_REACH) continue;
    if (Math.hypot(listener.x - (a.x + b.x) / 2, listener.z - (a.z + b.z) / 2) > OVERHEAR_REACH) continue;
    yield { scene, a, b };
  }
}
