import { fieldAccentBuffers, type FieldAccent } from './fieldAudio';
import { gameFile } from './files';
import { catalogue, sampleRate, type Cue, type SpokenPart } from './reading';

const base = 'assets/audio/vale/';
export type MixLevels = { voice: number; music: number; effects: number };
export const defaultMix: MixLevels = { voice: 1, music: 0.62, effects: 0.82 };
type Loop = { source: AudioBufferSourceNode; gain: GainNode };
type RoomMaterial = 'timber' | 'stone';
type RoomBus = 'voice' | 'effects';
type ImpactFocus = 'contact' | 'defeat';

// Extra path lengths in metres for the left and right ears, followed by reflected gain.
// The direct signal travels separately. Timber absorbs more of the high end than stone.
const reflections: Record<RoomMaterial, readonly (readonly [number, number, number])[]> = {
  timber: [
    [3.8, 4.7, 0.085],
    [7.5, 6.3, 0.041],
    [11.2, 13.3, 0.021],
  ],
  stone: [
    [6.4, 8.2, 0.15],
    [13.8, 11.1, 0.085],
    [19.6, 23.4, 0.052],
    [29.3, 33.2, 0.029],
    [39.8, 37.5, 0.014],
  ],
};

function roomImpulse(ctx: AudioContext, material: RoomMaterial) {
  const paths = reflections[material];
  const longest = Math.max(...paths.map(([l, r]) => Math.max(l, r)));
  const rate = ctx.sampleRate;
  const decay = Math.exp((-2 * Math.PI * (material === 'timber' ? 1900 : 4700)) / rate);
  const tail = Math.ceil(rate * 0.001);
  const buffer = ctx.createBuffer(2, Math.ceil((rate * longest) / 343) + tail + 1, rate);
  for (const ear of [0, 1] as const) {
    const samples = buffer.getChannelData(ear);
    for (const path of paths) {
      const start = Math.round((path[ear] * rate) / 343);
      let level = path[2] * (1 - decay);
      for (let i = 0; i < tail; i++) {
        samples[start + i] = samples[start + i]! + level;
        level *= decay;
      }
    }
  }
  return buffer;
}

