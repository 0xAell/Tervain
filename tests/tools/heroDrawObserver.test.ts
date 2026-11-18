import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Standalone tool injected into the running browser.
import { observeHeroDraws } from '../../tools/hero-draw-observer.mjs';

function setup(authored: boolean) {
  const hips = new THREE.Bone(), body = new THREE.SkinnedMesh(), sash = new THREE.SkinnedMesh();
  body.bind(new THREE.Skeleton([hips])); sash.bind(new THREE.Skeleton([hips]));
  const scene = new THREE.Scene(), pivot = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  scene.add(pivot); pivot.add(body, sash);
  const material = new THREE.MeshStandardMaterial(), grade = { target: {} };
  let target: object | null = grade.target;
  const renderer = { info: { render: { triangles: 0 } }, getRenderTarget: () => target };
  body.onBeforeRender = vi.fn(); body.onAfterRender = vi.fn();
  const original = { before: body.onBeforeRender, after: body.onAfterRender };
  const rig = { hips, body: pivot, sash, person: authored ? { mesh: body } : undefined, hero: !authored };
  const app = { player: { rig }, world: { scene }, cam: { camera }, grade };
  const observer = observeHeroDraws(app);
  const draw = (mesh: THREE.SkinnedMesh, triangles = 12, cam = camera) => {
    const args = [renderer as unknown as THREE.WebGLRenderer, scene, cam, mesh.geometry, material, null as unknown as THREE.Group] as const;
    mesh.onBeforeRender(...args);
    renderer.info.render.triangles += triangles;
    mesh.onAfterRender(...args);
  };
  return { observer, original, body, sash, rig, draw, material, setTarget: (value: object | null) => { target = value; } };
}

describe('playthrough hero colour draws', () => {
  for (const authored of [true, false]) it('follows ' + (authored ? 'the authored body' : 'the streamed body') + ' independently of the sash', () => {
    const { observer, original, body, sash, draw, setTarget, material } = setup(authored);
    observer.beforeWorld();
    draw(sash);
    expect(observer.presented()).toBe(false);
    sash.visible = false;
    draw(body);
    expect(observer.presented()).toBe(true);
    expect(original.before).toHaveBeenCalledOnce();
    expect(original.after).toHaveBeenCalledOnce();
    expect(observer.presented()).toBe(false);
    draw(body, 0);
    setTarget({}); draw(body);
    setTarget(null); draw(body, 5, new THREE.PerspectiveCamera());
    material.colorWrite = false; draw(body);
    expect(observer.presented()).toBe(false);
    material.colorWrite = true; draw(body);
    expect(observer.presented()).toBe(true);
  });

  it('fails closed on an empty streamed body while its accessory draws, then detects its arrival', () => {
    const { rig, observer, draw, body, sash } = setup(false);
    rig.body.remove(body);
    observer.beforeWorld();
    draw(sash);
    expect(observer.presented()).toBe(false);
    rig.body.add(body);
    observer.beforeWorld();
    draw(body);
    expect(observer.presented()).toBe(true);
  });
});
