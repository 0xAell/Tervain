import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createBanditRig, createPlayerRig, createThornback, personBuildOptions } from '../../src/presentation/characters';
import { disposeSceneResources } from '../../src/presentation/disposeScene';

// These tests check people's geometry, projection and paint logic, not texture resolution: paint small sheets inline.
personBuildOptions.sheetSize = 256;

const rigSkeleton = (root: THREE.Object3D) => {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
  });
  // A person is one skinned mesh; the player's sash is a second on the same skeleton.
  expect(meshes.length).toBeGreaterThanOrEqual(1);
  const skeleton = meshes[0]!.skeleton;
  expect(meshes.every((mesh) => mesh.skeleton === skeleton)).toBe(true);
  // The renderer makes this texture on the first draw; no WebGL context is
  // required to exercise its real ownership and dispose-event lifecycle.
  skeleton.computeBoneTexture();
  return skeleton;
};

/** A batch's own data textures, where three keeps them (none once the batch is disposed). */
const batchTextures = (batch: THREE.BatchedMesh) => {
  const own = batch as unknown as Record<'_matricesTexture' | '_indirectTexture' | '_colorsTexture', THREE.Texture | null>;
  return [own._matricesTexture, own._indirectTexture, own._colorsTexture].filter((texture): texture is THREE.Texture => !!texture);
};

/** Two boxes drawn as one batch, coloured, with the batch's own depth material, as partBatch.ts gives one. */
const boxBatch = () => {
  const box = new THREE.BoxGeometry();
  const batch = new THREE.BatchedMesh(2, box.getAttribute('position').count, box.index!.count, new THREE.MeshStandardMaterial());
  const geometry = batch.addGeometry(box);
  batch.addInstance(geometry);
  batch.addInstance(geometry);
  batch.setColorAt(1, new THREE.Color(0.6, 0.4, 0.2));
  batch.customDepthMaterial = new THREE.MeshDepthMaterial();
  box.dispose();
  return batch;
};