/** One gesture-unlocked graph. All sources and file URLs also work inside the standalone edition. */
export class Mixer {
  private context?: AudioContext;
  private master?: GainNode;
  private buses?: Record<'voice' | 'music' | 'air' | 'effects', GainNode>;
  private focus?: Record<'music' | 'air', GainNode>;
  private defeatFocusUntil = 0;
  private accents?: Record<FieldAccent, AudioBuffer>;
  private accentTurn = 0;
  private files = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer>>();
  private memory = 0;
  private loops = new Map<string, Loop>();
  private fading = new Set<AudioBufferSourceNode>();
  private desired: Record<string, string> = {};
  private effects = new Set<AudioBufferSourceNode>();
  room?: RoomMaterial;
  private interiors = new Map<
    RoomMaterial,
    { impulse: AudioBuffer; returns: Partial<Record<RoomBus, ConvolverNode>> }
  >();
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
        // Keep rare stacks of hits, music and world sound from overloading the output.
        const peakGuard = ctx.createDynamicsCompressor();
        peakGuard.threshold.value = -3;
        peakGuard.knee.value = 6;
        peakGuard.ratio.value = 12;
        peakGuard.attack.value = 0.003;
        peakGuard.release.value = 0.11;
        this.master.connect(peakGuard).connect(ctx.destination);
        const bus = (output: AudioNode = this.master!) => {
          const g = ctx.createGain();
          g.connect(output);
          return g;
        };
        this.focus = { music: bus(), air: bus() };
        this.buses = { voice: bus(), music: bus(this.focus.music), air: bus(this.focus.air), effects: bus() };
        this.mix();
      }
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
      this.accents ??= fieldAccentBuffers(this.context);
    } catch {
      /* Text and controls remain accessible on devices without audio output. */
    }
  }
  private reflect(source: AudioNode, bus: RoomBus, material: RoomMaterial | undefined) {
    if (!material) return;
    const ctx = this.context!;
    let interior = this.interiors.get(material);
    if (!interior) {
      interior = { impulse: roomImpulse(ctx, material), returns: {} };
      this.interiors.set(material, interior);
    }
    let send = interior.returns[bus];
    if (!send) {
      send = ctx.createConvolver();
      send.normalize = false;
      send.buffer = interior.impulse;
      send.connect(this.buses![bus]);
      interior.returns[bus] = send;
    }
    source.connect(send);
  }
  private mix() {
    if (!this.context || !this.master || !this.buses) return;
    const t = this.context.currentTime;
    const target = (node: GainNode, value: number, seconds: number) =>
      node.gain.setTargetAtTime(value, t, seconds);
    target(this.master, this.volume, 0.025);
    target(this.buses.voice, this.levels.voice, 0.025);
    const voiced = !!this.voice;
    target(this.buses.music, this.levels.music * (voiced ? 0.24 : 0.72), voiced ? 0.07 : 0.32);
    target(this.buses.air, this.levels.effects * (voiced ? 0.36 : 0.68), voiced ? 0.08 : 0.33);
    target(this.buses.effects, this.levels.effects * (voiced ? 0.72 : 1), voiced ? 0.045 : 0.16);
  }
  private focusImpact(kind: ImpactFocus, gain: number) {
    const focus = this.focus;
    if (!focus) return;
    const now = this.context!.currentTime;
    if (kind === 'contact' && now < this.defeatFocusUntil) return;
    const defeat = kind === 'defeat';
    const attack = defeat ? 0.018 : 0.008;
    const hold = defeat ? 0.096 : 0.032;
    const recovery = defeat ? 0.096 : 0.065;
    if (defeat) this.defeatFocusUntil = now + hold + 2 * recovery;
    for (const bus of ['music', 'air'] as const) {
      const param = focus[bus].gain;
      const depth = bus === 'music' ? (defeat ? 0.39 : 0.15) : (defeat ? 0.28 : 0.08);
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
      else {
        const value = param.value;
        param.cancelScheduledValues(now);
        param.setValueAtTime(value, now);
      }
      const target = 1 - depth * Math.min(1, gain);
      param.linearRampToValueAtTime(target, now + attack);
      param.setValueAtTime(target, now + hold);
      param.setTargetAtTime(1, now + hold, recovery);
    }
  }
  private resetFocus() {
    if (!this.focus) return;
    this.defeatFocusUntil = 0;
    const now = this.context!.currentTime;
    for (const node of Object.values(this.focus)) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(1, now);
    }
  }
  setVolume(n: number) {
    this.volume = n;
    if (!n) {
      this.stopVoice();
      this.resetFocus();
    }
    this.mix();
  }
  setLevels(levels: MixLevels) {
    this.levels = levels;
    if (!levels.voice) this.stopVoice();
    if (!levels.effects) this.resetFocus();
    this.mix();
  }
  private cached(file: string) {
    const ready = this.files.get(file);
    if (ready) {
      this.files.delete(file);
      this.files.set(file, ready);
    }
    return ready;
  }
  private buffer(file: string): Promise<AudioBuffer> {
    const ready = this.cached(file);
    if (ready) return Promise.resolve(ready);
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
        if (part.inWorld) this.reflect(source, 'voice', this.room);
        source.onended = () => {
          source.disconnect();
          if (generation !== this.generation) return;
          this.voice = undefined;
          this.mix();
          void next(index + 1);
        };
        source.start(0, part.cue[1] / sampleRate, part.cue[2] / sampleRate);
        this.voice = source;
        this.mix();
        if (part.caption !== undefined) this.caption(part.caption);
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
  private get canPlayEffect() {
    return !!this.context && !!this.buses && this.volume > 0 && this.levels.effects > 0 && !document.hidden;
  }
  preloadEffects(cues: readonly Cue[]) {
    if (!this.canPlayEffect) return false;
    const files = new Set(cues.map((cue) => this.file(cue)));
    for (const file of files) void this.buffer(file).catch(() => {});
    return true;
  }
  private playEffect(
    buffer: AudioBuffer,
    gain: number,
    pan: number,
    material: RoomMaterial | undefined,
    offset = 0,
    duration?: number,
    rate = 1
  ) {
    const ctx = this.context!,
      source = ctx.createBufferSource(),
      level = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    level.gain.value = gain;
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(level).connect(stereo).connect(this.buses!.effects);
    this.reflect(stereo, 'effects', material);
    this.effects.add(source);
    source.onended = () => {
      this.effects.delete(source);
      source.disconnect();
      level.disconnect();
      stereo.disconnect();
    };
    if (duration === undefined) source.start();
    else source.start(0, offset, duration);
  }
  playMenu(accent: 'menuOpen' | 'menuClose') {
    if (this.canPlayEffect && this.accents) this.playEffect(this.accents[accent], 0.62, 0, undefined);
  }
  playAccent(
    accent: FieldAccent,
    gain: number,
    pan: number,
    focus?: ImpactFocus,
    recording?: { cue: Cue; gain: number }
  ) {
    if (!this.canPlayEffect || !this.accents) return;
    const rate = 1 + (this.accentTurn++ % 5 - 2) * 0.018;
    this.playEffect(this.accents[accent], gain, pan, this.room, 0, undefined, rate);
    if (focus) this.focusImpact(focus, gain);
    if (!recording) return;
    const { cue } = recording;
    const file = this.file(cue);
    const ready = this.cached(file);
    if (ready) this.playEffect(ready, gain * recording.gain, pan, this.room, cue[1] / sampleRate, cue[2] / sampleRate);
    else void this.buffer(file).catch(() => {});
  }
  async effect(cue: Cue, gain: number, pan = 0, inWorld = true) {
    if (!this.canPlayEffect) return;
    const generation = this.worldGeneration;
    const material = inWorld ? this.room : undefined;
    const at = performance.now();
    try {
      const file = this.file(cue);
      const buffer = this.cached(file) ?? (await this.buffer(file));
      if (generation !== this.worldGeneration || performance.now() - at > 950 || !this.canPlayEffect) return;
      this.playEffect(buffer, gain, pan, material, cue[1] / sampleRate, cue[2] / sampleRate);
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
    this.room = undefined;
    this.stopVoice();
    this.resetFocus();
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
