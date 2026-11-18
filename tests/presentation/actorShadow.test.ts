import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { prepareActorShadow } from '../../src/presentation/actorShadow';
import { drawFromFewerTriangles } from '../../src/presentation/hero/shadowCaster';
import { shadowIndex } from '../../src/presentation/hero/shadowTriangles';
import { readGlb, parseGlb, packGlb, withoutTextures } from './glbFixture';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('shares one serial worker and one result per source, and leaves a released animal out of later passes', async () => {
  const glb = readGlb('animals/deer-1005232424.glb');
  const model = await parseGlb(packGlb(glb, withoutTextures(glb.json)));
  let source!: THREE.BufferGeometry;
  model.scene.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) source = (node as THREE.SkinnedMesh).geometry; });
  const actor = () => new THREE.SkinnedMesh(source.clone(), new THREE.MeshStandardMaterial());
  const a = actor(), b = actor(), c = actor(), disposed = actor(), otherTemplate = source.clone();
  const full = a.geometry.index!, fullB = b.geometry.index!, disposedIndex = disposed.geometry.index;
  await MeshoptSimplifier.ready;
  vi.useFakeTimers();
  const terminate = vi.fn();
  let workers = 0, jobs = 0, inFlight = 0;
  class TestWorker {
    constructor() { workers++; }
    onmessage!: (event: { data: object }) => void;
    terminate = terminate;
    postMessage(data: { indices: Uint32Array; positions: Float32Array; targetTriangles: number; maxError: number }) {
      jobs++;
      expect(++inFlight).toBe(1);
      Promise.resolve().then(() => {
        const result = shadowIndex(MeshoptSimplifier, data.indices, data.positions, data.targetTriangles, data.maxError);
        inFlight--;
        this.onmessage({ data: { type: 'complete', ...result } });
      });
    }
  }
  vi.stubGlobal('Worker', TestWorker);
  try {
    const requests = [prepareActorShadow(a, source), prepareActorShadow(b, source), prepareActorShadow(disposed, source), prepareActorShadow(c, otherTemplate)];
    disposed.geometry.dispose();
    await Promise.all(requests);
    expect([workers, jobs]).toEqual([1, 2]);
    expect(a.geometry.index).toBe(full);
    const restore = drawFromFewerTriangles();
    try {
      expect(a.geometry.index!.count).toBeLessThan(full.count * 0.9);
      expect(b.geometry.index).toBe(a.geometry.index);
      expect(c.geometry.index!.count).toBe(a.geometry.index!.count);
      expect(disposed.geometry.index).toBe(disposedIndex);
    } finally { restore(); }
    expect(a.geometry.index).toBe(full); expect(b.geometry.index).toBe(fullB);
    vi.advanceTimersByTime(6000);
    expect(terminate).toHaveBeenCalledOnce();
  } finally {
    for (const mesh of [a, b, c, disposed]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    source.dispose(); otherTemplate.dispose();
  }
});
