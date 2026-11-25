import type { Atlas } from './atlas';
import type { V2 } from '../core/world/layout';
import {
  chamberLift,
  landingSteps,
  landingRun,
  landingHalfWidth,
  roomProject,
  type Chamber,
  type FloorPlan,
  type Passage,
} from './roomPlans';

type Point = { x: number; y: number };
const at = (x: number, z: number, h = 0): Point => {
  const p = roomProject({ x, z });
  return { x: p.x, y: p.y - h };
};
function polygon(ctx: CanvasRenderingContext2D, points: Point[], color: string) {
  ctx.beginPath();
  points.forEach((p, i) =>
    i ? ctx.lineTo(Math.round(p.x), Math.round(p.y)) : ctx.moveTo(Math.round(p.x), Math.round(p.y))
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function line(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function quad(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  key: string,
  a: Point,
  b: Point,
  c: Point,
  repeatX?: number,
  repeatY?: number
) {
  const tex = atlas.surface(key),
    w = repeatX ?? tex.width,
    h = repeatY ?? tex.height;
  ctx.save();
  ctx.transform((b.x - a.x) / w, (b.y - a.y) / w, (c.x - a.x) / h, (c.y - a.y) / h, a.x, a.y);
  if (repeatX !== undefined) {
    ctx.fillStyle = ctx.createPattern(tex, 'repeat')!;
    ctx.fillRect(0, 0, w, h);
  } else ctx.drawImage(tex, 0, 0);
  ctx.restore();
}
function floorRect(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  key: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  texelsPerUnit = 0
) {
  quad(
    ctx,
    atlas,
    key,
    at(x0, z0),
    at(x1, z0),
    at(x0, z1),
    texelsPerUnit ? (x1 - x0) * texelsPerUnit : undefined,
    texelsPerUnit ? (z1 - z0) * texelsPerUnit : undefined
  );
}
export interface Casement {
  centre: V2;
  half: V2;
  height: number;
  floor: number;
}
function wall(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  a: V2,
  b: V2,
  h: number,
  stone: boolean,
  windows: boolean,
  loft: boolean,
  casement?: (centre: V2, half: V2, height: number) => void
) {
  const p = at(a.x, a.z),
    q = at(b.x, b.z),
    top = at(a.x, a.z, h),
    end = at(b.x, b.z, h),
    length = Math.hypot(b.x - a.x, b.z - a.z);
  const thickness = 0.43,
    dx = a.x === b.x ? -thickness : 0,
    dz = a.z === b.z ? -thickness : 0;
  const farA = at(a.x + dx, a.z + dz, h),
    farB = at(b.x + dx, b.z + dz, h);
  quad(ctx, atlas, stone ? 'room_masonry' : 'room_oak', farA, farB, top, length * 8, 4);
  polygon(ctx, [farB, end, q, at(b.x + dx, b.z + dz)], stone ? '#4c4c54' : '#523c33');
  line(ctx, farA, farB, stone ? '#b1a999' : '#bd9b6e');
  const point = (t: number, raise: number) => at(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, raise);
  quad(ctx, atlas, stone ? 'room_masonry' : 'room_plaster', top, end, p, length * 8, h);
  if (a.x === b.x) polygon(ctx, [top, end, q, p], 'rgba(40,38,51,.21)');
  line(ctx, p, q, '#493933', 3);
  line(ctx, top, end, '#3a302e', 4);
  line(ctx, point(0, h + 1), point(1, h + 1), '#c29a65', 1);
  if (h < 13) return;
  const panels = Math.max(1, Math.round(length / 4.2));
  for (let i = 0; i <= panels; i++) {
    const t = i / panels;
    line(ctx, point(t, 1), point(t, h - 1), stone ? '#615957' : '#5e4436', stone ? 2 : 3);
    line(ctx, point(t + 0.004, 2), point(t + 0.004, h - 1), stone ? '#aa9480' : '#b79262');
    if (i >= panels) continue;
    const m = (i + 0.5) / panels;
    if (windows && (i % 2 === 0 || loft)) {
      const half = Math.min(0.94 / length, 0.32 / panels);
      casement?.(
        { x: a.x + (b.x - a.x) * m, z: a.z + (b.z - a.z) * m },
        { x: (b.x - a.x) * half, z: (b.z - a.z) * half },
        h - 4
      );
      const a0 = point(m - half, h - 4),
        a1 = point(m + half, h - 4),
        b0 = point(m - half, 8),
        b1 = point(m + half, 8);
      polygon(ctx, [a0, a1, b1, b0], '#352e32');
      quad(
        ctx,
        atlas,
        'room_casement',
        { x: a0.x + 2, y: a0.y + 1 },
        { x: a1.x - 2, y: a1.y + 1 },
        { x: b0.x + 2, y: b0.y - 2 }
      );
      const sill = point(m + half + 0.02, 7);
      polygon(ctx, [b0, b1, sill, { x: b0.x + 3, y: b0.y + 3 }], stone ? '#a49a85' : '#c8a978');
    } else if (!stone && i % 2 === 1) {
      const half = 0.52 / length;
      quad(ctx, atlas, 'room_banner', point(m - half, h - 3), point(m + half, h - 3), point(m - half, 7));
    }
  }
  if (!stone) line(ctx, point(0, 5), point(1, 5), '#99754d', 2);
}
function slab(ctx: CanvasRenderingContext2D, atlas: Atlas, r: Chamber, stone: boolean, lift: number) {
  const a = at(r.x0, r.z1),
    b = at(r.x1, r.z1),
    c = at(r.x1, r.z0),
    bottom = (p: Point) => ({ x: p.x, y: p.y + 10 + lift });
  quad(ctx, atlas, stone ? 'room_masonry' : 'room_oak', a, b, bottom(a), (r.x1 - r.x0) * 8, 10 + lift);
  quad(ctx, atlas, 'room_masonry', b, c, bottom(b), (r.z1 - r.z0) * 9, 10 + lift);
  polygon(ctx, [a, b, bottom(b), bottom(a)], stone ? 'rgba(44,44,59,.48)' : 'rgba(54,39,33,.53)');
  polygon(ctx, [b, c, bottom(c), bottom(b)], 'rgba(32,31,43,.62)');
  if (lift > 0) line(ctx, { x: a.x, y: a.y + 5 }, { x: b.x, y: b.y + 5 }, stone ? '#6c6769' : '#7c6653', 2);
  line(ctx, bottom(a), bottom(b), '#231f27', 2);
  line(ctx, bottom(b), bottom(c), '#241f29', 2);
  floorRect(ctx, atlas, stone ? 'room_slate' : 'room_oak', r.x0, r.z0, r.x1, r.z1, stone ? 22 : 7);
  line(ctx, a, b, stone ? '#b4a596' : '#cfaa72', 2);
  line(ctx, b, c, stone ? '#8d817f' : '#a17b51', 2);
}
function arch(ctx: CanvasRenderingContext2D, atlas: Atlas, plan: FloorPlan, p: Passage) {
  const x = p.x,
    z = p.z,
    half = 1.72;
  const wing = plan.rooms[p.side === -1 ? 0 : 2];
  wall(ctx, atlas, { x, z: wing.z0 }, { x, z: z - half }, 22, plan.stone, false, false);
  wall(ctx, atlas, { x, z: z + half }, { x, z: wing.z1 }, 5, plan.stone, false, false);
  // Only the two jambs and lintel stand here, leaving the aperture visibly and physically open.
  const a = at(x, z - half),
    b = at(x, z + half),
    c = at(x, z - half, 24),
    d = at(x, z + half, 24);
  line(ctx, a, c, '#513c32', 4);
  line(ctx, b, d, '#513c32', 4);
  line(ctx, c, d, '#644632', 4);
  line(ctx, at(x, z - half, 25), at(x, z + half, 25), '#d2a46b', 2);
  line(ctx, b, at(x, z + half, 22), '#c29960', 1);
}
function landing(ctx: CanvasRenderingContext2D, atlas: Atlas, plan: FloorPlan, p: Passage) {
  const side = p.side!,
    top = chamberLift(plan, side < 0 ? 0 : 2),
    w = landingHalfWidth,
    z = p.z;
  const treads = Array.from({ length: landingSteps }, (_, i) => i);
  if (side < 0) treads.reverse();
  for (const i of treads) {
    const base = p.x - side * landingRun + (side * landingRun * i) / landingSteps;
    const end = base + (side * landingRun) / landingSteps,
      high = (top * (i + 1)) / landingSteps,
      low = (top * i) / landingSteps;
    const a = at(base, z - w, high),
      b = at(base, z + w, high),
      c = at(end, z - w, high),
      d = at(end, z + w, high);
    quad(ctx, atlas, plan.stone ? 'room_slate' : 'room_oak', a, b, c, w * 15, 5);
    if (side < 0)
      polygon(ctx, [a, b, at(base, z + w, low), at(base, z - w, low)], plan.stone ? '#67616a' : '#77563d');
    quad(ctx, atlas, plan.stone ? 'room_masonry' : 'room_oak', b, d, at(base, z + w), 8, high);
    polygon(
      ctx,
      [b, d, at(end, z + w), at(base, z + w)],
      plan.stone ? 'rgba(55,52,62,.47)' : 'rgba(51,34,31,.48)'
    );
    line(ctx, b, d, plan.stone ? '#a89e8d' : '#ac895b');
    line(ctx, a, b, plan.stone ? '#cec4a9' : '#dcb578');
  }
}
function stairs(ctx: CanvasRenderingContext2D, atlas: Atlas, p: Passage) {
  const x = p.x,
    z = p.z + 0.2,
    w = 1.55,
    up = p.kind === 'up';
  if (up) {
    quad(
      ctx,
      atlas,
      'room_archway',
      at(x - w - 0.14, z - 3.4, 37),
      at(x + w + 0.14, z - 3.4, 37),
      at(x - w - 0.14, z - 3.4, 11)
    );
  }
  if (!up)
    polygon(
      ctx,
      [at(x - w - 0.2, z), at(x + w + 0.2, z), at(x + w + 0.2, z - 3.9), at(x - w - 0.2, z - 3.9)],
      '#241f2b'
    );
  for (let i = 6; i >= 0; i--) {
    const near = z - i * 0.54,
      far = near - 0.56,
      h = (up ? 2.1 : -0.85) * (i + 1);
    const a = at(x - w, near, h),
      b = at(x + w, near, h),
      c = at(x - w, far, h);
    quad(ctx, atlas, 'room_oak', a, b, c, 29, 4);
    polygon(ctx, [a, b, at(x + w, near, h - 2.2), at(x - w, near, h - 2.2)], up ? '#725039' : '#403338');
    if (!up) polygon(ctx, [a, b, at(x + w, far, h), c], 'rgba(13,19,27,' + Math.min(0.65, 0.08 * i) + ')');
    line(ctx, a, b, up ? '#e3be81' : '#bb976d');
  }
  const top = up ? 15 : -5;
  for (const side of [-1, 1]) {
    const a = at(x + w * side, z, 2),
      b = at(x + w * side, z - 3.2, top);
    line(ctx, a, { x: a.x, y: a.y - 7 }, '#735035', 3);
    line(ctx, b, { x: b.x, y: b.y - 7 }, '#735035', 3);
    line(ctx, { x: a.x, y: a.y - 7 }, { x: b.x, y: b.y - 7 }, '#ad8957', 2);
  }
}
export interface RoomPlate {
  casements: Casement[];
  floors: Path2D;
  image: HTMLCanvasElement;
  left: number;
  top: number;
}
export class RoomArt {
  private plates = new Map<string, RoomPlate>();
  constructor(private atlas: Atlas) {}
  plate(plan: FloorPlan, indigo = false): RoomPlate {
    const style = plan.site.id + '/' + plan.level + '/' + indigo;
    const cached = this.plates.get(style);
    if (cached) return cached;
    const points = plan.rooms.flatMap((r) => [
      at(r.x0, r.z0),
      at(r.x1, r.z0),
      at(r.x0, r.z1),
      at(r.x1, r.z1),
    ]);
    const left = Math.floor(Math.min(...points.map((p) => p.x))) - 6,
      top = Math.floor(Math.min(...points.map((p) => p.y))) - 73;
    const image = document.createElement('canvas');
    image.width = Math.ceil(Math.max(...points.map((p) => p.x))) - left + 7;
    image.height = Math.ceil(Math.max(...points.map((p) => p.y))) - top + 15;
    const ctx = image.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-left, -top);
    for (const [i, r] of plan.rooms.entries()) {
      const lift = chamberLift(plan, i);
      ctx.save();
      ctx.translate(0, -lift);
      slab(ctx, this.atlas, r, plan.stone, lift);
      ctx.restore();
    }
    const casements: Casement[] = [],
      floors = new Path2D();
    const recordWindow = (index: number) => (centre: V2, half: V2, height: number) =>
      casements.push({ centre, half, height, floor: chamberLift(plan, index) });
    for (const [i, r] of plan.rooms.entries()) {
      const lift = chamberLift(plan, i);
      for (const [n, p] of [
        [r.x0, r.z0],
        [r.x1, r.z0],
        [r.x1, r.z1],
        [r.x0, r.z1],
      ].entries()) {
        const q = at(p[0]!, p[1]!, lift);
        if (n === 0) floors.moveTo(q.x, q.y);
        else floors.lineTo(q.x, q.y);
      }
      floors.closePath();
    }
    const [west, hall, east] = plan.rooms;
    for (const [i, r] of plan.rooms.entries()) {
      ctx.save();
      ctx.translate(0, -chamberLift(plan, i));
      const cx = (r.x0 + r.x1) / 2,
        cz = (r.z0 + r.z1) / 2,
        rx = (r.x1 - r.x0) * (i === 1 ? 0.245 : 0.31),
        rz = (r.z1 - r.z0) * 0.25;
      const weave = r.rug === 'blue' || (indigo && i === 1) ? 'room_indigo' : 'room_rug';
      if (plan.level !== 'cellar' || i === 1)
        floorRect(ctx, this.atlas, weave, cx - rx, cz - rz, cx + rx, cz + rz);
      wall(
        ctx,
        this.atlas,
        { x: r.x0, z: r.z0 },
        { x: r.x1, z: r.z0 },
        plan.level === 'loft' ? 31 : 33,
        plan.stone,
        plan.level !== 'cellar',
        plan.level === 'loft',
        recordWindow(i)
      );
      ctx.restore();
    }
    ctx.save();
    ctx.translate(0, -chamberLift(plan, 0));
    wall(
      ctx,
      this.atlas,
      { x: west.x0, z: west.z0 },
      { x: west.x0, z: west.z1 },
      29,
      plan.stone,
      plan.level !== 'cellar',
      false,
      recordWindow(0)
    );
    ctx.restore();
    for (const p of plan.passages) {
      if (p.kind === 'arch') {
        landing(ctx, this.atlas, plan, p);
        ctx.save();
        ctx.translate(0, -chamberLift(plan, p.side === -1 ? 0 : 2));
        arch(ctx, this.atlas, plan, p);
        ctx.restore();
      } else if (p.target) stairs(ctx, this.atlas, p);
      else {
        floorRect(ctx, this.atlas, 'room_rug', p.x - 1.65, p.z - 1.1, p.x + 1.65, hall.z1);
        const a = at(p.x - 1.6, hall.z1),
          b = at(p.x + 1.6, hall.z1);
        line(ctx, a, b, '#f2c97e', 2);
      }
    }
    // Low cutaway sills leave the furniture and people visible on the near side.
    ctx.save();
    ctx.translate(0, -chamberLift(plan, 2));
    wall(
      ctx,
      this.atlas,
      { x: east.x1, z: east.z0 },
      { x: east.x1, z: east.z1 },
      4,
      plan.stone,
      false,
      false
    );
    ctx.restore();
    const portal = plan.passages.find((p) => p.kind === 'outside');
    if (portal) {
      for (const side of [-1, 1]) {
        const a = at(side * 1.85, hall.z1),
          b = at(side * 1.85, hall.z1, 8);
        line(ctx, a, b, '#654a37', 4);
        line(ctx, b, { x: b.x + 1, y: b.y - 1 }, '#eac184', 3);
      }
    }
    const out = { image, left, top, casements, floors };
    if (this.plates.size >= 6) this.plates.delete(this.plates.keys().next().value!);
    this.plates.set(style, out);
    return out;
  }
}
