import { PHYSICAL_PROPS } from '../core/world/physicalProps';
import { SPAWN, BENCHES, COOKFIRES, type V2 } from '../core/world/layout';
import { scenery, type Scenery } from './land';
import { sites } from './doorways';
import { floorPlan, type Fixture, type FloorPlan } from './roomPlans';

export const outdoors = 'vale';
export type Shape = 'box' | 'round' | 'rock' | 'log' | 'chair' | 'table';
export type Material = 'wood' | 'stone' | 'pottery' | 'metal' | 'cloth';
interface Kind {
  name: string;
  shape: Shape;
  material: Material;
  mass: number;
  height: number;
  floats: boolean;
}
const kind = (
  name: string,
  shape: Shape,
  material: Material,
  mass: number,
  height: number,
  floats = false
): Kind => ({ name, shape, material, mass, height, floats });
const kinds: Record<string, Kind> = {
  furniture_crate: kind('Supply crate', 'box', 'wood', 12, 0.92, true),
  furniture_barrel: kind('Trade barrel', 'round', 'wood', 18, 1.3, true),
  furniture_jug: kind('Clay jug', 'round', 'pottery', 2, 0.77),
  furniture_pots: kind('Cooking pots', 'round', 'metal', 4, 0.54),
  furniture_firewood: kind('Split firewood', 'log', 'wood', 6, 0.49, true),
  furniture_herbs: kind('Bundle of herbs', 'box', 'cloth', 0.7, 0.33, true),
  furniture_sacks: kind('Grain sacks', 'box', 'cloth', 27, 0.84),
  furniture_pelt: kind('Rolled pelt', 'log', 'cloth', 4, 0.34, true),
  furniture_tools: kind('Tool case', 'box', 'metal', 7, 0.38),
  furniture_stool: kind('Wooden stool', 'round', 'wood', 5, 0.86, true),
  furniture_chair: kind('Wooden chair', 'chair', 'wood', 9, 1.64, true),
  seat: kind('Timber bench', 'table', 'wood', 48, 1.02, true),
  table: kind('Oak table', 'table', 'wood', 54, 1.47, true),
  driftwood: kind('Driftwood', 'log', 'wood', 9, 0.6, true),
  rockpile: kind('Loose stone', 'rock', 'stone', 11, 0.62),
  shore_apple: kind('Shore apple', 'rock', 'wood', 0.3, 0.38, true),
  journal_icon: kind('Bound book', 'box', 'cloth', 1.1, 0.24, true),
  bread: kind('Bread loaf', 'log', 'cloth', 0.6, 0.31, true),
  iron_scrap: kind('Iron offcut', 'box', 'metal', 5, 0.31),
};
export interface PropSpec extends V2, Kind {
  id: string;
  key: string;
  space: string;
  hx: number;
  hz: number;
  width: number; // Native sprite width outdoors.
  yaw: number;
  onTop: number;
  fixture?: Fixture;
  benchId?: string;
}
export const carryMass = 30;
export const isRooted = (key: string) =>
  /^(pine|birch|oak|fir|brush|flowers|reeds|rill_(willow|alder|sedge|iris|fern|spirea|lilies))$/.test(key);
export function locationId(p: Scenery) {
  return p.key + '_' + Math.round(p.x * 100) + '_' + Math.round(p.z * 100);
}
function looseScenery(p: Scenery) {
  return (
    p.key === 'driftwood' || p.key === 'table' || p.key === 'seat' || (p.key === 'rockpile' && p.width < 30)
  );
}
const catalogue = new Map<string, PropSpec>(),
  spaceLists = new Map<string, PropSpec[]>(),
  sectors = new Map<string, PropSpec[]>();
