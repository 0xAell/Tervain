import { afterEach, expect, it, vi } from 'vitest';
import { Player } from '../../src/presentation/player';
import { personBuildOptions, poseRig, setArmed } from '../../src/presentation/characters';
import * as THREE from 'three';

afterEach(() => vi.unstubAllGlobals());

it('rejects archived hero and resident models before making a network request', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('document', { baseURI: 'https://example.test/Tervain/' });
  const { loadMainHero } = await import('../../src/presentation/mainHero');
  const { loadMeshyNpcCatalog } = await import('../../src/presentation/meshynpcs');
  await expect(loadMainHero()).rejects.toThrow(/outside the playable art/);
  await expect(loadMeshyNpcCatalog()).rejects.toThrow(/outside the playable art/);
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps one locally sculpted wanderer through painting, combat, mounting and dismounting', async () => {
  const network = vi.fn(() => { throw new Error('A valley actor must be playable offline'); });
  vi.stubGlobal('fetch', network);
  personBuildOptions.sheetSize = 256;
  const player = new Player(), rig = player.rig;
  await rig.person!.ready;
  expect(rig.person!.source).toBe('painted');
  expect(rig.person!.spec.outfit.cloak).toBeDefined();
  expect(rig.person!.mesh.visible).toBe(true);
  setArmed(rig, 'drawn');
  for (let i = 0; i < 15; i++) poseRig(rig, { mode:'attack_light', t:i/15, time:i/30, speed:0, amp:1 },1/30);
  expect(rig.weapon!.visible).toBe(true);
  expect(Math.abs(rig.armR.rotation.x)).toBeGreaterThan(.1);
  const pose = { mode:'sit' as const, t:0, time:1, speed:0, amp:1, straddle:true, mountSwing:1 };
  poseRig(rig, pose, 1/30);
  expect(rig.hips.position.y).toBeLessThan(.12);
  expect(rig.legL.rotation.z).toBeGreaterThan(.3);
  expect(rig.legR.rotation.z).toBeLessThan(-.3);
  poseRig(rig, { ...pose, mode:'idle', straddle:false }, 1/30);
  expect(rig.legL.rotation.z).toBe(0);
  const mesh = rig.person!.mesh;
  for (const joint of Object.values(rig.extremities!)) {
    const slot = mesh.skeleton.bones.indexOf(joint), indices = mesh.geometry.getAttribute('skinIndex');
    expect(slot).toBeGreaterThan(0);
    expect(Array.from(indices.array).includes(slot)).toBe(true);
  }
  player.huntingVisual.setEquipped(true);
  player.huntingVisual.setAim(new THREE.Vector3(0,0,1),1);
  player.huntingVisual.apply(.1);
  expect(player.releaseBow()?.direction.length()).toBeCloseTo(1);
  expect(network).not.toHaveBeenCalled();
});
