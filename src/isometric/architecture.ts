import type { Atlas } from './atlas';
import { buildingEntry } from '../core/world/buildingEntries';
import { fromBuildingLocal } from '../core/world/interiors';
import type { BuildingSpec } from '../core/world/layout';
import { project, risePixels } from './projection';
import { houseSolid, HousePainter } from './houseSolid';
import { bitmap, depthStrips, finishBitmap } from './worldArt';
import { mix, rgba } from './waterPalette';

type Point = [number, number];
interface Facade {
  /** Source pixels at the two ends of the visible walls, their common corner, and the door sill. */
  feet: [Point, Point, Point];
  door: Point;
  /** Clockwise cut around the masonry and roof, excluding the painted display tile. */
  cut: Point[];
}
const facades: Record<string, Facade> = {
  house: {
    feet: [
      [19, 59],
      [47, 71],
      [80, 58],
    ],
    door: [64, 64],
    cut: [
      [0, 0],
      [100, 0],
      [100, 42],
      [81, 43],
      [81, 58],
      [48, 72],
      [46, 72],
      [19, 60],
      [19, 41],
      [0, 45],
    ],
  },
  bakery: {
    feet: [
      [22, 49],
      [59, 64],
      [81, 53],
    ],
    door: [37, 55],
    cut: [
      [0, 0],
      [101, 0],
      [101, 38],
      [82, 35],
      [82, 53],
      [61, 65],
      [58, 65],
      [52, 62],
      [49, 64],
      [44, 62],
      [44, 59],
      [22, 50],
      [21, 31],
      [0, 35],
    ],
  },
  inn: {
    feet: [
      [23, 72],
      [61, 91],
      [98, 73],
    ],
    door: [75, 84],
    cut: [
      [0, 0],
      [123, 0],
      [123, 49],
      [99, 48],
      [99, 73],
      [89, 78],
      [82, 81],
      [70, 87],
      [62, 92],
      [57, 90],
      [46, 85],
      [44, 86],
      [35, 81],
      [35, 78],
      [23, 73],
      [22, 50],
      [0, 54],
    ],
  },
  mill: {
    feet: [
      [27, 74],
      [51, 84],
      [113, 71],
    ],
    door: [39, 78],
    cut: [
      [0, 0],
      [133, 0],
      [133, 51],
      [116, 54],
      [114, 57],
      [118, 64],
      [119, 69],
      [116, 76],
      [110, 81],
      [105, 83],
      [98, 82],
      [94, 85],
      [91, 85],
      [71, 75],
      [53, 84],
      [50, 85],
      [27, 75],
      [27, 51],
      [0, 51],
    ],
  },
  shrine: {
    feet: [
      [25, 79],
      [49, 90],
      [77, 76],
    ],
    door: [35, 84],
    cut: [
      [0, 0],
      [102, 0],
      [102, 61],
      [78, 63],
      [78, 76],
      [68, 82],
      [67, 86],
      [61, 88],
      [58, 85],
      [50, 91],
      [47, 91],
      [25, 80],
      [24, 58],
      [15, 60],
      [0, 52],
    ],
  },
  archive: {
    feet: [
      [23, 68],
      [54, 84],
      [81, 74],
    ],
    door: [69, 78],
    cut: [
      [0, 0],
      [104, 0],
      [104, 57],
      [82, 57],
      [82, 73],
      [76, 76],
      [70, 78],
      [64, 82],
      [55, 85],
      [52, 84],
      [22, 69],
      [22, 43],
      [0, 44],
    ],
  },
  office: {
    feet: [
      [25, 54],
      [52, 67],
      [77, 56],
    ],
    door: [65, 62],
    cut: [
      [0, 0],
      [100, 0],
      [100, 37],
      [78, 37],
      [78, 56],
      [65, 63],
      [53, 68],
      [51, 68],
      [26, 55],
      [25, 40],
      [20, 38],
      [0, 36],
    ],
  },
  hut: {
    feet: [
      [19, 43],
      [45, 52],
      [64, 43],
    ],
    door: [32, 47],
    cut: [
      [0, 0],
      [78, 0],
      [78, 29],
      [63, 29],
      [64, 35],
      [66, 42],
      [65, 44],
      [61, 43],
      [60, 40],
      [51, 44],
      [49, 50],
      [47, 53],
      [44, 53],
      [43, 50],
      [20, 44],
      [18, 45],
      [18, 27],
      [0, 26],
    ],
  },
  bunks: {
    feet: [
      [28, 44],
      [57, 57],
      [83, 44],
    ],
    door: [42, 50],
    cut: [
      [0, 0],
      [107, 0],
      [107, 29],
      [84, 29],
      [84, 44],
      [59, 57],
      [56, 57],
      [28, 45],
      [28, 25],
      [0, 29],
    ],
  },
};
import { buildingSprite } from './settlement';
const worldFoot = (b: BuildingSpec, lx: number, lz: number) => {
  const p = fromBuildingLocal(b, lx, lz);
  return project(p.x, p.z);
};
function inside(x: number, y: number, polygon: Point[]) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
type Painting = ReturnType<Atlas['read']>[number];
export class Architecture {
  private sources = new Map<string, Painting[]>();
  private cache = new Map<string, ReturnType<typeof depthStrips>>();
  private thatch: number[];
  private painter: HousePainter;
  constructor(private atlas: Atlas) {
    this.painter = new HousePainter(atlas);
    const flecks = atlas.read('bridge')[0]!.pixels;
    this.thatch = [...new Set(flecks)]
      .filter((c) => c >>> 24 > 0 && (c & 255) > ((c >>> 8) & 255))
      .sort((a, b) => ((a >>> 8) & 255) - ((b >>> 8) & 255));
  }
  private frames(key: string) {
    let frames = this.sources.get(key);
    if (!frames) {
      const art = facades[key.split('--')[0]!]!;
      frames = this.atlas.read(key);
      for (const f of frames) {
        const offset = key === 'mill--turn' ? 1 : 0;
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++)
            if (f.pixels[y * f.w + x] && !inside(x - offset + 0.5, y + 0.5, art.cut))
              f.pixels[y * f.w + x] = 0;
      }
      this.sources.set(key, frames);
    }
    return frames;
  }
  exterior(b: BuildingSpec, turning: boolean, frame: number) {
    const base = buildingSprite[b.kind],
      key = turning && base === 'mill' ? 'mill--turn' : base;
    const frames = this.frames(key),
      index = frame % frames.length,
      id = b.id + '/' + key + index;
    const saved = this.cache.get(id);
    if (saved) return saved;
    const f = frames[index]!,
      info = facades[base]!,
      [l, k, r] = info.feet,
      entry = buildingEntry(b);
    const side = Math.cos(b.yaw) - Math.sin(b.yaw) >= 0 ? 1 : -1;
    const near = worldFoot(b, (side * b.w) / 2, b.d / 2),
      front = worldFoot(b, (-side * b.w) / 2, b.d / 2),
      back = worldFoot(b, (side * b.w) / 2, -b.d / 2),
      door = worldFoot(b, entry.x, b.d / 2);
    const doorOnLeft = info.door[0] < k[0];
    const stations = [
      { src: doorOnLeft ? l : r, at: front },
      { src: info.door, at: door },
      { src: k, at: near },
      { src: doorOnLeft ? r : l, at: back },
    ].sort((a, b) => a.at.x - b.at.x);
    const scale = (((b.w + b.d) * 6) / (r[0] - l[0])) * 0.86,
      offset = key === 'mill--turn' ? 1 : 0;
    const column = (screenX: number) => {
      const a = screenX < stations[1]!.at.x ? 0 : screenX < stations[2]!.at.x ? 1 : 2;
      const p = stations[a]!,
        q = stations[a + 1]!;
      const t = (screenX - p.at.x) / Math.max(0.001, q.at.x - p.at.x);
      return {
        u: p.src[0] + (q.src[0] - p.src[0]) * t + offset,
        base: p.src[1] + (q.src[1] - p.src[1]) * t,
        foot: p.at.y + (q.at.y - p.at.y) * t,
      };
    };
    // Bound true roof overhangs using the outermost source columns.
    const outer = (a: number, b: number) => {
      const p = stations[a]!,
        q = stations[b]!,
        end = p.src[0] < q.src[0] ? -offset : f.w - offset;
      return p.at.x + ((end - p.src[0]) * (q.at.x - p.at.x)) / (q.src[0] - p.src[0]);
    };
    const left = Math.floor(outer(0, 1)) - 1,
      right = Math.ceil(outer(3, 2)) + 1;
    const lows = stations.map((s) => s.at.y),
      top = Math.floor(Math.min(...lows) - f.h * scale) - 12,
      bottom = Math.ceil(Math.max(...lows) + f.h * scale) + 12;
    const face = bitmap(left, top, right - left, bottom - top),
      reflected = bitmap(left, top, right - left, bottom - top);
    const context = face.canvas.getContext('2d')!,
      water = reflected.canvas.getContext('2d')!;
    const w = face.canvas.width,
      h = face.canvas.height,
      image = context.createImageData(w, h),
      mirror = water.createImageData(w, h);
    const pixels = new Uint32Array(image.data.buffer),
      reflection = new Uint32Array(mirror.data.buffer);
    for (let x = 0; x < w; x++) {
      const c = column(x + left + 0.5),
        u = Math.floor(c.u);
      if (u < 0 || u >= f.w) continue;
      const pigment = (v: number) => {
        const col = f.pixels[v * f.w + u]!,
          r = col & 255,
          g = (col >>> 8) & 255,
          bv = (col >>> 16) & 255;
        if (!(col >>> 24)) return 0;
        if (base === 'house' && v < 57 && r > 136 && g < r * 0.84 && g > bv * 1.57) {
          const tone = Math.min(1, Math.max(0, (g - 49) / 167));
          const ink = this.thatch[Math.round(tone * (this.thatch.length - 1))]!;
          return mix(
            col,
            ink,
            b.kind === 'lodge' || b.kind === 'keeper' ? 175 : b.wall === 'timber' ? 140 : b.yaw < 0 ? 121 : 83
          );
        }
        // A few grass-coloured antialias pixels also occur on the wall feet of the source dioramas.
        if (v > c.base - 5 && g > r * 1.09 && g > bv * 1.35) return mix(col, rgba(65, 71, 48), 179);
        return col;
      };
      for (let y = 0; y < h; y++) {
        const above = c.foot - (top + y + 0.5),
          v = Math.floor(c.base - above / scale);
        if (v >= 0 && v < f.h) pixels[y * w + x] = pigment(v);
        const m = Math.floor(c.base + above / (scale * 0.82));
        if (m >= 0 && m < f.h) {
          const color = pigment(m),
            a = color >>> 24;
          if (a)
            reflection[y * w + x] =
              (color & 0xffffff) | (Math.round(a * 0.84 * Math.exp(-Math.max(0, -above) / 59)) << 24);
        }
      }
    }
    finishBitmap(face, image);
    finishBitmap(reflected, mirror);
    const lift = houseSolid(b).floor * risePixels;
    face.top -= Math.round(lift);
    reflected.top += Math.round(lift * 0.82);
    const strips = depthStrips(
      base,
      this.painter.paint(b, face),
      (x) => column(x).foot,
      this.painter.paint(b, reflected, true)
    );
    this.cache.set(id, strips);
    return strips;
  }
}
