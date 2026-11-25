import { Atlas } from './atlas';
import { project } from './land';
import type { Ground, Rect } from './ground';
import type { V2 } from '../core/world/layout';

export interface Stamp extends V2 {
  key: string;
  width: number;
  frame?: number;
  flip?: boolean;
  lift?: number;
  hero?: boolean;
  alpha?: number;
  anchor?: number;
  submerged?: number;
  wakeId?: string;
  moving?: boolean;
  reflect?: boolean;
}
interface Trail extends V2 {
  born: number;
  dx: number;
  dz: number;
  speed: number;
}
interface Tracker extends V2 {
  emitted: number;
}

function reflectionLayer() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  return { context, pixels: ({ x, y, w, h }: Rect) => context.getImageData(x, y, w, h).data };
}
function intersects(a: Rect, b: Rect) {
  return a.x <= b.x + b.w + 2 && a.x + a.w + 2 >= b.x && a.y <= b.y + b.h + 2 && a.y + a.h + 2 >= b.y;
}

export class WaterReflections {
  private layer = reflectionLayer();
  private mirror = this.layer.context;
  private distorted = document.createElement('canvas').getContext('2d')!;
  private regions: Rect[] = [];
  private wakes: Trail[] = [];
  private tracks = new Map<string, Tracker>();
  private lastTime = -1;
  reflected = 0;
  wakeCount = 0;

  constructor(private atlas: Atlas) {}
  reset() {
    this.wakes = [];
    this.tracks.clear();
    this.lastTime = -1;
  }
  private include(x: number, y: number, width: number, height: number) {
    const canvas = this.mirror.canvas;
    const left = Math.max(0, Math.floor(x) - 5),
      top = Math.max(0, Math.floor(y) - 4);
    const right = Math.min(canvas.width, Math.ceil(x + width) + 5),
      bottom = Math.min(canvas.height, Math.ceil(y + height) + 4);
    if (right <= left || bottom <= top) return;
    let rect = { x: left, y: top, w: right - left, h: bottom - top };
    for (let i = 0; i < this.regions.length; ) {
      const other = this.regions[i]!;
      if (!intersects(rect, other)) {
        i++;
        continue;
      }
      const x0 = Math.min(rect.x, other.x),
        y0 = Math.min(rect.y, other.y);
      rect = {
        x: x0,
        y: y0,
        w: Math.max(rect.x + rect.w, other.x + other.w) - x0,
        h: Math.max(rect.y + rect.h, other.y + other.h) - y0,
      };
      this.regions.splice(i, 1);
      i = 0;
    }
    this.regions.push(rect);
  }
  private track(stamp: Stamp, time: number) {
    if (!stamp.wakeId) return;
    const previous = this.tracks.get(stamp.wakeId);
    if (!previous || !stamp.moving || !stamp.submerged) {
      this.tracks.set(stamp.wakeId, { x: stamp.x, z: stamp.z, emitted: time });
      return;
    }
    const dx = stamp.x - previous.x,
      dz = stamp.z - previous.z,
      dist = Math.hypot(dx, dz);
    if (time - previous.emitted < 0.24 || dist < 0.28) return;
    if (dist < 3.8) {
      this.wakes.push({
        x: previous.x,
        z: previous.z,
        dx: dx / dist,
        dz: dz / dist,
        born: time,
        speed: Math.min(1, dist / 1.35),
      });
    }
    this.tracks.set(stamp.wakeId, { x: stamp.x, z: stamp.z, emitted: time });
  }

