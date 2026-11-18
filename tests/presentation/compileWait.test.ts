import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { installCompleteCompileWait } from '../../src/presentation/compileWait';

/** A program that links when told to, as KHR_parallel_shader_compile reports it. */
function program() {
  const p = { linked: false, usedTimes: 1, isReady: vi.fn(() => p.linked) };
  return p;
}

/**
 * A renderer whose compile hands back the materials it was given, each holding the programs listed for it, the last one
 * current: as three keeps them (`properties.get(material).programs`, `currentProgram`).
 */
function renderer(held: Map<THREE.Material, ReturnType<typeof program>[]>) {
  const r = {
    compile: vi.fn(() => new Set(held.keys())),
    properties: { get: (m: THREE.Material) => ({ programs: new Map(held.get(m)!.map((p, i) => [String(i), p])), currentProgram: held.get(m)!.at(-1) }) },
    compileAsync: undefined as unknown as THREE.WebGLRenderer['compileAsync'],
  };
  installCompleteCompileWait(r as unknown as THREE.WebGLRenderer);
  return r;
}

const settled = async (promise: Promise<unknown>) => {
  let done = false;
  void promise.then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(30);
  return done;
};

describe('a preparation waits for every program its materials hold', () => {
  it('waits for a material\'s earlier programs as well as its current one (a skinned figure beside a static mesh)', async () => {
    vi.useFakeTimers();
    try {
      const depth = new THREE.MeshDepthMaterial(), staticDepth = program(), skinnedDepth = program();
      const r = renderer(new Map<THREE.Material, ReturnType<typeof program>[]>([[depth, [skinnedDepth, staticDepth]]]));
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), target = new THREE.Scene();
      const pending = r.compileAsync(scene, camera, target);
      expect(r.compile).toHaveBeenCalledExactlyOnceWith(scene, camera, target);
      staticDepth.linked = true;
      // Three's own wait would resolve here: the current program is linked.
      expect(await settled(pending)).toBe(false);
      skinnedDepth.linked = true;
      expect(await settled(pending)).toBe(true);
      await expect(pending).resolves.toBe(scene);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not wait for a program let go meanwhile, nor for one already linked', async () => {
    vi.useFakeTimers();
    try {
      const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshBasicMaterial();
      const released = program(), linked = program(), current = program();
      linked.linked = true; current.linked = true; released.usedTimes = 0;
      const r = renderer(new Map<THREE.Material, ReturnType<typeof program>[]>([[a, [released, current]], [b, [linked]]]));
      expect(await settled(r.compileAsync(new THREE.Scene(), new THREE.PerspectiveCamera()))).toBe(true);
      expect(released.isReady).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a stand-in renderer without compile as it is', () => {
    const own = vi.fn();
    const stand = { compileAsync: own } as unknown as THREE.WebGLRenderer;
    installCompleteCompileWait(stand);
    expect(stand.compileAsync).toBe(own);
  });
});
