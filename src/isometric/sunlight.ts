import type { BuildingSpec } from '../core/world/layout';
import type { Atlas } from './atlas';
import { houseSolid, type Vertex3 } from './houseSolid';
import { project, risePixels } from './projection';
import type { Stamp } from './reflections';
import { terrainHeight } from './relief';

export interface Sun {
  x: number;
  z: number;
  strength: number;
}
export function sunAt(hour: number): Sun {
  const angle = ((hour - 6) * Math.PI) / 12,
    day = Math.max(0, Math.sin(angle));
  const length = 1 / (0.56 + day * 0.98);
  return {
    x: Math.cos(angle) * length * 0.84 + 0.23,
    z: length * 0.48 - 0.15 * Math.cos(angle),
    strength: 0.13 + day * 0.22,
  };
}
/** Follow a ray to the receiving slope. The bracket also covers trees standing above the lip of a ravine. */
export function castOnLand(p: Vertex3, sun: Sun): V2Screen {
  let lo = 0,
    hi = Math.max(0, p.h) + 0.2;
  for (let i = 0; i < 7; i++) {
    const t = (lo + hi) * 0.5,
      x = p.x + sun.x * t,
      z = p.z + sun.z * t;
    if (p.h - t > terrainHeight(x, z)) lo = t;
    else hi = t;
  }
  const dist = (lo + hi) * 0.5,
    x = p.x + sun.x * dist,
    z = p.z + sun.z * dist;
  return project(x, z, terrainHeight(x, z));
}
function hull(points: V2Screen[]) {
  const turn = (a: V2Screen, b: V2Screen, c: V2Screen) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const ordered = points.sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (values: V2Screen[]) => {
    const out: V2Screen[] = [];
    for (const p of values) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(ordered), ...half([...ordered].reverse())];
}
type V2Screen = { x: number; y: number };
const tall = /^(oak|pine|fir|birch|rill_willow|rill_alder|beacon|ruin|lantern|sign|bell|board|marker)(--|$)/;
const skip = /^(field_arrow|cursor|rill_lilies|rill_fish|rill_trout|rill_minnow|rill_dragonfly|rill_spark)/;
export class Sunlight {
  private houses = new WeakMap<BuildingSpec, { bucket: number; points: V2Screen[] }>();
  private layer = document.createElement('canvas');
  private ink = this.layer.getContext('2d')!;
  constructor(private atlas: Atlas) {}
  draw(
    ctx: CanvasRenderingContext2D,
    stamps: Stamp[],
    buildings: BuildingSpec[],
    ox: number,
    oy: number,
    hour: number
  ) {
    const { width: w, height: h } = ctx.canvas;
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = w;
      this.layer.height = h;
    }
    const g = this.ink;
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    const sun = sunAt(hour),
      bucket = Math.floor(hour * 12);
    g.fillStyle = '#283544';
    g.globalAlpha = 0.88;
    for (const b of buildings) {
      let entry = this.houses.get(b);
      if (entry?.bucket !== bucket) {
        entry = { bucket, points: hull(houseSolid(b).silhouette.map((v) => castOnLand(v, sun))) };
        this.houses.set(b, entry);
      }
      g.beginPath();
      entry.points.forEach((p, i) => (i ? g.lineTo(p.x + ox, p.y + oy) : g.moveTo(p.x + ox, p.y + oy)));
      g.closePath();
      g.fill();
    }
    for (const s of stamps) {
      if (s.art || s.angle !== undefined || skip.test(s.key) || (s.submerged ?? 0) > 0.06 || s.width < 12)
        continue;
      const high = tall.test(s.key),
        person = !!s.wakeId || !!s.hero;
      const base = s.elevation ?? 0,
        p = project(s.x, s.z, base),
        x = p.x + ox,
        y = p.y + oy;
      if (x < -110 || x > w + 110 || y < -95 || y > h + 95) continue;
      const frame = (s.frame ?? 0) % this.atlas.frameCount(s.key),
        image = this.atlas.shadow(s.key, frame);
      const height = this.atlas.height(s.key, s.width, frame),
        lift = s.lift ?? 0;
      const feet = lift > 1 || s.prop ? castOnLand({ ...s, h: base + lift / risePixels }, sun) : p;
      const tip = castOnLand(
        { ...s, h: base + (height * (high ? 0.91 : person ? 0.81 : 0.55) + lift) / risePixels },
        sun
      );
      const shadowWidth = s.width * (high ? 0.78 : person ? 0.72 : 0.77),
        scale = ((s.flip ? -1 : 1) * shadowWidth) / image.width;
      g.globalAlpha = high ? 0.81 : person ? 0.86 : 0.63;
      g.setTransform(
        scale,
        0,
        (feet.x - tip.x) / image.height,
        (feet.y - tip.y) / image.height,
        tip.x + ox - scale * image.width * 0.5,
        tip.y + oy
      );
      g.drawImage(image, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (person || high) {
        g.globalAlpha = person ? 0.76 : 0.55;
        g.beginPath();
        g.ellipse(
          x,
          y,
          Math.max(2, s.width * (person ? 0.13 : 0.18)),
          Math.max(1, s.width * 0.047),
          0,
          0,
          Math.PI * 2
        );
        g.fill();
      }
    }
    g.globalAlpha = 1;
    ctx.save();
    ctx.globalAlpha = sun.strength;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.layer, 0, 0);
    ctx.restore();
  }
}
