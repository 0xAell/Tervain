import { hourOfDay, evalAll } from '../core/game/state';
import { S } from '../core/content/strings';
import { DIALOGUE_NODES } from '../core/content/dialogue';
import { HERO_LINES, SPEAKER_NAMES, TALKS, VOICE_LINES, shown, type HeroCue } from '../core/content/voice';
import { eligibleBarks } from '../core/rules/schedule';
import { eventRemarks, scenesInEarshot } from '../core/rules/speech';
import type { GameEvent, NpcId } from '../core/game/types';
import { catalogue, readText, type VoiceMode, type SpokenPart } from './reading';
import { defaultMix, Mixer } from './mixer';
import { distance, groundAt, inBuilding } from './land';
import { onBridge, wetPoint } from './water';
import type { Activity, FieldSound } from './fieldcraft';
import type { Valley } from './simulation';

export type { MixLevels } from './mixer';
const stepMaterial: Record<string, string> = {
  trail: 'dirt',
  woodland: 'grass',
  rock: 'stone',
  gravel: 'stone',
  floor: 'wood',
  field: 'grass',
};
type Caption = (text: string) => void;

export class Sound {
  readonly mixer: Mixer;
  private variant = 0;
  private nextStep = 0;
  private nextAnimal = 0;
  private nextVoice = 0;
  private challenges = new Set<string>();
  private lastThreat = 0;
  private activity?: Activity;
  private sounded = false;
  private room?: string;
  private wasWet: boolean | null = null;
  private wasStriking = false;
  private wasJumping = false;
  private night: boolean | null = null;
  private pending?: { cue: HeroCue; due: number; expires: number };
  private heardTalks = new Set<number>();
  private scenes = new Set<string>();
  private turns = new Map<string, number>();
  private format = new Audio().canPlayType('audio/ogg; codecs="opus"') ? '.ogg' : '.m4a';
  enabled = false;
  constructor(
    public volume: number,
    public mode: VoiceMode = 'full',
    levels = { ...defaultMix }
  ) {
    this.mixer = new Mixer(volume, levels);
  }
  unlock() {
    this.mixer.unlock();
  }
  titleMusic() {
    if (this.volume && !this.enabled)
      void this.mixer.loop('music', 'assets/audio/vale/' + catalogue.music['first-light']);
  }
  setCaption(callback: Caption) {
    this.mixer.caption = callback;
  }
  setVolume(n: number) {
    this.volume = n;
    this.mixer.setVolume(n);
  }
  endLine() {
    this.mixer.stopVoice();
  }
  read(text: string[], priority = 3) {
    if (this.mode !== 'full') return false;
    return this.mixer.say(text.flatMap(readText), priority);
  }
  private actorPart(id: string): SpokenPart | undefined {
    const line = VOICE_LINES[id],
      cue = catalogue.lines[id];
    if (!line || !cue) return;
    return { cue, caption: SPEAKER_NAMES[line.speaker] + ' · ' + shown(line.text) };
  }
  tell(ids: string[], priority = 2) {
    if (this.mode === 'off') return false;
    return this.mixer.say(
      ids.flatMap((id) => this.actorPart(id) ?? []),
      priority
    );
  }
  story(ids: string[], priority = 4) {
    if (this.mode === 'off') return;
    const parts: SpokenPart[] = [];
    for (const id of ids) {
      const cue = catalogue.story[id];
      if (!cue) continue;
      const speaker = id.includes('#') ? 'hero' : DIALOGUE_NODES[id.slice(2)]?.speaker;
      const caption = speaker && speaker !== 'narrator' ? SPEAKER_NAMES[speaker] + ' · ' + S(id) : S(id);
      parts.push({ cue, caption });
    }
    this.mixer.say(parts, priority);
  }
  readPage(parts: SpokenPart[]) {
    if (this.mode === 'full') this.mixer.say(parts, 5);
  }
  more(npc: NpcId, v: Valley) {
    const eligible = TALKS.map((talk, i) => ({ talk, i })).filter(
      ({ talk }) => talk.npc === npc && evalAll(v.game.state, talk.when)
    );
    const pick =
      eligible.find(({ i }) => !this.heardTalks.has(i)) ??
      eligible.find(({ talk }) => talk.again) ??
      eligible[0];
    if (!pick) return;
    this.heardTalks.add(pick.i);
    return pick.talk.ask ? [pick.talk.ask, pick.talk.reply] : [pick.talk.reply];
  }
  private cycle(key: string, size: number) {
    const n = this.turns.get(key) ?? 0;
    this.turns.set(key, n + 1);
    return n % size;
  }
  private remark(cue: HeroCue, now: number, delay = 0.7) {
    if (HERO_LINES[cue]?.length) this.pending = { cue, due: now + delay, expires: now + 18 };
  }
  event(event: GameEvent, v: Valley) {
    if (event.t === 'equipment' && event.item) this.one('equip', 0.36);
    if (event.t === 'item' && event.id === 'coin') this.one('coins', 0.42);
    if (event.t === 'rite' || event.t === 'gate') this.one(event.t, 0.6);
    for (const r of eventRemarks(event, {
      archiveOpen: v.game.state.locationChanges.archive_door === 'open',
    }))
      this.remark(r.cue, v.time, r.delay);
  }
  private residents(v: Valley, night: boolean) {
    if (this.night !== null && this.night !== night) this.remark(night ? 'night' : 'dawn', v.time);
    this.night = night;
    if (this.mode === 'off' || this.mixer.speaking) return;
    const pending = this.pending;
    if (pending && v.time >= pending.due) {
      this.pending = undefined;
      const lines = HERO_LINES[pending.cue];
      if (v.time <= pending.expires && lines && this.tell([lines[this.cycle(pending.cue, lines.length)]!]))
        return;
    }
    if (v.room || v.time < this.nextVoice || v.bow || v.activity) return;
    this.nextVoice = v.time + 6;
    const live = v.actors.filter((a) => a.npc && !a.dead && !inBuilding(a));
    const hour = hourOfDay(v.game.state.clock);
    for (const { scene } of scenesInEarshot(
      v.game.state,
      hour,
      (id) => {
        const a = live.find((actor) => actor.npc === id);
        return a && { id, x: a.x, z: a.z, hidden: false, asleep: a.posture === 'rest', underway: a.move };
      },
      v.player
    )) {
      const today = scene.id + '/' + Math.floor(v.game.state.clock / 1440);
      if (!this.scenes.has(today) && this.tell(scene.lines, 1)) {
        this.scenes.add(today);
        this.nextVoice = v.time + 35;
        return;
      }
    }
    const near = live
      .filter((a) => a.posture !== 'rest' && distance(a, v.player) < 6)
      .sort((a, b) => distance(a, v.player) - distance(b, v.player))[0];
    if (!near?.npc) return;
    const pool = eligibleBarks(near.npc, v.game.state, hour);
    if (pool.length && this.tell([pool[this.cycle(near.npc, pool.length)]!.line], 1))
      this.nextVoice = v.time + 38;
  }
  private one(key: string, gain: number, pan = 0) {
    const options = catalogue.effects[key];
    if (!options?.length) return;
    void this.mixer.effect(options[this.variant++ % options.length]!, gain, pan);
  }
  page(name: string) {
    if (this.enabled) {
      const key = ({ inventory: 'bag', journal: 'page', map: 'map' } as Record<string, string>)[name];
      if (key) this.one(key, 0.45);
    }
  }
  contact(
    material: import('./propPhysics').ContactSound,
    energy: number,
    at: { x: number; z: number },
    listener: { x: number; z: number }
  ) {
    if (!this.enabled) return;
    const dx = at.x - listener.x,
      dz = at.z - listener.z,
      range = Math.hypot(dx, dz);
    const cue = material === 'splash' ? 'water_enter' : 'cargo.' + material;
    this.one(
      cue,
      (0.22 + 0.68 * energy) / (1 + range * 0.085),
      Math.max(-0.85, Math.min(0.85, (dx - dz) * 0.065))
    );
  }
  field(cue: FieldSound, range = 0) {
    if (this.enabled) this.one(cue, 0.8 / (1 + range / 22));
  }
  update(v: Valley) {
    if (!this.enabled || !this.volume) return;
    const hour = hourOfDay(v.game.state.clock),
      night = hour < 6 || hour > 19,
      place = v.nearestPlace(),
      room = v.room;
    const coast = place === 'shore' || place === 'lantern_point',
      forest = place === 'deepwood';
    const enemies = room ? [] : v.actors.filter((a) => a.enemy && !a.dead && distance(a, v.player) < 12);
    const combat = enemies.length > 0;
    if (combat) {
      this.lastThreat = v.time;
      for (const foe of enemies) {
        if (this.challenges.has(foe.id)) continue;
        const challenge = catalogue.encounters[foe.id];
        if (foe.key === 'thornback') {
          this.challenges.add(foe.id);
          this.one('thornback', 0.72);
          this.remark('beast', v.time, 1);
        } else if (challenge && this.mode !== 'off' && this.mixer.speechPriority < 3) {
          const spoke = this.mixer.say(
            [{ cue: challenge.cue, caption: challenge.speaker + ' · ' + challenge.text }],
            3
          );
          if (spoke) this.challenges.add(foe.id);
        }
      }
    } else if (v.time - this.lastThreat > 45) this.challenges.clear();
    const music = combat
      ? 'timber'
      : night
        ? 'banked-embers'
        : forest
          ? 'bough-watch'
          : place === 'spring_shrine'
            ? 'spring-stones'
            : coast
              ? 'riverbank'
              : 'lanterns';
    const pos = v.player;
    const riverside =
      !room &&
      !coast &&
      (
        [
          [0, 0],
          [5, 0],
          [-5, 0],
          [0, 5],
          [0, -5],
        ] as const
      ).some(([x, z]) => !!wetPoint(pos.x + x, pos.z + z));
    const air = room
      ? room.level === 'cellar'
        ? 'cellar'
        : room.level === 'ground' && v.lightsOn
          ? 'hearth'
          : 'interior'
      : coast
        ? 'coast'
        : riverside
          ? 'river'
          : night
            ? 'night'
            : forest
              ? 'woodland'
              : place === 'quarry'
                ? 'quarry'
                : place === 'rillford'
                  ? 'village'
                  : 'woodland';
    const score = room ? 'hearthside' : riverside && !combat && !night ? 'reedwater' : undefined;
    void this.mixer.loop(
      'music',
      score ? 'assets/audio/vale/' + catalogue.music[score] : 'assets/audio/world/ford/' + music + this.format
    );
    void this.mixer.loop('air', 'assets/audio/vale/' + catalogue.beds[air]);
    this.residents(v, night);
    if (!room && v.time >= this.nextAnimal && !v.activity && !combat) {
      const animal = v.actors
        .filter((a) => a.animal && !a.dead && a.key !== 'mount' && distance(pos, a) < 12)
        .sort((a, b) => distance(pos, a) - distance(pos, b))[0];
      if (animal) {
        this.one(
          'call.' + animal.key,
          0.44 / (1 + distance(pos, animal) / 7),
          (animal.x - pos.x - animal.z + pos.z) / 16
        );
        this.nextAnimal = v.time + 17;
      }
    }
  }
  movement(v: Valley) {
    if (!this.enabled || !this.volume) return;
    const act = v.activity;
    if (act !== this.activity) {
      this.activity = act;
      this.sounded = false;
    }
    if (act && !this.sounded && act.elapsed >= Math.min(0.38, act.duration * 0.28)) {
      this.sounded = true;
      const key =
        act.kind === 'pet'
          ? 'pet_' + act.target.animal?.key
          : act.kind === 'work' && act.target.fixture?.key.includes('loom')
            ? 'loom'
            : act.kind;
      this.one(key, 0.76);
    }
    if (this.room !== undefined && this.room !== v.roomKey) this.one('door', 0.48);
    this.room = v.roomKey;
    if (v.strike && !this.wasStriking) this.one('blade', 0.68);
    this.wasStriking = !!v.strike;
    if (this.wasJumping && !v.jump) this.one('land', 0.58);
    this.wasJumping = !!v.jump;
    const p = v.player,
      wet = !v.room && !!wetPoint(p.x, p.z) && !onBridge(p);
    if (this.wasWet !== null && wet !== this.wasWet) this.one(wet ? 'water_enter' : 'water_exit', 0.6);
    this.wasWet = wet;
    if (!v.walk || v.jump || v.time < this.nextStep) return;
    const material = v.room ? (v.room.stone ? 'stone' : 'wood') : onBridge(p) ? 'wood' : groundAt(p.x, p.z);
    const step = stepMaterial[material] ?? material;
    const key = wet ? (v.swimming ? 'water_swim' : 'water_wade') : 'step.' + step;
    this.one(catalogue.effects[key] ? key : 'step.dirt', wet ? 0.62 : 0.42);
    this.nextStep = v.time + (v.swimming ? 0.85 : v.riding ? 0.36 : 0.48);
  }
  reset() {
    this.mixer.reset();
    this.pending = undefined;
    this.nextStep = 0;
    this.nextAnimal = 9;
    this.nextVoice = 9;
    this.lastThreat = 0;
    this.challenges.clear();
    this.activity = undefined;
    this.room = undefined;
    this.wasWet = null;
    this.night = null;
    this.wasStriking = false;
    this.wasJumping = false;
    this.scenes.clear();
    this.heardTalks.clear();
    this.turns.clear();
  }
  stop() {
    this.reset();
    this.enabled = false;
  }
}
