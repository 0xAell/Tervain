import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { MAIN_HERO_FILE } from '../../src/presentation/assets/heroFile';
import { castShadowFrom, castShadowFromFewerTriangles, drawFromFewerTriangles, HERO_SHADOW_ERROR, HERO_SHADOW_TRIANGLES, shadowIndex } from '../../src/presentation/hero/shadowCaster';
import { bufferViewData, readGlb } from './glbFixture';

afterEach(() => { vi.unstubAllGlobals(); });

/** The shipped wanderer's vertex positions and triangle corners, decoded as the game decodes them. */
async function heroMesh() {
  const glb = readGlb(MAIN_HERO_FILE), primitive = glb.json.meshes[0].primitives[0];
  const position = glb.json.accessors[primitive.attributes.POSITION], index = glb.json.accessors[primitive.indices];
  expect([position.componentType, position.type, index.componentType]).toEqual([5126, 'VEC3', 5125]);
  const data = await bufferViewData(glb, position.bufferView), stride = glb.json.bufferViews[position.bufferView].byteStride ?? 12;
  const positions = new Float32Array(position.count * 3);
  for (let v = 0; v < position.count; v++) for (let k = 0; k < 3; k++) positions[v * 3 + k] = data.readFloatLE((position.byteOffset ?? 0) + v * stride + k * 4);
  const corners = await bufferViewData(glb, index.bufferView), indices = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i++) indices[i] = corners.readUInt32LE((index.byteOffset ?? 0) + i * 4);
  return { positions, indices, vertices: position.count as number };
}

describe('the wanderer\'s shadow from fewer of his own triangles', () => {
  it('chooses at most 15,000 of his 149,974 triangles over his own vertices, within 2 mm of his surface, the same every time', async () => {
    const { positions, indices, vertices } = await heroMesh();
    expect(indices.length / 3).toBe(149_974);
    await MeshoptSimplifier.ready;
    const { indices: coarse, error } = shadowIndex(MeshoptSimplifier, indices, positions);
    expect(coarse.length % 3).toBe(0);
    expect(coarse.length / 3).toBeLessThanOrEqual(HERO_SHADOW_TRIANGLES);
    expect(coarse.length / 3).toBeGreaterThan(HERO_SHADOW_TRIANGLES * 0.8);
    expect(error).toBeLessThanOrEqual(HERO_SHADOW_ERROR);
    // Every corner is one of his vertices: none is added or moved, so the skin weights and joints hold for all of them.
    let highest = 0;
    for (const v of coarse) highest = Math.max(highest, v);
    expect(highest).toBeLessThan(vertices);
    expect(Array.from(shadowIndex(MeshoptSimplifier, indices, positions).indices)).toEqual(Array.from(coarse));
  });

  it('draws the shadow from the coarse triangles and has the full ones back before anything else draws the mesh', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), full = geometry.index!, coarse = new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1);
    const mesh = new THREE.Mesh(geometry), before = vi.fn(), after = vi.fn();
    mesh.onBeforeShadow = before; mesh.onAfterShadow = after;
    const undo = castShadowFrom(mesh, coarse);
    const args = [{} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.Camera(), new THREE.Camera(), geometry, new THREE.MeshDepthMaterial(), new THREE.Group()] as const;
    mesh.onBeforeShadow(...args);
    expect(geometry.index).toBe(coarse);
    expect(before).toHaveBeenCalledOnce();
    mesh.onAfterShadow(...args);
    expect(geometry.index).toBe(full);
    expect(after).toHaveBeenCalledOnce();
    undo();
    expect([mesh.onBeforeShadow, mesh.onAfterShadow]).toEqual([before, after]);
    geometry.dispose();
  });

  it('lends the water\'s reflection the same triangles until it is done, and forgets a mesh undone or let go of', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), full = geometry.index!, coarse = new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1);
    const mesh = new THREE.Mesh(geometry);
    const undo = castShadowFrom(mesh, coarse);
    const restore = drawFromFewerTriangles();
    expect(geometry.index).toBe(coarse);
    restore();
    expect(geometry.index).toBe(full);
    undo();
    drawFromFewerTriangles()();
    const lent = drawFromFewerTriangles();
    expect(geometry.index).toBe(full);
    lent();
    // A mesh whose geometry is disposed (a rig rebuilt for a new journey) is no longer lent anything.
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 4, 4, 4)), otherFull = other.geometry.index!;
    castShadowFrom(other, coarse);
    other.geometry.dispose();
    const after = drawFromFewerTriangles();
    expect(other.geometry.index).toBe(otherFull);
    after();
    geometry.dispose();
  });

  it('casts from the worker\'s triangles when they arrive, and from the full mesh when the worker cannot help', async () => {
    vi.stubGlobal('Worker', class {});
    const mesh = () => new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96));
    const worker = () => ({ onmessage: null as ((event: MessageEvent) => void) | null, onerror: null as ((event: ErrorEvent) => void) | null, postMessage: vi.fn(), terminate: vi.fn() });
    const args = (m: THREE.Mesh) => [{} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.Camera(), new THREE.Camera(), m.geometry, new THREE.MeshDepthMaterial(), new THREE.Group()] as const;

    // The worker's reply is taken: the shadow draw sees the coarse index; the colour draw keeps the full one.
    const taken = mesh(), w = worker(), full = taken.geometry.index!;
    const done = castShadowFromFewerTriangles(taken, () => w as unknown as Worker);
    const [message] = w.postMessage.mock.calls[0]! as [{ indices: Uint32Array; positions: Float32Array }];
    expect(message.indices.length).toBe(full.count);
    expect(message.positions.length).toBe(taken.geometry.getAttribute('position').count * 3);
    w.onmessage!({ data: { type: 'complete', indices: new Uint32Array([0, 1, 2]), error: 0.0004 } } as MessageEvent);
    expect(await done).toBe(0.0004);
    taken.onBeforeShadow(...args(taken));
    expect(taken.geometry.index!.count).toBe(3);
    taken.onAfterShadow(...args(taken));
    expect(taken.geometry.index).toBe(full);
    expect(w.terminate).toHaveBeenCalledOnce();

    // An error, a worker that fails to start or cannot be made, and a mesh already light enough change nothing.
    for (const fail of ['error', 'onerror', 'throw', 'small'] as const) {
      const m = fail === 'small' ? new THREE.Mesh(new THREE.BoxGeometry()) : mesh(), w2 = worker();
      const pending = castShadowFromFewerTriangles(m, () => { if (fail === 'throw') throw new Error('blocked'); return w2 as unknown as Worker; });
      if (fail === 'error') w2.onmessage!({ data: { type: 'error', message: 'no' } } as MessageEvent);
      if (fail === 'onerror') w2.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
      expect(await pending, fail).toBeNull();
      expect(m.onBeforeShadow, fail).toBe(THREE.Object3D.prototype.onBeforeShadow);
      if (fail === 'small') expect(w2.postMessage).not.toHaveBeenCalled();
    }
  });
});
