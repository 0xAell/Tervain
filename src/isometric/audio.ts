import { VOICE_AUDIO, type StoryLineId } from '../presentation/sound/voiceManifest';
import { WORLD_AUDIO } from '../presentation/sound/worldAudioManifest';
import { hourOfDay } from '../core/game/state';
import { distance, groundAt } from './land';
import { onBridge, wetPoint } from './water';
import { gameFile } from './files';
import type { Valley } from './simulation';

const stepMaterial: Record<string, string> = {
  trail: 'dirt',
  woodland: 'grass',
  rock: 'gravel',
  floor: 'wood',
  field: 'grass',
};
interface Cue {
  file: string;
  start: number;
  length: number;
}
class Channel {
  private element = new Audio();
  private generation = 0;
  private end = 0;
  private timer = 0;
  private asset = '';
  constructor() {
    this.element.ontimeupdate = () => {
      if (this.end && this.element.currentTime >= this.end) this.element.pause();
    };
  }
  stop() {
    this.generation++;
    window.clearTimeout(this.timer);
    this.element.pause();
  }
  play(cue: Cue, volume: number) {
    this.stop();
    const generation = this.generation,
      a = this.element;
    const start = () => {
      if (generation !== this.generation) return;
      this.end = cue.start + cue.length;
      a.currentTime = cue.start;
      a.volume = Math.min(1, volume);
      void a
        .play()
        .then(() => {
          if (this.generation === generation)
            this.timer = window.setTimeout(() => a.pause(), cue.length * 1000);
        })
        .catch(() => {});
    };
    if (this.asset !== cue.file) {
      this.asset = cue.file;
      a.src = gameFile(cue.file + (a.canPlayType('audio/ogg') ? '.ogg' : '.m4a'));
    }
    if (a.readyState >= 1) start();
    else a.addEventListener('loadedmetadata', start, { once: true });
  }
}
export class Sound {
  private music = new Audio();
  private air = new Audio();
  private tag = '';
  private airTag = '';
  private voice = new Channel();
  private strokes = [new Channel(), new Channel()];
  private serial = 0;
  private nextStep = 0;
  private lastWet: boolean | null = null;
  enabled = false;
  constructor(public volume: number) {
    this.music.loop = true;
    this.air.loop = true;
    this.setVolume(volume);
  }
  setVolume(n: number) {
    this.volume = n;
    this.music.volume = n * 0.7;
    this.air.volume = n * 0.42;
    if (n === 0) {
      this.voice.stop();
      for (const c of this.strokes) c.stop();
    }
  }
  update(v: Valley) {
    if (!this.enabled) return;
    const night = hourOfDay(v.game.state.clock) < 6 || hourOfDay(v.game.state.clock) > 19,
      p = v.nearestPlace();
    const combat = v.actors.some((a) => a.enemy && !a.dead && distance(a, v.player) < 10);
    const track = combat
      ? 'timber'
      : night
        ? 'banked-embers'
        : p === 'deepwood'
          ? 'bough-watch'
          : p === 'spring_shrine'
            ? 'spring-stones'
            : p === 'shore' || p === 'lantern_point'
              ? 'riverbank'
              : 'lanterns';
    const air =
      p === 'shore' || p === 'lantern_point'
        ? 'lap'
        : p === 'deepwood'
          ? night
            ? 'forest_night'
            : 'forest_day'
          : p === 'quarry'
            ? 'quarry'
            : 'brook';
    const play = (a: HTMLAudioElement, file: string) => {
      a.src = gameFile('assets/audio/world/' + file + (a.canPlayType('audio/ogg') ? '.ogg' : '.m4a'));
      void a.play().catch(() => {});
    };
    if (this.tag !== track) {
      this.tag = track;
      play(this.music, 'ford/' + track);
    }
    if (this.airTag !== air) {
      this.airTag = air;
      play(this.air, 'loop-' + air);
    }
  }
  private one(bank: 'water' | 'steps', name: string, volume: number) {
    const source = WORLD_AUDIO.banks[bank];
    const clips = (source.clips as Record<string, readonly (readonly [number, number])[]>)[name];
    if (!clips) return;
    const cue = clips[this.serial % clips.length]!;
    this.strokes[this.serial++ % 2]!.play(
      { file: WORLD_AUDIO.base + source.file, start: cue[0], length: cue[1] },
      volume * this.volume
    );
  }
  movement(v: Valley) {
    if (!this.enabled || !this.volume) return;
    const p = v.player,
      wet = !!wetPoint(p.x, p.z) && !onBridge(p);
    if (this.lastWet !== null && wet !== this.lastWet)
      this.one('water', wet ? 'water.enter' : 'water.exit', 0.37);
    this.lastWet = wet;
    if (!v.walk || v.time < this.nextStep) return;
    if (wet) this.one('water', v.swimming ? 'water.swim' : 'water.wade', v.swimming ? 0.62 : 0.4);
    else {
      const material = onBridge(p) ? 'wood' : groundAt(p.x, p.z);
      this.one('steps', 'step.' + (stepMaterial[material] ?? material), 0.31);
    }
    this.nextStep = v.time + (v.swimming ? 0.85 : v.riding ? 0.36 : 0.48);
  }
  line(id: string) {
    if (!this.enabled || !this.volume) return;
    const cue = VOICE_AUDIO.story[id as StoryLineId];
    if (!cue) {
      this.voice.stop();
      return;
    }
    this.voice.play(
      { file: VOICE_AUDIO.base + VOICE_AUDIO.banks[cue[0]].file, start: cue[1], length: cue[2] },
      this.volume * 0.8
    );
  }
  endLine() {
    this.voice.stop();
  }
  reset() {
    this.lastWet = null;
    this.nextStep = 0;
    this.endLine();
  }
  stop() {
    this.reset();
    this.music.pause();
    this.air.pause();
    this.tag = '';
    this.airTag = '';
    for (const lane of this.strokes) lane.stop();
  }
}
