import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(shadows: boolean) {
  const colour = deferred(), uploads = deferred(), scene = new THREE.Scene(), object = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  object.visible = mesh.visible = false; object.add(mesh);
  const world = { scene }, previous = new THREE.WebGLRenderTarget(1, 1);
  const renderer = { shadowMap: { enabled: shadows }, getRenderTarget: () => previous,
    setRenderTarget: vi.fn(), compileAsync: vi.fn(() => colour.promise) };
  const uploadTextures = vi.fn(() => uploads.promise);
  const app = Object.assign(Object.create(App.prototype), { world, worldDisposed: false, renderer,
    grade: { enabled: false }, cam: { camera: new THREE.PerspectiveCamera() }, warmDepth: new Map(), uploadTextures });
  const warm = (draws = true, compileOnly = false) => Reflect.apply(Reflect.get(App.prototype, 'warmShaders'), app,
    [object, scene, draws, world, compileOnly]) as Promise<unknown>;
  return { colour, uploads, object, mesh, renderer, uploadTextures, world, warm };
}

describe('graphics preparation without shadow maps', () => {
  it.each([false, true])('waits for late textures and first draws even when shadows=%s', async shadows => {
    const s = fixture(shadows); let complete = false;
    const pending = s.warm().then(() => { complete = true; });
    expect(s.uploadTextures).not.toHaveBeenCalled();
    expect(s.object.visible).toBe(false); expect(s.mesh.visible).toBe(false);
    s.colour.resolve(); await Promise.resolve();
    expect(s.uploadTextures).toHaveBeenCalledExactlyOnceWith(s.object, true, s.world);
    expect(complete).toBe(false);
    s.uploads.resolve(); await pending; expect(complete).toBe(true);
  });
  it.each([false, true])('keeps compile-only preparation free of uploads when shadows=%s', async shadows => {
    const s = fixture(shadows), pending = s.warm(true, true);
    s.colour.resolve(); await pending;
    expect(s.uploadTextures).not.toHaveBeenCalled();
    expect(s.object.visible).toBe(false); expect(s.mesh.visible).toBe(false);
  });
  it('leaves a part a batch draws hidden while it shows the other hidden pieces for their programs', async () => {
    const s = fixture(false);
    const batched = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    batched.visible = false; batched.userData.batchedInto = {};
    s.object.add(batched);
    const seen: boolean[][] = [];
    s.renderer.compileAsync.mockImplementation(() => { seen.push([s.mesh.visible, batched.visible]); return s.colour.promise; });
    const pending = s.warm();
    expect(seen).toEqual([[true, false]]);
    s.colour.resolve(); s.uploads.resolve(); await pending;
    expect([s.mesh.visible, batched.visible]).toEqual([false, false]);
  });
  it('passes the no-first-draw option through the shadowless upload path', async () => {
    const s = fixture(false), pending = s.warm(false);
    s.colour.resolve(); await Promise.resolve();
    expect(s.uploadTextures).toHaveBeenCalledExactlyOnceWith(s.object, false, s.world);
    s.uploads.resolve(); await pending;
  });
});

describe('the sun\'s shadow programs prepared with the colour ones', () => {
  it('compiles a caster\'s depth once, fog-free, under every light the world has, point lights at no intensity included', async () => {
    const s = fixture(true);
    s.object.visible = s.mesh.visible = true;
    s.mesh.castShadow = true;
    const scene = s.world.scene;
    scene.fog = new THREE.Fog(0xffffff, 10, 100);
    const sun = new THREE.DirectionalLight(), sky = new THREE.HemisphereLight(), lamp = new THREE.PointLight(0xffffff, 0);
    scene.add(sun, sky, lamp);
    const calls: { target: THREE.Scene; fog: THREE.Fog | THREE.FogExp2 | null; lights: string[]; material: THREE.Material }[] = [];
    s.renderer.compileAsync.mockImplementation((...args: unknown[]) => {
      const target = args[2] as THREE.Scene, lights: string[] = [];
      target.traverseVisible((o) => { if ((o as THREE.Light).isLight) lights.push(o.type); });
      calls.push({ target, fog: target.fog, lights: lights.sort(), material: s.mesh.material as THREE.Material });
      return s.colour.promise;
    });
    const colour = s.mesh.material;
    const pending = s.warm(true, true);
    // The world's own colour programs, then the depth programs the shadow pass draws: the main view and every capture
    // see all six point lights, kept at no intensity when dark, so no pass leaves the shadow pass without them.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.target).toBe(scene);
    expect(calls[0]!.material).toBe(colour);
    expect(calls[1]!.target).not.toBe(scene);
    expect(calls[1]!.fog).toBeNull();
    expect(calls[1]!.lights).toEqual(['DirectionalLight', 'HemisphereLight', 'PointLight']);
    expect(calls[1]!.material).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(s.mesh.material).toBe(colour);
    s.colour.resolve(); await pending;
  });
});

