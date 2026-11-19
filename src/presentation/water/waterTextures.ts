import * as THREE from 'three';
import { CAUSTIC_SIZE, FOAM_SIZE, makeWaterTexels, RIPPLE_SIZE, type WaterTexels } from './waterTexels';

/**
 * The water's small detail, made once at start-up and shared by every water surface. All original and procedural:
 *
 *  - ripples: a tiling field of capillary and short gravity waves (a sum of waves on the tile's own lattice, so it
 *    repeats seamlessly), stored as slopes for the fragment normal;
 *  - foam: bubbly cells with torn lace between them, and fine sparkle, thresholded by how much foam a place has;
 *  - caustics: light traced through a gently waving surface onto a flat floor and counted where it lands, which is
 *    how real caustic webs form; two drifting layers of it light shallow beds.
 */

export interface WaterTextures {
  ripples: THREE.DataTexture;
  foam: THREE.DataTexture;
  caustics: THREE.DataTexture;
}

let shared: WaterTextures | null = null;

function finish(tex: THREE.DataTexture, name: string, mips = true): THREE.DataTexture {
  tex.name = name;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = mips;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** The textures, from their texels. */
function texturesFrom(texels: WaterTexels): WaterTextures {
  const rgba = (data: Uint8Array, n: number) => new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  return {
    ripples: finish(rgba(texels.ripples, RIPPLE_SIZE), 'tervain-water-ripples'),
    foam: finish(rgba(texels.foam, FOAM_SIZE), 'tervain-water-foam'),
    caustics: finish(rgba(texels.caustics, CAUSTIC_SIZE), 'tervain-water-caustics'),
  };
}

/** The shared textures; created on first use and kept for the life of the page. */
export function waterTextures(): WaterTextures {
  if (!shared) shared = texturesFrom(makeWaterTexels());
  return shared;
}

type WaterTexelReply = { type: 'complete'; texels: WaterTexels } | { type: 'error'; message: string };

/** Texels a worker is making ahead of the first world build (A68). */
let ahead: Promise<WaterTexels | null> | null = null;

/**
 * Make the texels in a worker while the main thread builds the terrain (world.ts), so that the water takes them instead
 * of making them on the main thread: half a second of the terrain's stage on the four-core test machine. Started any
 * earlier, beside the worker painting the ground's textures, the two shared that machine's cores and the ground's took
 * longer. A host without workers, or a worker that fails, leaves the texels to be made on first use as before.
 */
export function prefetchWaterTexels() {
  if (shared || ahead || typeof Worker === 'undefined') return;
  ahead = texelsInWorker().catch(() => null);
}

async function texelsInWorker(): Promise<WaterTexels | null> {
  let worker: Worker;
  try { worker = new Worker(new URL('./waterTexelWorker.ts', import.meta.url), { type: 'module' }); }
  catch { return null; }
  return await new Promise<WaterTexels | null>((resolve) => {
    let settled = false;
    const finishWith = (texels: WaterTexels | null) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(texels);
    };
    worker.onmessage = (event: MessageEvent<WaterTexelReply>) => finishWith(event.data.type === 'complete' ? event.data.texels : null);
    // Module loading or CSP failures cannot send a reply: the textures are then made on the main thread.
    worker.onerror = (event) => { event.preventDefault(); finishWith(null); };
    try { worker.postMessage('make'); }
    catch { finishWith(null); }
  });
}

/** Settles when the water's worker is done, or at once without one: work that should not share the cores with it waits. */
export function waterTexelsSettled(): Promise<unknown> {
  return ahead ?? Promise.resolve();
}

/**
 * Before the world's water is built: wait for texels made ahead, if a worker is making them, and build the shared
 * textures from them. Without any, the textures are made on first use, as before.
 */
export async function adoptWaterTexels(): Promise<void> {
  const pending = ahead;
  ahead = null;
  if (shared || !pending) return;
  const texels = await pending;
  if (texels && !shared) shared = texturesFrom(texels);
}