describe('scene resource ownership', () => {
  it('retains a shared texture while a persistent player still uses it', () => {
    const texture = new THREE.Texture();
    const player = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ normalMap: texture }));
    const oldGeometry = new THREE.BoxGeometry();
    const oldMaterial = new THREE.MeshStandardMaterial({ normalMap: texture });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(oldGeometry, oldMaterial));
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const disposeOldGeometry = vi.spyOn(oldGeometry, 'dispose');
    const disposeOldMaterial = vi.spyOn(oldMaterial, 'dispose');
    disposeSceneResources(scene, () => {}, [player]);
    expect(disposeTexture).not.toHaveBeenCalled();
    expect(disposeOldGeometry).toHaveBeenCalledTimes(1);
    expect(disposeOldMaterial).toHaveBeenCalledTimes(1);
  });

  it('releases shared scene geometry, material and texture only once', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture });
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    disposeSceneResources(scene, () => {});
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });

  it('runs module cleanup before fallback without disposing hook-owned resources twice', () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const privateTexture = new THREE.Texture();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    scene.add(new THREE.Mesh(geometry, material));
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const disposePrivate = vi.spyOn(privateTexture, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    disposeSceneResources(scene, () => {
      expect(disposeGeometry).not.toHaveBeenCalled();
      privateTexture.dispose();
      texture.dispose();
      material.dispose();
    });
    expect(disposeTexture).toHaveBeenCalledTimes(1);
    expect(disposePrivate).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
  });

  it('preserves detached persistent rigs and disposes shader-uniform textures in the old scene', () => {
    const scene = new THREE.Scene();
    const playerGeometry = new THREE.BoxGeometry();
    const playerMaterial = new THREE.MeshStandardMaterial();
    const player = new THREE.Mesh(playerGeometry, playerMaterial);
    scene.add(player);
    scene.remove(player);
    const texture = new THREE.Texture();
    const material = new THREE.ShaderMaterial({ uniforms: { atlas: { value: texture } } });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const disposePlayer = vi.spyOn(playerGeometry, 'dispose');
    const disposePlayerMat = vi.spyOn(playerMaterial, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    disposeSceneResources(scene, () => {});
    expect(disposePlayer).not.toHaveBeenCalled();
    expect(disposePlayerMat).not.toHaveBeenCalled();
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('releases rendered costume skeletons once through repeated world rebuilds while retaining the player', () => {
    const player = createPlayerRig();
    const playerSkeleton = rigSkeleton(player.root);
    const playerTexture = playerSkeleton.boneTexture!;
    const disposePlayerSkeleton = vi.spyOn(playerSkeleton, 'dispose');
    const disposePlayerTexture = vi.spyOn(playerTexture, 'dispose');
    for (let rebuild = 0; rebuild < 3; rebuild++) {
      const scene = new THREE.Scene();
      scene.add(player.root);
      const oldPeople = [createBanditRig(0), createBanditRig(1)];
      const oldSkeletons = oldPeople.map((person) => rigSkeleton(person.root));
      const textureSpies = oldSkeletons.map((skeleton) => vi.spyOn(skeleton.boneTexture!, 'dispose'));
      const skeletonSpies = oldSkeletons.map((skeleton) => vi.spyOn(skeleton, 'dispose'));
      for (const person of oldPeople) scene.add(person.root);
      scene.remove(player.root);
      disposeSceneResources(scene, () => {}, [player.root]);
      disposeSceneResources(scene, () => {}, [player.root]);
      for (let i = 0; i < oldSkeletons.length; i++) {
        expect(skeletonSpies[i]).toHaveBeenCalledTimes(1);
        expect(textureSpies[i]).toHaveBeenCalledTimes(1);
        expect(oldSkeletons[i]!.boneTexture).toBeNull();
      }
      expect(disposePlayerSkeleton).not.toHaveBeenCalled();
      expect(disposePlayerTexture).not.toHaveBeenCalled();
      expect(playerSkeleton.boneTexture).toBe(playerTexture);
    }
    const finalScene = new THREE.Scene();
    finalScene.add(player.root);
    disposeSceneResources(finalScene, () => {});
    expect(disposePlayerSkeleton).toHaveBeenCalledTimes(1);
    expect(disposePlayerTexture).toHaveBeenCalledTimes(1);
  });

  it('protects a skeleton and bone texture borrowed by a detached retained mesh', () => {
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    skeleton.computeBoneTexture();
    const texture = skeleton.boneTexture!;
    const player = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    player.bind(skeleton);
    const oldMaterial = new THREE.MeshStandardMaterial({ map: texture });
    const oldMesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), oldMaterial);
    oldMesh.bind(skeleton);
    const scene = new THREE.Scene();
    scene.add(oldMesh);
    const disposeSkeleton = vi.spyOn(skeleton, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const disposeOldMaterial = vi.spyOn(oldMaterial, 'dispose');
    disposeSceneResources(scene, () => {}, [player]);
    expect(disposeSkeleton).not.toHaveBeenCalled();
    expect(disposeTexture).not.toHaveBeenCalled();
    expect(disposeOldMaterial).toHaveBeenCalledTimes(1);
    expect(skeleton.boneTexture).toBe(texture);
    scene.add(player);
    disposeSceneResources(scene, () => {});
    expect(disposeSkeleton).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('does not release a hook-owned skeleton or aliased material bone texture twice', () => {
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    skeleton.computeBoneTexture();
    const texture = skeleton.boneTexture!;
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture }));
    mesh.bind(skeleton);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const disposeSkeleton = vi.spyOn(skeleton, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    disposeSceneResources(scene, () => skeleton.dispose());
    expect(disposeSkeleton).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
    expect(skeleton.boneTexture).toBeNull();
  });

  it('releases a batch\'s own data textures and the shadow materials meshes carry for themselves, once each', () => {
    const scene = new THREE.Scene();
    const batch = boxBatch();
    const mask = new THREE.Texture();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ alphaMap: mask }));
    leaf.customDepthMaterial = new THREE.MeshDepthMaterial({ alphaMap: mask });
    leaf.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: mask });
    scene.add(batch, leaf);
    // The instances' matrices, the draw list and the colours.
    expect(batchTextures(batch)).toHaveLength(3);
    const spies = [...batchTextures(batch), batch.customDepthMaterial!, leaf.customDepthMaterial, leaf.customDistanceMaterial, mask].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeSceneResources(scene, () => {});
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('passes over a batch its owner let go while it still stands in the scene (the terrain\'s tiles)', () => {
    const scene = new THREE.Scene();
    const batch = boxBatch();
    scene.add(batch);
    const spies = [...batchTextures(batch), batch.geometry, batch.customDepthMaterial!].map((resource) => vi.spyOn(resource, 'dispose'));
    expect(() => disposeSceneResources(scene, () => batch.dispose())).not.toThrow();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps a retained batch whole', () => {
    const held = new THREE.Group(), batch = boxBatch();
    held.add(batch);
    const scene = new THREE.Scene();
    scene.add(held, new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const textures = batchTextures(batch);
    const spies = [...textures, batch.customDepthMaterial!].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeSceneResources(scene, () => {}, [held]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(batchTextures(batch)).toEqual(textures);
  });

  it('lets a thornback\'s two batches go with the world it stood in: their matrices, draw lists and depth materials', () => {
    const rig = createThornback();
    const scene = new THREE.Scene();
    scene.add(rig.root);
    const batches = rig.parts!.meshes;
    expect(batches).toHaveLength(2);
    const spies = batches.flatMap((batch) => [...batchTextures(batch), batch.customDepthMaterial!].map((resource) => vi.spyOn(resource, 'dispose')));
    // Two data textures and a depth material for each batch; no colours.
    expect(spies).toHaveLength(6);
    disposeSceneResources(scene, () => {});
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
