import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const parse = vi.hoisted(() => vi.fn<(buffer: ArrayBuffer) => Promise<GLTF>>());
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { parseAsync = parse; setMeshoptDecoder() { return this; } } }));

function model(kind: number): GLTF {
  const scene = new THREE.Group();
  for (let i = 0; i < (kind === 1 ? 2 : 1); i++) {
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ alphaTest: i ? 0.4 : 0 })));
  }
  return { scene, animations: [], parser: { json: {}, associations: new Map() } } as unknown as GLTF;
}
function bytes(kind: number): ArrayBuffer {
  const buffer = new ArrayBuffer(16), header = new DataView(buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, buffer.byteLength, true);
  header.setUint8(12, kind);
  return buffer;
}
function kindOf(url: URL): number {
  return url.pathname.includes('/hero/') ? 0 : url.pathname.includes('/flora/') ? 1 : 2;
}

beforeEach(() => {
  vi.resetModules(); parse.mockReset();
  vi.stubGlobal('document', { baseURI: 'https://example.test/Tervain/' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared required-model loading budget', () => {
  it('holds the four-model budget through decoding across two forests and scenery, and retains cached models on rebuild', async () => {
    const fetcher = vi.fn(async (url: URL) => new Response(bytes(kindOf(url)))); vi.stubGlobal('fetch', fetcher);
    const decoding: (() => void)[] = []; let active = 0, peak = 0;
    parse.mockImplementation(buffer => {
      active++; peak = Math.max(peak, active);
      return new Promise(resolve => decoding.push(() => { active--; resolve(model(new DataView(buffer).getUint8(12))); }));
    });
    const [{ loadHeroPine }, { loadSolitaryPine }, { loadSourceRockPile }] = await Promise.all([
      import('../../src/presentation/heroPine'), import('../../src/presentation/solitaryPine'), import('../../src/presentation/sourceRockPile'),
    ]);
    // Both pine families supply three levels, plus one rock pile. Four files may be in hand at once.
    const first = [loadHeroPine(), loadSolitaryPine(), loadSourceRockPile()];
    await vi.waitFor(() => expect(decoding).toHaveLength(4));
    // HTTP bodies have completed. Slots remain occupied until their images and
    // geometry finish decoding, so scenery cannot create extra memory pressure.
    expect(fetcher).toHaveBeenCalledTimes(4);
    decoding.splice(0, 1)[0]!();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(active).toBe(4);
    await vi.waitFor(() => expect(decoding).toHaveLength(4));
    decoding.splice(0).forEach(finish => finish());
    await vi.waitFor(() => expect(decoding).toHaveLength(2));
    decoding.splice(0).forEach(finish => finish());
    await Promise.all(first);
    expect(peak).toBe(4); expect(active).toBe(0);
    await Promise.all([loadHeroPine(), loadSolitaryPine(), loadSourceRockPile()]);
    expect(fetcher).toHaveBeenCalledTimes(7); expect(parse).toHaveBeenCalledTimes(7);
  });

  it('starts the stall allowance of a queued model when its download starts, and retries a dropped download in its own slot', async () => {
    vi.useFakeTimers();
    const waiting: (() => void)[] = [], signals: AbortSignal[] = [];
    let rejectFirst!: (error: Error) => void;
    const fetcher = vi.fn((url: URL, options: RequestInit) => {
      signals.push(options.signal as AbortSignal);
      return new Promise<Response>((resolve, reject) => {
        if (waiting.length === 0) rejectFirst = reject;
        waiting.push(() => resolve(new Response(bytes(kindOf(url)))));
        options.signal!.addEventListener('abort', () => reject(new Error('download timed out')), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetcher); parse.mockImplementation(async buffer => model(new DataView(buffer).getUint8(12)));
    const [{ loadHeroPine }, { loadSolitaryPine }, { loadSourceRockPile }, { DOWNLOAD_POLICY }] = await Promise.all([
      import('../../src/presentation/heroPine'), import('../../src/presentation/solitaryPine'), import('../../src/presentation/sourceRockPile'),
      import('../../src/presentation/assets/download'),
    ]);
    DOWNLOAD_POLICY.backoffMs = [0, 0];
    const pine = loadSolitaryPine(), rock = loadSourceRockPile(), secondPine = loadHeroPine();
    // The three shore-pine levels plus the rock occupy all four initial slots.
    expect(fetcher).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(DOWNLOAD_POLICY.stallMs - 5_000);
    // The first pine drops its connection and retries in its own slot. The second family still waits.
    rejectFirst(new Error('connection closed'));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(String(fetcher.mock.calls[4]![0])).toBe(String(fetcher.mock.calls[0]![0]));
    waiting.slice(1, 4).forEach(finish => finish());
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(8));
    // The second family's timer starts when its download does.
    const queuedSignal = signals[5]!;
    await vi.advanceTimersByTimeAsync(DOWNLOAD_POLICY.stallMs - 1_000);
    expect(queuedSignal.aborted).toBe(false);
    waiting.slice(4).forEach(finish => finish());
    await Promise.all([pine, rock, secondPine]);
    expect(parse).toHaveBeenCalledTimes(7);
    expect(vi.getTimerCount()).toBe(0);
  });
});
