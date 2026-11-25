import { fromBuildingLocal } from '../core/world/interiors';
import { buildingTreads } from '../core/world/buildingEntries';
import type { BuildingSpec, V2 } from '../core/world/layout';
import type { Atlas } from './atlas';
import { project } from './projection';
import { terrainHeight, footingHeight } from './relief';
import { bitmap, type WorldImage } from './worldArt';
import { mix, rgba } from './waterPalette';

export interface Vertex3 extends V2 {
  h: number;
}
type Skin = 'wall' | 'roof' | 'edge' | 'stone' | 'tread';
interface Face {
  v: Vertex3[];
  skin: Skin;
}
interface House {
  faces: Face[];
  silhouette: Vertex3[];
  floor: number;
}
const models = new WeakMap<BuildingSpec, House>();

/** Four bearing walls, solid roof pitches and eaves, masonry footings and walkable entrance treads. */
export function houseSolid(b: BuildingSpec): House {
  const cached = models.get(b);
  if (cached) return cached;
  const floor = terrainHeight(b.x, b.z) + footingHeight,
    faces: Face[] = [];
  const v = (x: number, z: number, h: number): Vertex3 => ({ ...fromBuildingLocal(b, x, z), h: floor + h });
  const face = (skin: Skin, ...v: Vertex3[]) => faces.push({ skin, v });
  const box = (x0: number, z0: number, x1: number, z1: number, lo: number, hi: number, skin: Skin) => {
    const cap = (h: number) => [v(x0, z0, h), v(x1, z0, h), v(x1, z1, h), v(x0, z1, h)];
    const bottom = cap(lo),
      top = cap(hi);
    for (let i = 0; i < 4; i++) {
      const k = (i + 1) % 4;
      face(skin, bottom[i]!, bottom[k]!, top[k]!, top[i]!);
    }
    face(skin === 'stone' ? 'tread' : skin, ...top);
  };
  const w = b.w * 0.5,
    d = b.d * 0.5,
    eave = b.h * 1.18,
    over = 0.37;
  box(-w - 0.12, -d - 0.12, w + 0.12, d + 0.12, -footingHeight - 0.2, 0, 'stone');
  box(-w, -d, w, d, 0, eave, 'wall');
  const xl = -w - over,
    xr = w + over,
    back = -d - over,
    front = d + over;
  const pitch = b.roof === 'lean' ? eave * 0.48 : d * 0.98,
    ridge = eave + pitch;
  const high = (z: number) => (b.roof === 'lean' ? eave + ((front - z) / (front - back)) * pitch : eave);
  const edges = [
    v(xl, back, high(back)),
    v(xr, back, high(back)),
    v(xr, front, high(front)),
    v(xl, front, high(front)),
  ];
  for (let i = 0; i < 4; i++) {
    const a = edges[i]!,
      c = edges[(i + 1) % 4]!;
    face('edge', { ...a, h: a.h - 0.19 }, { ...c, h: c.h - 0.19 }, c, a);
  }
  const [a, c, f, g] = edges as [Vertex3, Vertex3, Vertex3, Vertex3];
  const hip = b.roof === 'hip' ? Math.min(d * 0.74, w * 0.65) : 0;
  const left = v(xl + hip, 0, ridge),
    right = v(xr - hip, 0, ridge);
  if (b.roof === 'lean') face('roof', a, c, f, g);
  else {
    face('roof', a, c, right, left);
    face('roof', g, left, right, f);
    face(hip ? 'roof' : 'wall', a, left, g);
    face(hip ? 'roof' : 'wall', c, f, right);
  }
  for (const t of buildingTreads(b))
    box(t.x - t.halfX, t.zMin, t.x + t.halfX, t.zMax, -footingHeight - 0.08, t.top - footingHeight, 'stone');
  const house = {
    faces,
    floor,
    silhouette: [
      ...edges,
      ...(b.roof === 'lean' ? [] : [left, right]),
      v(-w, -d, 0),
      v(w, -d, 0),
      v(w, d, 0),
      v(-w, d, 0),
    ],
  };
  models.set(b, house);
  return house;
}

