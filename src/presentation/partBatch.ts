import * as THREE from 'three';

/**
 * Small parts that move drawn as one batch per material, each part an instance whose matrix follows what holds it: the
 * rooms' door leaves on their pivots (A66), the settlement's signs, gates, wheels and bell, and the pushable barrels and
 * crates on their bodies' poses. Each part was a mesh of its own, a draw call in every pass that drew it (the picture, the
 * sun's shadow map, the water's reflection) for a few hundred triangles; the doors alone were 84 of a frame's 758 draws at
 * the village's busiest stop on the benchmark route. The parts' own meshes stay in the scene graph, hidden (their names,
 * holders and places are kept for lookups), as mergeStaticParts keeps a fixed prop's parts.
 */
export interface PartBatch {
  /** One batch per material, added to the parent the parts are placed in. */
  readonly meshes: readonly THREE.BatchedMesh[];
  /** Puts every part whose holders moved, or were shown or hidden, since the last call where it now is. */
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
  /** Which meshes under the holders to batch (all by default). */
  include?: (mesh: THREE.Mesh) => boolean;
}

/**
 * A copy of a part's material for the batch alone, kept equal to its source: a building set built before the baked
 * surfaces arrived takes them up later (regions.ts `adoptBaked`), and the copy follows each change its source announces
 * (`needsUpdate`). A value changed without that, such as a colour animated every frame (the windows' and lanterns' glow at
 * night), would not reach it: such materials are not given to a batch.
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

interface Anchor {
  /** The objects from the parts' own parent up to the batch's parent: their matrices place the parts, and any of them hides them. */
  chain: THREE.Object3D[];
  /** The chain's matrix and visibility when its parts were last placed. */
  matrix: THREE.Matrix4;
  visible: boolean;
  parts: { below: THREE.Matrix4; batch: THREE.BatchedMesh; instance: number }[];
}

/** Where `anchor`'s chain puts its parts in the batch parent's space, from each link's own position, turn and scale. */
function chainMatrix(chain: readonly THREE.Object3D[], into: THREE.Matrix4): THREE.Matrix4 {
  into.identity();
  for (const link of chain) {
    if (link.matrixAutoUpdate) link.updateMatrix();
    into.premultiply(link.matrix);
  }
  return into;
}

/**
 * Draw the meshes under each of `holders`, all within `parent`, as batches added to `parent`. A part follows whatever
 * moves above it up to `parent` (a door's pivot, a sign's swing on its bracket, a barrel's body), and hides when any of
 * them is hidden. A mesh's own matrix is taken as fixed. The meshes are bucketed by material, shadow flags and vertex
 * layout; a bucket of one stays as it is. Returns null when nothing was batched.
 */
export function batchParts(holders: readonly THREE.Object3D[], parent: THREE.Object3D, options: PartBatchOptions): PartBatch | null {
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: { mesh: THREE.Mesh; anchor: Anchor }[] }>();
  const anchors = new Map<THREE.Object3D, Anchor>(), claimed = new Set<THREE.Mesh>();
  parent.updateMatrixWorld(true);
  for (const holder of holders) {
    let within = false;
    for (let o: THREE.Object3D | null = holder; o; o = o.parent) if (o === parent) { within = o !== holder; break; }
    if (!within) continue;
    holder.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || claimed.has(mesh) || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.BatchedMesh).isBatchedMesh) return;
      if (!mesh.visible || Array.isArray(mesh.material) || mesh.morphTargetInfluences || !mesh.parent) return;
      if (options.include && !options.include(mesh)) return;
      let anchor = anchors.get(mesh.parent);
      if (!anchor) {
        const chain: THREE.Object3D[] = [];
        for (let o: THREE.Object3D | null = mesh.parent; o && o !== parent; o = o.parent) chain.push(o);
        let visible = true;
        for (const link of chain) visible &&= link.visible;
        anchor = { chain, matrix: chainMatrix(chain, new THREE.Matrix4()), visible, parts: [] };
        anchors.set(mesh.parent, anchor);
      }
      const geometry = mesh.geometry;
      // A batch holds indexed geometry or unindexed geometry, not both (a creature's merged parts are unindexed).
      const layout = (geometry.index ? 'indexed:' : 'unindexed:') + Object.keys(geometry.attributes).sort().map((name) => `${name}${geometry.attributes[name]!.itemSize}`).join(',');
      const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${layout}`;
      const bucket = buckets.get(key) ?? buckets.set(key, { material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [] }).get(key)!;
      bucket.parts.push({ mesh, anchor });
      claimed.add(mesh);
    });
  }
  const meshes: THREE.BatchedMesh[] = [], copies: ReturnType<typeof followingCopy>[] = [], depthMaterials: THREE.Material[] = [];
  const toBatch = new Map<THREE.BatchedMesh, THREE.Matrix4>();
  // A batch stands at its parts' middle, so an instance's offset, kept in single precision, is small.
  const middle = new THREE.Vector3(), at = new THREE.Vector3(), place = new THREE.Matrix4();
  for (const { material, cast, receive, parts } of buckets.values()) {
    if (parts.length < 2) continue;
    middle.set(0, 0, 0);
    for (const { mesh, anchor } of parts) {
      if (mesh.matrixAutoUpdate) mesh.updateMatrix();
      middle.add(at.setFromMatrixPosition(place.multiplyMatrices(anchor.matrix, mesh.matrix)));
    }
    middle.divideScalar(parts.length);
    let vertices = 0, indices = 0;
    for (const { mesh } of parts) { vertices += mesh.geometry.getAttribute('position').count; indices += mesh.geometry.index?.count ?? 0; }
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
    for (const { mesh, anchor } of parts) {
      const below = mesh.matrix.clone();
      const instance = batch.addInstance(batch.addGeometry(mesh.geometry));
      batch.setMatrixAt(instance, place.multiplyMatrices(offset, anchor.matrix).multiply(below));
      anchor.parts.push({ below, batch, instance });
      if (!anchor.visible) batch.setVisibleAt(instance, false);
      mesh.visible = false;
      mesh.userData.batchedInto = batch;
      mesh.userData.batchedInstance = instance;
    }
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    parent.add(batch);
    meshes.push(batch);
    if (copy) copies.push(copy);
    depthMaterials.push(depth);
  }
  if (!meshes.length) return null;
  // Anchors whose parts all stayed single need no following.
  const followed = [...anchors.values()].filter((anchor) => anchor.parts.length > 0);
  const moved = new Set<THREE.BatchedMesh>(), now = new THREE.Matrix4();
  return {
    meshes,
    update() {
      for (const copy of copies) copy.follow();
      for (const anchor of followed) {
        chainMatrix(anchor.chain, now);
        let visible = true;
        for (const link of anchor.chain) visible &&= link.visible;
        const placed = !now.equals(anchor.matrix), shown = visible !== anchor.visible;
        if (!placed && !shown) continue;
        anchor.matrix.copy(now);
        anchor.visible = visible;
        for (const part of anchor.parts) {
          if (placed) part.batch.setMatrixAt(part.instance, place.multiplyMatrices(toBatch.get(part.batch)!, now).multiply(part.below));
          if (shown) part.batch.setVisibleAt(part.instance, visible);
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
