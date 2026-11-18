import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installSoftSunShadows, PENUMBRA_MAX, SOFT_SUN_SHADOW, SUN_SHADOW_FADE, SUN_SHADOW_SPAN, sunCasterFrustum } from '../../src/presentation/softShadows';

function daylight(altitude = 50) {
  const light = new THREE.DirectionalLight();
  light.position.set(22, altitude, -18);
  light.target.position.set(3, 0, 7);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const camera = light.shadow.camera;
  Object.assign(camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  camera.updateProjectionMatrix();
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.radius = SOFT_SUN_SHADOW;
  light.shadow.updateMatrices(light);
  return light;
}

describe('the sun depth visible to any shadow receiver', () => {
  it.each([0.5, 50])('retains the fade, widest filtered tap and bilinear border on every edge at light height %s', altitude => {
    expect(installSoftSunShadows()).toBe(true);
    const sun = daylight(altitude), shadow = sun.shadow, result = new THREE.Frustum();
    const original = shadow.getFrustum().clone();
    expect(sunCasterFrustum(sun, result)).toBe(result);
    const half = SUN_SHADOW_SPAN / 2, texel = SUN_SHADOW_SPAN / shadow.mapSize.x;
    const lastTap = half * SUN_SHADOW_FADE[1] + Math.max(PENUMBRA_MAX, 2 * texel) + texel / 2;
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const point = (edge: number) => shadow.camera.localToWorld(new THREE.Vector3(edge * x, edge * y, -20));
      expect(result.containsPoint(point(lastTap))).toBe(true);
      expect(result.intersectsSphere(new THREE.Sphere(point(lastTap + 0.3), 0.31))).toBe(true);
      expect(original.containsPoint(point(half - 0.1))).toBe(true);
      expect(result.intersectsSphere(new THREE.Sphere(point(half - 0.1), 0.02))).toBe(false);
    }
    // The same original volume is still available to Three. Depth along the light is never shortened.
    for (let i = 0; i < 6; i++) expect(shadow.getFrustum().planes[i]!.equals(original.planes[i]!)).toBe(true);
    for (const i of [4, 5]) expect(result.planes[i]!.equals(original.planes[i]!)).toBe(true);
  });

  it('keeps the full volume for ordinary PCF and when a coarse map consumes the entire border', () => {
    installSoftSunShadows();
    const sun = daylight(), result = new THREE.Frustum();
    for (const [radius, size] of [[2, 2048], [SOFT_SUN_SHADOW, 64]] as const) {
      sun.shadow.radius = radius; sun.shadow.mapSize.set(size, size);
      sunCasterFrustum(sun, result);
      expect(result.planes.every((p, i) => p.equals(sun.shadow.getFrustum().planes[i]!))).toBe(true);
    }
  });
});
