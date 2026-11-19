import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeBarkFields } from '../../src/presentation/barkFields';
import { canopyAtlas } from '../../src/presentation/canopyAtlasTexels';

/**
 * The woodland's canopy atlas (its full-size level) and bark noise fields are made by a worker while the terrain is built
 * and handed over before the woodland (woodTexels.ts, world.ts): the build then uses the worker's arrays, the same bytes it
 * would make, and makes them itself when there is no worker or it fails.
 */
const request = { atlas: { size: 64, cells: 2, seed: 7 }, barkSizes: [64] };
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

vi.mock('../../src/presentation/procTex', async (original) => {
  const actual = await original<typeof import('../../src/presentation/procTex')>();
  return { ...actual, fbmField: vi.fn(actual.fbmField) };
});

/** A worker that answers as the real one does (running its script), or fails as a module that does not load. */
function fakeWorker(answer: 'complete' | 'fail', started: unknown[]) {
  return class {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { preventDefault(): void }) => void) | null = null;
    postMessage(message: { atlas: { size: number; cells: number; seed: number } | null; barkSizes: number[] }) {
      started.push(message);
      queueMicrotask(() => {
        if (answer === 'fail') { this.onerror?.({ preventDefault() {} }); return; }
        const atlas = message.atlas ? canopyAtlas(message.atlas.size, message.atlas.cells, message.atlas.seed) : null;
        this.onmessage?.({ data: { type: 'complete', atlas, bark: message.barkSizes.map((n) => ({ n, ...makeBarkFields(n) })) } });
      });
    }
    terminate() {}
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

describe('the woodland texels made ahead', () => {
  it('builds the canopy atlas on the level the worker made and paints the bark on its fields, without making either again', async () => {
    const started: unknown[] = [];
    vi.stubGlobal('Worker', fakeWorker('complete', started));
    const wood = await import('../../src/presentation/woodTexels');
    const { canopyAtlasTexture } = await import('../../src/presentation/canopy');
    const { barkTextures } = await import('../../src/presentation/treeTextures');
    const procTex = await import('../../src/presentation/procTex');
    let waterDone!: () => void;
    wood.prefetchWoodTexels(request, new Promise<void>((resolve) => { waterDone = resolve; }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // One worker at a time beside the main thread: this one waits for the water's.
    expect(started).toHaveLength(0);
    waterDone();
    await wood.adoptWoodTexels();
    expect(started).toEqual([request]);
    const calls = vi.mocked(procTex.fbmField).mock.calls.length;
    const atlas = canopyAtlasTexture(64, 2, 0.4, 7);
    const bark = barkTextures('oak', 64);
    // The bark's fields came from the worker: no noise field was made on this thread for them.
    expect(vi.mocked(procTex.fbmField).mock.calls.length).toBe(calls);
    expect(same(atlas.image.data as Uint8Array, canopyAtlas(64, 2, 7).data)).toBe(true);
    // The same bytes as a build that made them itself.
    vi.resetModules();
    const fresh = await import('../../src/presentation/treeTextures');
    expect(same(bark.map.image.data as Uint8Array, fresh.barkTextures('oak', 64).map.image.data as Uint8Array)).toBe(true);
  });

  it('makes them in the build when the worker fails, the same bytes', async () => {
    vi.stubGlobal('Worker', fakeWorker('fail', []));
    const wood = await import('../../src/presentation/woodTexels');
    const { canopyAtlasTexture } = await import('../../src/presentation/canopy');
    wood.prefetchWoodTexels(request);
    await wood.adoptWoodTexels();
    expect(same(canopyAtlasTexture(64, 2, 0.4, 7).image.data as Uint8Array, canopyAtlas(64, 2, 7).data)).toBe(true);
  });

  it('leaves an atlas of another size, cells or seed to be made in the build', async () => {
    vi.stubGlobal('Worker', fakeWorker('complete', []));
    const wood = await import('../../src/presentation/woodTexels');
    const { canopyAtlasTexture } = await import('../../src/presentation/canopy');
    wood.prefetchWoodTexels(request);
    await wood.adoptWoodTexels();
    expect(same(canopyAtlasTexture(64, 2, 0.4, 8).image.data as Uint8Array, canopyAtlas(64, 2, 8).data)).toBe(true);
  });

  it('hands the atlas level and every bark field over from the worker, the buffers transferred', async () => {
    const posted: [{ type: string; atlas: { data: Uint8Array }; bark: { n: number; warp: Float32Array; fine: Float32Array; low: Float32Array }[] }, { transfer: ArrayBuffer[] }][] = [];
    const self = { onmessage: null as null | ((event: { data: typeof request }) => void), postMessage: (message: never, options: { transfer: ArrayBuffer[] }) => { posted.push([message, options]); } };
    vi.stubGlobal('self', self);
    await import('../../src/presentation/woodTexelWorker');
    self.onmessage!({ data: request });
    const [message, options] = posted[0]!;
    expect(message.type).toBe('complete');
    expect(same(message.atlas.data, canopyAtlas(64, 2, 7).data)).toBe(true);
    const fields = makeBarkFields(64);
    expect(message.bark.map((b) => b.n)).toEqual([64]);
    for (const key of ['warp', 'fine', 'low'] as const) expect(same(message.bark[0]![key], fields[key])).toBe(true);
    expect(options.transfer).toEqual([message.atlas.data.buffer, message.bark[0]!.warp.buffer, message.bark[0]!.fine.buffer, message.bark[0]!.low.buffer]);
  });
});
