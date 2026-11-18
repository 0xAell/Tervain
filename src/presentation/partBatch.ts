import * as THREE from 'three';

/**
 * Small parts that move drawn as one batch per material, each part an instance whose matrix follows the object holding
 * it: the rooms' door leaves on their pivots (A66) and the pushable barrels and crates on their bodies' poses. Each part
 * was a mesh of its own, a draw call in every pass that drew it (the picture, the sun's shadow map, the water's
 * reflection) for a few hundred triangles; the doors alone were 84 of a frame's 758 draws at the village's busiest stop
 * on the benchmark route. The parts' own meshes stay in the scene graph, hidden (their names, holders and places are kept
 * for lookups), as mergeStaticParts keeps a fixed prop's parts.
 */
export interface PartBatch {
  /** One batch per material, added beside the holders. */
  readonly meshes: readonly THREE.BatchedMesh[];
  /** Puts the parts of each holder that moved, or was shown or hidden, since the last call where it now is. */
  update(): void;
  dispose(): void;
}

export interface PartBatchOptions {
  /** The batches are named `<name>:<material>`. */
  name: string;
  /**
   * Draw with copies of the parts' materials, kept equal to them, for materials that single meshes draw too. Three makes a
   * batched object's program apart from a single mesh's, so one material drawn both ways has its program looked up again
   * at every switch, in every pass of every frame (A78 found such lookups once a frame). Materials only the parts use are
   * drawn as they are.
   */
  copyMaterials: boolean;
}

/**
 * A copy of a part's material for the batch alone, kept equal to its source: a building set built before the baked
 * surfaces arrived takes them up later (regions.ts `adoptBaked`), and the copy follows each change its source announces.
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

interface Held {
  holder: THREE.Object3D;
  /** The holder's matrix and visibility when its parts were last placed. */
  matrix: THREE.Matrix4;
  visible: boolean;
  parts: { below: THREE.Matrix4; batch: THREE.BatchedMesh; instance: number }[];
}

/**
 * Draw the meshes under each of `holders` as batches added to `parent`, the group that holds them. The meshes are bucketed
 * by material, shadow flags and vertex layout; a bucket of one stays as it is. Returns null when nothing was batched.
 */
export function batchParts(holders: readonly THREE.Object3D[], parent: THREE.Object3D, options: PartBatchOptions): PartBatch | null {
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: { holder: THREE.Object3D; mesh: THREE.Mesh }[] }>();
  for (const holder of holders) {
    if (holder.parent !== parent) continue;
    holder.updateMatrixWorld(true);
    holder.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      if (!mesh.visible || Array.isArray(mesh.material) || mesh.morphTargetInfluences || !mesh.geometry.index) return;
      const geometry = mesh.geometry;
      const layout = Object.keys(geometry.attributes).sort().map((name) => `${name}${geometry.attributes[name]!.itemSize}`).join(',');
      const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${layout}`;
      const bucket = buckets.get(key) ?? buckets.set(key, { material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [] }).get(key)!;
      bucket.parts.push({ holder, mesh });
    });
  }
  const meshes: THREE.BatchedMesh[] = [], copies: ReturnType<typeof followingCopy>[] = [], depthMaterials: THREE.Material[] = [];
  const held = new Map<THREE.Object3D, Held>(), toBatch = new Map<THREE.BatchedMesh, THREE.Matrix4>();
  // A batch stands at its parts' middle, so an instance's offset, kept in single precision, is small.
  const middle = new THREE.Vector3(), place = new THREE.Matrix4();
  for (const { material, cast, receive, parts } of buckets.values()) {
    if (parts.length < 2) continue;
    middle.set(0, 0, 0);
    for (const { holder } of parts) middle.add(holder.position);
    middle.divideScalar(parts.length);
    let vertices = 0, indices = 0;
    for (const { mesh } of parts) { vertices += mesh.geometry.getAttribute('position').count; indices += mesh.geometry.index!.count; }
    const copy = options.copyMaterials ? followingCopy(material) : null;
    const batch = new THREE.BatchedMesh(parts.length, vertices, indices, copy?.material ?? material);
    batch.name = `${options.name}:${material.name || (parts[0]!.mesh.name.split(':').pop() ?? 'part')}`;
    batch.castShadow = cast;
    batch.receiveShadow = receive;
    // Its own depth material for the sun's shadow: three's shared one, switched between batched and single casters, would
    // have its program looked up again at each switch. The same kind three uses (unpacked depth), so the same shadow.
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
    batch.customDepthMaterial = depth;
    batch.position.copy(middle);
    batch.updateMatrix();
    batch.matrixAutoUpdate = false;
    const offset = new THREE.Matrix4().makeTranslation(-middle.x, -middle.y, -middle.z);
    toBatch.set(batch, offset);
    for (const { holder, mesh } of parts) {
      const below = new THREE.Matrix4();
      for (let o: THREE.Object3D | null = mesh; o && o !== holder; o = o.parent) below.premultiply(o.matrix);
      const instance = batch.addInstance(batch.addGeometry(mesh.geometry));
      batch.setMatrixAt(instance, place.multiplyMatrices(offset, holder.matrix).multiply(below));
      let entry = held.get(holder);
      if (!entry) { entry = { holder, matrix: holder.matrix.clone(), visible: holder.visible, parts: [] }; held.set(holder, entry); }
      entry.parts.push({ below, batch, instance });
      if (!holder.visible) batch.setVisibleAt(instance, false);
      mesh.visible = false;
      mesh.userData.batchedInto = batch;
    }
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    parent.add(batch);
    meshes.push(batch);
    if (copy) copies.push(copy);
    depthMaterials.push(depth);
  }
  if (!meshes.length) return null;
  const moved = new Set<THREE.BatchedMesh>();
  return {
    meshes,
    update() {
      for (const copy of copies) copy.follow();
      for (const entry of held.values()) {
        const holder = entry.holder;
        if (holder.matrixAutoUpdate) holder.updateMatrix();
        const placed = !holder.matrix.equals(entry.matrix), shown = holder.visible !== entry.visible;
        if (!placed && !shown) continue;
        entry.matrix.copy(holder.matrix);
        entry.visible = holder.visible;
        for (const part of entry.parts) {
          if (placed) part.batch.setMatrixAt(part.instance, place.multiplyMatrices(toBatch.get(part.batch)!, holder.matrix).multiply(part.below));
          if (shown) part.batch.setVisibleAt(part.instance, holder.visible);
          moved.add(part.batch);
        }
      }
      // The bounds follow, so a batch is never culled with a part of it still in view.
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