type Texture = ReturnType<Atlas['read']>[number];
/** Project the PixelLab painting onto the solid shell. Fine silhouettes such as vanes and the millwheel extend beyond it. */
export class HousePainter {
  private masonry: Texture;
  constructor(atlas: Atlas) {
    this.masonry = atlas.read('room_masonry')[0]!;
  }
  paint(b: BuildingSpec, original: WorldImage, mirror = false): WorldImage {
    const model = houseSolid(b),
      factor = mirror ? -0.82 : 1;
    const view = (v: Vertex3) => ({
      ...project(v.x, v.z, v.h * factor),
      depth: v.x + v.z + v.h * factor * 1.5,
    });
    const all = model.faces.flatMap((f) => f.v.map(view));
    const left = Math.floor(Math.min(original.left, ...all.map((p) => p.x))) - 1,
      top = Math.floor(Math.min(original.top, ...all.map((p) => p.y))) - 1;
    const right = Math.ceil(Math.max(original.left + original.canvas.width, ...all.map((p) => p.x))) + 1,
      bottom = Math.ceil(Math.max(original.top + original.canvas.height, ...all.map((p) => p.y))) + 1;
    const out = bitmap(left, top, right - left, bottom - top);
    const ctx = out.canvas.getContext('2d', { willReadFrequently: true })!;
    const w = out.canvas.width;
    ctx.drawImage(original.canvas, original.left - left, original.top - top);
    const image = ctx.getImageData(0, 0, w, out.canvas.height),
      pixels = new Uint32Array(image.data.buffer),
      paint = pixels.slice();
    const depths = new Float32Array(pixels.length).fill(-Infinity);
    for (const { v, skin } of model.faces) {
      const verts = v.map(view),
        pa = v[0]!,
        pb = v[1]!,
        pc = v[2]!;
      const ux = pb.x - pa.x,
        uz = pb.z - pa.z,
        uh = pb.h - pa.h,
        vx = pc.x - pa.x,
        vz = pc.z - pa.z,
        vh = pc.h - pa.h;
      let nx = uz * vh - uh * vz,
        ny = ux * vz - uz * vx,
        nz = uh * vx - ux * vh;
      // Use the visible side of the plane for its illumination, including a reflection viewed from below.
      if (nx + nz + ny * factor < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const lambert = (-0.68 * nx + 0.72 * ny - 0.17 * nz) / (Math.hypot(nx, ny, nz) || 1);
      const tint = Math.max(-95, Math.min(40, (lambert - 0.17) * 84));
      const masonry = skin === 'stone' || skin === 'tread',
        art = this.masonry;
      for (let j = 1; j + 1 < v.length; j++) {
        const a = verts[0]!,
          c = verts[j]!,
          d = verts[j + 1]!,
          va = v[0]!,
          vc = v[j]!,
          vd = v[j + 1]!;
        const det = (c.x - a.x) * (d.y - a.y) - (d.x - a.x) * (c.y - a.y);
        if (Math.abs(det) < 0.001) continue;
        const x0 = Math.max(0, Math.floor(Math.min(a.x, c.x, d.x) - left)),
          x1 = Math.min(w, Math.ceil(Math.max(a.x, c.x, d.x) - left));
        const y0 = Math.max(0, Math.floor(Math.min(a.y, c.y, d.y) - top)),
          y1 = Math.min(out.canvas.height, Math.ceil(Math.max(a.y, c.y, d.y) - top));
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const px = x + left + 0.5 - a.x,
              py = y + top + 0.5 - a.y;
            const l = (px * (d.y - a.y) - py * (d.x - a.x)) / det,
              m = ((c.x - a.x) * py - (c.y - a.y) * px) / det,
              k = 1 - l - m;
            if (Math.min(k, l, m) < -1e-5) continue;
            const i = y * w + x,
              depth = k * a.depth + l * c.depth + m * d.depth;
            if (depth < depths[i]! || (!masonry && !(paint[i]! >>> 24))) continue;
            depths[i] = depth;
            const h = k * va.h + l * vc.h + m * vd.h,
              wx = k * va.x + l * vc.x + m * vd.x,
              wz = k * va.z + l * vc.z + m * vd.z;
            const u = Math.floor((wx - wz) * 4.9),
              vtex = Math.floor((skin === 'tread' ? wx + wz : h) * 7);
            const tex =
              art.pixels[(((vtex % art.h) + art.h) % art.h) * art.w + (((u % art.w) + art.w) % art.w)]!;
            let col = paint[i]!;
            if (masonry) {
              const base = skin === 'tread' ? rgba(155, 145, 123) : rgba(100, 100, 90);
              col = mix(base, tex, skin === 'stone' ? 102 : 50);
              if (skin === 'stone') {
                const course = (h + 0.02) * 3.5,
                  offset = (Math.floor(course) & 1) * 0.53 + (wx - wz) * 0.72;
                if (course - Math.floor(course) < 0.12 || offset - Math.floor(offset) < 0.06)
                  col = mix(col, rgba(57, 59, 58), 120);
              }
            }
            col = tint > 0 ? mix(col, rgba(255, 224, 156), tint) : mix(col, rgba(37, 45, 62), -tint);
            if (skin === 'wall') {
              const under = Math.max(0, 1 - Math.abs(h - model.floor - b.h * 1.18) / 0.43);
              col = mix(col, rgba(46, 42, 47), under * 76);
            }
            pixels[i] = mirror
              ? (col & 0xffffff) | (Math.round(191 * Math.exp(-Math.max(0, h) * 0.073)) << 24)
              : col;
          }
      }
    }
    ctx.putImageData(image, 0, 0);
    return out;
  }
}
