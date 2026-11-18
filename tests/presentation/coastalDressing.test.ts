import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildScatter } from '../../src/presentation/scatter';
import { createShoreDetailPopulation } from '../../src/presentation/scatterPopulation';
import type { BuildContext, Quality } from '../../src/presentation/context';
import { Exclusions } from '../../src/presentation/vegetation';
import { Colliders } from '../../src/core/world/colliders';
import { Terrain } from '../../src/core/world/terrain';

let terrain: Terrain;
let exclusions: Exclusions;
beforeAll(() => { terrain = new Terrain(); exclusions = new Exclusions(terrain); });

function build(quality: Quality) {
  return buildScatter({ terrain, excl: exclusions, quality, colliders: new Colliders() } as BuildContext);
}

describe('original coastal dressing render contract', () => {
  it('attaches original painted cutout leaves to static woody scrub with normalized charts and matching shadow cutouts', () => {
    const view = build('high');
    try {
      const details = createShoreDetailPopulation(terrain, exclusions);
      expect(view.counts.driftwood).toBe(details.filter(detail => detail.kind === 'driftwood').length);
      expect(view.counts.shoreScrub).toBe(details.filter(detail => detail.kind === 'scrub').length);
      const leafMeshes: THREE.Mesh[] = [];
      // The chunks' own meshes (each is drawn by its material's batch, which shares their geometry and material).
      view.group.traverse(object => { if (object instanceof THREE.Mesh && !(object instanceof THREE.BatchedMesh) && object.name.endsWith(':cloth')) leafMeshes.push(object); });
      expect(leafMeshes.length).toBeGreaterThan(0);
      let leafTriangles = 0;
      for (const mesh of leafMeshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        expect(material.map).toBeInstanceOf(THREE.DataTexture);
        expect(material.map!.colorSpace).toBe(THREE.NoColorSpace);
        expect(material.alphaTest).toBe(0.35);
        expect(material.side).toBe(THREE.DoubleSide);
        expect(mesh.castShadow).toBe(true);
        expect(mesh.matrixAutoUpdate).toBe(false);
        const uv = mesh.geometry.getAttribute('uv');
        // Ordinary map UVs and alphaTest are consumed by Three's native depth and distance passes.
        // The region's usual metre-scale cloth chart must not distort these independent leaf charts.
        expect(new Set(Array.from(uv.array))).toEqual(new Set([0, 0.5, 1]));
        const pos = mesh.geometry.getAttribute('position'), normal = mesh.geometry.getAttribute('normal'), index = mesh.geometry.getIndex()!;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
        for (let triangle = 0; triangle < index.count; triangle += 3) {
          const i = index.getX(triangle), j = index.getX(triangle + 1), k = index.getX(triangle + 2);
          a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j); c.fromBufferAttribute(pos, k);
          n.fromBufferAttribute(normal, i);
          expect(b.sub(a).cross(c.sub(a)).dot(n)).toBeGreaterThan(0);
        }
        leafTriangles += mesh.geometry.getIndex()!.count / 3;
      }
      expect(leafTriangles).toBe(view.counts.shoreScrub * 72);
    } finally { view.dispose?.(); }
  });

  it('draws each material\'s chunks as one batch, every chunk culled on its own and drawn exactly where it was', () => {
    const view = build('high');
    try {
      const chunks = new Map<string, THREE.Mesh[]>();
      view.group.traverse(object => {
        if (!(object instanceof THREE.Mesh) || object instanceof THREE.BatchedMesh) return;
        const material = object.name.split(':').pop()!;
        (chunks.get(material) ?? chunks.set(material, []).get(material)!).push(object);
      });
      const batches = view.group.children.filter((o): o is THREE.BatchedMesh => o instanceof THREE.BatchedMesh);
      // Rocks, the driftwood's and scrub's bark and leaves, the wrack and reeds, the cattails: one batch each.
      expect(batches.map(b => b.name).sort()).toEqual(['scatter:bark', 'scatter:cloth', 'scatter:leaf', 'scatter:rock', 'scatter:vc']);
      let rock = 0, small = 0;
      for (const batch of batches) {
        const meshes = chunks.get(batch.name.split(':')[1]!)!;
        expect(batch.instanceCount, batch.name).toBe(meshes.length);
        expect(batch.perObjectFrustumCulled).toBe(true);
        for (const mesh of meshes) {
          expect(mesh.visible).toBe(false);
          expect(mesh.userData.batchedInto).toBe(batch);
          // The chunk stands at the origin: its instance's matrix is the identity, so its vertices are drawn as before,
          // and it is culled by the same bounds.
          const instance = mesh.userData.batchedInstance as number;
          const matrix = batch.getMatrixAt(instance, new THREE.Matrix4()).premultiply(batch.matrix);
          expect(matrix.equals(new THREE.Matrix4())).toBe(true);
          const sphere = batch.getBoundingSphereAt(batch.getGeometryIdAt(instance), new THREE.Sphere())!;
          mesh.geometry.computeBoundingSphere();
          expect(sphere.center.distanceTo(mesh.geometry.boundingSphere!.center)).toBeLessThan(1e-4);
          expect(Math.abs(sphere.radius - mesh.geometry.boundingSphere!.radius)).toBeLessThan(1e-4);
          const triangles = mesh.geometry.getIndex()!.count / 3;
          if (batch.name === 'scatter:rock') rock += triangles; else small += triangles;
        }
      }
      // Wet shingle and fronds travel in the vertex-colour batch; only larger solid rock needs the mineral shader.
      expect([rock, small]).toEqual([41640, 26280]);
    } finally { view.dispose?.(); }
  });

  it('gives rebuilt coastal scrub its own disposable leaf texture without invalidating another world', () => {
    const first = build('low'), second = build('high');
    const material = (view: ReturnType<typeof build>) => {
      let found: THREE.MeshStandardMaterial | undefined;
      view.group.traverse(object => { if (object instanceof THREE.Mesh && object.name.endsWith(':cloth')) found = object.material as THREE.MeshStandardMaterial; });
      return found!;
    };
    const a = material(first), b = material(second);
    expect(a.map).not.toBe(b.map);
    expect(a.map!.source).not.toBe(b.map!.source);
    const dispose = vi.spyOn(a.map!, 'dispose'), retainedDispose = vi.spyOn(b.map!, 'dispose');
    try {
      first.dispose?.();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(retainedDispose).not.toHaveBeenCalled();
      expect((b.map as THREE.DataTexture).image.data!.length).toBe(128 * 128 * 4);
    } finally { second.dispose?.(); }
    expect(retainedDispose).toHaveBeenCalledTimes(1);
  });
});
