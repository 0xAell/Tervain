import { hourOfDay, evalAll } from '../core/game/state';
import { ANIMAL_SPECIES } from '../core/game/hunting';
import { worldView } from '../core/game/worldView';
import { ANCHORS, BUILDINGS } from '../core/world/layout';
import { S } from '../core/content/strings';
import { DIALOGUE_NODES } from '../core/content/dialogue';
import { HERO_LINES, SPEAKER_NAMES, TALKS, VOICE_LINES, shown, type HeroCue } from '../core/content/voice';
import { eligibleBarks } from '../core/rules/schedule';
import { eventRemarks, scenesInEarshot } from '../core/rules/speech';
import type { GameEvent, NpcId } from '../core/game/types';
import { catalogue, readText, type VoiceMode, type SpokenPart } from './reading';
import type { FieldAccent } from './fieldAudio';
import { defaultMix, Mixer } from './mixer';
import { distance, inBuilding } from './land';
import { onBridge, waterProfile, wetPoint } from './water';
import type { Activity, FieldSound } from './fieldcraft';
import type { Valley } from './simulation';

export type { MixLevels } from './mixer';
const stepMaterial: Record<string, string> = {
  trail: 'dirt',
  woodland: 'grass',
  rock: 'stone',
  gravel: 'stone',
  pottery: 'stone',
  metal: 'stone',
  floor: 'wood',
  field: 'grass',
};
const waterStep: Readonly<Record<string, string | undefined>> = {
  sea: 'water_swim', shallows: 'water_wade', river: 'water_wade', pool: 'water_wade',
};
function footstep(material: string) {
  const key = 'step.' + (stepMaterial[material] ?? material);
  return catalogue.effects[key] ? key : 'step.dirt';
}
const fieldAccents: Partial<Record<FieldSound, {
  accent: FieldAccent;
  gain: number;
  focus?: 'contact' | 'defeat';
  foley?: readonly [string, number];
}>> = {
  village_bell: { accent: 'villageBell', gain: 0.88 },
  rope_draw: { accent: 'ropeDraw', gain: 0.65 },
  bucket_dry: { accent: 'bucketDry', gain: 0.82 },
  bucket_water: { accent: 'bucketWater', gain: 0.88 },
  blade_swing: { accent: 'bladeSwing', gain: 0.76, foley: ['blade', 0.46] },
  unarmed_swing: { accent: 'handSwing', gain: 0.72 },
  blade_hit: { accent: 'bladeHit', gain: 1, focus: 'contact', foley: ['hit', 0.34] },
  unarmed_hit: { accent: 'bodyHit', gain: 0.94, focus: 'contact', foley: ['hit', 0.39] },
  hit: { accent: 'bodyHit', gain: 0.94, focus: 'contact', foley: ['hit', 0.39] },
  player_hit: { accent: 'playerHit', gain: 1.06, focus: 'contact', foley: ['hit', 0.45] },
  parry: { accent: 'parry', gain: 1.02, focus: 'contact', foley: ['block', 0.24] },
  counter_swing: { accent: 'counterSwing', gain: 0.79 },
  counter_hit: { accent: 'counterHit', gain: 1.04, focus: 'contact', foley: ['hit', 0.29] },
  block: { accent: 'guard', gain: 0.98, focus: 'contact', foley: ['block', 0.35] },
  enemy_windup: { accent: 'windup', gain: 0.58 },
  enemy_down: { accent: 'defeat', gain: 0.92, focus: 'defeat' },
  sidestep: { accent: 'sidestep', gain: 0.76 },
  thrust: { accent: 'thrust', gain: 0.83 },
  bow_focus: { accent: 'bowFocus', gain: 0.67 },
  focused_release: { accent: 'focusedRelease', gain: 0.94, foley: ['bow_release', 0.45] },
  focused_hit: { accent: 'focusedHit', gain: 0.92, focus: 'contact', foley: ['arrow_flesh', 0.42] },
  arrow_flesh: { accent: 'bodyHit', gain: 0.72, focus: 'contact', foley: ['arrow_flesh', 0.72] },
};
const fieldRecordings = ['blade', 'hit', 'block', 'bow_draw', 'bow_release', 'arrow_flesh', 'arrow_ground', 'step.dirt']
  .flatMap((key) => catalogue.effects[key] ?? []);