  private paintWake(wake: Trail, time: number, ox: number, oy: number) {
    const age = time - wake.born,
      life = age / 1.75,
      spread = 0.26 + age * (1.35 + wake.speed * 0.36);
    const p = project(wake.x, wake.z),
      cx = p.x + ox,
      cy = p.y + oy,
      ctx = this.mirror;
    this.include(cx - spread * 10 - 3, cy - spread * 5 - 2, spread * 20 + 6, spread * 10 + 4);
    ctx.globalAlpha = (1 - life) * (1 - life) * 0.87;
    ctx.fillStyle = '#c4d3bc';
    // A wake expands in the world's horizontal plane. The bow wave has two arms and a broken trailing rim.
    for (let k = 0; k < 36; k++) {
      const angle = (k * Math.PI) / 18,
        ux = Math.cos(angle),
        uz = Math.sin(angle),
        heading = ux * wake.dx + uz * wake.dz;
      if (heading > 0.76 || (heading < -0.25 && (k + Math.floor(age * 7)) % 6 < 4)) continue;
      const radius = spread * (1 - 0.24 * heading);
      const x = Math.round(cx + (ux - uz) * radius * 6),
        y = Math.round(cy + (ux + uz) * radius * 3);
      ctx.fillRect(x, y, heading > 0 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, ground: Ground, stamps: Stamp[], ox: number, oy: number, time: number) {
    const w = ctx.canvas.width,
      h = ctx.canvas.height;
    if (time < this.lastTime) this.reset();
    this.lastTime = time;
    this.reflected = 0;
    this.wakes = this.wakes.filter((wake) => time - wake.born < 1.75);
    for (const stamp of stamps) if (stamp.wakeId) this.track(stamp, time);
    if (this.wakes.length > 64) this.wakes.splice(0, this.wakes.length - 64);
    this.wakeCount = this.wakes.length;
    if (!ground.hasWater) return;
    for (const target of [this.mirror, this.distorted]) {
      if (target.canvas.width !== w || target.canvas.height !== h) {
        target.canvas.width = w;
        target.canvas.height = h;
      }
      target.imageSmoothingEnabled = false;
      target.clearRect(0, 0, w, h);
    }
    this.regions.length = 0;
    for (const stamp of stamps) {
      if (stamp.reflect === false || stamp.key === 'cursor') continue;
      const frame = Math.max(0, stamp.frame ?? 0),
        height = this.atlas.height(stamp.key, stamp.width, frame) * (1 - (stamp.submerged ?? 0));
      const s = project(stamp.x, stamp.z),
        x = Math.round(s.x + ox),
        y = Math.round(s.y + oy + (stamp.lift ?? 0) * 0.78);
      const anchor = stamp.anchor ?? 1,
        left = x - stamp.width / 2,
        depth = height * anchor * 0.78;
      if (
        y > h + 3 ||
        y + depth < 0 ||
        !ground.touchesWater(left - 4, y - 2, left + stamp.width + 4, y + depth + 3)
      )
        continue;
      this.mirror.save();
      if (anchor !== 1) {
        this.mirror.beginPath();
        this.mirror.rect(Math.floor(left) - 1, y, stamp.width + 2, Math.ceil(depth) + 1);
        this.mirror.clip();
      }
      this.mirror.translate(x, y);
      this.mirror.scale(1, -0.78);
      this.atlas.draw(this.mirror, stamp.key, 0, 0, stamp.width, frame, stamp.flip, anchor, stamp.submerged);
      this.mirror.restore();
      this.reflected++;
      this.include(left, y, stamp.width, depth);
    }
    for (const stamp of stamps) {
      const wreck = stamp.key === 'wreck',
        rock = stamp.key === 'tide_rocks';
      if (!wreck && !rock && !stamp.submerged) continue;
      const s = project(stamp.x, stamp.z),
        x = s.x + ox,
        y = s.y + oy,
        r = stamp.width * (wreck ? 0.37 : rock ? 0.29 : 0.17);
      if (!ground.touchesWater(x - r - 2, y - 5, x + r + 2, y + 6)) continue;
      const pulse = (time * 0.37 + Math.abs(stamp.z) * 0.031) % 1;
      this.include(x - r - 4, y - r * 0.21 - 3, r * 2 + 8, r * 0.42 + 7);
      this.mirror.globalAlpha = (0.36 + 0.24 * Math.sin(pulse * Math.PI)) * (rock || wreck ? 1 : 0.74);
      this.mirror.fillStyle = '#c0d6c1';
      for (let k = 0; k < 36; k++) {
        const angle = (k * Math.PI) / 18;
        if (Math.sin(angle * 3 + pulse * 5 + stamp.x) + Math.cos(angle * 5 - pulse * 3) < 0.12) continue;
        const reach = r + pulse * 2.4;
        const px = Math.round(x + Math.cos(angle) * reach),
          py = Math.round(y - 1 + Math.sin(angle) * reach * 0.21);
        this.mirror.fillRect(px, py, rock || wreck ? 2 : 1, 1);
      }
      this.mirror.globalAlpha = 1;
    }
    for (const wake of this.wakes) this.paintWake(wake, time, ox, oy);
    if (!this.regions.length || ground.compositeMirrors(ctx, this.mirror.canvas)) return;
    for (const rect of this.regions) {
      ground.reflect(this.layer.pixels(rect), this.distorted, rect);
      ctx.drawImage(this.distorted.canvas, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
    }
  }
}
