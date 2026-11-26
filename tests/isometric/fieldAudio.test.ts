import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../src/core/game/game';
import { coastX } from '../../src/core/world/coast';
import { Sound } from '../../src/isometric/audio';
import { crossings } from '../../src/isometric/crossing';
import { doorsById } from '../../src/isometric/doorways';
import { fieldAccentBuffers } from '../../src/isometric/fieldAudio';
import { defaultMix, Mixer } from '../../src/isometric/mixer';
import { catalogue } from '../../src/isometric/reading';
import { Valley } from '../../src/isometric/simulation';

const node = () => ({ connect: vi.fn((peer: unknown) => peer), disconnect: vi.fn() });
const audioParam = () => ({
  value: 1,
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
});
const gainNode = () => ({ ...node(), gain: audioParam() });
const pannerNode = () => ({ ...node(), pan: { value: 0 } });
const bufferSource = () => ({ ...node(), start: vi.fn(), stop: vi.fn(), playbackRate: { value: 1 } });
const compressorNode = () => ({
  ...node(),
  threshold: { value: 0 },
  knee: { value: 0 },
  ratio: { value: 1 },
  attack: { value: 0 },
  release: { value: 0 },
});

function makeBuffer(_channels: number, length: number) {
  const data = new Float32Array(length);
  return { length, numberOfChannels: 1, getChannelData: () => data } as unknown as AudioBuffer;
}

function fakeAudio() {
  const gains: ReturnType<typeof gainNode>[] = [];
  const pans: ReturnType<typeof pannerNode>[] = [];
  const sources: ReturnType<typeof bufferSource>[] = [];
  const compressor = compressorNode();
  const document = { hidden: false };
  const clock = {
    currentTime: 8,
    state: 'running',
    destination: node(),
    createBuffer: makeBuffer,
    createGain: () => gains[gains.push(gainNode()) - 1]!,
    createDynamicsCompressor: () => compressor,
    createStereoPanner: () => pans[pans.push(pannerNode()) - 1]!,
    createBufferSource: () => sources[sources.push(bufferSource()) - 1]!,
    decodeAudioData: vi.fn(async () => makeBuffer(1, 24)),
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return clock; }));
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', {});
  const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(24) }));
  vi.stubGlobal('fetch', fetch);
  return { clock, compressor, document, fetch, gains, pans, sources };
}

afterEach(() => vi.unstubAllGlobals());

