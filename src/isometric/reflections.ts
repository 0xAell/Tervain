import { drawProp } from './propArt';
import { Atlas } from './atlas';
import { coursesInFrame, wetPoint, onBridge, riverVelocity, type Flow, type Ripple } from './water';
import type { ArtStrip } from './worldArt';
import { project, risePixels } from './projection';
import type { Ground, Rect } from './ground';
import type { V2 } from '../core/world/layout';

export interface Stamp extends V2 {
  key: string;
  art?: ArtStrip;
  width: number;
  frame?: number;
  flip?: boolean;
  lift?: number;
  elevation?: number;
  hero?: boolean;
  alpha?: number;
  anchor?: number;
  submerged?: number;
  wakeId?: string;
  moving?: boolean;
  airborne?: boolean;
  reflect?: boolean;
  angle?: number;
  contact?: import('./fieldcraft').Contact;
  prop?: import('./propPhysics').PropView;
  sway?: number;
}
interface Trail extends V2 {
  born: number;
  dx: number;
  dz: number;
  speed: number;
  vx: number;
  vz: number;
  course: number;
}
interface Tracker extends V2 {
  emitted: number;
  wet: boolean;
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
  private track(stamp: Stamp, time: number, flow: Flow) {
    if (!stamp.wakeId) return;
    const previous = this.tracks.get(stamp.wakeId);
    const wet = !!stamp.submerged && !stamp.airborne;
    if (!previous || !wet) {
      this.tracks.set(stamp.wakeId, { x: stamp.x, z: stamp.z, emitted: time, wet });
      return;
    }
    const dx = stamp.x - previous.x,
      dz = stamp.z - previous.z,
      dist = Math.hypot(dx, dz),
      elapsed = time - previous.emitted;
    const p = wetPoint(stamp.x, stamp.z);
    if (!p) return;
    const current = riverVelocity(p, flow),
      speed = Math.hypot(current.x, current.z);
    const step = stamp.moving && dist >= 0.33 && elapsed >= 0.23;
    const bow = p.kind === 'river' && speed > 0.26 && elapsed > 0.93;
    if (previous.wet && !step && !bow) return;
    if (dist < 3.8) {
      const dir = dist > 0.08 ? dist : Math.max(0.01, speed),
        incoming = !previous.wet;
      this.wakes.push({
        x: stamp.x,
        z: stamp.z,
        dx: (dist > 0.08 ? dx : -current.x) / dir,
        dz: (dist > 0.08 ? dz : -current.z) / dir,
        speed: incoming ? 0.97 : step ? Math.min(0.88, 0.37 + dist * 0.34) : 0.24,
        born: time,
        vx: current.x,
        vz: current.z,
        course: coursesInFrame.indexOf(p.course),
      });
    }
    this.tracks.set(stamp.wakeId, { x: stamp.x, z: stamp.z, emitted: time, wet });
  }
  advance(stamps: Stamp[], time: number, flow: Flow): Ripple[] {
    if (time < this.lastTime) this.reset();
    this.lastTime = time;
    this.wakes = this.wakes.filter((w) => time - w.born < 1.75);
    for (const stamp of stamps) if (stamp.wakeId) this.track(stamp, time, flow);
    if (this.wakes.length > 48) this.wakes.splice(0, this.wakes.length - 48);
    this.wakeCount = this.wakes.length;
    return this.wakes
      .filter((w) => w.course > 0)
      .slice(-16)
      .map((w) => {
        const age = time - w.born;
        return {
          x: w.x + w.vx * age,
          z: w.z + w.vz * age,
          radius: 0.2 + age * (1.45 + w.speed * 0.52),
          amplitude: (1 - age / 1.75) ** 1.5 * (0.38 + w.speed * 0.85),
          course: w.course,
        };
      });
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
    this.reflected = 0;
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
    // Seen from below, the underside occludes an occupant's feet in the virtual image.
    const deckWalkers = stamps.filter((p) => p.wakeId && onBridge(p));
    const mirrored = deckWalkers.length
      ? [...deckWalkers, ...stamps.filter((p) => !deckWalkers.includes(p))]
      : stamps;
    for (const stamp of mirrored) {
      if (stamp.reflect === false || stamp.key === 'cursor') continue;
      if (stamp.art) {
        const m = stamp.art.mirror;
        if (
          m &&
          ground.touchesWater(
            m.left + ox,
            m.top + oy,
            m.left + ox + m.canvas.width,
            m.top + oy + m.canvas.height
          )
        ) {
          this.mirror.drawImage(m.canvas, m.left + ox, m.top + oy);
          this.include(m.left + ox, m.top + oy, m.canvas.width, m.canvas.height);
          this.reflected++;
        }
        continue;
      }
      const frame = Math.max(0, stamp.frame ?? 0),
        height = this.atlas.height(stamp.key, stamp.width, frame) * (1 - (stamp.submerged ?? 0));
      const s = project(stamp.x, stamp.z),
        x = Math.round(s.x + ox),
        y = Math.round(s.y + oy + ((stamp.lift ?? 0) + (stamp.elevation ?? 0) * risePixels) * 0.78);
      const anchor = stamp.anchor ?? 1,
        left = x - stamp.width / 2,
        depth = height * anchor * 0.78,
        sway = (stamp.sway ?? 0) * 0.15,
        drift = Math.abs(sway) * height;
      if (
        y > h + 3 ||
        y + depth < 0 ||
        !ground.touchesWater(left - drift - 4, y - 2, left + stamp.width + drift + 4, y + depth + 3)
      )
        continue;
      this.mirror.save();
      this.mirror.globalAlpha = ['rill_boulder', 'rill_pebbles', 'rill_slab'].includes(stamp.key)
        ? 0.5
        : stamp.submerged
          ? 0.74
          : stamp.hero
            ? 0.68
            : 0.85;
      if (anchor !== 1) {
        this.mirror.beginPath();
        this.mirror.rect(Math.floor(left) - 1, y, stamp.width + 2, Math.ceil(depth) + 1);
        this.mirror.clip();
      }
      this.mirror.translate(x, y);
      this.mirror.scale(1, -0.78);
      if (sway) this.mirror.transform(1, 0, sway, 1, 0, 0);
      if (stamp.prop) drawProp(this.mirror, this.atlas, stamp.prop, 0, 0, stamp.width);
      else
        this.atlas.draw(
          this.mirror,
          stamp.key,
          0,
          0,
          stamp.width,
          frame,
          stamp.flip,
          anchor,
          stamp.submerged,
          height > 32
        );
      this.mirror.restore();
      this.reflected++;
      this.include(left - drift, y, stamp.width + 2 * drift, depth);
    }
    for (const wake of this.wakes) if (wake.course === 0) this.paintWake(wake, time, ox, oy);
    if (!this.regions.length || ground.compositeMirrors(ctx, this.mirror.canvas)) return;
    for (const rect of this.regions) {
      ground.reflect(this.layer.pixels(rect), this.distorted, rect);
      ctx.drawImage(this.distorted.canvas, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
    }
  }
}
