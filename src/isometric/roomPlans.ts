import type { InteriorLevel, ItemId } from '../core/game/types';
import type { BuildingSpec, V2 } from '../core/world/layout';
import { households } from './households';

export interface RoomRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export interface Chamber extends RoomRect {
  name: string;
  rug: 'red' | 'blue';
}
export type Use = 'trade' | 'book' | 'lamp' | 'bed' | 'chest' | 'hearth' | 'supply' | 'seat';
export interface Fixture extends V2 {
  id: string;
  key: string;
  width: number;
  hx: number;
  hz: number;
  use?: Use;
  label?: string;
  item?: ItemId;
}
export type PassageKind = 'outside' | 'up' | 'down' | 'arch';
export interface Passage extends V2 {
  id: string;
  kind: PassageKind;
  target?: InteriorLevel;
  side?: -1 | 1;
}
export interface StairFlight extends RoomRect {
  passage: Passage;
  direction: number;
  /** Surface heights in native room pixels, in walking order from this floor. */
  treads: { start: number; end: number; height: number }[];
}
export interface FloorPlan {
  site: BuildingSpec;
  level: InteriorLevel;
  name: string;
  rooms: [Chamber, Chamber, Chamber];
  fixtures: Fixture[];
  passages: Passage[];
  stairs: StairFlight[];
  gap: number;
  stone: boolean;
}
export const roomScale = 11;
export const roomRisePixels = 14;
export const floorElevation: Record<InteriorLevel, number> = { cellar: -3, ground: 0, loft: 3.5 };
export const stairRun = 5.25;
export const upperLandingRun = 1.3;
const stairCount = 11,
  stairWidth = 3.4;

function makeFlight(p: Passage, level: InteriorLevel): StairFlight {
  const direction = p.kind === 'up' ? -1 : 1,
    finish = p.z + direction * stairRun,
    rise = (floorElevation[p.target!] - floorElevation[level]) * roomRisePixels;
  return {
    passage: p,
    direction,
    x0: p.x - stairWidth / 2,
    x1: p.x + stairWidth / 2,
    z0: Math.min(p.z, finish),
    z1: Math.max(p.z, finish),
    treads: Array.from({ length: stairCount }, (_, i) => ({
      start: p.z + (direction * stairRun * i) / stairCount,
      end: p.z + (direction * stairRun * (i + 1)) / stairCount,
      height: (rise * i) / (stairCount - 1),
    })),
  };
}
export function stairAt(plan: FloorPlan, p: V2) {
  return plan.stairs.find((s) => p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1);
}
export function stairDepth(s: StairFlight, p: V2) {
  return (p.z - s.passage.z) * s.direction;
}
export const roomProject = (p: V2) => ({ x: (p.x - p.z) * roomScale, y: ((p.x + p.z) * roomScale) / 2 });
export const roomUnproject = (x: number, y: number): V2 => ({
  x: (y + x / 2) / roomScale,
  z: (y - x / 2) / roomScale,
});
// Local elevations are in native pixels, matching the existing room wall and stair dimensions.
export const landingSteps = 4,
  landingRun = 2.4,
  landingHalfWidth = 1.72;
export function chamberLift(plan: FloorPlan, index: number) {
  if (index === 1) return 0;
  if (plan.level === 'cellar') return index === 0 ? 12 : 23;
  if (plan.level === 'loft') return index === 0 ? 22 : 14;
  return index === 0 ? 21 : 12;
}
export function roomLift(plan: FloorPlan, p: V2) {
  const stair = stairAt(plan, p);
  if (stair) {
    const index = Math.min(stairCount - 1, Math.floor((stairDepth(stair, p) * stairCount) / stairRun));
    return stair.treads[index]!.height;
  }
  const hall = plan.rooms[1],
    left = p.x <= hall.x0;
  if (left || p.x >= hall.x1) return chamberLift(plan, left ? 0 : 2);
  if (Math.abs(p.z - plan.gap) > landingHalfWidth) return 0;
  const west = p.x - hall.x0,
    east = hall.x1 - p.x,
    dist = Math.min(west, east);
  if (dist >= landingRun) return 0;
  const t = Math.ceil(((landingRun - dist) * landingSteps) / landingRun);
  return (t * chamberLift(plan, west < east ? 0 : 2)) / landingSteps;
}
export function roomFoot(plan: FloorPlan, p: V2) {
  const q = roomProject(p);
  q.y -= roomLift(plan, p);
  return q;
}
export function pickRoomFloor(plan: FloorPlan, x: number, y: number) {
  let picked = roomUnproject(x, y),
    nearest = -Infinity,
    bestGap = Infinity;
  // A point on a vertical riser selects its closest tread. The frontmost exact hit wins.
  const consider = (h: number) => {
    const p = roomUnproject(x, y + h);
    if (!chamberAt(plan, p)) return;
    const gap = Math.abs(h - roomLift(plan, p));
    if (gap < bestGap - 0.001 || (Math.abs(gap - bestGap) < 0.001 && h > nearest)) {
      picked = p;
      nearest = h;
      bestGap = gap;
    }
  };
  for (const index of [0, 2]) {
    for (let k = 0; k <= landingSteps; k++) consider((chamberLift(plan, index) * k) / landingSteps);
  }
  for (const stair of plan.stairs) for (const tread of stair.treads) consider(tread.height);
  return picked;
}
const cached = new Map<string, FloorPlan>();
const middle = (a: number, b: number) => (a + b) / 2;