type Caption = (text: string) => void;
// World speech uses positive priorities and can always take over the interface reader.
const interfacePriority = 0;
const mill = BUILDINGS.find((building) => building.kind === 'mill')!;

export class Sound {
  readonly mixer: Mixer;
  private variant = 0;
  private lastStep = 0;
  private nextAnimal = 0;
  private nextVoice = 0;
  private challenges = new Set<string>();
  private lastThreat = 0;
  private activity?: Activity;
  private sounded = false;
  private room?: string;
  private wasWet: boolean | null = null;
  private wasJumping = false;
  private fieldAudioPrepared = false;
  private night: boolean | null = null;
  private pending?: { cue: HeroCue; due: number; expires: number };
  private heardTalks = new Set<number>();
  private scenes = new Set<string>();
  private turns = new Map<string, number>();
  private battleAccent = false;
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
    if (this.enabled && !this.fieldAudioPrepared) this.fieldAudioPrepared = this.mixer.preloadEffects(fieldRecordings);
  }
  titleMusic() {
    if (this.volume && !this.enabled)
      void this.mixer.loop('music', 'assets/audio/bell-road/overture.mp3');
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
  get worldNarration() {
    return this.mode === 'full' || this.mode === 'interface';
  }
  get readingInterface() {
    return this.mixer.speaking && this.mixer.speechPriority === interfacePriority;
  }
  readInterface(lines: string[]) {
    return this.mode === 'interface' && this.mixer.say(lines.flatMap(readText), interfacePriority);
  }
  stopInterface() {
    if (this.readingInterface) this.endLine();
  }
  narrate(text: string[], priority = 3) {
    if (!this.worldNarration) return false;
    return this.mixer.say(text.flatMap(readText), priority);
  }
  private actorPart(id: string): SpokenPart | undefined {
    const line = VOICE_LINES[id],
      cue = catalogue.lines[id];
    if (!line || !cue) return;
    return { cue, inWorld: true, caption: SPEAKER_NAMES[line.speaker] + ' · ' + shown(line.text) };
  }
  tell(ids: string[], priority = 2) {
    if (this.mode === 'off') return false;
    return this.mixer.say(
      ids.flatMap((id) => this.actorPart(id) ?? []),
      priority
    );
  }
  story(ids: string[], priority = 4) {
    if (this.mode === 'off') return false;
    const parts: SpokenPart[] = [];
    for (const id of ids) {
      const cue = catalogue.story[id];
      if (!cue) continue;
      const speaker = id.includes('#') ? 'hero' : DIALOGUE_NODES[id.slice(2)]?.speaker;
      const caption = speaker && speaker !== 'narrator' ? SPEAKER_NAMES[speaker] + ' · ' + S(id) : S(id);
      if (speaker !== 'narrator' || this.worldNarration)
        parts.push({ cue, caption, inWorld: !!speaker && speaker !== 'narrator' });
    }
    return this.mixer.say(parts, priority);
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
    if (event.t === 'autosave' && event.reason === 'encounter_cleared' && !v.actors.some(a =>
      a.enemy && !v.game.state.defeated[a.enemy] && distance(a,v.player) < 13)) {
      this.mixer.playAccent('roadCadence', 0.89, 0);
    }
    if (event.t === 'grant' && event.id === 'dry_bell_completion') this.reward();
    if (event.t === 'allocation')
      this.mixer.playAccent('villageBell', 0.72, 0);
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
    if (this.mode === 'off' || (this.mixer.speaking && !this.readingInterface)) return;
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
  private recordedEffect(key: string) {
    const options = catalogue.effects[key];
    return options?.length ? options[this.variant++ % options.length] : undefined;
  }
  private one(key: string, gain: number, pan = 0, inWorld = true) {
    const recorded = this.recordedEffect(key);
    if (recorded) void this.mixer.effect(recorded, gain, pan, inWorld);
  }
  page(name: string) {
    if (this.enabled) {
      const key = ({ inventory: 'bag', journal: 'page', map: 'map' } as Record<string, string>)[name];
      if (key) this.one(key, 0.33, 0, false);
      if (['inventory', 'journal', 'map', 'pause', 'saves', 'help', 'settings', 'play'].includes(name))
        this.mixer.playMenu(name === 'play' ? 'menuClose' : 'menuOpen');
    }
  }
  reward() {
    if (this.enabled) this.mixer.playAccent('gearEarned', 0.76, 0);
  }
  selection(equip = false) {
    if (this.enabled) this.mixer.playMenu(equip ? 'beltClasp' : 'menuChoose');
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
  engagement(v: Valley) {
    const a = v.combatTarget;
    if (!this.enabled || !this.volume || this.battleAccent || !a || a.dead) return;
    this.battleAccent = true;
    this.lastThreat = v.time;
    this.mixer.playAccent('windup', 0.48, 0);
    void this.mixer.loop('music', 'assets/audio/bell-road/' + (a.enemyKind === 'thornback' ? 'thorn' : 'ford') + '.mp3');
  }
  dialogueTick() {
    if (this.enabled && this.mode === 'off') this.mixer.playAccent('voiceTick', 0.65, 0);
  }
  field(cue: FieldSound, range = 0, pan = 0) {
    if (!this.enabled) return;
    if (cue === 'enemy_windup' && !this.battleAccent) {
      this.battleAccent = true;
      this.mixer.playAccent('windup', 0.48, pan);
      void this.mixer.loop('music', 'assets/audio/bell-road/ford.mp3');
    }
    const gain = 0.8 / (1 + range / 22);
    const layer = fieldAccents[cue];
    if (!layer) {
      this.one(cue, gain, pan);
      return;
    }
    const recorded = layer.foley && this.recordedEffect(layer.foley[0]);
    this.mixer.playAccent(
      layer.accent, gain * layer.gain, pan, layer.focus,
      recorded && layer.foley ? { cue: recorded, gain: layer.foley[1] } : undefined
    );
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
            [{ cue: challenge.cue, caption: challenge.speaker + ' · ' + challenge.text, inWorld: true }],
            3
          );
          if (spoke) this.challenges.add(foe.id);
        }
      }
    } else if (v.time - this.lastThreat > 45) this.challenges.clear();
    const pos = v.player;
    const riverside = !room && !coast && [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]
      .some(([x, z]) => !!wetPoint(pos.x + x!, pos.z + z!));
    const work = worldView(v.game.state);
    const millrace = work.millTurning && distance(pos, mill) < 18;
    const quarry = (work.quarryState === 'working' || work.quarryState === 'night_shift') && distance(pos, ANCHORS.quarry_face!) < 22;
    const threatened = !room && (combat || (this.lastThreat > 0 && v.time - this.lastThreat < 3));
    const score = threatened ? (enemies.some(a => a.key === 'thornback') ? 'thorn' : 'ford')
      : room ? (room.level === 'cellar' ? 'undercroft' : room.site.kind === 'shrine' ? 'hymn' : 'hearth')
      : v.game.state.quest.phase === 'settled' && place === 'rillford' ? 'homecoming'
      : night ? 'lamplight' : coast ? 'strand' : forest ? 'pines' : place === 'spring_shrine' ? 'hymn'
      : riverside || millrace ? 'water' : 'market';
    const air = room ? (room.level === 'cellar' ? 'vault' : 'rafters') : coast ? 'tideline'
      : millrace || riverside ? 'millrace' : night ? 'night' : place === 'rillford' || quarry ? 'square' : 'canopy';
    void this.mixer.loop('music', 'assets/audio/bell-road/' + score + '.mp3');
    void this.mixer.loop('air', 'assets/audio/bell-road/air-' + air + '.mp3');
    this.battleAccent = threatened;
    this.residents(v, night);
    if (!room && v.time >= this.nextAnimal && !v.activity && !combat) {
      const animal = v.actors
        .filter((a) => a.animal && !a.dead && a.key !== 'mount' && distance(pos, a) < 12)
        .sort((a, b) => distance(pos, a) - distance(pos, b))[0];
      if (animal) {
        const species = ANIMAL_SPECIES[animal.animal!];
        const voice = species === 'stag' ? 'deer' : species;
        const codec = document.createElement('audio').canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a';
        void this.mixer.recording(
          'audio/animals/' + voice + '-' + (1 + this.variant++ % 2) + '.' + codec,
          0.44 / (1 + distance(pos, animal) / 7),
          (animal.x - pos.x - animal.z + pos.z) / 16
        );
        this.nextAnimal = v.time + 17;
      }
    }
  }
  movement(v: Valley) {
    if (!this.enabled || !this.volume) {
      this.wasJumping = !!v.jump;
      this.wasWet = null;
      this.lastStep = v.gait.serial;
      return;
    }
    const room = v.room;
    if (this.room !== v.roomKey) {
      this.mixer.room = room ? (room.stone ? 'stone' : 'timber') : undefined;
      if (this.room !== undefined) {
        const stairs = room && this.room.split('/')[0] === room.site.id;
        this.one(stairs ? footstep(room.stone || room.level === 'cellar' ? 'stone' : 'wood') : 'door', 0.48);
      }
      this.room = v.roomKey;
      this.wasJumping = false;
      this.wasWet = null;
    }
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
      if (act.target.field === 'well' || act.target.field === 'bell') this.field('rope_draw');
      else this.one(key, 0.76);
    }
    const stepped = v.gait.serial !== this.lastStep;
    this.lastStep = v.gait.serial;
    const landing = this.wasJumping && !v.jump ? v.landing : undefined;
    if (v.jump && !this.wasJumping && v.player.health > 0) this.mixer.playAccent('jumpLift', 0.43, 0);
    this.wasJumping = !!v.jump;
    if (v.jump || v.player.health <= 0) return;

    const p = v.player;
    const supported = v.standingLift > 0.1 || (!room && onBridge(p));
    const bank = !room && !supported ? waterProfile(p.x, p.z)?.bank ?? -Infinity : -Infinity;
    // Give a planted foot a little width at the waterline so tiny reversals don't retrigger two splashes.
    const edge = landing || this.wasWet === null ? 0 : this.wasWet ? -0.14 : 0.14;
    const wet = bank > edge;
    if (landing) {
      const cue = this.recordedEffect(landing.wet ? 'water_enter' : footstep(landing.material));
      this.mixer.playAccent(landing.wet ? 'waterLanding' : 'groundLanding', 0.72, 0, undefined, cue && { cue, gain: 1 });
      // Grounded travel after touchdown can cross a bank before this frame is presented.
      this.wasWet = landing.wet;
    }
    if (this.wasWet !== null && wet !== this.wasWet) this.one(wet ? 'water_enter' : 'water_exit', 0.6);
    this.wasWet = wet;
    if (landing || !stepped || !v.walk) return;
    const waterCue = waterStep[v.gait.material];
    this.one(waterCue ?? footstep(v.gait.material), waterCue ? 0.62 : v.gait.speed > 6.4 ? 0.53 : 0.42);
  }
  reset() {
    this.mixer.reset();
    this.pending = undefined;
    this.lastStep = 0;
    this.nextAnimal = 9;
    this.nextVoice = 9;
    this.lastThreat = 0;
    this.battleAccent = false;
    this.challenges.clear();
    this.activity = undefined;
    this.room = undefined;
    this.wasWet = null;
    this.night = null;
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
