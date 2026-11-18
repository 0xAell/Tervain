import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { Colliders } from '../../src/core/world/colliders';
import { buildAnimalCamp } from '../../src/presentation/animalCamp';

vi.mock('../../src/presentation/buildingTextures', () => ({
  makeTexPair: () => ({ map: new THREE.Texture(), normal: new THREE.Texture() }),
}));

function trianglePositions(mesh: THREE.Mesh): number[] {
  const geo = mesh.geometry, position = geo.getAttribute('position'), vertex = new THREE.Vector3();
  const xyz: number[] = [];
  for (let i = 0; i < (geo.index?.count ?? position.count); i++) {
    vertex.fromBufferAttribute(position, geo.index?.getX(i) ?? i).applyMatrix4(mesh.matrix);
    xyz.push(Math.fround(vertex.x), Math.fround(vertex.y), Math.fround(vertex.z));
  }
  return xyz;
}

it('keeps the caravan’s six independent receivers and the exact original shadow triangles in one bounded sun caster', () => {
  const terrain = { heightAt: (x: number, z: number) => 2 + x / 20 - z / 15 };
  const original = buildAnimalCamp(terrain, new Colliders()), batched = buildAnimalCamp(terrain, new Colliders(), true);
  const colour = (root: THREE.Group) => root.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.visible);
  try {
    const before = colour(original.group), after = colour(batched.group);
    expect(before.filter((mesh) => mesh.castShadow)).toHaveLength(6);
    expect(after.map((mesh) => mesh.name)).toEqual(before.map((mesh) => mesh.name));
    expect(after.every((mesh) => mesh.receiveShadow && !mesh.castShadow && mesh.frustumCulled)).toBe(true);
    const caster = batched.sunCaster!;
    expect(caster.visible).toBe(false);
    expect(caster.castShadow && caster.frustumCulled).toBe(true);
    expect(caster.geometry.boundingSphere!.radius).toBeGreaterThan(0);
    expect(trianglePositions(caster)).toEqual(before.flatMap(trianglePositions));
    expect(original.sunCaster).toBeNull();
    const dispose = vi.spyOn(caster.geometry, 'dispose');
    batched.dispose?.(); batched.dispose?.();
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally { original.dispose?.(); batched.dispose?.(); }
});
