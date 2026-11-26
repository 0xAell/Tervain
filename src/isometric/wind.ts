import type { Atlas } from './atlas';

const poseCount = 16;
const tau = 2 * Math.PI;

/** The front moves inland from the strand. The slower wave gathers and releases the gust. */
export function windPhase(x: number, z: number, time: number, pace = 1) {
  const front = time * 1.13 - x * 0.13 - z * 0.062;
  return (
    (time * 0.59 - x * 0.025 - z * 0.012) * pace +
    0.17 * Math.sin(front) +
    0.057 * Math.sin(front * 0.48 - 0.9)
  );
}

export function windFrame(phase: number, count: number, offset = 0) {
  const frame = Math.floor(phase * count + offset) % count;
  return (frame + count) % count;
}

export interface WindSprite {
  key: string;
  widthScale: number;
}
type RGB = readonly [number, number, number];
type Palette = readonly [RGB, RGB];

function canvas(w: number, h: number) {
  const image = document.createElement('canvas');
  image.width = w;
  image.height = h;
  return image.getContext('2d')!;
}

function shades(atlas: Atlas, key: string, palette: Palette) {
  const { pixels, w, h } = atlas.read(key)[0]!;
  const ink = canvas(w, h);
  const color = ink.createImageData(w, h);
  new Uint32Array(color.data.buffer).set(pixels);
  const c = color.data;
  for (let i = 0; i < c.length; i += 4) {
    if (!c[i + 3]) continue;
    const light = Math.min(1, Math.max(0, (c[i]! + 2 * c[i + 1]! + c[i + 2]! - 124) / 756));
    for (let j = 0; j < 3; j++)
      c[i + j] = Math.round(palette[0][j]! + (palette[1][j]! - palette[0][j]!) * light);
  }
  ink.putImageData(color, 0, 0);
  return ink.canvas;
}

function ribbon(atlas: Atlas, sourceKey: string, key: string, bend: number, hanging = false, palette?: Palette) {
  const art = palette ? shades(atlas, sourceKey, palette) : atlas.surface(sourceKey);
  const { width: w, height: h } = art;
  const pad = Math.ceil(bend * 1.5),
    span = w + 2 * pad,
    strip = canvas(span * poseCount, h);
  for (let frame = 0; frame < poseCount; frame++) {
    const phase = (frame * tau) / poseCount;
    for (let y = 0; y < h; y++) {
      // The top bar or the bottom of the stem stays anchored.
      const free = hanging ? Math.max(0, y - 7) / (h - 8) : (h - 1 - y) / (h - 1);
      const wave = 0.18 + Math.sin(phase - free * 1.65) + Math.sin(2 * phase - free * 2.8) * 0.29;
      const offset = Math.round(bend * free ** 1.85 * wave);
      strip.drawImage(art, 0, y, w, 1, span * frame + pad + offset, y, w, 1);
    }
  }
  atlas.addAnimation(key, strip.canvas, span, h);
  return { key, widthScale: span / w };
}

function wreckSail(atlas: Atlas): WindSprite {
  const { pixels, w, h } = atlas.read('wreck')[0]!;
  const hull = canvas(w, h),
    sail = canvas(w, h);
  const timber = hull.createImageData(w, h),
    cloth = sail.createImageData(w, h);
  new Uint32Array(timber.data.buffer).set(pixels);
  // The canvas is the pale patch below the yardarm in the original 120 by 92 wreck.
  // Preserve the brown mast, spars and ribs even where the edges overlap the sail.
  for (let y = 9; y < Math.min(h, 63); y++)
    for (let x = Math.ceil(68 + (y - 9) * 0.37); x < Math.min(w, 117); x++) {
      if (y < 9 + (x - 72) * 0.68) continue;
      const i = (y * w + x) * 4,
        r = timber.data[i]!,
        g = timber.data[i + 1]!,
        b = timber.data[i + 2]!;
      if (!timber.data[i + 3] || g < r * 0.83 || b < r * 0.48) continue;
      cloth.data.set(timber.data.subarray(i, i + 4), i);
      timber.data[i + 3] = 0;
    }
  hull.putImageData(timber, 0, 0);
  sail.putImageData(cloth, 0, 0);
  const pad = 8,
    span = w + 2 * pad,
    strip = canvas(span * poseCount, h);
  for (let frame = 0; frame < poseCount; frame++) {
    const phase = (frame * tau) / poseCount,
      left = span * frame + pad;
    for (let y = 9; y < Math.min(h, 63); y++) {
      const free = Math.max(0, (y - 12) / 50);
      const wave = 0.21 + Math.sin(phase - free * 2.65) + 0.28 * Math.sin(2 * phase - free * 4);
      strip.drawImage(sail.canvas, 0, y, w, 1, left + Math.round(7 * free ** 1.7 * wave), y, w, 1);
    }
    strip.drawImage(hull.canvas, left, 0);
  }
  const key = 'wreck--wind';
  atlas.addAnimation(key, strip.canvas, span, h);
  return { key, widthScale: span / w };
}

export function buildWindArt(atlas: Atlas) {
  const sprites = new Map<string, WindSprite>();
  for (const [key, bend] of [
    ['pine', 1.35], ['pine--broad', 1.0], ['pine--lean', 1.2],
    ['fir', 1.1], ['fir--young', 1.5],
    ['birch', 1.65], ['birch--fork', 1.35],
    ['oak', 0.85], ['oak--lean', 1.0],
    ['brush', 1.25],
    ['flowers', 3.9],
    ['reeds', 4.7],
    ['rill_spirea', 4],
    ['field_herbs', 3],
  ] as const)
    sprites.set(key, ribbon(atlas, key, key + '--wind', bend));
  sprites.set('wreck', wreckSail(atlas));
  ribbon(atlas, 'room_banner', 'room_banner--wind', 3.4, true);
  return {
    sprites,
    meadow: ribbon(atlas, 'rill_sedge', 'meadow_grass--wind', 6.4, false, [[48, 65, 38], [150, 171, 88]]),
    verge: ribbon(atlas, 'reeds', 'verge_grass--wind', 6, false, [[57, 68, 42], [158, 169, 97]]),
    grain: ribbon(atlas, 'rill_sedge', 'field_grain--wind', 6, false, [[104, 82, 45], [215, 181, 94]]),
    greens: ribbon(atlas, 'rill_fern', 'field_greens--wind', 4.5, false, [[51, 73, 45], [141, 161, 89]]),
  };
}