describe('field audio', () => {
  it('renders bounded original accents with a fast contact and a later defeat crest', () => {
    const accents = fieldAccentBuffers({ createBuffer: makeBuffer });
    const peak = (buffer: AudioBuffer, from: number, until: number) =>
      Math.max(...buffer.getChannelData(0).slice(from * 24000, until * 24000).map(Math.abs));
    expect(peak(accents.bladeHit, 0, 0.016)).toBeGreaterThan(0.2);
    expect(peak(accents.defeat, 0, 0.03)).toBe(0);
    expect(peak(accents.defeat, 0.04, 0.14)).toBeGreaterThan(0.2);
    for (const buffer of Object.values(accents)) expect(peak(buffer, 0, 0.42)).toBeLessThan(0.65);
    expect(peak(accents.groundLanding, 0, 1 / 60)).toBeGreaterThan(0.08);
    expect(peak(accents.groundLanding, 2 / 60, 4 / 60)).toBeGreaterThan(peak(accents.groundLanding, 0, 1 / 60));
    expect(peak(accents.groundLanding, 0.13, 0.155)).toBeLessThan(0.025);
  });

  it('sounds one lift and one surface contact even when a stride crosses on the landing frame', () => {
    vi.stubGlobal('Audio', class { canPlayType() { return ''; } });
    const sound = new Sound(1);
    sound.enabled = true;
    const valley = new Valley(new Game());
    const effect = vi.spyOn(sound.mixer, 'effect').mockResolvedValue(undefined);
    const accent = vi.spyOn(sound.mixer, 'playAccent').mockImplementation(() => {});
    const bridge = crossings[0]!;
    valley.game.setPlayerTransform(bridge.x, 0, bridge.z, 0);
    sound.movement(valley);
    const jump = () => {
      valley.requestJump();
      sound.movement(valley);
      while (valley.jump > 0.15) {
        valley.step(1 / 60, 0, 0, false);
        sound.movement(valley);
      }
    };
    const land = () => {
      while (valley.jump) valley.step(1 / 60, 0, 0, false);
      valley.walk = true;
      valley.gait.serial++;
      sound.movement(valley);
      sound.movement(valley);
    };
    jump();
    land();
    expect(catalogue.effects['step.wood']).toContain(accent.mock.lastCall?.[4]?.cue);
    jump();
    valley.game.setPlayerTransform(41, 0, 14, 0);
    sound.movement(valley);
    land();
    expect(accent.mock.calls.map(([name]) => name)).toEqual(['jumpLift', 'groundLanding', 'jumpLift', 'waterLanding']);
    expect(accent.mock.lastCall?.[4]?.cue).toEqual(catalogue.effects.water_enter![0]);
    expect(effect).not.toHaveBeenCalled();
    valley.gait.phase = 0.999;
    valley.step(1 / 60, 1, 0, false);
    sound.movement(valley);
    expect(catalogue.effects.water_wade).toContain(effect.mock.lastCall?.[0]);

    jump();
    expect(valley.enterDoor(doorsById.get('house_a/front')!)).toBe(true);
    sound.movement(valley);
    expect(accent.mock.lastCall?.[0]).toBe('jumpLift');
    expect(catalogue.effects.door).toContain(effect.mock.lastCall?.[0]);
  });

  it.each([
    { offset: 4.4, dx: -1, run: true, wet: false, material: 'sand', impact: 'groundLanding', bank: 'water_enter' },
    { offset: -2.45, dx: 1, run: false, wet: true, material: 'shallows', impact: 'waterLanding', bank: 'water_exit' },
  ])('sounds the boot contact and the later $bank when both fall in one frame', (shot) => {
    vi.stubGlobal('Audio', class { canPlayType() { return ''; } });
    const sound = new Sound(1);
    sound.enabled = true;
    const effect = vi.spyOn(sound.mixer, 'effect').mockResolvedValue(undefined);
    const accent = vi.spyOn(sound.mixer, 'playAccent').mockImplementation(() => {});
    const v = new Valley(new Game());
    const z = -9;
    v.game.setPlayerTransform(coastX(z) + shot.offset, 0, z, 0);
    v.step(1 / 60, 0, 0, false);
    sound.movement(v);
    v.requestJump();
    for (let frame = 0; frame < 11; frame++) {
      v.step(0.05, shot.dx, 0, shot.run);
      sound.movement(v);
    }
    expect(v.landing).toEqual({ material: shot.material, wet: shot.wet });
    expect(v.gait.prints.filter((p) => p.landing)).toHaveLength(shot.wet ? 0 : 2);
    sound.movement(v);
    expect(accent.mock.calls.map(([name]) => name)).toEqual(['jumpLift', shot.impact]);
    expect(catalogue.effects[shot.wet ? 'water_enter' : 'step.sand']).toContain(accent.mock.lastCall?.[4]?.cue);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(catalogue.effects[shot.bank]).toContain(effect.mock.lastCall?.[0]);
  });

  it('plays immediately through a real pan path and warms missing foley without a late echo', async () => {
    const { clock, compressor, fetch, gains, pans, sources } = fakeAudio();
    const mixer = new Mixer(1, defaultMix);
    mixer.unlock();
    expect(gains[0]!.connect).toHaveBeenCalledWith(compressor);
    expect(compressor.connect).toHaveBeenCalledWith(clock.destination);
    const recording = { cue: catalogue.effects.hit![0]!, gain: 0.4 };
    mixer.playAccent('bladeHit', 0.8, -0.65, 'contact', recording);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.start).toHaveBeenCalledExactlyOnceWith();
    expect(pans[0]!.pan.value).toBe(-0.65);
    expect(pans[0]!.connect).toHaveBeenCalledWith(gains[6]);
    expect(gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.88, clock.currentTime + 0.008);
    expect(gains[3]!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sources).toHaveLength(1);
    mixer.playAccent('bladeHit', 0.8, 0.2, 'contact', recording);
    expect(sources).toHaveLength(3);
    expect(pans.slice(1).map((panner) => panner.pan.value)).toEqual([0.2, 0.2]);
  });

  it('releases focus on reset and gates new effects while hidden or muted', () => {
    const { clock, document, gains, sources } = fakeAudio();
    const mixer = new Mixer(1, defaultMix);
    mixer.unlock();
    mixer.playAccent('defeat', 0.8, 0, 'defeat');
    mixer.playAccent('bladeHit', 0.8, 0, 'contact');
    expect(gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
    mixer.reset();
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    expect(gains[1]!.gain.setValueAtTime).toHaveBeenLastCalledWith(1, clock.currentTime);

    document.hidden = true;
    mixer.playAccent('guard', 1, 0);
    document.hidden = false;
    mixer.setLevels({ ...defaultMix, effects: 0 });
    mixer.playAccent('guard', 1, 0);
    mixer.setLevels(defaultMix);
    mixer.setVolume(0);
    mixer.playAccent('guard', 1, 0);
    expect(sources).toHaveLength(2);
  });
});
