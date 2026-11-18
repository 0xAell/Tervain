import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_BUILD_SLICE_MS, WorldScene, type WorldBuildProgress } from '../../src/presentation/world';
import { createInitialState } from '../../src/core/game/state';
import { defaultSettings } from '../../src/platform/settings';
import { Colliders } from '../../src/core/world/colliders';
import type { SceneModule } from '../../src/presentation/context';
import { disposeSceneResources } from '../../src/presentation/disposeScene';
import { PINE_FILES } from '../../src/presentation/solitaryPine';
import { HERO_PINE_FILES } from '../../src/presentation/heroPine';
import { MESHY_TREE_LODS } from '../../src/presentation/meshyTrees';
import { forestTreeIds } from '../../src/presentation/forestPlanting';
import { ANIMALS } from '../../src/core/content/animals';
import { WORLD } from '../../src/core/world/layout';

const controls = vi.hoisted(() => ({
  owners: [] as { name: string; dispose: () => void; group?: unknown }[],
  colliders: null as unknown,
  navigationGate: null as Promise<unknown> | null,
  navVersions: [] as number[],
  groundFailure: null as Error | null,
  modelGate: null as Promise<void> | null,
  modelsStarted: null as (() => void) | null,
  furnitureGate: null as Promise<void> | null,
  furnitureLoads: 0,
  /** How often the physics engine was asked to start. */
  physicsStarts: 0,
  /** The work slice each cooperative stage was asked to keep to. */
  budgets: [] as [string, number | undefined][],
  modelCallbacks: {} as Partial<Record<'pine' | 'heroPine' | 'stone' | 'trees' | 'animals' | 'furniture', (loaded: number, total: number) => void>>,
}));

async function modelFamily(family: keyof typeof controls.modelCallbacks, total: number, progress?: (loaded: number, total: number) => void) {
  if (progress) controls.modelCallbacks[family] = progress;
  progress?.(0, total);
  if (Object.keys(controls.modelCallbacks).length === 6) controls.modelsStarted?.();
  if (controls.modelGate) await controls.modelGate;
  progress?.(total, total);
}

function owner(name: string) {
  const group = new THREE.Group(); group.name = name;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  const resource = { name, group, update() {}, dispose: vi.fn() };
  controls.owners.push(resource);
  return resource;
}

