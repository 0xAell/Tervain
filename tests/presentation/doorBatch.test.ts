import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { DoorLeaf } from '../../src/presentation/buildings';
import { batchDoorLeaves } from '../../src/presentation/doorBatch';
import { buildScenery } from '../../src/presentation/settlement';
import { buildStaticColliders } from '../../src/core/world/colliders';
import { Terrain } from '../../src/core/world/terrain';

// Raster materials only, as in coplanarFaces.test.ts: the real generators, geometry and placements run.
vi.mock('../../src/presentation/regions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/presentation/regions')>();
  class MaterialSet {
    readonly windowMat = new THREE.MeshBasicMaterial({ name: 'pane' });
    readonly lanternMat = new THREE.MeshBasicMaterial({ name: 'glow' });
    readonly daylightMat = new THREE.MeshBasicMaterial({ name: 'daylight' });
    private readonly materials = new Map<string, THREE.Material>([['pane', this.windowMat], ['glow', this.lanternMat], ['daylight', this.daylightMat]]);
    get(key: string) {
      if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ name: key }));
      return this.materials.get(key)!;
    }
    dispose() {}
  }
  return { ...actual, MaterialSet };
});

/** Where `mesh`'s vertices stand in the world, as drawn by itself. */
function drawnAlone(mesh: THREE.Mesh): number[] {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position'), v = new THREE.Vector3(), out: number[] = [];
  for (let i = 0; i < position.count; i++) out.push(...v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray());
  return out;
}

/** Where the same vertices stand as the batch draws them: its matrix, then the instance's. */
function drawnInBatch(batch: THREE.BatchedMesh, instance: number, geometry: THREE.BufferGeometry): number[] {
  batch.updateWorldMatrix(true, false);
  const matrix = batch.getMatrixAt(instance, new THREE.Matrix4()).premultiply(batch.matrixWorld);
  const position = geometry.getAttribute('position'), v = new THREE.Vector3(), out: number[] = [];
  for (let i = 0; i < position.count; i++) out.push(...v.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray());
  return out;
}

function expectClose(actual: number[], expected: number[], tolerance: number) {
  expect(actual).toHaveLength(expected.length);
  let worst = 0;
  for (let i = 0; i < actual.length; i++) worst = Math.max(worst, Math.abs(actual[i]! - expected[i]!));
  expect(worst).toBeLessThan(tolerance);
}

/** Three doors in a street, each a leaf of planks and iron hanging from its pivot, as settlement.ts hangs them. */
function street() {
  const parent = new THREE.Group(), planks = new THREE.MeshStandardMaterial({ name: 'planks' }), iron = new THREE.MeshStandardMaterial({ name: 'metal', metalness: 0.32 });
  const doors: DoorLeaf[] = [];
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(), leaf = new THREE.Group();
    pivot.position.set(-40 + i * 37, 1.5 + i * 0.1, 12 - i * 9);
    pivot.rotation.y = 0.3 + i;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1 + i * 0.05, 2, 0.06, 2, 3, 1), planks);
    board.position.set(0.55, 1, 0); board.name = `door-${i}:planks`; board.castShadow = board.receiveShadow = true;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.02), iron);
    strap.position.set(0.45, 0.4 + i * 0.1, 0.04); strap.name = `door-${i}:metal`; strap.castShadow = strap.receiveShadow = true;
    leaf.add(board, strap);
    pivot.add(leaf);
    parent.add(pivot);
    doors.push({ room: {} as DoorLeaf['room'], pivot });
  }
  parent.updateMatrixWorld(true);
  return { parent, planks, iron, doors };
}

