import { describe, expect, it } from 'vitest';
import { modelAssetUrl } from '../../src/presentation/assets/modelUrl';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const HOSTED = `https://raw.githubusercontent.com/0xAell/Tervain/${SHA}/public/models/`;

describe('original model delivery', () => {
  const playable = ['flora/hero/hero-oak-mid.glb', 'flora/craft/silver-fir-near.glb', 'craft/furniture/manifest.json', 'scenery/intertidal-schist.glb'];

  it('resolves playable assets under the served game directory and the exact build commit', () => {
    for (const file of playable) {
      expect(modelAssetUrl(file, './', 'https://example.test/Tervain/index.html', '').href).toBe(`https://example.test/Tervain/models/${file}`);
      expect(modelAssetUrl(file, './', 'https://example.test/Tervain/index.html', HOSTED).href).toBe(`${HOSTED}${file}`);
    }
  });

  it('refuses archived art before a browser can fetch it from either host', () => {
    for (const file of ['npcs/manifest.json', 'flora/meshy-012/oak-elder-near.glb', 'hero/hero.glb', 'animals/tiger-1005232739.glb', 'furniture/manifest.json']) {
      for (const remote of ['', HOSTED]) expect(() => modelAssetUrl(file, './', 'https://example.test/Tervain/', remote)).toThrow(/outside the playable art/);
    }
  });

  it('rejects an unpublished or mutable production target instead of falling back locally', () => {
    for (const base of [HOSTED.replace(SHA, 'main'), HOSTED.replace(SHA, SHA.slice(0, 7)), HOSTED.replace('https:', 'http:'), HOSTED.replace('Tervain/', 'Warpkeep/')]) {
      expect(() => modelAssetUrl(playable[0]!, './', 'https://example.test/Tervain/', base)).toThrow(/exact production commit/);
    }
  });

  it('keeps manifest paths inside the model root on both delivery hosts', () => {
    for (const file of ['', '/hero.glb', '../hero.glb', 'npcs/../../hero.glb', 'npcs/%2e%2e/hero.glb', 'npcs/%2fhero.glb', 'https://example.test/x.glb', 'npcs\\hero.glb', 'npcs/hero.glb?bad', 'npcs/hero.glb#bad']) {
      for (const remote of ['', HOSTED]) expect(() => modelAssetUrl(file, './', 'https://example.test/Tervain/', remote)).toThrow(/Invalid model asset path/);
    }
  });
});
