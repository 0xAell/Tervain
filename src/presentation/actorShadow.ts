import type { BufferAttribute, BufferGeometry, SkinnedMesh } from 'three';
import { castShadowFrom, makeShadowIndexWorker, requestShadowIndex } from './hero/shadowCaster';

const prepared = new WeakMap<BufferGeometry, Promise<BufferAttribute | null>>();
let queue = Promise.resolve(), worker: Worker | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;

/** Share one serial worker and one index per immutable template across the actors that use it. */
function actorIndex(template: BufferGeometry): Promise<BufferAttribute | null> {
  const known = prepared.get(template);
  if (known) return known;
  const task = queue.then(async () => {
    clearTimeout(idle);
    try {
      worker ??= makeShadowIndexWorker();
      const triangles = template.index!.count / 3;
      const result = await requestShadowIndex(template, worker, Math.ceil(triangles / 2), 0.0005);
      if (!result) { worker.terminate(); worker = undefined; }
      return result?.index ?? null;
    } catch { return null; } finally {
      // Models arrive in bursts as the village streams. Release the idle worker and its WASM heap afterwards.
      if (worker) idle = setTimeout(() => { worker?.terminate(); worker = undefined; }, 5000);
    }
  });
  prepared.set(template, task);
  queue = task.then(() => {});
  return task;
}

/** Material groups and draw subranges address the full indices. Keep them intact on models that use them. */
export async function prepareActorShadow(mesh: SkinnedMesh, template: BufferGeometry): Promise<void> {
  if (typeof Worker === 'undefined' || !template.index || template.index.count <= 45_000 || !template.getAttribute('position')
    || template.groups.length || Array.isArray(mesh.material) || template.drawRange.start !== 0 || template.drawRange.count !== Infinity) return;
  const geometry = mesh.geometry;
  let live = true;
  const disposed = () => { live = false; };
  geometry.addEventListener('dispose', disposed);
  try {
    const index = await actorIndex(template);
    if (live && index && mesh.geometry === geometry) castShadowFrom(mesh, index);
  } finally { geometry.removeEventListener('dispose', disposed); }
}
