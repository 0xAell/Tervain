import * as THREE from 'three';
import { HERO_SHADOW_TRIANGLES } from './shadowTriangles';

export { HERO_SHADOW_ERROR, HERO_SHADOW_TRIANGLES, shadowIndex, type ShadowSimplifier } from './shadowTriangles';

/** The meshes that have fewer triangles to draw from, and those triangles (castShadowFrom). */
const fewer = new Map<THREE.Mesh, THREE.BufferAttribute>();

/**
 * Lend the coarser skin indices to the low-resolution water reflection until the returned function is called. Each
 * mesh keeps its own skeleton, skin weights and materials.
 */
export function drawFromFewerTriangles(): () => void {
  const swapped: [THREE.BufferGeometry, THREE.BufferAttribute | null][] = [];
  for (const [mesh, index] of fewer) {
    swapped.push([mesh.geometry, mesh.geometry.index]);
    mesh.geometry.index = index;
  }
  return () => { for (let i = swapped.length - 1; i >= 0; i--) swapped[i]![0].index = swapped[i]![1]; };
}

/**
 * Draw `mesh`'s shadows from `index`, over its own vertices: three calls these hooks around each shadow draw, so the
 * full index is back before anything else draws the mesh. The water's reflection draws from it too (drawFromFewerTriangles).
 * Returns how to undo it.
 */
export function castShadowFrom(mesh: THREE.Mesh, index: THREE.BufferAttribute): () => void {
  const before = mesh.onBeforeShadow, after = mesh.onAfterShadow;
  fewer.set(mesh, index);
  // A mesh let go of (a rig rebuilt for a new journey) is forgotten with its geometry.
  const forget = () => { if (fewer.get(mesh) === index) fewer.delete(mesh); };
  mesh.geometry.addEventListener('dispose', forget);
  let full: THREE.BufferAttribute | null = null;
  mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry, depthMaterial, group) {
    full = geometry.index; geometry.index = index;
    before.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
  };
  mesh.onAfterShadow = function (renderer, object, camera, shadowCamera, geometry, depthMaterial, group) {
    after.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
    geometry.index = full; full = null;
  };
  return () => { mesh.onBeforeShadow = before; mesh.onAfterShadow = after; forget(); mesh.geometry.removeEventListener('dispose', forget); };
}

type ShadowWorkerReply = { type: 'complete'; indices: Uint32Array; error: number } | { type: 'error'; message: string };

export function makeShadowIndexWorker(): Worker {
  return new Worker(new URL('./shadowIndexWorker.ts', import.meta.url), { type: 'module' });
}

/** The caller owns the worker and can reuse it for another geometry once this request settles. */
export function requestShadowIndex(geometry: THREE.BufferGeometry, worker: Worker, targetTriangles: number,
  maxError?: number): Promise<{ index: THREE.BufferAttribute; error: number } | null> {
  const index = geometry.index!, position = geometry.getAttribute('position');
  const indices = new Uint32Array(index.array);
  const positions = new Float32Array(position.count * 3);
  for (let v = 0; v < position.count; v++) {
    positions[v * 3] = position.getX(v); positions[v * 3 + 1] = position.getY(v); positions[v * 3 + 2] = position.getZ(v);
  }
  return new Promise((resolve) => {
    worker.onmessage = (event: MessageEvent<ShadowWorkerReply>) => {
      const reply = event.data;
      if (reply.type !== 'complete' || !reply.indices.length || reply.indices.length >= index.count) { resolve(null); return; }
      resolve({ index: new THREE.BufferAttribute(reply.indices, 1), error: reply.error });
    };
    worker.onerror = (event) => { event.preventDefault(); resolve(null); };
    try { worker.postMessage({ indices, positions, targetTriangles, maxError }, [indices.buffer, positions.buffer]); } catch { resolve(null); }
  });
}

/** Work out the wanderer's shadow triangles off-thread. The full mesh keeps casting if the worker cannot help. */
export async function castShadowFromFewerTriangles(mesh: THREE.Mesh, createWorker = makeShadowIndexWorker): Promise<number | null> {
  const geometry = mesh.geometry;
  if (!geometry.index || !geometry.getAttribute('position') || geometry.index.count <= HERO_SHADOW_TRIANGLES * 3 || typeof Worker === 'undefined') return null;
  let worker: Worker;
  try { worker = createWorker(); } catch { return null; }
  try {
    const result = await requestShadowIndex(geometry, worker, HERO_SHADOW_TRIANGLES);
    if (result) castShadowFrom(mesh, result.index);
    return result?.error ?? null;
  } finally { worker.terminate(); }
}
