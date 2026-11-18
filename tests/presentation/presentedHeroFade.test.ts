import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/app';
import { Colliders } from '../../src/core/world/colliders';
import { MotionInterpolation } from '../../src/platform/frameTiming';
import { CameraRig } from '../../src/presentation/cameraRig';
import { NearFade } from '../../src/presentation/nearFade';

function fixture(reducedMotion = false) {
  const group = new THREE.Group(), root = new THREE.Group();
  group.add(root);
  const cam = new CameraRig(root.position), heroFade = new NearFade(), motion = new MotionInterpolation();
  const flat = { groundAt: () => 0 }, colliders = new Colliders();
  const app = Object.assign(Object.create(App.prototype) as object, {
    player: { rig: { root }, group }, cam, heroFade, motion, mode: 'play', simStep: 0,
    hunting: { updateHud() {} }, updateHud() {}, updateDebug() {}, render() {},
  });
  function capture(distance: number, playerX = 0) {
    root.position.x = playerX;
    cam.follow(1 / 60, playerX, 0, 0, flat, colliders, reducedMotion, 0);
    cam.camera.position.set(playerX, 1, distance);
    heroFade.apply(group, cam.bodyCoverage);
    motion.capture(++app.simStep, [root, cam.camera]);
  }
  function present(alpha: number, duringDraw: () => void) {
    app.render = duringDraw;
    Reflect.get(App.prototype, 'present').call(app, alpha);
  }
  return { cam, heroFade, root, group, capture, present };
}

describe('hero and equipment fade at the presented eye', () => {
  it.each([false, true])('follows both directions of a sudden obstruction; reduced motion %s', reducedMotion => {
    const { cam, heroFade, group, capture, present } = fixture(reducedMotion);
    capture(2.105); capture(.04);
    const check = (alpha: number, expectedCoverage: number, visible: boolean) => present(alpha, () => {
      expect(heroFade.uniform.value).toBeCloseTo(expectedCoverage, 4);
      expect(group.visible).toBe(visible);
      expect(cam.bodyVisible).toBe(visible);
    });
    check(.25, 1, true);
    check(.5, .754767, true);
    check(.65, .036080, true);
    check(.66, .016681, false);
    check(.75, 0, false);
    expect(cam.camera.position.z).toBe(.04);
    expect(group.visible).toBe(false);
    expect(heroFade.uniform.value).toBe(0);

    capture(2.105);
    check(.25, 0, false);
    check(.5, .754767, true);
    check(.9, 1, true);
    expect(cam.camera.position.z).toBe(2.105);
    expect(group.visible).toBe(true);
    expect(heroFade.uniform.value).toBe(1);
  });

  it('measures from the interpolated body and restores both transforms and coverage if a draw fails', () => {
    const { cam, heroFade, root, group, capture, present } = fixture();
    capture(.81); capture(.04, 2);
    expect(() => present(0, () => {
      expect(root.position.x).toBe(0);
      expect(cam.camera.position.x).toBe(0);
      expect(heroFade.uniform.value).toBeCloseTo(.104, 5);
      throw new Error('draw failed');
    })).toThrow('draw failed');
    expect(root.position.x).toBe(2);
    expect(cam.camera.position.x).toBe(2);
    expect(group.visible).toBe(false);
    expect(heroFade.uniform.value).toBe(0);
  });

  it('keeps manual views, benchmark views and a reset camera clear of follow-camera fading', () => {
    const { cam, heroFade, group, capture, present } = fixture();
    capture(.04);
    const visible = () => {
      expect(group.visible).toBe(true);
      expect(heroFade.uniform.value).toBe(1);
      expect(cam.bodyVisible).toBe(true);
    };
    cam.manual = { p: cam.camera.position.clone(), look: new THREE.Vector3() };
    present(1, visible);
    cam.manual = null;
    cam.mode = 'bench';
    present(1, visible);
    cam.mode = 'follow';
    cam.reset();
    present(1, visible);
  });
});
