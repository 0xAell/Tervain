import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { loadAnimalTemplates, validateAnimalTemplate } from '../../src/presentation/animals';
import { ANIMALS, requiredAnimalClips } from '../../src/core/content/animals';
import { sculptValleyAnimal } from '../../src/presentation/animals/valleyAnimals';
import { AnimalArrowSurface } from '../../src/presentation/animals/hunting/hit';
import { ANIMAL_IDS } from '../../src/core/game/hunting';

afterEach(() => vi.unstubAllGlobals());

describe('valley animal sculptures', () => {
  it('builds all nineteen persistent animals and their full repertoire offline, in one draw per animal', async () => {
    const fetcher = vi.fn(() => { throw Error('Unexpected network request'); });
    vi.stubGlobal('fetch', fetcher);
    const progress = vi.fn(), models = await loadAnimalTemplates(progress);
    expect(models.size).toBe(19);
    expect(progress).toHaveBeenLastCalledWith(19,19);
    for (const def of ANIMALS) {
      const model = models.get(def.id)!, valid = validateAnimalTemplate(model, def);
      expect(valid.triangles).toBeGreaterThan(1300);
      expect(valid.triangles).toBeLessThan(6500);
      const meshes: THREE.Mesh[] = [];
      model.scene.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
      expect(meshes).toHaveLength(1);
      const skin = meshes[0] as THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      expect(skin.material.vertexColors).toBe(true);
      expect(skin.material.map).toBeNull();
      expect(model.animations.map(c => c.name)).toEqual(requiredAnimalClips(def));
      expect(model.animations.every(c => c.tracks.every(t => t.name.endsWith('.quaternion')))).toBe(true);
    }
    expect((await loadAnimalTemplates()).get(ANIMALS[0]!.id)).toBe(models.get(ANIMALS[0]!.id));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reconstructs identical skins and clips with independent bones and distinct species silhouettes', () => {
    const silhouettes = new Set<string>();
    for (const sp of new Set(ANIMALS.map(d => d.species))) {
      const def = ANIMALS.find(d => d.species === sp)!, a = sculptValleyAnimal(def), b = sculptValleyAnimal(def);
      const skin = (asset: typeof a) => asset.scene.getObjectByName(sp + ' / hide') as THREE.SkinnedMesh;
      const first = skin(a), second = skin(b);
      expect(first.geometry.attributes.position!.array).toEqual(second.geometry.attributes.position!.array);
      expect(a.animations[0]!.tracks[0]!.values).toEqual(b.animations[0]!.tracks[0]!.values);
      expect(first.skeleton.bones[0]).not.toBe(second.skeleton.bones[0]);
      silhouettes.add(validateAnimalTemplate(a,def).bounds.getSize(new THREE.Vector3()).toArray().map(v=>v.toFixed(2)).join('/'));
    }
    expect(silhouettes.size).toBe(8);
  });

  it('tests arrows against the actual coloured skin including the nose, ribs and antler tines', () => {
    const def = ANIMALS.find(d => d.tame)!, model = sculptValleyAnimal(def);
    const mesh = model.scene.getObjectByName('deer / hide') as THREE.SkinnedMesh;
    model.scene.updateMatrixWorld(true);
    mesh.geometry.computeBoundingSphere();
    const surface = new AnimalArrowSurface({id:ANIMAL_IDS[0]!,species:'deer'}, model.scene);
    const shoot = (joint: string) => {
      const bone = mesh.skeleton.bones.findIndex(b=>b.name === joint), index = mesh.geometry.index!;
      const pts = mesh.geometry.getAttribute('position'), weights = mesh.geometry.getAttribute('skinIndex');
      // Shoot inward from the centre of a real triangle on the named anatomy.
      for (let k=0; k<index.count; k+=3) {
        const ids=[index.getX(k),index.getX(k+1),index.getX(k+2)];
        if (!ids.every(i=>weights.getX(i)===bone)) continue;
        const [a,b,c]=ids.map(i=>new THREE.Vector3().fromBufferAttribute(pts,i)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3];
        const normal = THREE.Triangle.getNormal(a,b,c,new THREE.Vector3());
        if (normal.lengthSq()<.9) continue;
        const centre=a.add(b).add(c).multiplyScalar(1/3);
        const hit=surface.trace(centre.addScaledVector(normal,.002),normal.negate(),.006);
        if(hit) return hit.zone;
      }
      throw Error('No surface hit for ' + joint);
    };
    expect(shoot('head')).toBe('head');
    expect(shoot('body')).toBe('body');
    expect(shoot('antlers')).toBeNull();
  });
});
