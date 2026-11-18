import * as THREE from 'three';
import { expect, it } from 'vitest';
import { Terrain } from '../../src/core/world/terrain';
import { FORD } from '../../src/core/world/layout';
import type { BuildContext, FrameContext } from '../../src/presentation/context';
import { buildWildlife } from '../../src/presentation/wildlife';

it('keeps river birds in the existing coastal batch and holds both decorative clocks through reduced motion or a pause', () => {
  const terrain = new Terrain();
  const outlet = new THREE.Vector3(-5, 7, 8);
  const wildlife = buildWildlife({ terrain, quality: 'low' } as BuildContext, [outlet]);
  const [birdMesh, smokePoints] = wildlife.group.children;
  const birds = birdMesh as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  const smoke = smokePoints as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  expect(birds.geometry.instanceCount).toBe(6);
  expect(wildlife.stats?.()).toEqual({ gulls: 4, riverMartins: 2, chimneys: 1 });
  const paths = birds.geometry.getAttribute('aPath');
  expect([paths.getX(4), paths.getY(4)]).toEqual([FORD.x, FORD.z]);
  expect(smoke.geometry.getAttribute('position').getY(0)).toBe(outlet.y);

  const frame = { reducedMotion: false, hour: 12, nightness: 0 };
  const advance = (f: Partial<FrameContext>) => wildlife.update(0.1, { ...frame, ...f } as FrameContext);
  advance({});
  const clock = birds.material.uniforms.uTime!.value;
  advance({ reducedMotion: true, time: 10 });
  advance({ wildlifeActive: false, time: 20 });
  expect(birds.material.uniforms.uTime!.value).toBe(clock);
  expect(smoke.material.uniforms.uTime!.value).toBe(clock);
  advance({ nightness: 1 });
  expect(birds.visible).toBe(false);
  expect(smoke.material.uniforms.uTime!.value).toBeGreaterThan(clock);
  wildlife.dispose?.();
});