export function floorPlan(site: BuildingSpec, level: InteriorLevel): FloorPlan {
  const id = site.id + '/' + level,
    previous = cached.get(id);
  if (previous) return previous;
  const home = households[site.id]!,
    stone =
      level === 'cellar' || site.kind === 'shrine' || site.kind === 'archive' || site.id === 'lantern_tower';
  const variation = [...site.id].reduce((n, c) => n + c.charCodeAt(0), 0);
  const hall = 6.5 + Math.min(2, site.w * 0.16) + (level === 'ground' ? 0.9 : 0);
  const deep = 6.4 + (variation % 3) * 0.45 + (site.kind === 'inn' || site.kind === 'shrine' ? 1.15 : 0);
  const left = 7.6 + (variation % 4) * 0.55,
    right = 7.9 + ((variation >> 1) % 4) * 0.5;
  const gap = ((variation % 3) - 1) * 0.65,
    loft = level === 'loft',
    basement = level === 'cellar';
  const name = loft ? home.loft : basement ? home.cellar : 'Ground floor';
  const rooms: FloorPlan['rooms'] = [
    {
      x0: -hall - left,
      x1: -hall,
      z0: -deep + 1.4,
      z1: deep - 1.45,
      name: loft ? 'Bedchamber' : basement ? 'Dry stores' : home.workroom,
      rug: variation % 4 === 0 && site.id !== 'house_a' ? 'red' : 'blue',
    },
    {
      x0: -hall,
      x1: hall,
      z0: -deep,
      z1: deep,
      name: loft ? home.loft : basement ? home.cellar : 'Entry hall',
      rug: 'red',
    },
    {
      x0: hall,
      x1: hall + right,
      z0: -deep + 2.25,
      z1: deep - 0.55,
      name: loft ? 'Writing room' : basement ? 'Strongroom' : 'Keeping room',
      rug: 'red',
    },
  ];
  const lx = middle(rooms[0].x0, -hall),
    rx = middle(hall, rooms[2].x1);
  const fixtures: Fixture[] = [];
  const put = (
    key: string,
    x: number,
    z: number,
    width: number,
    hx: number,
    hz: number,
    use?: Use,
    label?: string,
    item?: ItemId
  ) => {
    if (!use && (key === f('chair') || key === f('stool'))) {
      use = 'seat';
      label = key === f('chair') ? 'Sit in the chair' : 'Sit on the stool';
    }
    fixtures.push({ id: (use ?? key) + '-' + fixtures.length, key, x, z, width, hx, hz, use, label, item });
  };
  // The clear central aisle links both wings. Stairs and every object have a reachable apron.
  const passages: Passage[] = [
    { id: 'west', kind: 'arch', x: -hall, z: gap, side: -1 },
    { id: 'east', kind: 'arch', x: hall, z: gap, side: 1 },
  ];
  // Reciprocal flights line up across floors, including the wider ground-floor hall.
  const stairX = hall - (level === 'ground' ? 0.9 : 0) - 4.35,
    stairBack = -deep + 1.75;
  if (!loft)
    passages.push({
      id: 'up',
      kind: 'up',
      x: (basement ? -1 : 1) * stairX,
      z: stairBack + stairRun,
      target: basement ? 'ground' : 'loft',
    });
  if (!basement)
    passages.push({
      id: 'down',
      kind: 'down',
      x: (loft ? 1 : -1) * stairX,
      z: stairBack,
      target: loft ? 'ground' : 'cellar',
    });
  if (level === 'ground') passages.push({ id: 'exit', kind: 'outside', x: 0, z: deep - 0.58 });
  const f = (type: string) => 'furniture_' + type;
  const workKey = ['bed', 'table', 'chest'].includes(home.tool) ? home.tool : f(home.tool);
  if (level === 'ground') {
    put(
      workKey,
      lx - 0.6,
      rooms[0].z0 + 2.2,
      51,
      1.65,
      1.05,
      'trade',
      home.task === 'ledger'
        ? 'Read the water ledger'
        : home.task === 'rite'
          ? 'Use the offering altar'
          : 'Use the ' + home.workroom.toLowerCase()
    );
    put('room_hearth', rx, rooms[2].z0 + 1.7, 53, 1.6, 0.85, 'hearth', 'Tend the hearth');
    put('table', 2.8, 2.5, 42, 1.35, 0.68);
    put(f('chair'), 3.4, 4.05, 23, 0.48, 0.45);
    put(f('stool'), 1.2, 2.4, 18, 0.42, 0.4);
    put(
      f('cupboard'),
      rooms[0].x0 + 1.55,
      2.45,
      38,
      1.05,
      0.7,
      'supply',
      'Check the cupboard',
      home.supplies
    );
    put(f('shelf'), rooms[2].x1 - 1.4, -1.45, 36, 0.92, 0.65);
  } else if (loft) {
    put('bed', lx - 0.8, rooms[0].z0 + 2.45, 50, 1.1, 1.55, 'bed', 'Rest in the bed');
    put(f('desk'), rx - 0.1, rooms[2].z0 + 2, 42, 1.23, 0.72, 'book', 'Read ' + home.book);
    put(f('chair'), rx + 1.15, rooms[2].z0 + 3.8, 22, 0.46, 0.42);
    put(
      f(
        site.kind === 'inn'
          ? 'bunk'
          : home.tool === 'loom'
            ? 'loom'
            : home.task === 'fletch'
              ? 'rack'
              : 'bookshelf'
      ),
      2.5,
      deep - 2.1,
      38,
      1,
      0.76
    );
    put(
      f('cupboard'),
      rooms[0].x0 + 1.35,
      2.2,
      37,
      0.92,
      0.68,
      'supply',
      'Check the linen cupboard',
      'healing_herb'
    );
    put(f('bookshelf'), rooms[2].x1 - 1.5, 1.35, 39, 1.15, 0.62);
  } else {
    put(
      f('rack'),
      lx - 0.8,
      rooms[0].z0 + 1.8,
      46,
      1.3,
      0.72,
      'supply',
      'Search the provision rack',
      home.supplies
    );
    put(f('workbench'), rx - 0.3, rooms[2].z0 + 2, 47, 1.35, 0.92, 'trade', 'Use the cellar workbench');
    put(f('barrel'), 3, deep - 1.65, 27, 0.74, 0.67);
    put(f('barrel'), 4.7, deep - 1.8, 25, 0.71, 0.62);
    put(f(home.task === 'fletch' ? 'pelt' : 'sacks'), rooms[0].x0 + 1.8, 2.0, 33, 0.95, 0.62);
    put(f('crate'), rooms[2].x1 - 1.45, -0.8, 30, 0.8, 0.65);
  }
  if (!loft) put(f('desk'), 0.35, -deep + 1.45, 39, 1.1, 0.67, 'book', 'Read ' + home.book);
  put('chest', rx + 0.7, rooms[2].z1 - 2, 33, 0.95, 0.63, 'chest', 'Open the storage chest');
  put(f('candle'), -2.2, 2.4, 16, 0.36, 0.34, 'lamp', 'Adjust the room lights');
  put(f('firewood'), rooms[0].x0 + 1.4, rooms[0].z0 + 1.05, 25, 0.7, 0.4);
  put(f('jug'), -hall + 0.9, deep - 1.28, 19, 0.44, 0.35);
  put(f('shelf'), -hall - 1.6, rooms[0].z0 + 1.05, 30, 0.86, 0.42);
  put(f(loft ? 'herbs' : 'pots'), hall + 1.78, rooms[2].z0 + 1.1, 23, 0.55, 0.38);
  if (level === 'ground') put(f('stool'), rx - 1.8, 2, 17, 0.38, 0.35);
  const stairs = passages.filter((p) => p.target).map((p) => makeFlight(p, level));
  const plan = { site, level, name, rooms, fixtures, passages, stairs, gap, stone };
  cached.set(id, plan);
  return plan;
}
export function chamberAt(plan: FloorPlan, p: V2) {
  return plan.rooms.find((r) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
}
export function roomWalkable(plan: FloorPlan, p: V2) {
  const r = chamberAt(plan, p);
  if (
    !r ||
    p.z < r.z0 + 0.32 ||
    p.z > r.z1 - 0.32 ||
    p.x < plan.rooms[0].x0 + 0.32 ||
    p.x > plan.rooms[2].x1 - 0.32
  )
    return false;
  for (const wall of [plan.rooms[1].x0, plan.rooms[1].x1]) {
    if (Math.abs(p.x - wall) < 0.34 && Math.abs(p.z - plan.gap) > 1.52) return false;
  }
  return !plan.fixtures.some((f) => Math.abs(f.x - p.x) < f.hx + 0.22 && Math.abs(f.z - p.z) < f.hz + 0.22);
}
export function roomCanMove(plan: FloorPlan, a: V2, b: V2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3));
  let previous = a,
    flight = stairAt(plan, a);
  for (let i = 1; i <= steps; i++) {
    const next = { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps };
    if (!roomWalkable(plan, next)) return false;
    const entered = stairAt(plan, next);
    if (flight !== entered) {
      const stair = (flight ?? entered)!;
      // The mouth is the only break in the stringers and in the lip of the well.
      if (stairDepth(stair, flight ? next : previous) > 0) return false;
      if (next.z !== previous.z) {
        const t = (stair.passage.z - previous.z) / (next.z - previous.z);
        const crossingX = previous.x + (next.x - previous.x) * t;
        if (crossingX < stair.x0 || crossingX > stair.x1) return false;
      }
    }
    previous = next;
    flight = entered;
  }
  return true;
}
export function passageLanding(plan: FloorPlan, from?: InteriorLevel): V2 {
  const p = from
    ? plan.passages.find((p) => p.target === from)
    : plan.passages.find((p) => p.kind === 'outside');
  return p
    ? { x: p.x, z: p.z + (p.kind === 'outside' ? -1.65 : p.kind === 'up' ? 0.66 : -0.66) }
    : { x: 0, z: 2 };
}
const fixtureApproaches = new WeakMap<Fixture, V2>();
export function fixtureApproach(f: Fixture, plan: FloorPlan): V2 {
  const known = fixtureApproaches.get(f);
  if (known) return known;
  const candidates = [
    { x: f.x, z: f.z + f.hz + 0.73 },
    { x: f.x - f.hx - 0.82, z: f.z },
    { x: f.x + f.hx + 0.82, z: f.z },
    { x: f.x, z: f.z - f.hz - 0.82 },
    { x: f.x - f.hx - 0.65, z: f.z + f.hz + 0.68 },
    { x: f.x + f.hx + 0.65, z: f.z + f.hz + 0.68 },
  ];
  const at = candidates.find((p) => roomWalkable(plan, p) && visibleAcrossWall(plan, p, f)) ?? candidates[0]!;
  fixtureApproaches.set(f, at);
  return at;
}
export function passageLabel(plan: FloorPlan, p: Passage, at: V2) {
  if (p.kind === 'outside') return 'Leave ' + households[plan.site.id]!.name;
  if (p.target) return (p.kind === 'up' ? 'Up to ' : 'Down to ') + floorPlan(plan.site, p.target).name;
  const wing = plan.rooms[p.side === -1 ? 0 : 2];
  return 'Enter ' + (chamberAt(plan, at) === wing ? plan.rooms[1].name : wing.name);
}
export function visibleAcrossWall(plan: FloorPlan, a: V2, b: V2) {
  for (const x of [plan.rooms[1].x0, plan.rooms[1].x1]) {
    if ((a.x - x) * (b.x - x) >= 0) continue;
    if (Math.abs(a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x) - plan.gap) > 1.55) return false;
  }
  return true;
}
