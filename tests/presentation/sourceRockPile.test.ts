import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildSourceRockPiles, rockPileReach } from '../../src/presentation/sourceRockPile';
import { assertNaturalModelBudget } from '../../src/presentation/naturalModelBudget';
import { defaultSettings } from '../../src/platform/settings';
import { Terrain } from '../../src/core/world/terrain';
import { buildStaticColliders } from '../../src/core/world/colliders';
import { Exclusions } from '../../src/presentation/vegetation';
import { createFloraPopulation, registerFloraColliders } from '../../src/presentation/floraPopulation';
import { createScatterPopulation, registerScatterColliders } from '../../src/presentation/scatterPopulation';
import { buildForestLandmarks } from '../../src/presentation/forestLandmarks';
import { registerFloraColliders as registerPlantedColliders } from '../../src/core/world/flora';
import { PLANTED_FOREST } from '../../src/core/world/plantedForest';
import { ROCK_PILE_REACH } from '../../src/core/world/rockPiles';
import { rockPileBinary, rockPileTemplate } from './rockPileFixture';

let template: GLTF;
beforeAll(async () => { template = await rockPileTemplate(); });
afterAll(() => { template.scene.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); } }); });

function fixture(quality: 'low' | 'medium' | 'high' = 'high') {
  const terrain = new Terrain(), excl = new Exclusions(terrain), colliders = buildStaticColliders(terrain);
  const forest = createFloraPopulation(terrain, excl);
  registerFloraColliders(forest, colliders);
  const trunks = colliders.all.flatMap(c => c.kind === 'circle' && c.id.startsWith('tree:') ? [{ x: c.x, z: c.z, radius: c.r }] : []);
  const scatter = createScatterPopulation(terrain, excl, trunks);
  registerScatterColliders(scatter, colliders);
  terrain.registerRockSurfaces(colliders.rockMeshes);
  const previousContacts = [...colliders.rockMeshes], previousIds = colliders.all.map(c => c.id);
  const module = buildSourceRockPiles({ terrain, colliders, excl, quality, settings: { ...defaultSettings(), quality },
    sway: { uTime: { value: 0 }, uWind: { value: 0 } } }, template);
  return { terrain, colliders, excl, module, previousContacts, previousIds };
}


