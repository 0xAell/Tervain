import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { FrameContext } from '../../src/presentation/context';
import { buildEnvironment, type SkyLightFilter } from '../../src/presentation/environment';
import { SKY } from '../../src/presentation/skyState';

const at = (hour: number) => ({ hour }) as FrameContext;
const renderer = {} as THREE.WebGLRenderer;

/** Stands in for three's PMREM filter, which needs WebGL: the target is made on the first call and filled again after. */
function recordingFilter() {
  const calls: { image: THREE.Texture; into: THREE.WebGLRenderTarget | null; version: number }[] = [];
  const made: THREE.WebGLRenderTarget[] = [];
  const filter: SkyLightFilter = {
    filter(image, into) {
      calls.push({ image, into, version: image.version });
      if (into) return into;
      const target = new THREE.WebGLRenderTarget(336, 128);
      target.texture.mapping = THREE.CubeUVReflectionMapping;
      made.push(target);
      return target;
    },
    dispose: vi.fn(),
  };
  const filterFor = vi.fn((_renderer: THREE.WebGLRenderer) => filter);
  return { calls, made, filter, filterFor };
}

/** The shared sky state as the sky module leaves it at the start, put back after each test. */
const start = {
  colours: (['top', 'horizon', 'ground', 'sunColor'] as const).map((k) => SKY[k].value.clone()),
  sunDir: SKY.sunDir.value.clone(), moonDir: SKY.moonDir.value.clone(),
  numbers: (['sunI', 'night', 'brightness', 'cover'] as const).map((k) => SKY[k].value),
};
afterEach(() => {
  SKY.ibl.value = 0;
  (['top', 'horizon', 'ground', 'sunColor'] as const).forEach((k, i) => SKY[k].value.copy(start.colours[i]!));
  SKY.sunDir.value.copy(start.sunDir); SKY.moonDir.value.copy(start.moonDir);
  (['sunI', 'night', 'brightness', 'cover'] as const).forEach((k, i) => { SKY[k].value = start.numbers[i]!; });
});

/** The sky image as it was painted before the grid (every direction and gradient worked out per texel): the reference. */
function paintedBefore(w: number, h: number): Uint16Array {
  const data = new Uint16Array(w * h * 4);
  const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
  const smooth01 = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };
  const tmpTop = SKY.top.value.clone(), tmpHor = SKY.horizon.value.clone(), tmpGround = SKY.ground.value.clone(), tmpSun = SKY.sunColor.value.clone();
  const sun = SKY.sunDir.value, moon = SKY.moonDir.value, sunI = SKY.sunI.value, night = SKY.night.value, br = SKY.brightness.value, cover = SKY.cover.value;
  const bounce = 0.5 + 0.65 * clamp(sunI / 2.5, 0, 1);
  const gr = tmpGround.r * bounce * 1.5, gg = tmpGround.g * bounce * 1.5, gb = tmpGround.b * bounce * 1.5;
  const coreK = (1.0 - cover * 0.45) * sunI, glowK = (0.22 + cover * 0.16) * sunI;
  const moonUp = clamp(moon.y * 5, 0, 1) * night, nightFill = night * 0.05 * (0.6 + 0.6 * br);
  const half = THREE.DataUtils.toHalfFloat;
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI, cl = Math.cos(lat), dy = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w - 0.5) * Math.PI * 2, dx = cl * Math.cos(lon), dz = cl * Math.sin(lon);
      let r: number, g: number, b: number;
      if (dy >= 0) {
        const t = Math.pow(dy, 0.5);
        r = tmpHor.r + (tmpTop.r - tmpHor.r) * t; g = tmpHor.g + (tmpTop.g - tmpHor.g) * t; b = tmpHor.b + (tmpTop.b - tmpHor.b) * t;
      } else {
        const t = smooth01(-dy / 0.5);
        r = tmpHor.r * 0.7 + (gr - tmpHor.r * 0.7) * t; g = tmpHor.g * 0.7 + (gg - tmpHor.g * 0.7) * t; b = tmpHor.b * 0.7 + (gb - tmpHor.b * 0.7) * t;
      }
      const cs = clamp(dx * sun.x + dy * sun.y + dz * sun.z, -1, 1);
      if (cs > 0) {
        const a = Math.acos(cs);
        const core = Math.exp(-(a * a) / (0.2 * 0.2)) * 0.6 * coreK, glow = Math.exp(-(a * a) / (0.62 * 0.62)) * glowK;
        r += tmpSun.r * (core + glow); g += tmpSun.g * (core + glow); b += tmpSun.b * (core + glow);
      }
      if (moonUp > 0) {
        const cm = clamp(dx * moon.x + dy * moon.y + dz * moon.z, -1, 1);
        if (cm > 0) {
          const a = Math.acos(cm);
          const m = (Math.exp(-(a * a) / (0.05 * 0.05)) * 0.9 + Math.exp(-(a * a) / (0.5 * 0.5)) * 0.06) * moonUp;
          r += 0.55 * m; g += 0.65 * m; b += 0.95 * m;
        }
      }
      const o = (y * w + x) * 4;
      data[o] = half(r + nightFill * 0.5); data[o + 1] = half(g + nightFill * 0.65); data[o + 2] = half(b + nightFill * 1.0); data[o + 3] = half(1);
    }
  }
  return data;
}

