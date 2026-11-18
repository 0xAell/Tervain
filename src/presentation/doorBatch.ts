import * as THREE from 'three';
import type { DoorLeaf } from './buildings';

/**
 * The rooms' door leaves drawn as one batch per material (the planks and the iron), each leaf an instance whose matrix
 * follows its pivot. Built apart from the merged shells so they can swing (A66), the 18 leaves were two meshes each, a
 * draw call each in every pass that drew them (the picture, the sun's shadow map, the water's reflection) for about 270
 * triangles: 84 of a frame's 758 draws at the village's busiest stop on the benchmark route. The leaves' own meshes stay
 * in the scene graph, hidden (their names, pivots and places are kept for lookups), as mergeStaticParts keeps a fixed
 * prop's parts.
 */
export interface DoorBatch {
  /** One batch per material, added beside the pivots. */
  readonly meshes: readonly THREE.BatchedMesh[];
  /** Puts each leaf that swung since the last call where its pivot now holds it. Call after the doors swing. */
  update(): void;
  dispose(): void;
}

/**
 * A copy of a leaf material for the batch alone, kept equal to its source. Three makes a batched object's program apart
 * from a single mesh's, so one material drawn both ways has its program looked up again at every switch, in every pass
 * of every frame (A78 found such lookups once a frame). A set built before the baked surfaces arrived takes them up later
 * (regions.ts `adoptBaked`): the copy follows each change its source announces.
 */
function followingCopy(source: THREE.Material): { material: THREE.Material; follow(): void } {
  const material = source.clone();
  // Three's copy leaves out a material's shader hooks: a patched source keeps its patch here too.
  const hooks = () => { material.onBeforeCompile = source.onBeforeCompile; material.customProgramCacheKey = source.customProgramCacheKey; };
  hooks();
  let seen = source.version;
  return {
    material,
    follow() {
      if (source.version === seen) return;
      seen = source.version;
      material.copy(source);
      hooks();
      material.needsUpdate = true;
    },
  };
}

interface Leaf {
  pivot: THREE.Object3D;
  /** The leaf mesh's matrix in its pivot's space (the parts below a pivot do not move). */
  below: THREE.Matrix4;
  batch: THREE.BatchedMesh;
  instance: number;
  angle: number;
}

/**
 * Draw `doors`' leaves as batches added to `parent`, the group that holds their pivots. Leaves are bucketed by material,
 * shadow flags and vertex layout; a bucket of one stays as it is. Returns null when nothing was batched.
 */
export function batchDoorLeaves(doors: readonly DoorLeaf[], parent: THREE.Object3D): DoorBatch | null {
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: { pivot: THREE.Object3D; mesh: THREE.Mesh }[] }>();
  for (const { pivot } of doors) {
    if (pivot.parent !== parent) continue;
    pivot.updateMatrixWorld(true);
    pivot.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      if (!mesh.visible || Array.isArray(mesh.material) || mesh.morphTargetInfluences || !mesh.geometry.index) return;
      const geometry = mesh.geometry;
      const layout = Object.keys(geometry.attributes).sort().map((name) => `${name}${geometry.attributes[name]!.itemSize}`).join(',');
      const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${layout}`;
      const bucket = buckets.get(key) ?? buckets.set(key, { material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [] }).get(key)!;
      bucket.parts.push({ pivot, mesh });
    });
  }
  const meshes: THREE.BatchedMesh[] = [], leaves: Leaf[] = [], copies: ReturnType<typeof followingCopy>[] = [];
  const depthMaterials: THREE.Material[] = [];
  // The batch stands at the leaves' middle, so an instance's offset, kept in single precision, is small.
  const middle = new THREE.Vector3(), place = new THREE.Matrix4(), offset = new THREE.Matrix4();
  for (const { material, cast, receive, parts } of buckets.values()) {
    if (parts.length < 2) continue;
    middle.set(0, 0, 0);
    for (const { pivot } of parts) middle.add(pivot.position);
    middle.divideScalar(parts.length);
    let vertices = 0, indices = 0;
    for (const { mesh } of parts) { vertices += mesh.geometry.getAttribute('position').count; indices += mesh.geometry.index!.count; }
    const copy = followingCopy(material);
    const batch = new THREE.BatchedMesh(parts.length, vertices, indices, copy.material);
    batch.name = `doors:${material.name || (parts[0]!.mesh.name.split(':').pop() ?? 'leaf')}`;
    batch.castShadow = cast;
    batch.receiveShadow = receive;
    // Its own depth material for the sun's shadow: three's shared one, switched between batched and single casters, would
    // have its program looked up again at each switch. The same kind three uses (unpacked depth), so the same shadow.
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
    batch.customDepthMaterial = depth;
    batch.position.copy(middle);
    batch.updateMatrix();
    batch.matrixAutoUpdate = false;
    offset.makeTranslation(-middle.x, -middle.y, -middle.z);
    for (const { pivot, mesh } of parts) {
      const below = new THREE.Matrix4();
      for (let o: THREE.Object3D | null = mesh; o && o !== pivot; o = o.parent) below.premultiply(o.matrix);
      const instance = batch.addInstance(batch.addGeometry(mesh.geometry));
      batch.setMatrixAt(instance, place.multiplyMatrices(offset, pivot.matrix).multiply(below));
      leaves.push({ pivot, below, batch, instance, angle: pivot.rotation.y });
      mesh.visible = false;
      mesh.userData.batchedInto = batch;
    }
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    parent.add(batch);
    meshes.push(batch);
    copies.push(copy);
    depthMaterials.push(depth);
  }
  if (!meshes.length) return null;
  const moved = new Set<THREE.BatchedMesh>();
  return {
    meshes,
    update() {
      for (const copy of copies) copy.follow();
      for (const leaf of leaves) {
        const angle = leaf.pivot.rotation.y;
        if (angle === leaf.angle) continue;
        leaf.angle = angle;
        leaf.pivot.updateMatrix();
        offset.makeTranslation(-leaf.batch.position.x, -leaf.batch.position.y, -leaf.batch.position.z);
        leaf.batch.setMatrixAt(leaf.instance, place.multiplyMatrices(offset, leaf.pivot.matrix).multiply(leaf.below));
        moved.add(leaf.batch);
      }
      // A leaf swings about a metre at most; the bounds follow so the batch is never culled with a leaf still in view.
      for (const batch of moved) { batch.computeBoundingBox(); batch.computeBoundingSphere(); }
      moved.clear();
    },
    dispose() {
      for (const batch of meshes) { batch.removeFromParent(); batch.dispose(); }
      for (const copy of copies) copy.material.dispose();
      for (const depth of depthMaterials) depth.dispose();
    },
  };
}