describe('the original coastal schist outcrop', () => {
  it('carries one closed set of bedding planes, mineral colour and a local grain texture', () => {
    const { bytes, json } = rockPileBinary();
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    expect(json.asset.generator).toBe('Tervain tools/craft-environment/build.mjs');
    const primitive = json.meshes[0].primitives[0];
    expect(json.accessors[primitive.indices].count / 3).toBe(740);
    expect(json.accessors[primitive.attributes.COLOR_0].count).toBe(json.accessors[primitive.attributes.POSITION].count);
    expect(json.materials).toHaveLength(1); expect(json.materials[0].pbrMetallicRoughness.metallicFactor).toBe(0);
    expect(json.images[0].bufferView).toBeTypeOf('number'); expect(json.images[0].uri).toBeUndefined();
  });

  it('adds a modest deterministic set without replacing canonical rocks, filling the arrival, or overlapping existing tree/route claims', () => {
    const f = fixture();
    try {
      expect(f.module.placements.length).toBeGreaterThanOrEqual(2);
      expect(f.module.placements.length).toBeLessThanOrEqual(6);
      expect(f.colliders.rockMeshes.slice(0, f.previousContacts.length)).toEqual(f.previousContacts);
      expect(f.colliders.all.slice(0, f.previousIds.length).map(c => c.id)).toEqual(f.previousIds);
      for (const p of f.module.placements) {
        expect(f.excl.blocked(p.x, p.z, p.radius + 0.5)).toBe(false);
        const own = new Set([p.id]);
        expect(f.colliders.cast(p.x, p.z, p.x, p.z, p.radius + 0.35, own)).toBeNull();
      }
    } finally { f.module.dispose!(); }
  });

  it('keeps identical meshes and contacts across Low, Medium and High, using uniform source transforms and real submitted triangle counts', () => {
    let first: unknown;
    for (const quality of ['low', 'medium', 'high'] as const) {
      const f = fixture(quality);
      try {
        const transforms = f.module.placements.map(p => ({ ...p }));
        if (first) expect(transforms).toEqual(first); else first = transforms;
        expect(f.module.group.children).toHaveLength(f.module.contacts.length);
        for (const object of f.module.group.children) {
          const mesh = object as THREE.Mesh;
          expect(assertNaturalModelBudget('Rendered source pile', [mesh.geometry])).toBe(740);
          expect(mesh.scale.x).toBe(mesh.scale.y); expect(mesh.scale.y).toBe(mesh.scale.z);
          expect(mesh.rotation.x).toBe(0); expect(mesh.rotation.z).toBe(0);
          expect((mesh.material as THREE.MeshStandardMaterial).metalness).toBe(0);
          expect((mesh.material as THREE.MeshStandardMaterial).roughness).toBe(1);
          expect((mesh.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0);
        }
        expect(f.module.stats!()).toEqual({ sourceRockPiles: transforms.length, sourceRockModelTris: 740, sourceRockTris: transforms.length * 740 });
      } finally { f.module.dispose!(); }
    }
  });

  it('uses every rendered source vertex/index in finite contact, with the entire basal surface seated in the actual triangulated soil', () => {
    const f = fixture();
    const point = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    try {
      for (const object of f.module.group.children) {
        const mesh = object as THREE.Mesh, contact = f.module.contacts.find(rock => rock.id === mesh.name)!;
        const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.index!;
        expect(contact.indices.length).toBe(index.count); expect(contact.positions.length).toBe(positions.count * 3);
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          expect(contact.positions[i * 3]).toBeCloseTo(point.x, 4);
          expect(contact.positions[i * 3 + 1]).toBeCloseTo(point.y, 5);
          expect(contact.positions[i * 3 + 2]).toBeCloseTo(point.z, 4);
        }
        for (let i = 0; i < index.count; i++) expect(contact.indices[i]).toBe(index.getX(i));
        const bounds = mesh.geometry.boundingBox!, plane = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.12;
        for (let triangle = 0; triangle < index.count; triangle += 3) {
          a.fromBufferAttribute(positions, index.getX(triangle)); b.fromBufferAttribute(positions, index.getX(triangle + 1)); c.fromBufferAttribute(positions, index.getX(triangle + 2));
          if (Math.min(a.y, b.y, c.y) > plane) continue;
          for (let u = 0; u <= 3; u++) for (let v = 0; v <= 3 - u; v++) {
            point.copy(a).multiplyScalar(u / 3).addScaledVector(b, v / 3).addScaledVector(c, 1 - (u + v) / 3);
            if (point.y > plane + 1e-7) continue;
            point.applyMatrix4(mesh.matrixWorld);
            expect(point.y, `floating basal source face at ${point.x},${point.z}`).toBeLessThanOrEqual(f.terrain.heightAt(point.x, point.z) - 0.054);
          }
        }
        expect(f.colliders.rockMeshes).toContain(contact);
        expect(f.colliders.all.find(collider => collider.id === mesh.name)?.rockMesh).toBe(contact);
      }
    } finally { f.module.dispose!(); }
  });

  it('reaches as far across the ground as the core says the rock pile reaches', () => {
    const f = fixture();
    try {
      const geometry = (f.module.group.children[0] as THREE.Mesh).geometry;
      expect(rockPileReach(geometry)).toBeCloseTo(ROCK_PILE_REACH, 4);
      for (const placement of f.module.placements) expect(placement.radius).toBeCloseTo(ROCK_PILE_REACH * placement.s, 12);
    } finally { f.module.dispose!(); }
  });

  it('lays, among everything the world has built before it, exactly the piles the core exports', () => {
    // As WorldScene.build orders it: the core's colliders, the woodland landmarks, the planted forest, the loose stone.
    vi.stubGlobal('document', { createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => new Proxy({ canvas } as Record<string | symbol, unknown>, {
        get: (target, key) => key in target ? target[key] : () => ({ addColorStop() {} }), set: () => true }) };
      return canvas;
    } });
    const terrain = new Terrain(), excl = new Exclusions(terrain), colliders = buildStaticColliders(terrain);
    const landmarks = buildForestLandmarks(terrain, colliders, 'high');
    registerPlantedColliders(PLANTED_FOREST.map((tree, index) => ({ ...tree, tint: 1, decorationRank: 0, collisionId: tree.radius > 0 ? `tree:${index}` : null })),
      colliders, (tree) => tree.radius, (tree) => PLANTED_FOREST[Number(tree.collisionId!.slice(5))]!.navigationRadius);
    const trunks = colliders.all.flatMap(c => c.kind === 'circle' && c.id.startsWith('tree:') ? [{ x: c.x, z: c.z, radius: c.r }] : []);
    registerScatterColliders(createScatterPopulation(terrain, excl, trunks), colliders);
    terrain.registerRockSurfaces(colliders.rockMeshes);
    const module = buildSourceRockPiles({ terrain, colliders, excl, quality: 'high', settings: { ...defaultSettings(), quality: 'high' },
      sway: { uTime: { value: 0 }, uWind: { value: 0 } } }, template);
    try {
      const exported = JSON.parse(readFileSync(new URL('../../data/world/placement.json', import.meta.url), 'utf8')).rockPiles.kept as { id: string; x: number; z: number; radius: number }[];
      expect(module.placements.map(p => p.id)).toEqual(exported.map(p => p.id));
      module.placements.forEach((placement, index) => {
        expect(placement.x).toBeCloseTo(exported[index]!.x, 5); expect(placement.z).toBe(exported[index]!.z);
        expect(placement.radius).toBeCloseTo(exported[index]!.radius, 5);
      });
    } finally { module.dispose!(); landmarks.dispose(); vi.unstubAllGlobals(); }
  });

  it('owns one private geometry/material and releases them once without disposing the cached source', () => {
    const f = fixture(), meshes = f.module.group.children as THREE.Mesh[];
    try {
      expect(new Set(meshes.map(mesh => mesh.geometry)).size).toBe(1);
      expect(new Set(meshes.map(mesh => mesh.material)).size).toBe(1);
      const original = template.scene.children[0] as THREE.Mesh;
      const sourceGeometry = vi.spyOn(original.geometry, 'dispose'), sourceMaterial = vi.spyOn(original.material as THREE.Material, 'dispose');
      const geometry = vi.spyOn(meshes[0]!.geometry, 'dispose'), material = vi.spyOn(meshes[0]!.material as THREE.Material, 'dispose');
      f.module.dispose!(); f.module.dispose!();
      expect(geometry).toHaveBeenCalledTimes(1); expect(material).toHaveBeenCalledTimes(1);
      expect(sourceGeometry).not.toHaveBeenCalled(); expect(sourceMaterial).not.toHaveBeenCalled();
      expect(f.module.group.children).toHaveLength(0);
    } finally { vi.restoreAllMocks(); f.module.dispose!(); }
  });
});