describe('the sun\'s shadow programs prepared for the casters alone', () => {
  it('leaves what casts no shadow out of the shadow compile, then gives it its own material back', async () => {
    const s = fixture(true);
    s.object.visible = s.mesh.visible = true;
    s.mesh.castShadow = true;
    const plainMaterial = new THREE.MeshStandardMaterial();
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), plainMaterial);
    s.object.add(plain);
    const seen: { caster: THREE.Material | null; plain: THREE.Material | null }[] = [];
    s.renderer.compileAsync.mockImplementation(() => {
      seen.push({ caster: s.mesh.material as THREE.Material, plain: plain.material as THREE.Material | null });
      return s.colour.promise;
    });
    const pending = s.warm(true, true);
    // The colour compile sees everything as drawn; the shadow compile only the caster, with its depth material.
    expect(seen).toHaveLength(2);
    expect(seen[0]!.plain).toBe(plainMaterial);
    expect(seen[1]!.caster).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(seen[1]!.plain).toBeNull();
    expect(plain.material).toBe(plainMaterial);
    s.colour.resolve(); await pending;
  });
});

describe('the parts a batch draws, left out of the compile', () => {
  it.each([false, true])('compiles neither colour nor shadow programs for them, then gives them their material back (first view: %s)', async (firstView) => {
    const s = fixture(true);
    s.object.visible = s.mesh.visible = true;
    s.mesh.castShadow = true;
    const partMaterial = new THREE.MeshStandardMaterial();
    const part = new THREE.Mesh(new THREE.BoxGeometry(), partMaterial);
    part.visible = false; part.castShadow = true; part.userData.batchedInto = {};
    s.object.add(part);
    const seen: { part: THREE.Material | null; caster: THREE.Material | null }[] = [];
    s.renderer.compileAsync.mockImplementation(() => {
      seen.push({ part: part.material as THREE.Material | null, caster: s.mesh.material as THREE.Material | null });
      return s.colour.promise;
    });
    const colour = s.mesh.material;
    const pending = s.warm(true, firstView);
    // The colour compile sees the caster as drawn and not the part; the shadow compile the caster's depth, still not the part.
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ part: null, caster: colour });
    expect(seen[1]!.part).toBeNull();
    expect(seen[1]!.caster).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(part.material).toBe(partMaterial);
    expect(part.visible).toBe(false);
    s.colour.resolve(); s.uploads.resolve(); await pending;
    expect(part.material).toBe(partMaterial);
  });
});

describe('the shrine hall\'s panes prepared with the first view', () => {
  it('compiles the panes as a whole capture shows them, into the grade\'s target under the world\'s lights, and puts the target back', async () => {
    const scene = new THREE.Scene(), target = new THREE.WebGLRenderTarget(1, 1), previous = new THREE.WebGLRenderTarget(1, 1);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    let current: THREE.WebGLRenderTarget | null = previous;
    const compiled: [THREE.Object3D, THREE.Scene, THREE.WebGLRenderTarget | null][] = [];
    const renderer = {
      getRenderTarget: () => current, setRenderTarget: (t: THREE.WebGLRenderTarget | null) => { current = t; },
      compileAsync: (object: THREE.Object3D, _camera: THREE.Camera, into: THREE.Scene) => { compiled.push([object, into, current]); return Promise.resolve(); },
    };
    const world = { scene, compileCapturedPanes: (compile: (pane: THREE.Object3D) => unknown) => [compile(pane)] };
    const app = Object.assign(Object.create(App.prototype), { renderer, world, grade: { enabled: true, target }, cam: { camera: new THREE.PerspectiveCamera() } });
    await (Reflect.apply(Reflect.get(App.prototype, 'compileCapturedPanes'), app, []) as Promise<unknown>);
    expect(compiled).toEqual([[pane, scene, target]]);
    expect(current).toBe(previous);
  });
});
