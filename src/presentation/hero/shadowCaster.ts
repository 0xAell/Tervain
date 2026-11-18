import * as THREE from 'three';
import { HERO_SHADOW_TRIANGLES } from './shadowTriangles';

export { HERO_SHADOW_ERROR, HERO_SHADOW_TRIANGLES, shadowIndex, type ShadowSimplifier } from './shadowTriangles';

/**
 * Draw `mesh`'s shadows from `index`, over its own vertices: three calls these hooks around each shadow draw, so the
 * full index is back before anything else draws the mesh. Returns how to undo it.
 */
export function castShadowFrom(mesh: THREE.Mesh, index: THREE.BufferAttribute): () => void {
  const before = mesh.onBeforeShadow, after = mesh.onAfterShadow;
  let full: THREE.BufferAttribute | null = null;
  mesh.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry, depthMaterial, group) {
    full = geometry.index; geometry.index = index;
    before.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
  };
  mesh.onAfterShadow = function (renderer, object, camera, shadowCamera, geometry, depthMaterial, group) {
    after.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
    geometry.index = full; full = null;
  };
  return () => { mesh.onBeforeShadow = before; mesh.onAfterShadow = after; };
}

type ShadowWorkerReply = { type: 'complete'; indices: Uint32Array; error: number } | { type: 'error'; message: string };

/**
 * Work out `mesh`'s shadow triangles in a worker (about 0.1 s: neither the journey's load nor a frame waits on it) and
 * cast its shadow from them once they arrive. Without a worker, or if it fails, the full mesh keeps casting, as before.
 * Resolves with the error reached, or null when nothing changed.
 */
export function castShadowFromFewerTriangles(mesh: THREE.Mesh, createWorker = () => new Worker(new URL('./shadowIndexWorker.ts', import.meta.url), { type: 'module' })): Promise<number | null> {
  const index = mesh.geometry.index, position = mesh.geometry.getAttribute('position');
  if (!index || !position || index.count <= HERO_SHADOW_TRIANGLES * 3 || typeof Worker === 'undefined') return Promise.resolve(null);
  const indices = new Uint32Array(index.count), positions = new Float32Array(position.count * 3);
  for (let i = 0; i < index.count; i++) indices[i] = index.getX(i);
  for (let v = 0; v < position.count; v++) { positions[v * 3] = position.getX(v); positions[v * 3 + 1] = position.getY(v); positions[v * 3 + 2] = position.getZ(v); }
  let worker: Worker;
  try { worker = createWorker(); } catch { return Promise.resolve(null); }
  return new Promise((resolve) => {
    const finish = (result: number | null) => { worker.terminate(); resolve(result); };
    worker.onmessage = (event: MessageEvent<ShadowWorkerReply>) => {
      const reply = event.data;
      if (reply.type !== 'complete' || !(reply.indices.length > 0) || reply.indices.length >= index.count) { finish(null); return; }
      castShadowFrom(mesh, new THREE.BufferAttribute(reply.indices, 1));
      finish(reply.error);
    };
    worker.onerror = (event) => { event.preventDefault(); finish(null); };
    try { worker.postMessage({ indices, positions }, [indices.buffer, positions.buffer]); } catch { finish(null); }
  });
}