const sector = (x: number, z: number) => Math.floor(x / 16) + ',' + Math.floor(z / 16);
const roots = new Map<string, Scenery[]>();
const original = new Map<Scenery, PropSpec>();
const solidRooms = new WeakMap<FloorPlan, FloorPlan>();
let registered = false;
function add(p: PropSpec) {
  if (catalogue.has(p.id)) throw Error('Duplicate loose object ' + p.id);
  catalogue.set(p.id, p);
  let group = spaceLists.get(p.space);
  if (!group) spaceLists.set(p.space, (group = []));
  group.push(p);
  if (p.space === outdoors) {
    const key = sector(p.x, p.z);
    let bucket = sectors.get(key);
    if (!bucket) sectors.set(key, (bucket = []));
    bucket.push(p);
  }
  return p;
}
function make(
  id: string,
  key: string,
  space: string,
  p: V2,
  hx: number,
  hz: number,
  width: number,
  options: Partial<PropSpec> = {}
) {
  return add({ ...kinds[key]!, id, key, space, x: p.x, z: p.z, hx, hz, width, yaw: 0, onTop: 0, ...options });
}
const carryFixture = (f: Fixture) => !!kinds[f.key] && (!f.use || f.use === 'seat');
function addRoom(plan: FloorPlan, space: string) {
  solidRooms.set(plan, { ...plan, fixtures: plan.fixtures.filter((f) => !carryFixture(f)) });
  for (const f of plan.fixtures) {
    if (!carryFixture(f)) continue;
    make(space + '/' + f.id, f.key, space, f, f.hx, f.hz, (f.width * 6) / 11, { fixture: f });
  }
  // Place individual possessions on real furniture tops and pack supplies around the dry stores.
  const table =
    plan.fixtures.find((f) => f.key === 'table' && !f.use) ??
    plan.fixtures.find((f) => f.key === 'furniture_desk');
  if (table) {
    const y = surfaceHeight(table);
    make(
      space + '/table-ware',
      'furniture_jug',
      space,
      { x: table.x - 0.46, z: table.z + 0.05 },
      0.25,
      0.23,
      6.6,
      { height: 0.65, onTop: y, mass: 1.6 }
    );
    const key =
      plan.level !== 'ground'
        ? 'journal_icon'
        : /smith|quarry/.test(plan.site.id)
          ? 'iron_scrap'
          : /fish|house_b|orchard/.test(plan.site.id)
            ? 'shore_apple'
            : 'bread';
    make(space + '/table-goods', key, space, { x: table.x + 0.48, z: table.z - 0.15 }, 0.32, 0.23, 6.8, {
      onTop: y,
    });
  }
  const wing = plan.rooms[2],
    cx = wing.x1 - 2.1,
    cz = wing.z1 - 2.75;
  const key =
    plan.level === 'cellar'
      ? 'furniture_crate'
      : plan.level === 'loft'
        ? 'furniture_pelt'
        : 'furniture_tools';
  make(
    space + '/loose-goods',
    key,
    space,
    { x: cx, z: cz },
    0.53,
    0.39,
    key === 'furniture_crate' ? 13 : 10.8
  );
}
export function surfaceHeight(f: Fixture) {
  return (
    kinds[f.key]?.height ??
    (f.key === 'bed'
      ? 0.85
      : f.key === 'chest'
        ? 1.02
        : f.key.includes('desk') || f.key.includes('workbench')
          ? 1.35
          : f.key.includes('shelf') || f.key.includes('cupboard') || f.key.includes('rack')
            ? 2.15
            : f.key.includes('candle')
              ? 0.75
              : 1.55)
  );
}
function stock() {
  for (const p of PHYSICAL_PROPS) {
    make(p.id, 'furniture_' + p.kind, outdoors, p, p.width / 2, p.depth / 2, p.kind === 'barrel' ? 14 : 15, {
      height: p.height,
      mass: p.mass,
      yaw: p.yaw,
    });
  }
  for (const [name, x, z] of [
    ['strand', SPAWN.x - 1.8, SPAWN.z - 1.75],
    ['ford', 27.5, 5.8],
    ['village', -1.2, 16.1],
    ['camp', -93.8, 28.6],
    ['quarry', 85, -15.5],
    ['fishers', -245, 72],
  ] as const) {
    const crate = make(name + '/wood-crate', 'furniture_crate', outdoors, { x, z }, 0.7, 0.57, 20, {
      height: 1.1,
    });
    make(name + '/jar', 'furniture_jug', outdoors, { x: x + 0.15, z: z + 0.04 }, 0.28, 0.25, 10, {
      onTop: crate.height,
      height: 0.7,
    });
    make(name + '/barrel', 'furniture_barrel', outdoors, { x: x + 2.1, z: z + 0.9 }, 0.58, 0.58, 19, {
      height: 1.48,
    });
    make(name + '/small-crate', 'furniture_crate', outdoors, { x: x - 0.95, z: z + 1.55 }, 0.51, 0.47, 14, {
      height: 0.78,
      mass: 6,
    });
    make(name + '/sacks', 'furniture_sacks', outdoors, { x: x + 2.3, z: z - 0.85 }, 0.7, 0.44, 16);
  }
  // Leave the doors and cart tracks clear. Players can handle the tools and stores here.
  for (const [site, x, z, load] of [
    ['mill', -26, -7, 'furniture_sacks'],
    ['quarry-face', 98, -31, 'furniture_tools'],
    ['spring-house', -35, -105, 'furniture_herbs'],
  ] as const) {
    const bench = make(site + '/sorting-table', 'table', outdoors, { x, z }, 1.15, 0.6, 33);
    make(site + '/stock', load, outdoors, { x: x - 0.45, z }, 0.43, 0.28, 13, { onTop: bench.height });
    make(site + '/water-jug', 'furniture_jug', outdoors, { x: x + 0.55, z }, 0.25, 0.22, 9, {
      onTop: bench.height,
    });
  }
  for (const f of COOKFIRES) {
    make('firewood/' + f.id, 'furniture_firewood', outdoors, { x: f.x + 1.8, z: f.z + 0.8 }, 0.72, 0.29, 14);
  }
}
export function registerProps() {
  if (registered) return;
  registered = true;
  for (const p of scenery()) {
    if (isRooted(p.key)) {
      const k = sector(p.x, p.z);
      let list = roots.get(k);
      if (!list) roots.set(k, (list = []));
      list.push(p);
    }
    if (!looseScenery(p)) continue;
    const hx =
      p.key === 'driftwood'
        ? p.width / 27
        : p.key === 'table'
          ? 1.45
          : p.key === 'seat'
            ? 1.32
            : Math.min(0.77, p.width / 31);
    const hz = p.key === 'table' ? 0.75 : p.key === 'seat' ? 0.5 : p.key === 'driftwood' ? 0.37 : hx * 0.82;
    const opts: Partial<PropSpec> =
      p.key === 'rockpile' ? { height: hx * 1.18, mass: Math.max(3, Math.round(35 * hx ** 3)) } : {};
    if (p.key === 'seat') {
      const bench = Object.entries(BENCHES).find(([, b]) => b.x === p.x && b.z === p.z);
      if (bench) {
        opts.benchId = bench[0];
        opts.yaw = bench[1].yaw;
      }
    }
    original.set(p, make('vale/' + locationId(p), p.key, outdoors, p, hx, hz, p.width, opts));
  }
  stock();
  for (const site of sites)
    for (const level of ['ground', 'loft', 'cellar'] as const)
      addRoom(floorPlan(site, level), site.id + '/' + level);
}
export function propById(id: string) {
  registerProps();
  return catalogue.get(id);
}
export function sceneryProp(p: Scenery) {
  registerProps();
  return original.get(p);
}
export function staticRoom(plan: FloorPlan) {
  registerProps();
  return solidRooms.get(plan) ?? plan;
}
export function roomProps(space: string) {
  registerProps();
  return spaceLists.get(space) ?? [];
}
export function rootsNear(p: V2, radius: number) {
  registerProps();
  const found: Scenery[] = [];
  for (let i = Math.floor((p.x - radius) / 16); i <= Math.floor((p.x + radius) / 16); i++)
    for (let j = Math.floor((p.z - radius) / 16); j <= Math.floor((p.z + radius) / 16); j++)
      for (const s of roots.get(i + ',' + j) ?? [])
        if (Math.hypot(s.x - p.x, s.z - p.z) <= radius) found.push(s);
  return found;
}
export const isTree = (key: string) => /^(pine|birch|oak|fir|rill_willow|rill_alder)$/.test(key);
export const trunkRadius = (p: Scenery) => Math.max(0.22, p.width / 125);
/** Click routes and hand-driven movement use the same trunk footprint as thrown objects. */
export function passesTrunks(a: V2, b: V2) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = Math.hypot(dx, dz);
  if (len < 0.001) return true;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  for (const s of rootsNear(mid, len / 2 + 1.75)) {
    if (!isTree(s.key)) continue;
    const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / (len * len)));
    const d = Math.hypot(a.x + dx * t - s.x, a.z + dz * t - s.z);
    if (d < trunkRadius(s) + 0.26 && t > 0) return false;
  }
  return true;
}
export function propsNear(p: V2, radius: number) {
  registerProps();
  const result: PropSpec[] = [];
  for (let x = Math.floor((p.x - radius) / 16); x <= Math.floor((p.x + radius) / 16); x++)
    for (let z = Math.floor((p.z - radius) / 16); z <= Math.floor((p.z + radius) / 16); z++) {
      const bucket = sectors.get(x + ',' + z);
      if (bucket) result.push(...bucket);
    }
  return result;
}