describe('the sky\'s light', () => {
  it('is one image and one filtered target for the whole journey, so lit materials see the same environment every frame', () => {
    const scene = new THREE.Scene(), { calls, made, filterFor } = recordingFilter();
    const environment = buildEnvironment(scene, 'high', filterFor);
    expect(scene.environment).toBeNull();

    environment.update(0, at(11));
    expect(SKY.ibl.value).toBe(1);
    environment.prepare!(renderer);
    expect(filterFor).toHaveBeenCalledExactlyOnceWith(renderer);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.into).toBeNull();
    const image = calls[0]!.image as THREE.DataTexture, environmentTexture = scene.environment;
    expect(environmentTexture).toBe(made[0]!.texture);
    expect([image.image.width, image.image.height, image.type, image.mapping]).toEqual([128, 64, THREE.HalfFloatType, THREE.EquirectangularReflectionMapping]);
    const noon = Array.from(image.image.data as Uint16Array);

    // Nothing repainted, nothing filtered.
    environment.prepare!(renderer);
    expect(calls).toHaveLength(1);

    // A repaint (every 1.8 s, or when the hour jumps) refills the same image in place and filters it into the same target.
    environment.update(0.5, at(11.1));
    environment.prepare!(renderer);
    expect(calls).toHaveLength(1);
    SKY.top.value.setRGB(0.9, 0.45, 0.2); // the sky module's evening zenith
    environment.update(1.3, at(11.2));
    environment.prepare!(renderer);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.image).toBe(image);
    expect(calls[1]!.into).toBe(made[0]);
    expect(calls[1]!.version).toBeGreaterThan(calls[0]!.version);
    expect(Array.from(image.image.data as Uint16Array)).not.toEqual(noon);
    expect(scene.environment).toBe(environmentTexture);
    // A jump in the hour (a night's sleep, a loaded game) repaints at once.
    environment.update(0.1, at(15));
    environment.prepare!(renderer);
    expect(calls).toHaveLength(3);
    expect(scene.environment).toBe(environmentTexture);
    expect(made).toHaveLength(1);
    expect(filterFor).toHaveBeenCalledOnce();
  });

  it('paints the same half floats as before, from noon to a moonlit night, at High and at Low', () => {
    const skies: (() => void)[] = [
      () => {},
      () => { SKY.sunDir.value.set(0.3, 0.9, 0.2).normalize(); SKY.sunI.value = 2.5; SKY.night.value = 0; SKY.cover.value = 0.2; },
      () => {
        SKY.top.value.setRGB(0.32, 0.36, 0.62); SKY.horizon.value.setRGB(0.95, 0.55, 0.32); SKY.sunColor.value.setRGB(1.4, 0.7, 0.35);
        SKY.sunDir.value.set(0.9, 0.05, -0.3).normalize(); SKY.moonDir.value.set(-0.5, 0.4, 0.2).normalize();
        SKY.sunI.value = 1.2; SKY.night.value = 0.3; SKY.cover.value = 0.6; SKY.brightness.value = 0.8;
      },
      () => {
        SKY.top.value.setRGB(0.01, 0.015, 0.04); SKY.horizon.value.setRGB(0.03, 0.04, 0.08); SKY.ground.value.setRGB(0.02, 0.02, 0.015);
        SKY.sunDir.value.set(0, -0.7, 0.7).normalize(); SKY.moonDir.value.set(0.2, 0.8, 0.3).normalize();
        SKY.sunI.value = 0; SKY.night.value = 1; SKY.cover.value = 0.9; SKY.brightness.value = 1.2;
      },
    ];
    for (const quality of ['high', 'low'] as const) {
      const scene = new THREE.Scene(), { calls, filterFor } = recordingFilter();
      const environment = buildEnvironment(scene, quality, filterFor);
      skies.forEach((sky, i) => {
        sky();
        environment.update(i === 0 ? 0 : 1.8, at(11));
        environment.prepare!(renderer);
        const image = calls[i]!.image as THREE.DataTexture;
        expect(Array.from(image.image.data as Uint16Array), `${quality} sky ${i}`).toEqual(Array.from(paintedBefore(image.image.width, image.image.height)));
      });
      environment.dispose!();
    }
  });

  it('lets go of its image, target and filter, and leaves the scene without it', () => {
    const scene = new THREE.Scene(), { calls, made, filter, filterFor } = recordingFilter();
    const environment = buildEnvironment(scene, 'low', filterFor);
    environment.update(0, at(8));
    environment.prepare!(renderer);
    const image = calls[0]!.image as THREE.DataTexture, released = vi.fn(), targetReleased = vi.fn();
    expect([image.image.width, image.image.height]).toEqual([64, 32]);
    image.addEventListener('dispose', released);
    made[0]!.addEventListener('dispose', targetReleased);
    environment.dispose!();
    expect(released).toHaveBeenCalledOnce();
    expect(targetReleased).toHaveBeenCalledOnce();
    expect(filter.dispose).toHaveBeenCalledOnce();
    expect(scene.environment).toBeNull();
    expect(SKY.ibl.value).toBe(0);
  });
});
