import type { HeroReveal } from './heroReveal';
import type { Atlas } from './atlas';
import type { V2 } from '../core/world/layout';
import {
  chamberLift,
  landingSteps,
  landingRun,
  landingHalfWidth,
  roomProject,
  upperLandingRun,
  type Chamber,
  type FloorPlan,
  type RoomArch,
  type StairFlight,
} from './roomPlans';
import { windFrame } from './wind';

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
interface Hanging {
  a: Point;
  b: Point;
  c: Point;
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
  casement?: (centre: V2, half: V2, height: number) => void,
  hanging?: (a: Point, b: Point, c: Point) => void
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
      hanging?.(point(m - half, h - 3), point(m + half, h - 3), point(m - half, 7));
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
function arch(ctx: CanvasRenderingContext2D, atlas: Atlas, plan: FloorPlan, p: RoomArch) {
  const x = p.x,
    z = p.z,
    half = landingHalfWidth;
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
function landing(ctx: CanvasRenderingContext2D, atlas: Atlas, plan: FloorPlan, p: RoomArch) {
  const side = p.side,
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
function stairRailing(ctx: CanvasRenderingContext2D, s: StairFlight, x: number, stone: boolean) {
  const first = s.treads[0]!,
    last = s.treads[s.treads.length - 1]!,
    rise = Math.max(0, last.height),
    z0 = first.start,
    z1 = last.end,
    dark = stone ? '#424047' : '#50382c',
    light = stone ? '#a59473' : '#b58a58';
  for (const fraction of [0, 0.5, 1]) {
    const z = z0 + (z1 - z0) * fraction,
      h = rise * fraction;
    line(ctx, at(x, z, h), at(x, z, h + 10), dark, 3);
    line(ctx, at(x - 0.05, z, h + 1), at(x - 0.05, z, h + 10), light);
    line(ctx, at(x - 0.07, z, h + 10.5), at(x + 0.07, z, h + 10.5), '#dbb57f', 2);
  }
  for (const h of [5, 10]) {
    line(ctx, at(x, z0, h), at(x, z1, rise + h), dark, h === 10 ? 3 : 2);
    line(ctx, at(x, z0, h + 1), at(x, z1, rise + h + 1), light);
  }
}

function stairOpening(s: StairFlight) {
  const outline = new Path2D();
  const corners = [at(s.x0, s.z0), at(s.x0, s.z1), at(s.x1, s.z1), at(s.x1, s.z0)];
  corners.forEach((p, i) => (i ? outline.lineTo(p.x, p.y) : outline.moveTo(p.x, p.y)));
  outline.closePath();
  return outline;
}

// The two near edges hide the part of a descending sprite that passes below the floor.
export function clipBelowRim(ctx: CanvasRenderingContext2D, s: StairFlight) {
  const left = at(s.x0, s.z1),
    front = at(s.x1, s.z1),
    right = at(s.x1, s.z0);
  ctx.beginPath();
  ctx.moveTo(left.x - 100, left.y - 50);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(front.x, front.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(right.x + 100, right.y - 50);
  ctx.lineTo(right.x + 100, right.y - 220);
  ctx.lineTo(left.x - 100, left.y - 220);
  ctx.closePath();
  ctx.clip();
}

function stairs(ctx: CanvasRenderingContext2D, atlas: Atlas, s: StairFlight, stone: boolean) {
  const { x0, x1, z0, z1, treads } = s,
    last = treads[treads.length - 1]!,
    up = last.height > 0,
    face = stone ? 'room_masonry' : 'room_oak',
    surface = stone ? 'room_slate' : 'room_oak',
    dark = stone ? '#47444c' : '#513a31',
    nose = stone ? '#c7bd9e' : '#e1b884';
  if (up) {
    polygon(
      ctx,
      [at(x0, z0), at(x1 + 1.05, z0 + 0.5), at(x1 + 0.35, z1 + 0.25), at(x0, z1)],
      'rgba(34,26,31,.30)'
    );
  } else {
    const outline = stairOpening(s);
    ctx.fillStyle = '#191c26';
    ctx.fill(outline);
    ctx.save();
    ctx.clip(outline);
    const pit = last.height - 8;
    for (const [x, z] of [
      [x1, z0],
      [x0, z1],
    ] as const) {
      const a = at(x0, z0),
        b = at(x, z),
        c = at(x0, z0, pit),
        d = at(x, z, pit);
      quad(ctx, atlas, 'room_masonry', a, b, c, Math.hypot(x - x0, z - z0) * 11, -pit);
      polygon(ctx, [a, b, d, c], x === x0 ? 'rgba(32,30,43,.52)' : 'rgba(24,25,36,.35)');
      line(ctx, a, b, dark, 3);
    }
  }
  if (up) {
    const front = last.end,
      back = front - upperLandingRun,
      h = last.height,
      left = x0 - 0.14,
      right = x1 + 0.14;
    // A section of the next floor projects from the rear wall, with the head of the flight let into it.
    quad(ctx, atlas, face, at(right, back, h), at(right, front, h), at(right, back, h - 5), 14, 5);
    quad(ctx, atlas, face, at(left, front, h), at(right, front, h), at(left, front, h - 5), 36, 5);
    quad(ctx, atlas, surface, at(left, back, h), at(right, back, h), at(left, front, h), 32, 13);
    line(ctx, at(left, front, h), at(right, front, h), nose);
    const high = h + 23;
    quad(
      ctx,
      atlas,
      stone ? 'room_masonry' : 'room_plaster',
      at(left, back, high),
      at(right, back, high),
      at(left, back, h),
      30,
      23
    );
    const jamb = (x: number, height: number) => at(x, back, h + height);
    const opening = [
      jamb(left + 0.42, 0),
      jamb(left + 0.42, 15),
      jamb(left + 0.74, 19),
      jamb(right - 0.72, 19),
      jamb(right - 0.42, 15),
      jamb(right - 0.42, 0),
    ];
    polygon(ctx, opening, '#302b2f');
    ctx.save();
    ctx.clip();
    const recess = back - 0.95,
      inside = (x: number, lift: number) => at(x, recess, h + lift);
    quad(ctx, atlas, face, inside(left, 21), inside(right, 21), inside(left, 0), 27, 21);
    line(ctx, inside(left + 1.55, 0), inside(left + 1.55, 20), dark, 2);
    quad(ctx, atlas, surface, inside(left, 0), inside(right, 0), jamb(left, 0), 30, 9);
    quad(ctx, atlas, face, inside(left + 0.42, 20), jamb(left + 0.42, 20), inside(left + 0.42, 0), 9, 20);
    polygon(ctx, opening, 'rgba(29,30,40,.58)');
    line(ctx, inside(left + 0.5, 1), inside(right, 1), '#8b7659');
    ctx.restore();
    for (const x of [left + 0.18, right - 0.18]) {
      line(ctx, jamb(x, 0), jamb(x, 21), dark, 3);
      line(ctx, jamb(x - 0.06, 0), jamb(x - 0.06, 21), stone ? '#aa9e83' : '#c29c6b');
    }
    line(ctx, jamb(left - 0.08, 22), jamb(right + 0.08, 22), dark, 4);
    line(ctx, jamb(left - 0.08, 23.5), jamb(right + 0.08, 23.5), nose);
    stairRailing(ctx, s, x0, stone);
  }
  // Both directions are painted from the back of the house toward the viewer.
  for (let j = 0; j < treads.length; j++) {
    const i = up ? treads.length - 1 - j : j,
      tread = treads[i]!,
      back = Math.min(tread.start, tread.end),
      front = Math.max(tread.start, tread.end),
      h = tread.height,
      lower = treads[i + (up ? -1 : 1)]?.height ?? h,
      a = at(x0, front, h),
      b = at(x1, front, h),
      c = at(x0, back, h),
      d = at(x1, back, h);
    if (up && h > 0) {
      quad(ctx, atlas, face, d, b, at(x1, back), (front - back) * 12, h);
      polygon(ctx, [d, b, at(x1, front), at(x1, back)], 'rgba(34,28,35,.48)');
      line(ctx, d, b, dark, 2);
    }
    if (lower < h) {
      quad(ctx, atlas, face, a, b, at(x0, front, lower), (x1 - x0) * 9, h - lower);
      polygon(ctx, [a, b, at(x1, front, lower), at(x0, front, lower)], 'rgba(53,38,41,.36)');
    }
    quad(ctx, atlas, surface, c, d, a, (x1 - x0) * 10, (front - back) * 9);
    line(ctx, a, b, nose);
    if (!up) {
      const alpha = 0.08 + (0.72 * i) / (treads.length - 1);
      polygon(ctx, [c, d, at(x1, front, lower), at(x0, front, lower)], 'rgba(19,25,39,' + alpha + ')');
    }
  }
  if (up) {
    line(ctx, at(x1, z0, last.height - 4), at(x1, z1, -1), dark, 4);
    line(ctx, at(x1, z0, last.height - 3), at(x1, z1), stone ? '#928571' : '#b38d5d');
    // Peg heads along the timber stringer.
    if (!stone)
      for (const i of [2, 5, 8]) {
        const t = treads[i]!,
          p = at(x1, t.start, t.height - 3);
        ctx.fillStyle = '#332d2d';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
  } else {
    // A lantern hangs inside the far cheek. Its light falls off within the well.
    const lamp = at(x0 + 0.12, z0 + (z1 - z0) * 0.69, -9);
    const light = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 15);
    light.addColorStop(0, 'rgba(255,185,91,.38)');
    light.addColorStop(1, 'rgba(228,153,68,0)');
    ctx.fillStyle = light;
    ctx.fillRect(lamp.x - 15, lamp.y - 15, 30, 30);
    const lx = Math.round(lamp.x),
      ly = Math.round(lamp.y);
    ctx.fillStyle = '#3d3030';
    ctx.fillRect(lx - 2, ly - 3, 4, 6);
    ctx.fillStyle = '#d7964d';
    ctx.fillRect(lx - 1, ly - 2, 2, 4);
    ctx.fillStyle = '#ffe4a1';
    ctx.fillRect(lx, ly - 1, 1, 2);
    ctx.restore();
    for (const [a, b] of [
      [at(x0, z1), at(x1, z1)],
      [at(x1, z1), at(x1, z0)],
      [at(x0, z0), at(x0, z1)],
    ] as const) {
      line(ctx, a, b, dark, 4);
      line(ctx, { x: a.x, y: a.y - 1 }, { x: b.x, y: b.y - 1 }, stone ? '#ae9f88' : '#bc9869');
    }
    stairRailing(ctx, s, x0, stone);
  }
  stairRailing(ctx, s, x1, stone);
}
interface StairLayer {
  flight: StairFlight;
  left: number;
  top: number;
  image: HTMLCanvasElement;
  rail: HTMLCanvasElement;
}
function stairLayer(atlas: Atlas, flight: StairFlight, stone: boolean): StairLayer {
  const { x0, x1, z0, z1, treads } = flight;
  const height = Math.max(0, treads[treads.length - 1]!.height);
  const back = height ? z0 - upperLandingRun : z0;
  const left = Math.floor(at(x0, z1).x) - 16,
    top = Math.floor(at(x0, back, height + 24).y) - 4;
  const image = document.createElement('canvas');
  image.width = Math.ceil(at(x1, back).x) - left + 16;
  image.height = Math.ceil(at(x1, z1).y) - top + 11;
  const rail = document.createElement('canvas');
  rail.width = image.width;
  rail.height = image.height;
  for (const canvas of [image, rail]) {
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-left, -top);
    if (canvas === image) stairs(ctx, atlas, flight, stone);
    else stairRailing(ctx, flight, x1, stone);
  }
  return { flight, image, rail, left, top };
}
export function stairForeground(
  ctx: CanvasRenderingContext2D,
  plate: RoomPlate,
  p: V2,
  box: { x: number; y: number; w: number; h: number },
  reveal: HeroReveal
) {
  for (const layer of plate.stairs) {
    if (
      box.x + box.w < layer.left ||
      box.x > layer.left + layer.image.width ||
      box.y + box.h < layer.top ||
      box.y > layer.top + layer.image.height
    )
      continue;
    const s = layer.flight,
      aboard = p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1;
    const behind = (p.x < s.x0 && p.z < s.z1) || (p.z < s.z0 && p.x < s.x1);
    if (!aboard && !behind) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    const art = behind && s.passage.kind === 'up' ? layer.image : layer.rail;
    ctx.drawImage(art, layer.left, layer.top);
    ctx.restore();
    const mask = reveal.foreground(box.x, box.y, box.w, box.h);
    if (mask) {
      mask.save();
      mask.beginPath();
      mask.rect(box.x, box.y, box.w, box.h);
      mask.clip();
      mask.drawImage(art, layer.left, layer.top);
      mask.restore();
    }
  }
}
export interface RoomPlate {
  casements: Casement[];
  hangings: Hanging[];
  floors: Path2D;
  stairs: StairLayer[];
  image: HTMLCanvasElement;
  left: number;
  top: number;
}
export class RoomArt {
  private plates = new Map<string, RoomPlate>();
  constructor(private atlas: Atlas) {}
  drawHangings(ctx: CanvasRenderingContext2D, plate: RoomPlate, phase: number) {
    if (!plate.hangings.length) return;
    const key = 'room_banner--wind',
      count = this.atlas.frameCount(key),
      { width: w, height: h } = this.atlas.surface('room_banner');
    for (const [index, { a, b, c }] of plate.hangings.entries()) {
      const art = this.atlas.surface(key, windFrame(phase, count, index * 1.45));
      ctx.save();
      ctx.transform((b.x - a.x) / w, (b.y - a.y) / w, (c.x - a.x) / h, (c.y - a.y) / h, a.x, a.y);
      ctx.drawImage(art, (w - art.width) / 2, 0);
      ctx.restore();
    }
  }
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
      hangings: Hanging[] = [],
      floors = new Path2D();
    const recordWindow = (index: number) => (centre: V2, half: V2, height: number) =>
      casements.push({ centre, half, height, floor: chamberLift(plan, index) });
    const recordHanging = (index: number) => (a: Point, b: Point, c: Point) => {
      const lift = chamberLift(plan, index);
      const raised = (p: Point) => ({ x: p.x, y: p.y - lift });
      hangings.push({ a: raised(a), b: raised(b), c: raised(c) });
    };
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
    for (const stair of plan.stairs) floors.addPath(stairOpening(stair));
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
        recordWindow(i),
        recordHanging(i)
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
      recordWindow(0),
      recordHanging(0)
    );
    ctx.restore();
    const stairLayers = plan.stairs.map((s) =>
      stairLayer(this.atlas, s, plan.stone || s.passage.target === 'cellar')
    );
    for (const p of plan.arches) {
      landing(ctx, this.atlas, plan, p);
      ctx.save();
      ctx.translate(0, -chamberLift(plan, p.side === -1 ? 0 : 2));
      arch(ctx, this.atlas, plan, p);
      ctx.restore();
    }
    for (const layer of stairLayers) ctx.drawImage(layer.image, layer.left, layer.top);
    const portal = plan.passages.find((p) => p.kind === 'outside');
    if (portal) {
      floorRect(ctx, this.atlas, 'room_rug', portal.x - 1.65, portal.z - 1.1, portal.x + 1.65, hall.z1);
      line(ctx, at(portal.x - 1.6, hall.z1), at(portal.x + 1.6, hall.z1), '#f2c97e', 2);
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
    if (portal) {
      for (const side of [-1, 1]) {
        const a = at(side * 1.85, hall.z1),
          b = at(side * 1.85, hall.z1, 8);
        line(ctx, a, b, '#654a37', 4);
        line(ctx, b, { x: b.x + 1, y: b.y - 1 }, '#eac184', 3);
      }
    }
    const out = { image, left, top, casements, hangings, floors, stairs: stairLayers };
    if (this.plates.size >= 6) this.plates.delete(this.plates.keys().next().value!);
    this.plates.set(style, out);
    return out;
  }
}
