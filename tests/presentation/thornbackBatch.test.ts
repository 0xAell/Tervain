import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createThornback } from '../../src/presentation/characters';

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

function worst(actual: number[], expected: number[]): number {
  expect(actual).toHaveLength(expected.length);
  let most = 0;
  for (let i = 0; i < actual.length; i++) most = Math.max(most, Math.abs(actual[i]! - expected[i]!));
  return most;
}

describe('the thornback drawn as one batch per material', () => {
  it('draws its twelve merged parts in two batches with its own materials, each part where its joint holds it, posed or fallen', () => {
    const rig = createThornback();
    const batches = rig.parts!.meshes;
    // One batch for the hide, one for the bone; the parts' own meshes stay in place, hidden.
    expect(batches).toHaveLength(2);
    expect(new Set(batches.map((b) => b.material))).toEqual(new Set(rig.materials));
    const parts: THREE.Mesh[] = [];
    rig.body.traverse((o) => { if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh); });
    expect(parts).toHaveLength(12);
    for (const part of parts) {
      expect(part.visible).toBe(false);
      expect(batches).toContain(part.userData.batchedInto);
    }
    // The creature walks, turns its head and falls: every part is drawn where it would have been drawn alone.
    const check = () => {
      // As the frame does before drawing (renderWorld's scene.updateMatrixWorld): a moved root carries the batches with it.
      rig.root.updateMatrixWorld(true);
      for (const part of parts) {
        const batch = part.userData.batchedInto as THREE.BatchedMesh;
        expect(worst(drawnInBatch(batch, part.userData.batchedInstance as number, part.geometry), drawnAlone(part))).toBeLessThan(1e-5);
      }
    };
    check();
    rig.root.position.set(110, 4, -56); rig.root.rotation.y = 0.8;
    rig.legL.rotation.x = 0.6; rig.legR.rotation.x = -0.6; rig.head.rotation.x = -0.3; rig.torso.rotation.x = 0.1;
    rig.hips.position.y = 0.62;
    rig.parts!.update();
    check();
    rig.body.rotation.z = 1.4;
    rig.parts!.update();
    check();
  });

  it('hides with the creature, as its own meshes did', () => {
    const rig = createThornback(), scene = new THREE.Scene();
    scene.add(rig.root);
    const drawn = () => { const out: THREE.Object3D[] = []; scene.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) out.push(o); }); return out; };
    expect(drawn()).toEqual(rig.parts!.meshes);
    rig.root.visible = false;
    expect(drawn()).toEqual([]);
  });
});
