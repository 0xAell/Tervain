import * as THREE from 'three';

/**
 * Fixed settlement shells already have world-space vertices. Walls, roofing and trim
 * need distinct coloured materials, but the sun sees identical opaque depth. Pack
 * their unmodified triangles once. Each shadow pass selects contiguous index ranges
 * using exactly the original part spheres, so a culled building costs no triangles.
 */
export function buildRegionSun(regions: readonly THREE.Group[]) {
  const group = new THREE.Group();
  group.name = 'Settlement sun casters';
  group.visible = false;
  const sides = new Map<THREE.Side, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]>();
  const identity = new THREE.Matrix4();
  for (const region of regions) {
    if (region.matrixAutoUpdate) region.updateMatrix();
    if (!region.matrix.equals(identity)) continue;
    for (const child of region.children) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      if (!mesh.isMesh || mesh.matrixAutoUpdate) continue;
      // Region.toGroup freezes each shell part after baking its pose into its vertices.
      if (!mesh.matrix.equals(identity)) continue;
      const mat = mesh.material;
      if (!mesh.castShadow || !mesh.geometry.index || !mat.isMeshStandardMaterial
        || mat.transparent || mat.alphaTest || mat.alphaToCoverage || mat.displacementMap || mat.clipShadows
        || mat.wireframe || mesh.customDepthMaterial || mesh.customDistanceMaterial) continue;
      // PCF depth reverses material.side unless shadowSide is explicit.
      const side = mat.shadowSide ?? (mat.side === THREE.FrontSide ? THREE.BackSide : mat.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
      const parts = sides.get(side) ?? [];
      parts.push(mesh); sides.set(side, parts);
    }
  }
  const select: ((frustum: THREE.Frustum) => void)[] = [];
  const owned: { dispose(): void }[] = [];
  const sphere = new THREE.Sphere();
  for (const [side, parts] of sides) {
    if (parts.length < 2) continue;
    const material = new THREE.MeshBasicMaterial({ side });
    material.shadowSide = side;
    owned.push(material);
    const vertexCount = parts.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
    const indexCount = parts.reduce((sum, mesh) => sum + mesh.geometry.index!.count, 0);
    const xyz = new Float32Array(vertexCount * 3);
    const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    let vertex = 0, start = 0;
    const spans = parts.map(mesh => {
      const geometry = mesh.geometry, position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const index = geometry.index!, first = start;
      xyz.set(position.array, vertex * 3);
      for (let i = 0; i < index.count; i++) indices[start++] = vertex + index.getX(i);
      vertex += position.count;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      mesh.castShadow = false;
      return { mesh, first, end: start, bound: geometry.boundingSphere! };
    });
    const position = new THREE.BufferAttribute(xyz, 3), index = new THREE.BufferAttribute(indices, 1);
    // Alternating visible and culled parts produce the largest possible number of runs.
    const runs = Array.from({ length: Math.ceil(parts.length / 2) }, (_, n) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', position); geometry.setIndex(index);
      owned.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `settlement sun:${side}:${n}`;
      mesh.castShadow = true;
      // Each original bounding sphere is tested below in the sun's own frustum.
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      return mesh;
    });
    let shown = 0;
    select.push(frustum => {
      let count = 0, open = -1, end = 0;
      for (const span of spans) {
        const mesh = span.mesh;
        if (mesh.visible && mesh.parent!.visible && mesh.material.visible &&
            frustum.intersectsSphere(sphere.copy(span.bound).applyMatrix4(mesh.matrixWorld))) {
          if (open < 0) open = span.first;
          end = span.end;
        } else if (open >= 0) {
          runs[count]!.geometry.setDrawRange(open, end - open);
          runs[count++]!.visible = true;
          open = -1;
        }
      }
      if (open >= 0) {
        runs[count]!.geometry.setDrawRange(open, end - open);
        runs[count++]!.visible = true;
      }
      for (let i = count; i < shown; i++) runs[i]!.visible = false;
      shown = count;
    });
  }
  return {
    group,
    update(frustum: THREE.Frustum) { for (const choose of select) choose(frustum); },
    dispose() {
      group.removeFromParent();
      for (const parts of sides.values()) for (const mesh of parts) mesh.castShadow = true;
      for (const item of owned) item.dispose();
    },
  };
}
