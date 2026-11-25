import { gameFile } from './files';
import { catalogue, sampleRate, type Cue, type SpokenPart } from './reading';

const base = 'assets/audio/vale/';
export type MixLevels = { voice: number; music: number; effects: number };
export const defaultMix: MixLevels = { voice: 1, music: 0.62, effects: 0.82 };
type Loop = { source: AudioBufferSourceNode; gain: GainNode };

/** One gesture-unlocked graph. All sources and file URLs also work inside the standalone edition. */
export class Mixer {
  private context?: AudioContext;
  private master?: GainNode;
  private buses?: Record<'voice' | 'music' | 'air' | 'effects', GainNode>;
  private files = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer>>();
  private memory = 0;
  private loops = new Map<string, Loop>();
  private fading = new Set<AudioBufferSourceNode>();
  private desired: Record<string, string> = {};
  private effects = new Set<AudioBufferSourceNode>();
  private voice?: AudioBufferSourceNode;
  private generation = 0;
  private worldGeneration = 0;
  private active = false;
  private currentPriority = 0;
  caption: (text: string) => void = () => {};
  constructor(
    private volume: number,
    private levels: MixLevels
  ) {}

  unlock() {
    try {
      if (!this.context) {
        const ctx = (this.context = new AudioContext());
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        const bus = () => {
          const g = ctx.createGain();
          g.connect(this.master!);
          return g;
        };
        this.buses = { voice: bus(), music: bus(), air: bus(), effects: bus() };
        this.mix();
      }
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
    } catch {
      /* Text and controls remain accessible on devices without audio output. */
    }
  }
  private mix() {
    if (!this.context || !this.master || !this.buses) return;
    const t = this.context.currentTime;
    const target = (node: GainNode, value: number, seconds: number) =>
      node.gain.setTargetAtTime(value, t, seconds);
    target(this.master, this.volume, 0.025);
    target(this.buses.voice, this.levels.voice, 0.025);
    target(this.buses.music, this.levels.music * (this.active ? 0.24 : 0.72), this.active ? 0.07 : 0.32);
    target(this.buses.air, this.levels.effects * (this.active ? 0.36 : 0.68), this.active ? 0.08 : 0.33);
    target(this.buses.effects, this.levels.effects * (this.active ? 0.72 : 1), 0.045);
  }
  setVolume(n: number) {
    this.volume = n;
    if (!n) this.stopVoice();
    this.mix();
  }
  setLevels(levels: MixLevels) {
    this.levels = levels;
    if (!levels.voice) this.stopVoice();
    this.mix();
  }
  private buffer(file: string): Promise<AudioBuffer> {
    const ready = this.files.get(file);
    if (ready) {
      this.files.delete(file);
      this.files.set(file, ready);
      return Promise.resolve(ready);
    }
    const pending = this.loading.get(file);
    if (pending) return pending;
    const ctx = this.context!;
    const task = fetch(gameFile(file))
      .then(async (r) => {
        if (!r.ok) throw Error('Audio unavailable: ' + file);
        return ctx.decodeAudioData(await r.arrayBuffer());
      })
      .then((buffer) => {
        this.files.set(file, buffer);
        this.memory += buffer.length * buffer.numberOfChannels * 4;
        while (this.memory > 52 * 1024 * 1024 && this.files.size > 1) {
          const [key, old] = this.files.entries().next().value!;
          this.memory -= old.length * old.numberOfChannels * 4;
          this.files.delete(key);
        }
        return buffer;
      })
      .finally(() => this.loading.delete(file));
    this.loading.set(file, task);
    return task;
  }
  get speaking() {
    return this.active;
  }
  get speechPriority() {
    return this.currentPriority;
  }
  private file(cue: Cue) {
    return base + catalogue.files[cue[0]]!;
  }
  say(parts: SpokenPart[], priority: number) {
    if (!parts.length || !this.context || !this.volume || !this.levels.voice || document.hidden) return false;
    if (this.active && priority < this.currentPriority) return false;
    this.stopVoice();
    const generation = this.generation;
    this.currentPriority = priority;
    this.active = true;
    this.mix();
    const next = async (index: number): Promise<void> => {
      if (generation !== this.generation) return;
      const part = parts[index];
      if (!part) {
        this.stopVoice();
        return;
      }
      try {
        const buffer = await this.buffer(this.file(part.cue));
        if (generation !== this.generation) return;
        const ctx = this.context!,
          source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.buses!.voice);
        this.voice = source;
        source.onended = () => {
          source.disconnect();
          if (generation === this.generation) void next(index + 1);
        };
        if (part.caption !== undefined) this.caption(part.caption);
        source.start(0, part.cue[1] / sampleRate, part.cue[2] / sampleRate);
        const after = parts[index + 1];
        if (after && after.cue[0] !== part.cue[0]) void this.buffer(this.file(after.cue)).catch(() => {});
      } catch {
        if (generation === this.generation) void next(index + 1);
      }
    };
    void next(0);
    return true;
  }
  stopVoice() {
    this.generation++;
    if (this.voice) {
      this.voice.onended = null;
      this.voice.stop();
      this.voice.disconnect();
      this.voice = undefined;
    }
    this.active = false;
    this.currentPriority = 0;
    this.caption('');
    this.mix();
  }
  async effect(cue: Cue, gain: number, pan = 0) {
    if (!this.context || !this.volume || !this.levels.effects || document.hidden) return;
    const generation = this.worldGeneration;
    const at = performance.now();
    try {
      const buffer = await this.buffer(this.file(cue)),
        ctx = this.context;
      if (generation !== this.worldGeneration || performance.now() - at > 950 || !this.volume) return;
      const source = ctx.createBufferSource(),
        level = ctx.createGain(),
        stereo = ctx.createStereoPanner();
      level.gain.value = gain;
      stereo.pan.value = Math.max(-1, Math.min(1, pan));
      source.buffer = buffer;
      source.connect(level).connect(stereo).connect(this.buses!.effects);
      this.effects.add(source);
      source.onended = () => {
        this.effects.delete(source);
        source.disconnect();
        level.disconnect();
        stereo.disconnect();
      };
      source.start(0, cue[1] / sampleRate, cue[2] / sampleRate);
    } catch {
      /* A missing effect cannot interrupt the game or another sound. */
    }
  }
  async loop(bus: 'music' | 'air', file: string) {
    if (!this.context || !this.volume || this.desired[bus] === file) return;
    const generation = this.worldGeneration;
    this.desired[bus] = file;
    try {
      const buffer = await this.buffer(file),
        ctx = this.context;
      if (generation !== this.worldGeneration || this.desired[bus] !== file) return;
      const source = ctx.createBufferSource(),
        gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      const now = ctx.currentTime,
        fade = bus === 'music' ? 1.35 : 0.85;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + fade);
      source.connect(gain).connect(this.buses![bus]);
      source.onended = () => {
        this.fading.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
      const previous = this.loops.get(bus);
      this.loops.set(bus, { source, gain });
      if (previous) {
        this.fading.add(previous.source);
        const level = previous.gain.gain;
        if (typeof level.cancelAndHoldAtTime === 'function') level.cancelAndHoldAtTime(now);
        else {
          const value = level.value;
          level.cancelScheduledValues(now);
          level.setValueAtTime(value, now);
        }
        previous.gain.gain.linearRampToValueAtTime(0, now + fade);
        previous.source.stop(now + fade + 0.015);
      }
    } catch {
      if (generation === this.worldGeneration && this.desired[bus] === file) delete this.desired[bus];
    }
  }
  reset() {
    this.stopVoice();
    this.worldGeneration++;
    for (const { source } of this.loops.values()) source.stop();
    this.loops.clear();
    for (const source of this.fading) source.stop();
    this.fading.clear();
    this.desired = {};
    for (const source of this.effects) source.stop();
    this.effects.clear();
  }
  sleep() {
    this.reset();
    if (this.context) void this.context.suspend().catch(() => {});
  }
}