vi.mock('../../src/presentation/assets/needs', () => ({ ALL_NEEDS: [] }));
vi.mock('../../src/core/world/terrain', () => ({ Terrain: class {
  static async create(options: { onProgress?: (completed: number, total: number) => void; budgetMs?: number }) {
    controls.budgets.push(['terrain', options.budgetMs]);
    const nz = (WORLD.maxZ - WORLD.minZ) / WORLD.cell;
    options.onProgress?.(nz + 1, nz + 1);
    return { heightAt: () => 0, nz, rooms: { base: () => 0 } };
  }
} }));
vi.mock('../../src/core/world/colliders', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/core/world/colliders')>(), buildStaticColliders: () => controls.colliders,
}));
vi.mock('../../src/core/world/nav', async importOriginal => ({ ...await importOriginal<typeof import('../../src/core/world/nav')>(), NavGrid: class {
  static async create(terrain: { nz: number }, _colliders: unknown, _radius: number, options: { onProgress?: (completed: number, total: number) => void; budgetMs?: number }) {
    controls.budgets.push(['walking routes', options.budgetMs]);
    if (controls.navigationGate) await controls.navigationGate;
    options.onProgress?.(terrain.nz, terrain.nz);
    controls.navVersions.push((controls.colliders as Colliders).version);
    return { ensureFresh() {}, async forRadiusAsync(_radius: number, wider: { onProgress?: (completed: number, total: number) => void; budgetMs?: number }) {
      controls.budgets.push(['large creature routes', wider.budgetMs]);
      wider.onProgress?.(4, terrain.nz); wider.onProgress?.(terrain.nz, terrain.nz);
      controls.navVersions.push((controls.colliders as Colliders).version);
    } };
  }
} }));
vi.mock('../../src/physics/physics', () => ({ initializePhysics: async () => { controls.physicsStarts++; }, RealmPhysics: class {
  dispose = vi.fn(); setWater() {}
  constructor() { controls.owners.push({ name: 'physics', dispose: this.dispose }); }
} }));
vi.mock('../../src/presentation/terrainTextures', () => ({ TERRAIN_TEXTURE_SIZE: { high: 1024, medium: 768, low: 256 }, makeTerrainTextures: async (_size: number, _yieldNow: unknown, options: { onProgress?: (completed: number, total: number) => void }) => {
  const textures = { albedo: new THREE.DataArrayTexture(), normal: new THREE.DataArrayTexture(), size: 256,
    dispose: vi.fn(() => { textures.albedo.dispose(); textures.normal.dispose(); }) };
  controls.owners.push({ name: 'textures', dispose: textures.dispose });
  options.onProgress?.(8, 8);
  return textures;
} }));
vi.mock('../../src/presentation/terrainMesh', () => ({ buildTerrainTilesAsync: async (...args: unknown[]) => {
  controls.budgets.push(['ground', (args[5] as { budgetMs?: number } | undefined)?.budgetMs]);
  if (controls.groundFailure) throw controls.groundFailure;
  return owner('ground tiles').group;
} }));
vi.mock('../../src/presentation/sky', () => ({ SkyRig: class {
  group = new THREE.Group(); fog = new THREE.FogExp2(0xabbccd); dispose = vi.fn();
  constructor() { controls.owners.push({ name: 'sky', dispose: this.dispose }); }
} }));
vi.mock('../../src/presentation/water/waterSystem', () => ({ WaterSystem: class {
  group = new THREE.Group(); world = {}; dispose = vi.fn();
  constructor() { controls.owners.push({ name: 'water', dispose: this.dispose }); }
} }));
vi.mock('../../src/presentation/solitaryPine', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/presentation/solitaryPine')>(), loadSolitaryPine: async (progress?: (loaded: number, total: number) => void) => {
    await modelFamily('pine', PINE_FILES.length, progress); return [];
  },
}));
vi.mock('../../src/presentation/heroPine', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/presentation/heroPine')>(), loadHeroPine: async (progress?: (loaded: number, total: number) => void) => {
    await modelFamily('heroPine', HERO_PINE_FILES.length, progress); return [];
  },
}));
vi.mock('../../src/presentation/meshyTrees', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/presentation/meshyTrees')>(), loadMeshyTrees: async (ids: readonly string[], progress?: (loaded: number, total: number) => void) => {
    await modelFamily('trees', new Set(ids).size, progress); return [];
  },
}));
vi.mock('../../src/presentation/sourceRockPile', () => ({ loadSourceRockPile: async (progress?: (loaded: number, total: number) => void) => {
  await modelFamily('stone', 1, progress); return {};
}, buildSourceRockPiles: () => owner('rocks') }));
vi.mock('../../src/presentation/forestLandmarks', () => ({ buildForestLandmarks: () => ({ ...owner('landmarks'), stats: {} }) }));
vi.mock('../../src/presentation/flora', () => ({ buildFloraAsync: async () => ({ ...owner('forest'), initializeFloor() {}, physicalWood: [] }) }));
vi.mock('../../src/presentation/scatter', () => ({ buildScatter: () => owner('scatter') }));
vi.mock('../../src/presentation/ambient', () => ({ buildAmbient: () => owner('ambient') }));
vi.mock('../../src/presentation/groundcover', () => ({ buildGroundcover: () => owner('groundcover') }));
vi.mock('../../src/presentation/wildlife', () => ({ buildWildlife: () => owner('wildlife') }));
vi.mock('../../src/presentation/woodlandAir', () => ({ buildWoodlandAir: () => owner('air') }));
vi.mock('../../src/presentation/coastalBackdrop', () => ({ buildCoastalBackdrop: () => owner('coast') }));
vi.mock('../../src/presentation/environment', () => ({ buildEnvironment: () => owner('environment') }));
vi.mock('../../src/presentation/settlement', () => ({ buildScenery: () => ({ ...owner('scenery'), riteBowl: new THREE.Group() }) }));
vi.mock('../../src/presentation/hunterSupplies', () => ({ buildHunterSupplies: () => owner('hunter supplies').group, disposeHunterSupplies: (group: THREE.Group) => {
  controls.owners.find(resource => resource.group === group)!.dispose();
} }));
vi.mock('../../src/presentation/animalCamp', () => ({ buildAnimalCamp: () => owner('caravan') }));
vi.mock('../../src/presentation/animals', () => ({ loadAnimalTemplates: async (progress?: (loaded: number, total: number) => void) => {
  await modelFamily('animals', ANIMALS.length, progress); return new Map();
}, buildAnimals: () => owner('animals') }));
vi.mock('../../src/presentation/furniture', async importOriginal => ({ loadFurniture: async (progress?: (loaded: number, total: number) => void) => {
  controls.furnitureLoads++;
  if (controls.furnitureGate) await controls.furnitureGate;
  await modelFamily('furniture', 1, progress); return new Map();
}, buildFurniture: () => owner('furniture'), deferredFurniture: (await importOriginal<typeof import('../../src/presentation/furniture')>()).deferredFurniture }));
vi.mock('../../src/core/world/groundContacts', () => ({ createGroundContactField: () => ({}) }));
vi.mock('../../src/presentation/physicalProps', () => ({ buildPhysicalProps: () => owner('physical supplies') }));
vi.mock('../../src/presentation/riteResponse', () => ({ buildRiteResponse: () => owner('rite') }));
const buildCaches = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock('../../src/presentation/buildCaches', () => ({ buildCache: () => {}, releaseBuildCaches: buildCaches.release }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(() => {
  controls.owners = []; controls.navVersions = []; controls.groundFailure = null; controls.navigationGate = null;
  controls.modelGate = null; controls.modelsStarted = null; controls.modelCallbacks = {};
  controls.furnitureGate = null; controls.furnitureLoads = 0; controls.budgets = []; controls.physicsStarts = 0; buildCaches.release.mockClear();
  const colliders = new Colliders();
  for (const id of ['archive_door', 'archive_shutter', 'shortcut_gate']) colliders.circle(id, 0, 0, 1);
  controls.colliders = colliders;
  vi.spyOn(WorldScene.prototype, 'syncStatic').mockImplementation(() => {});
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillStyle: '', fillRect() {},
  }) }) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('world load and activation boundary', () => {
  it('reports monotonic completed GLB counts across interleaved families, including every tree LOD', async () => {
    const gate = deferred(), started = deferred(); controls.modelGate = gate.promise; controls.modelsStarted = started.resolve;
    const phases: WorldBuildProgress[] = [], legacy = vi.fn();
    const pending = WorldScene.create(createInitialState(), defaultSettings(), legacy, undefined, { yieldNow: async () => {}, onPhase: p => phases.push(p) });
    await started.promise;
    const expectedTotal = PINE_FILES.length + HERO_PINE_FILES.length + 1 + forestTreeIds().length * MESHY_TREE_LODS.length + ANIMALS.length + 1;
    expect(phases.at(-1)).toMatchObject({ phase: 'models', completed: 0, total: expectedTotal });
    controls.modelCallbacks.pine!(2, PINE_FILES.length);
    expect(phases.at(-1)!.completed).toBe(2);
    controls.modelCallbacks.heroPine!(HERO_PINE_FILES.length, HERO_PINE_FILES.length);
    expect(phases.at(-1)!.completed).toBe(2 + HERO_PINE_FILES.length);
    controls.modelCallbacks.trees!(3, forestTreeIds().length);
    expect(phases.at(-1)!.completed).toBe(2 + HERO_PINE_FILES.length + 3 * MESHY_TREE_LODS.length);
    controls.modelCallbacks.animals!(5, ANIMALS.length);
    controls.modelCallbacks.stone!(1, 1);
    const previous = phases.at(-1)!.completed;
    controls.modelCallbacks.pine!(0, PINE_FILES.length); // An older cached observer cannot move the bar backwards.
    expect(phases.at(-1)!.completed).toBe(previous);
    expect(legacy).toHaveBeenCalledWith({ loaded: 3, total: forestTreeIds().length, label: 'Woodland models' });
    gate.resolve();
    const world = await pending;
    try {
      const counts = phases.filter(p => p.phase === 'models');
      expect(counts.at(-1)).toMatchObject({ completed: expectedTotal, total: expectedTotal });
      expect(counts.every((p, i) => i === 0 || p.completed! >= counts[i - 1]!.completed!)).toBe(true);
      const length = phases.length; controls.modelCallbacks.animals!(0, ANIMALS.length);
      expect(phases).toHaveLength(length); // A previous model phase cannot overwrite later construction.
    } finally { disposeSceneResources(world.scene, () => world.dispose()); }
  });

  it('opens without the furniture when it is deferred and furnishes the rooms once the pieces arrive (backlog 4)', async () => {
    const gate = deferred(); controls.furnitureGate = gate.promise;
    const phases: WorldBuildProgress[] = [];
    const world = await WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, {
      yieldNow: async () => {}, deferFurniture: true, onPhase: p => phases.push(p),
    });
    try {
      const expectedTotal = PINE_FILES.length + HERO_PINE_FILES.length + 1 + forestTreeIds().length * MESHY_TREE_LODS.length + ANIMALS.length;
      expect(phases.filter(p => p.phase === 'models').at(-1)).toMatchObject({ completed: expectedTotal, total: expectedTotal });
      expect(controls.modelCallbacks.furniture).toBeUndefined();
      const module = world.modules.find(entry => entry.name === 'furniture')!.module as SceneModule & { arrived: boolean };
      expect(module.arrived).toBe(false);
      expect(controls.owners.find(resource => resource.name === 'furniture')).toBeUndefined();
      gate.resolve();
      // Nothing is fetched until the world has opened (A72).
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(controls.furnitureLoads).toBe(0);
      world.open();
      await vi.waitFor(() => expect(module.arrived).toBe(true));
      expect(controls.furnitureLoads).toBe(1);
      const furniture = controls.owners.find(resource => resource.name === 'furniture')!;
      expect(module.group.children).toContain(furniture.group);
    } finally { disposeSceneResources(world.scene, () => world.dispose()); }
    expect(controls.owners.find(resource => resource.name === 'furniture')!.dispose).toHaveBeenCalledOnce();
  });

  it('returns only after physical contacts and both navigation widths are ready, with saved gates installed first', async () => {
    const gate = deferred(); controls.navigationGate = gate.promise;
    const state = createInitialState(); state.locationChanges.shortcut = 'open';
    const phases: WorldBuildProgress[] = [], reachedNavigation = deferred();
    let completed = false;
    const pending = WorldScene.create(state, defaultSettings(), undefined, undefined, {
      yieldNow: async () => {}, onPhase: p => { phases.push(p); if (p.phase === 'navigation') reachedNavigation.resolve(); },
    }).then(world => { completed = true; return world; });
    await reachedNavigation.promise;
    expect(completed).toBe(false);
    expect(controls.owners.find(resource => resource.name === 'physics')).toBeDefined();
    expect((controls.colliders as Colliders).all.find(c => c.id === 'shortcut_gate')!.active).toBe(false);
    gate.resolve();
    const world = await pending;
    try {
      expect(controls.navVersions).toEqual([(controls.colliders as Colliders).version, (controls.colliders as Colliders).version]);
      expect(phases.at(-1)).toMatchObject({ phase: 'finishing', completed: 1, total: 1 });
      for (const stage of ['models', 'textures', 'terrain', 'navigation']) {
        const counts = phases.filter(p => p.phase === stage && p.total !== undefined);
        expect(new Set(counts.map(p => p.total)).size).toBe(1);
        expect(counts.every((p, i) => i === 0 || p.completed! >= counts[i - 1]!.completed!)).toBe(true);
        expect(counts.at(-1)!.completed).toBe(counts.at(-1)!.total);
      }
      const largeRoutes = phases.filter(p => p.label === 'Large creature routes');
      expect(largeRoutes[0]!.completed).toBeGreaterThan((WORLD.maxZ - WORLD.minZ) / WORLD.cell);
      const physicsCounts = phases.filter(p => p.phase === 'physics' && p.completed !== undefined);
      expect(physicsCounts).toEqual([{ phase: 'physics', label: 'Physical contacts', completed: 1, total: 1 }]);
      expect(world.physics).toBeDefined(); expect(world.nav).toBeDefined(); expect(world.animals).toBeDefined();
      expect(world.modules.find(module => module.name === 'forest')).toBeDefined();
      expect(WorldScene.prototype.syncStatic).toHaveBeenCalledWith(state, true);
    } finally { disposeSceneResources(world.scene, () => world.dispose()); }
  });

  it('starts the physics engine while the models are still loading, not after them', async () => {
    const gate = deferred(), started = deferred(); controls.modelGate = gate.promise; controls.modelsStarted = started.resolve;
    const pending = WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, { yieldNow: async () => {} });
    await started.promise;
    expect(controls.physicsStarts).toBeGreaterThan(0);
    gate.resolve();
    const world = await pending;
    disposeSceneResources(world.scene, () => world.dispose());
  });

  it('works its cooperative stages in long slices while the loading screen covers them, unless the caller names its own', async () => {
    expect(WORLD_BUILD_SLICE_MS).toBeGreaterThan(8);
    for (const [given, expected] of [[undefined, WORLD_BUILD_SLICE_MS], [5, 5]] as const) {
      controls.budgets = [];
      const world = await WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined,
        { yieldNow: async () => {}, ...(given === undefined ? {} : { budgetMs: given }) });
      try {
        expect(new Set(controls.budgets.map(([stage]) => stage))).toEqual(new Set(['terrain', 'ground', 'walking routes', 'large creature routes']));
        expect(controls.budgets.filter(([, budget]) => budget !== expected)).toEqual([]);
      } finally { disposeSceneResources(world.scene, () => world.dispose()); }
    }
  });

  it('cleans every completed owner and attached geometry when cancellation arrives before activation', async () => {
    const controller = new AbortController(), reason = new DOMException('Replaced build', 'AbortError');
    const geometryDisposal = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    await expect(WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, {
      yieldNow: async () => {}, signal: controller.signal,
      onPhase: p => { if (p.phase === 'navigation') controller.abort(reason); },
    })).rejects.toBe(reason);
    for (const resource of controls.owners) {
      if (resource.name !== 'ground tiles') expect(resource.dispose).toHaveBeenCalledOnce();
    }
    expect(geometryDisposal).toHaveBeenCalled();
    expect(WorldScene.prototype.syncStatic).not.toHaveBeenCalled();
  });

  it('empties the caches only a build reads once the world is built, and leaves them to the build after a cancelled one', async () => {
    const controller = new AbortController(), reason = new DOMException('Replaced build', 'AbortError');
    await expect(WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, {
      yieldNow: async () => {}, signal: controller.signal,
      onPhase: p => { if (p.phase === 'navigation') controller.abort(reason); },
    })).rejects.toBe(reason);
    expect(buildCaches.release).not.toHaveBeenCalled();
    const world = await WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, { yieldNow: async () => {} });
    try { expect(buildCaches.release).toHaveBeenCalledOnce(); } finally { disposeSceneResources(world.scene, () => world.dispose()); }
  });

  it('cleans earlier modules and private textures when a later ground construction stage fails', async () => {
    const failure = new Error('Ground allocation failed'); controls.groundFailure = failure;
    await expect(WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, { yieldNow: async () => {} })).rejects.toBe(failure);
    expect(controls.owners.some(resource => resource.name === 'physics')).toBe(false);
    for (const resource of controls.owners) expect(resource.dispose).toHaveBeenCalledOnce();
    expect(WorldScene.prototype.syncStatic).not.toHaveBeenCalled();
  });

  it('continues cleanup after one private module hook throws, retaining the original construction failure', async () => {
    const failure = new Error('Loading screen detached'), privateFailure = new Error('Forest private cleanup failed');
    const geometries = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    await expect(WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, {
      yieldNow: async () => {}, onPhase: p => {
        if (p.phase === 'physics') {
          vi.mocked(controls.owners.find(resource => resource.name === 'forest')!.dispose).mockImplementation(() => { throw privateFailure; });
          throw failure;
        }
      },
    })).rejects.toBe(failure);
    for (const resource of controls.owners) expect(resource.dispose).toHaveBeenCalledOnce();
    expect(geometries).toHaveBeenCalled();
  });

  it('releases the completed scene if final readiness reporting fails, and owned disposal is idempotent on success', async () => {
    const failure = new Error('Loading screen detached');
    await expect(WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, {
      yieldNow: async () => {}, onPhase: p => { if (p.phase === 'finishing' && p.completed === 1) throw failure; },
    })).rejects.toBe(failure);
    for (const resource of controls.owners) if (resource.name !== 'ground tiles') expect(resource.dispose).toHaveBeenCalledOnce();
    controls.owners = [];
    const world = await WorldScene.create(createInitialState(), defaultSettings(), undefined, undefined, { yieldNow: async () => {} });
    world.dispose(); world.dispose();
    for (const resource of controls.owners) if (resource.name !== 'ground tiles') expect(resource.dispose).toHaveBeenCalledOnce();
    disposeSceneResources(world.scene, () => world.dispose());
  });
});
