import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeWaterTexels, type WaterTexels } from '../../src/presentation/water/waterTexels';

/**
 * The water's texels are made by a worker while the world builds its terrain, and adopted before its water is built
 * (world.ts): the textures are then built from what the worker handed over, the same bytes the main thread makes, and a
 * worker that fails leaves them to the main thread.
 */
const texels = makeWaterTexels();
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** A worker that answers the request as the real one does, or fails as a module that does not load. */
function fakeWorker(answer: 'complete' | 'fail', made: WaterTexels[], started: number[] = []) {
  return class {
    constructor() { started.push(started.length); }
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { preventDefault(): void }) => void) | null = null;
    terminated = false;
    postMessage(request: unknown) {
      expect(request).toBe('make');
      queueMicrotask(() => {
        if (answer === 'fail') { this.onerror?.({ preventDefault() {} }); return; }
        const made1 = makeWaterTexels();
        made.push(made1);
        this.onmessage?.({ data: { type: 'complete', texels: made1 } });
      });
    }
    terminate() { this.terminated = true; }
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('the water texels made ahead', () => {
  it('builds the shared textures from what the worker handed over, without making them again', async () => {
    const made: WaterTexels[] = [];
    vi.stubGlobal('Worker', fakeWorker('complete', made));
    const water = await import('../../src/presentation/water/waterTextures');
    water.prefetchWaterTexels();
    water.prefetchWaterTexels();
    await water.adoptWaterTexels();
    expect(made).toHaveLength(1);
    const textures = water.waterTextures();
    // The worker's own arrays: adopted, not copied or made again.
    expect(textures.ripples.image.data).toBe(made[0]!.ripples);
    expect(textures.foam.image.data).toBe(made[0]!.foam);
    expect(textures.caustics.image.data).toBe(made[0]!.caustics);
    expect(same(textures.foam.image.data as Uint8Array, texels.foam)).toBe(true);
    expect([textures.ripples.name, textures.foam.name, textures.caustics.name]).toEqual(['tervain-water-ripples', 'tervain-water-foam', 'tervain-water-caustics']);
    expect([textures.ripples.image.width, textures.foam.image.width, textures.caustics.image.width]).toEqual([256, 512, 256]);
    // Kept for the life of the page: a later journey neither starts a worker nor makes them again.
    water.prefetchWaterTexels();
    await water.adoptWaterTexels();
    expect(made).toHaveLength(1);
    expect(water.waterTextures()).toBe(textures);
  });

  it('leaves the textures to the main thread when the worker fails, with the same bytes', async () => {
    vi.stubGlobal('Worker', fakeWorker('fail', []));
    const water = await import('../../src/presentation/water/waterTextures');
    water.prefetchWaterTexels();
    await water.adoptWaterTexels();
    const textures = water.waterTextures();
    for (const key of ['ripples', 'foam', 'caustics'] as const) expect(same(textures[key].image.data as Uint8Array, texels[key])).toBe(true);
  });

  it('makes them on first use where there are no workers', async () => {
    vi.stubGlobal('Worker', undefined);
    const water = await import('../../src/presentation/water/waterTextures');
    water.prefetchWaterTexels();
    await water.adoptWaterTexels();
    expect(same(water.waterTextures().ripples.image.data as Uint8Array, texels.ripples)).toBe(true);
  });

  it('hands every texel over from the worker, the buffers transferred', async () => {
    const posted: [unknown, { transfer: ArrayBuffer[] }][] = [];
    const self = { onmessage: null as null | (() => void), postMessage: (message: unknown, options: { transfer: ArrayBuffer[] }) => { posted.push([message, options]); } };
    vi.stubGlobal('self', self);
    await import('../../src/presentation/water/waterTexelWorker');
    self.onmessage!();
    expect(posted).toHaveLength(1);
    const [message, options] = posted[0]! as [{ type: string; texels: WaterTexels }, { transfer: ArrayBuffer[] }];
    expect(message.type).toBe('complete');
    for (const key of ['ripples', 'foam', 'caustics'] as const) expect(same(message.texels[key], texels[key])).toBe(true);
    expect(options.transfer).toEqual([message.texels.ripples.buffer, message.texels.foam.buffer, message.texels.caustics.buffer]);
  });
});
