import type { Atlas } from './atlas';
import { project } from './land';
import { crossingPoint, deckHeight, risePixels, type Crossing } from './crossing';
import { bitmap, depthStrips } from './worldArt';
import { mix } from './waterPalette';

type Material = 'wood' | 'deck' | 'stone' | 'peg';
type Vertex = [number, number, number];
interface Beam {
  s0: number;
  s1: number;
  t0: number;
  t1: number;
  low: [number, number];
  high: [number, number];
  mat: Material;
  near: boolean;
  grain: number;
}
function timbers(b: Crossing) {
  const parts: Beam[] = [],
    h = b.halfLength,
    w = b.halfWidth;
  function block(
    s0: number,
    s1: number,
    t0: number,
    t1: number,
    low: [number, number],
    high: [number, number],
    mat: Material = 'wood',
    near = false
  ) {
    parts.push({ s0, s1, t0, t1, low, high, mat, near, grain: parts.length * 7 });
  }
  const boards = Math.ceil((h * 2) / 0.51),
    step = (h * 2) / boards;
  for (let i = 0; i < boards; i++) {
    const a = -h + i * step,
      end = a + step,
      ya = deckHeight(b, a),
      yb = deckHeight(b, end);
    const lip = 0.025 * Math.sin(i * 4.9);
    block(a, end - 0.025, -w - 0.07 + lip, w + 0.07 + lip, [ya - 0.24, yb - 0.24], [ya, yb], 'deck');
    for (const side of [-1, 1]) {
      const t = side * (w - 0.28);
      block(a, end, t - 0.13, t + 0.13, [ya - 0.51, yb - 0.51], [ya - 0.17, yb - 0.17]);
    }
  }
  // Battered masonry at the landings, timber bents where each bank gives way to the channel.
  for (const sign of [-1, 1]) {
    // Loose capstones bed each end into the verge, flush with the worn centre of the road.
    for (const side of [-1, 1]) {
      const a = sign * (h - 0.42),
        end = sign * (h + 0.61),
        t = side * (w - 0.12);
      block(a, end, t - 0.26, t + 0.26, [-0.035, -0.035], [0.12, 0.055], 'stone');
    }
    const centre = sign * (h - 1.68);
    for (let row = 0; row < 2; row++) {
      const outer = w + 0.32 - row * 0.09,
        split = row === 0 ? 4 : 5;
      for (let j = 0; j < split; j++) {
        const t = -outer + j * ((outer * 2) / split);
        const base = row * 0.27 - 0.08,
          top = base + 0.28 + 0.045 * Math.cos(j + sign);
        block(
          centre - 0.66 + row * 0.08,
          centre + 0.66 - row * 0.08,
          t,
          t + (outer * 2) / split - 0.035,
          [base, base],
          [top, top],
          'stone'
        );
      }
    }
  }
  for (const s of b.sills) {
    const y = deckHeight(b, s);
    block(s - 0.18, s + 0.18, -w - 0.18, w + 0.18, [y - 0.76, y - 0.76], [y - 0.5, y - 0.5]);
    for (const t of [-(w - 0.16), w - 0.16]) {
      block(s - 0.17, s + 0.17, t - 0.17, t + 0.17, [-0.16, -0.16], [y - 0.68, y - 0.68]);
      const d = s < 0 ? 1 : -1,
        other = s + d * 1.35,
        joint = deckHeight(b, other) - 0.51;
      block(s, other, t - 0.095, t + 0.095, [0.26, joint - 0.19], [0.46, joint]);
    }
  }
  const railEnd = h - 0.55,
    bays = Math.max(3, Math.round((railEnd * 2) / 2.65));
  for (const side of [-1, 1]) {
    const t = side * w,
      near = side > 0;
    for (let i = 0; i <= bays; i++) {
      const a = -railEnd + (2 * railEnd * i) / bays,
        ya = deckHeight(b, a);
      block(
        a - 0.12,
        a + 0.12,
        t - 0.13,
        t + 0.13,
        [ya - 0.22, ya - 0.22],
        [ya + 1.48, ya + 1.48],
        'wood',
        near
      );
      block(
        a - 0.145,
        a + 0.145,
        t - 0.15,
        t + 0.15,
        [ya + 1.42, ya + 1.42],
        [ya + 1.53, ya + 1.53],
        'wood',
        near
      );
      if (i === bays) continue;
      const end = -railEnd + (2 * railEnd * (i + 1)) / bays,
        yb = deckHeight(b, end);
      for (const height of [0.48, 1.29]) {
        const width = height > 1 ? 0.1 : 0.055,
          thick = height > 1 ? 0.16 : 0.1;
        block(
          a,
          end,
          t - width,
          t + width,
          [ya + height, yb + height],
          [ya + height + thick, yb + height + thick],
          'wood',
          near
        );
      }
      // Individually trenched ends and their iron pins catch the light on the outward face.
      block(
        a - 0.055,
        a + 0.075,
        t + 0.125,
        t + 0.157,
        [ya + 1.24, ya + 1.24],
        [ya + 1.39, ya + 1.39],
        'peg',
        near
      );
    }
  }
  return parts;
}
const frac = (v: number) => v - Math.floor(v);
export function bridgeArt(atlas: Atlas, b: Crossing) {
  const parts = timbers(b),
    native = atlas.read('bridge')[0]!,
    rock = atlas.read('texture-rock')[0]!,
    plank = atlas.read('texture-floor')[0]!;
  const palette = [...new Set(native.pixels)]
    .filter((c) => c >>> 24 > 0 && (c & 255) > ((c >>> 8) & 255))
    .sort((a, b) => ((a >>> 8) & 255) - ((b >>> 8) & 255));
  const greys = [...new Set(rock.pixels)]
    .filter((c) => Math.abs((c & 255) - ((c >>> 8) & 255)) < 19)
    .sort((a, b) => ((a >>> 8) & 255) - ((b >>> 8) & 255));
  const weathered = greys[Math.floor(greys.length * 0.76)]!,
    damp = greys[Math.floor(greys.length * 0.2)]!;
  const wood = (f: number) => palette[Math.round(Math.max(0, Math.min(1, f)) * (palette.length - 1))]!;
  const plan = (s: number, t: number) => {
    const p = crossingPoint(b, s, t);
    return project(p.x, p.z);
  };
  const corners = [-1, 1].flatMap((a) =>
    [-1, 1].map((c) => plan(a * (b.halfLength + 0.7), c * (b.halfWidth + 0.7)))
  );
  const left = Math.floor(Math.min(...corners.map((c) => c.x))) - 1,
    right = Math.ceil(Math.max(...corners.map((c) => c.x))) + 1,
    top = Math.floor(Math.min(...corners.map((c) => c.y))) - Math.ceil((b.rise + 2) * risePixels) - 2,
    bottom = Math.ceil(Math.max(...corners.map((c) => c.y))) + Math.ceil((b.rise + 2) * risePixels) + 2;
  const width = right - left,
    height = bottom - top;
  function raster(near: boolean, mirror = false) {
    const out = bitmap(left, top, width, height),
      ctx = out.canvas.getContext('2d')!,
      im = ctx.createImageData(width, height),
      pixels = new Uint32Array(im.data.buffer),
      depths = new Float32Array(width * height).fill(-Infinity);
    for (const part of parts) {
      if (!mirror && part.near !== near) continue;
      const { s0, s1, t0, t1, low, high, mat, grain } = part;
      const vertices: Vertex[] = [
        [s0, t0, low[0]],
        [s1, t0, low[1]],
        [s1, t1, low[1]],
        [s0, t1, low[0]],
        [s0, t0, high[0]],
        [s1, t0, high[1]],
        [s1, t1, high[1]],
        [s0, t1, high[0]],
      ];
      const points = vertices.map(([s, t, h]) => {
        const p = plan(s, t),
          alt = mirror ? -h * 0.84 : h;
        return { x: p.x - left, y: p.y - top - alt * risePixels, depth: alt, h };
      });
      // Rasterize complete solids. Looking into the river sees the undersides of beams and the bracing.
      function face(ids: [number, number, number, number], light: number, uSpan: number, vSpan: number) {
        const [a, d, e, f] = ids.map((id) => points[id]!) as [
          (typeof points)[number],
          (typeof points)[number],
          (typeof points)[number],
          (typeof points)[number],
        ];
        for (const tri of [
          [a, d, e, 0, 0, 1, 0, 1, 1],
          [a, e, f, 0, 0, 1, 1, 0, 1],
        ] as const) {
          const [p, q, r, up, vp, uq, vq, ur, vr] = tri;
          const det = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
          if (Math.abs(det) < 0.00001) continue;
          for (
            let y = Math.max(0, Math.floor(Math.min(p.y, q.y, r.y)));
            y < Math.min(height, Math.ceil(Math.max(p.y, q.y, r.y)));
            y++
          )
            for (
              let x = Math.max(0, Math.floor(Math.min(p.x, q.x, r.x)));
              x < Math.min(width, Math.ceil(Math.max(p.x, q.x, r.x)));
              x++
            ) {
              const px = x + 0.5 - p.x,
                py = y + 0.5 - p.y;
              const m = (px * (r.y - p.y) - py * (r.x - p.x)) / det,
                n = ((q.x - p.x) * py - (q.y - p.y) * px) / det,
                o = 1 - m - n;
              if (Math.min(o, m, n) < -0.00001) continue;
              const i = y * width + x,
                depth = p.depth * o + q.depth * m + r.depth * n;
              if (depth < depths[i]!) continue;
              const u = (up * o + uq * m + ur * n) * uSpan,
                v = (vp * o + vq * m + vr * n) * vSpan;
              const uv =
                Math.floor(frac(v * (mat === 'deck' ? 0.32 : 0.77) + grain * 0.13) * plank.h) * plank.w +
                Math.floor(frac(u * 0.37 + grain * 0.19) * plank.w);
              const fibre = ((plank.pixels[uv]! >>> 8) & 255) / 200;
              const knots = Math.sin(grain * 1.73) * 0.065;
              let color = mix(wood(light * 0.85 + (fibre - 0.48) * 0.63 + knots), damp, 52);
              if (mat === 'deck') {
                const topFace = ids[0] === 4,
                  boardEdge = u,
                  t = t0 + v;
                const seam = topFace && boardEdge < 0.095,
                  bevel = topFace && !seam && u < 0.145;
                const nail =
                  topFace &&
                  Math.abs(Math.abs(t) - (b.halfWidth - 0.27)) < 0.085 &&
                  Math.abs(u - 0.16) < 0.085;
                const faceLight = topFace ? 0.68 : 0.24;
                color = mix(
                  wood(faceLight + (fibre - 0.48) * 0.34 + knots + (bevel ? 0.095 : 0)),
                  weathered,
                  topFace ? 87 : 37
                );
                const shadow =
                  topFace &&
                  (Math.abs(t + b.halfWidth - 0.69) < 0.13 ||
                    (t < -b.halfWidth + 0.74 && frac((s0 + u) * 0.4 + 0.28) < 0.085));
                if (seam || nail || shadow) color = mix(color, wood(0.035), nail ? 192 : seam ? 124 : 94);
              }
              if (mat === 'stone' || mat === 'peg') {
                const raw =
                  rock.pixels[
                    Math.floor(frac(v * 0.8 + grain * 0.13) * rock.h) * rock.w +
                      Math.floor(frac(u * 0.73) * rock.w)
                  ]!;
                color = mix(raw, mat === 'peg' ? wood(0.06) : wood(light + 0.03), mat === 'peg' ? 130 : 86);
              }
              if (mirror) {
                color = mix(color, rock.pixels[0]!, 96);
                color = (color & 0xffffff) | 0xc5000000;
              }
              pixels[i] = color;
              depths[i] = depth;
            }
        }
      }
      const len = s1 - s0,
        across = t1 - t0,
        thick = high[0] - low[0];
      face([0, 1, 2, 3], 0.12, len, across);
      face([0, 1, 5, 4], 0.4, len, thick);
      face([1, 2, 6, 5], 0.27, across, thick);
      face([2, 3, 7, 6], 0.39, len, thick);
      face([3, 0, 4, 7], 0.45, across, thick);
      face([4, 5, 6, 7], 0.69, len, across);
    }
    ctx.putImageData(im, 0, 0);
    return out;
  }
  const depthAt = (t: number) => (sx: number) => {
    const a = plan(-b.halfLength, t),
      end = plan(b.halfLength, t);
    return a.y + ((sx - a.x) * (end.y - a.y)) / (end.x - a.x);
  };
  return [
    ...depthStrips('bridge', raster(false), depthAt(-b.halfWidth - 0.03), raster(false, true)),
    ...depthStrips('bridge', raster(true), depthAt(b.halfWidth + 0.03)),
  ];
}
