import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { poseRig } from '../../src/presentation/characters';
import { createMeshyNpcRig } from '../../src/presentation/meshynpcs';
import { PosedVertices } from '../../src/presentation/posedVertices';
import { loadResident, residentMesh } from './residentFixtures';

/** Every vertex where three's own CPU skinning puts it, and where PosedVertices does: they must agree to the last bit. */
function both(mesh: THREE.SkinnedMesh, skin: PosedVertices) {
  const ours: number[] = [], three: number[] = [], v = new THREE.Vector3();
  for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
    ours.push(...skin.at(i, v).toArray());
    three.push(...mesh.getVertexPosition(i, v).toArray());
  }
  return { ours, three };
}

/** Bit for bit: the same doubles, -0 told from +0. */
function expectSameBits(ours: number[], three: number[]) {
  expect(ours).toHaveLength(three.length);
  const differing = ours.findIndex((value, i) => !Object.is(value, three[i]));
  expect(differing, `first differing component ${differing}: ${ours[differing]} vs ${three[differing]}`).toBe(-1);
}

/** A small skinned limb: four bones in a chain, every vertex on up to four of them (some weights zero), bound off-centre. */
function limb(morph = false) {
  const count = 64, random = (() => { let s = 7; return () => ((s = Math.imul(s, 48271) % 2147483647) / 2147483647); })();
  const position = new Float32Array(count * 3), index = new Uint16Array(count * 4), weight = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    position.set([random() - 0.5, random() * 2, random() - 0.5], v * 3);
    const w = [random(), random(), v % 3 === 0 ? 0 : random(), v % 5 === 0 ? 0 : random()], sum = w.reduce((a, b) => a + b, 0);
    index.set([v % 4, (v + 1) % 4, (v + 2) % 4, (v + 3) % 4], v * 4);
    weight.set(w.map(x => x / sum), v * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(index, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
  if (morph) {
    geometry.morphAttributes.position = [new THREE.BufferAttribute(position.map(x => x * 0.3 + 0.01), 3)];
    geometry.morphTargetsRelative = true;
  }
  const bones = [0, 1, 2, 3].map(() => new THREE.Bone());
  bones.forEach((bone, i) => { bone.position.set(0, i ? 0.5 : 0, 0); if (i) bones[i - 1]!.add(bone); });
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  if (morph) mesh.updateMorphTargets();
  const root = new THREE.Group();
  root.add(bones[0]!, mesh);
  root.position.set(3, -1, 2);
  mesh.position.set(0.2, 0.1, -0.3);
  mesh.rotation.set(0.3, -0.2, 0.1);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const pose = (t: number) => {
    bones.forEach((bone, i) => { bone.rotation.set(0.4 * t + i * 0.1, -0.3 * t * i, 0.25 * t); bone.scale.set(1, 1 + 0.1 * t * i, 1); });
    bones[0]!.position.set(0.1 * t, 0, -0.05 * t);
    root.rotation.y = t;
    root.updateMatrixWorld(true);
  };
  return { mesh, bones, pose };
}

describe('a skinned mesh\'s posed vertices', () => {
  it('are where three\'s own skinning puts them, to the last bit, pose after pose', () => {
    const { mesh, pose } = limb(), skin = new PosedVertices(mesh);
    for (const t of [0, 0.7, -1.3]) {
      pose(t);
      const { ours, three } = both(mesh, skin.pose());
      expectSameBits(ours, three);
    }
  });

  it('follow the bones only from the next pose on', () => {
    const { mesh, bones, pose } = limb(), skin = new PosedVertices(mesh), v = new THREE.Vector3();
    pose(0.4);
    const before = skin.pose().at(5, v).clone();
    bones[1]!.rotation.x += 0.5;
    bones[1]!.updateMatrixWorld(true);
    expect(mesh.getVertexPosition(5, new THREE.Vector3()).distanceTo(before)).toBeGreaterThan(0.01);
    expect(skin.at(5, v).equals(before)).toBe(true);
    expect(skin.pose().at(5, v).equals(mesh.getVertexPosition(5, new THREE.Vector3()))).toBe(true);
  });

  it('keep three\'s morph targets', () => {
    const { mesh, pose } = limb(true), skin = new PosedVertices(mesh);
    mesh.morphTargetInfluences![0] = 0.6;
    pose(0.9);
    const { ours, three } = both(mesh, skin.pose());
    expectSameBits(ours, three);
  });

  it('match a delivered resident\'s skin, every vertex, mid-stride', async () => {
    const { source, entry } = await loadResident('spring-steward');
    const rig = createMeshyNpcRig(source, entry, 1, 'none', undefined, { skinRepair: false, jointFit: false, poseFit: false, surface: false });
    const mesh = residentMesh(rig.root), skin = new PosedVertices(mesh);
    for (const time of [0.3, 0.75]) {
      poseRig(rig, { mode: 'walk', speed: 0.78, time, t: 0, amp: 1 }, 1);
      rig.root.updateMatrixWorld(true);
      const { ours, three } = both(mesh, skin.pose());
      expect(ours.length).toBeGreaterThan(3000);
      expectSameBits(ours, three);
    }
  });
});
