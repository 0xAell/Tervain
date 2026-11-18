import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegionSun } from '../../src/presentation/regionSun';

function triangle(x: number, material = new THREE.MeshStandardMaterial()) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([x, 0, 0, x + .5, 0, 0, x, .5, 0], 3));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.matrixAutoUpdate = false;
  return mesh;
}

function sunFrustum(x: number, extent: number) {
  const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, .1, 50);
  camera.position.set(x, 0, 10); camera.lookAt(x, 0, 0); camera.updateMatrixWorld();
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

function corners(mesh: THREE.Mesh, drawn: boolean) {
  const geometry = mesh.geometry, vertex = geometry.getAttribute('position'), index = geometry.index!;
  const start = drawn ? geometry.drawRange.start : 0, count = drawn ? geometry.drawRange.count : index.count;
  const result: number[] = [];
  for (let i = start; i < start + count; i++) {
    const j = index.getX(i);
    result.push(vertex.getX(j), vertex.getY(j), vertex.getZ(j));
  }
  return result;
}

describe('settlement sun depth runs', () => {
  it('keeps the exact oriented triangles, per-source culling, hidden regions, and faces across moving sunlight', () => {
    const root = new THREE.Group(), village = new THREE.Group(), quarry = new THREE.Group();
    root.add(village, quarry); root.position.y = .25;
    const doubles = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const sources = [triangle(-24), triangle(6), triangle(-12), triangle(9), triangle(3), triangle(-2, doubles), triangle(20, doubles)];
    village.add(...sources.slice(0, 4)); quarry.add(...sources.slice(4));
    const windows = triangle(1, new THREE.MeshStandardMaterial({ alphaTest: .5 }));
    const moved = triangle(2); moved.position.x = 1; moved.updateMatrix();
    village.add(windows, moved);
    root.updateMatrixWorld(true);
    const sun = buildRegionSun([village, quarry]);
    root.add(sun.group);
    expect(windows.castShadow && moved.castShadow).toBe(true);
    expect(sources.every(mesh => !mesh.castShadow)).toBe(true);
    const indexVersions = sun.group.children.map(object => (object as THREE.Mesh).geometry.index!.version);
    const drawCounts: number[] = [];
    for (const [x, extent, showQuarry] of [[0, 60, true], [6, 5, true], [6, 5, false], [100, 1, true], [0, 60, true]] as const) {
      quarry.visible = showQuarry;
      const frustum = sunFrustum(x, extent);
      sun.update(frustum);
      const drawn = sun.group.children.filter(mesh => mesh.visible) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
      drawCounts.push(drawn.length);
      for (const side of [THREE.BackSide, THREE.DoubleSide]) {
        const original = sources.filter(mesh => mesh.parent!.visible && (mesh.material.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.BackSide) === side && frustum.intersectsObject(mesh));
        expect(drawn.filter(mesh => mesh.material.shadowSide === side).flatMap(mesh => corners(mesh, true))).toEqual(original.flatMap(mesh => corners(mesh, false)));
      }
    }
    expect(drawCounts).toEqual([2, 2, 2, 0, 2]);
    expect(sun.group.children.map(object => (object as THREE.Mesh).geometry.index!.version)).toEqual(indexVersions);
    sun.dispose();
    expect(sources.every(mesh => mesh.castShadow)).toBe(true);
  });
});