describe('the doors drawn as one batch per material', () => {
  it('draws every leaf where its own meshes stood, one batch for the planks and one for the iron, the meshes hidden', () => {
    const { parent, planks, iron, doors } = street();
    const leaves = doors.map((d) => { const meshes: THREE.Mesh[] = []; d.pivot.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); }); return meshes; });
    const before = leaves.map((meshes) => meshes.map(drawnAlone));
    const batch = batchDoorLeaves(doors, parent)!;
    expect(batch.meshes.map((m) => [m.name, m.instanceCount, m.castShadow, m.receiveShadow, m.parent === parent])).toEqual([
      ['doors:planks', 3, true, true, true], ['doors:metal', 3, true, true, true],
    ]);
    for (const [i, meshes] of leaves.entries()) {
      meshes.forEach((mesh, k) => {
        expect(mesh.visible).toBe(false);
        const owner = batch.meshes[k]!;
        expect(mesh.userData.batchedInto).toBe(owner);
        expectClose(drawnInBatch(owner, i, mesh.geometry), before[i]![k]!, 1e-5);
      });
    }
    // Its own copies of the leaves' materials (three makes a batched object's program apart), and its own depth material.
    const [boards, straps] = batch.meshes as THREE.BatchedMesh[];
    expect(boards!.material).not.toBe(planks);
    expect((straps!.material as THREE.MeshStandardMaterial).metalness).toBe(iron.metalness);
    expect(boards!.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect((boards!.customDepthMaterial as THREE.MeshDepthMaterial).depthPacking).toBe(THREE.BasicDepthPacking);
  });

  it('follows a leaf as its door swings, and its material as the set takes up baked surfaces', () => {
    const { parent, planks, doors } = street();
    const batch = batchDoorLeaves(doors, parent)!;
    const [boards] = batch.meshes as THREE.BatchedMesh[];
    const board = doors[1]!.pivot.children[0]!.children[0] as THREE.Mesh;
    doors[1]!.pivot.rotation.y += Math.PI / 2;
    const radius = boards!.boundingSphere!.radius;
    batch.update();
    expectClose(drawnInBatch(boards!, 1, board.geometry), drawnAlone(board), 1e-5);
    expect(boards!.boundingSphere!.radius).not.toBe(radius);
    // Still where they stood: the leaves that did not swing.
    const still = doors[0]!.pivot.children[0]!.children[0] as THREE.Mesh;
    expectClose(drawnInBatch(boards!, 0, still.geometry), drawnAlone(still), 1e-5);

    const baked = new THREE.Texture();
    planks.map = baked;
    planks.needsUpdate = true;
    const version = boards!.material.version;
    batch.update();
    expect((boards!.material as THREE.MeshStandardMaterial).map).toBe(baked);
    expect(boards!.material.version).toBeGreaterThan(version);
    batch.update();
    expect(boards!.material.version).toBe(version + 1);
  });

  it('leaves a lone leaf as it is, and lets go of its batches, copies and depth materials', () => {
    const { parent, doors } = street();
    expect(batchDoorLeaves(doors.slice(0, 1), parent)).toBeNull();
    expect(parent.children.some((o) => (o as THREE.BatchedMesh).isBatchedMesh)).toBe(false);
    const batch = batchDoorLeaves(doors, parent)!;
    const released = vi.fn();
    for (const mesh of batch.meshes) {
      mesh.geometry.addEventListener('dispose', released);
      (mesh.material as THREE.Material).addEventListener('dispose', released);
      mesh.customDepthMaterial!.addEventListener('dispose', released);
    }
    batch.dispose();
    expect(released).toHaveBeenCalledTimes(6);
    expect(parent.children.some((o) => (o as THREE.BatchedMesh).isBatchedMesh)).toBe(false);
  });

  it('batches all eighteen of the settlement\'s leaves into two draws, each exactly where its leaf hangs', () => {
    vi.stubGlobal('document', { createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => context };
      const context = new Proxy<Record<string, unknown>>({ canvas, measureText: (t: string) => ({ width: t.length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
      { get: (target, key) => target[String(key)] ?? (() => {}) });
      return canvas;
    } });
    const terrain = new Terrain();
    const scenery = buildScenery(terrain, buildStaticColliders(terrain), 'low');
    scenery.group.updateMatrixWorld(true);
    expect(scenery.doors).toHaveLength(18);
    const batches = scenery.doorBatch!.meshes;
    expect(batches.map((m) => [m.name, m.instanceCount])).toEqual([['doors:planks', 18], ['doors:metal', 18]]);
    let leaves = 0;
    for (const { pivot } of scenery.doors) {
      pivot.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        leaves++;
        expect(mesh.visible).toBe(false);
        const owner = mesh.userData.batchedInto as THREE.BatchedMesh;
        expect(batches).toContain(owner);
      });
    }
    expect(leaves).toBe(36);
    // The doors swing as residents pass: the reeve's door opened halfway is drawn where its own meshes would be.
    const reeve = scenery.doors.find((d) => d.pivot.name === 'Door / reeve_house')!;
    reeve.pivot.rotation.y += 0.8;
    scenery.doorBatch!.update();
    reeve.pivot.updateMatrixWorld(true);
    const index = scenery.doors.indexOf(reeve);
    reeve.pivot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      expectClose(drawnInBatch(mesh.userData.batchedInto as THREE.BatchedMesh, index, mesh.geometry), drawnAlone(mesh), 1e-4);
    });
    scenery.dispose();
  });
});
