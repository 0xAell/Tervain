import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ANIMALS, type AnimalDefinition, type AnimalClip } from '../../src/core/content/animals';
import { packGlb, parseGlb, readGlb, withoutTextures } from './glbFixture';

/** Small skin for lifecycle/controller tests. Real delivered topology is checked separately. */
export function animalFixture(segments = 1): GLTF {
  const scene = new THREE.Group(), geometry = new THREE.BoxGeometry(0.6, 0.6, 1.2, segments, segments, segments); geometry.translate(0, 0.3, 0);
  const bones = ['body', 'neck', 'head', 'jaw', 'tail', 'frontUpperL', 'frontLowerL', 'frontPawL', 'frontUpperR', 'frontLowerR', 'frontPawR',
    'hindUpperL', 'hindLowerL', 'hindPawL', 'hindUpperR', 'hindLowerR', 'hindPawR'].map(name => { const bone = new THREE.Bone(); bone.name = name; return bone; });
  for (const bone of bones.slice(1)) bones[0]!.add(bone);
  scene.add(bones[0]!);
  const indices: number[] = [], weights: number[] = [], position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const name = `${position.getZ(i) > 0 ? 'front' : 'hind'}Paw${position.getX(i) > 0 ? 'R' : 'L'}`;
    indices.push(position.getY(i) < 0.08 ? bones.findIndex(bone => bone.name === name) : 2, 0, 0, 0); weights.push(1, 0, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); scene.add(skin); skin.bind(new THREE.Skeleton(bones));
  const names: AnimalClip[] = ['Idle', 'Walk', 'Run', 'Alert', 'Call', 'Graze', 'Groom', 'Sleep'];
  const animations = names.map((name, index) => new THREE.AnimationClip(name, name === 'Call' ? 2.4 : 2, [
    new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1, 2], [0, 0, 0, 1, 0, Math.sin(0.04 + index * 0.015), 0, Math.cos(0.04 + index * 0.015), 0, 0, 0, 1, 0, 0, 0, 1]),
  ]));
  scene.updateMatrixWorld(true);
  scene.userData.animal = { motionSpeeds: { Walk: 1, Run: 2.6 } };
  return { scene, scenes: [scene], animations, cameras: [], asset: { version: '2.0' }, parser: {}, userData: {} } as unknown as GLTF;
}

export function animalBinary(definition: AnimalDefinition) {
  return readGlb(`animals/${definition.file}`);
}

/** Preserve every skinned surface, bone and animation sample; texture/GPU appearance has a native acceptance gate. */
export async function animalTemplates(definitions: readonly AnimalDefinition[] = ANIMALS): Promise<ReadonlyMap<string, GLTF>> {
  const result = new Map<string, GLTF>();
  for (const definition of definitions) {
    const glb = animalBinary(definition);
    const template = await parseGlb(packGlb(glb, withoutTextures(glb.json)));
    result.set(definition.id, template);
  }
  return result;
}
