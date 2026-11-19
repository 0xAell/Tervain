import type { BarkFields } from './barkFields';
import { adoptCanopyAtlasLevel, type CanopyAtlasLevel } from './canopy';
import { adoptBarkFields } from './treeTextures';

/**
 * What a worker makes for the woodland while the main thread builds the terrain: the canopies' full-size leaf atlas
 * (canopy.ts) and the bark's noise fields (treeTextures.ts), about 0.6 s of the woodland's stage on the four-core test
 * machine. Neither depends on anything a world chooses, so they are the same bytes wherever they are made; the main thread
 * still makes the atlas's mips, which depend on the materials' cut-off. A host without workers, or a worker that fails,
 * makes them in the build as before.
 */
export interface WoodTexelRequest { atlas: { size: number; cells: number; seed: number } | null; barkSizes: number[] }

type WoodTexelReply = { type: 'complete'; atlas: CanopyAtlasLevel | null; bark: (BarkFields & { n: number })[] } | { type: 'error'; message: string };

let ahead: Promise<{ request: WoodTexelRequest; reply: Extract<WoodTexelReply, { type: 'complete' }> } | null> | null = null;

/**
 * Start the worker once `after` settles (the water's worker: one worker at a time beside the main thread, which the
 * four-core test machine showed to matter, #917).
 */
export function prefetchWoodTexels(request: WoodTexelRequest, after?: Promise<unknown>) {
  if (ahead || typeof Worker === 'undefined') return;
  ahead = Promise.resolve(after).catch(() => undefined).then(() => texelsInWorker(request)).catch(() => null);
}

async function texelsInWorker(request: WoodTexelRequest) {
  let worker: Worker;
  try { worker = new Worker(new URL('./woodTexelWorker.ts', import.meta.url), { type: 'module' }); }
  catch { return null; }
  return await new Promise<{ request: WoodTexelRequest; reply: Extract<WoodTexelReply, { type: 'complete' }> } | null>((resolve) => {
    let settled = false;
    const finish = (reply: WoodTexelReply | null) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(reply?.type === 'complete' ? { request, reply } : null);
    };
    worker.onmessage = (event: MessageEvent<WoodTexelReply>) => finish(event.data);
    // Module loading or CSP failures cannot send a reply: the build then makes the texels itself.
    worker.onerror = (event) => { event.preventDefault(); finish(null); };
    try { worker.postMessage(request); }
    catch { finish(null); }
  });
}

/** Before the woodland is built: wait for the worker, if one is making the texels, and hand them over. */
export async function adoptWoodTexels(): Promise<void> {
  const pending = ahead;
  ahead = null;
  if (!pending) return;
  const made = await pending;
  if (!made) return;
  const { request, reply } = made;
  if (reply.atlas && request.atlas) adoptCanopyAtlasLevel(request.atlas.size, request.atlas.cells, request.atlas.seed, reply.atlas);
  for (const { n, warp, fine, low } of reply.bark) adoptBarkFields(n, { warp, fine, low });
}
