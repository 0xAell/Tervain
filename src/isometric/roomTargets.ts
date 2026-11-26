import { fromBuildingLocal, toBuildingLocal } from '../core/world/interiors';
import type { NpcId, WorldState } from '../core/game/types';
import { BENCHES, COOKFIRES, PICKUP_LOCATIONS, RESULT_CHECKS, SLUICE, WAGON_TALLY, type V2 } from '../core/world/layout';
import { S } from '../core/content/strings';
import { isHuntableAnimalId } from '../core/game/hunting';
import { doorways, doorOpen, siteAtPoint, type Doorway } from './doorways';
import { households } from './households';
import {
  fixtureApproach,
  passageLabel,
  roomLift,
  roomRisePixels,
  roomWalkable,
  stairAt,
  visibleAcrossWall,
  type Fixture,
  type FloorPlan,
  type Passage,
} from './roomPlans';
import type { Scenery } from './land';
import { rootsNear, locationId, carryMass } from './propCatalogue';
import type { PropPhysics } from './propPhysics';
import type { Actor } from './simulation';
import { villageFixtures } from './villageFixtures';

export interface RoomTarget {
  id: string;
  at: V2;
  approach: V2;
  label: string;
  reach: number;
  door?: Doorway;
  passage?: Passage;
  fixture?: Fixture;
  npc?: NpcId;
  field?: 'pet' | 'seat' | 'fire' | 'gather' | 'dress' | 'wagon' | 'bell' | 'well' | 'board' | 'sluice' | 'gauge';
  sprite?: { key: string; width: number };
  pickup?: (typeof PICKUP_LOCATIONS)[number];
  animal?: Actor;
  prop?: string;
  plant?: Scenery;
  locked?: boolean;
}
export function outsideTargets(state: WorldState): RoomTarget[] {
  return doorways.map((door) => {
    const locked = !doorOpen(door, state),
      name = households[door.site.id]!.name;
    const label = locked
      ? door.rear
        ? 'Examine the archive shutter'
        : 'Examine the locked archive door'
      : 'Enter ' + name + (door.rear ? ' by the shutter' : '');
    return { id: door.id, at: door.sill, approach: door.outside, label, reach: 2.45, door, locked };
  });
}
const deposits = PICKUP_LOCATIONS.filter((p) =>
  ['healing_herb', 'shore_apple', 'field_mushroom', 'iron_scrap'].includes(p.item)
);
export const gatheringIds = new Set(deposits.map((p) => p.id));
export function fieldTargets(state: WorldState, actors: Actor[]): RoomTarget[] {
  const targets: RoomTarget[] = [];
  const add = (
    id: string,
    field: RoomTarget['field'],
    at: V2,
    label: string,
    reach: number,
    extras?: Partial<RoomTarget>
  ) => {
    targets.push({ id, field, at, approach: { x: at.x - 1, z: at.z + 0.55 }, label, reach, ...extras });
  };
  const gauge = RESULT_CHECKS[0]!;
  const phase = state.quest.phase;
  add('mill/gauge', 'gauge', gauge, phase === 'committed' ? S('prompt.check_channel')
    : phase === 'settled' ? 'Read the mill gauge' : S('prompt.inspect.dry_channel'), gauge.r,
    { approach: { x: gauge.x - 3.05, z: gauge.z }, sprite: { key: 'mill_gauge', width: 15 } });
  add('sluice', 'sluice', SLUICE.control, S('prompt.sluice'), SLUICE.control.r, {
    approach: { x: SLUICE.control.x - 0.95, z: SLUICE.control.z + 1.25 }, sprite: { key: 'sluice_winch', width: 29 },
  });
  add('wagon/tally', 'wagon', WAGON_TALLY, 'Read the wagoner’s tally', WAGON_TALLY.reach);
  for (const fixture of villageFixtures)
    add('square/' + fixture.key, fixture.key, fixture.at, fixture.label, fixture.reach,
      { approach: fixture.approach, sprite: fixture });
  for (const [id, bench] of Object.entries(BENCHES))
    add('bench/' + id, 'seat', bench, 'Sit on the bench', 2.3);
  for (const fire of COOKFIRES) add('fire/' + fire.id, 'fire', fire, 'Cook at the fire', 2.6,
    { sprite: { key: 'cookfire', width: 25 } });
  for (const p of deposits)
    if (state.locationChanges['pickup:' + p.id] !== 'taken')
      add('gather/' + p.id, 'gather', p, 'Gather ' + S('item.' + p.item).toLowerCase(), p.r + 0.45, {
        pickup: p,
      });
  for (const a of actors) {
    if (!a.animal || siteAtPoint(a)) continue;
    const record = state.hunting[a.animal];
    if (record?.status === 'dead') add('dress/' + a.id, 'dress', a, 'Skin ' + a.name, 2.8, { animal: a });
    else if (!isHuntableAnimalId(a.animal) && a.key !== 'mount')
      add('pet/' + a.id, 'pet', a, 'Pet the ' + a.name, 2.4, { animal: a });
  }
  return targets;
}
export function residentSpots(plan: FloorPlan, actors: Actor[]) {
  const people: { a: Actor; at: V2 }[] = [];
  for (const a of actors) {
    if (!a.npc || a.dead || siteAtPoint(a) !== plan.site) continue;
    if (plan.level !== (a.posture === 'rest' ? 'loft' : 'ground')) continue;
    const l = toBuildingLocal(plan.site, a.x, a.z);
    const room = plan.rooms[a.posture === 'work' || a.posture === 'rest' ? 0 : 1];
    const preferred = {
      x: Math.max(room.x0 + 1.5, Math.min(room.x1 - 1.5, (room.x0 + room.x1) / 2 + l.x * 0.5)),
      z: 1 + l.z * 0.21,
    };
    const candidates = [
      preferred,
      { x: preferred.x, z: preferred.z + 1.45 },
      { x: preferred.x - 1.7, z: preferred.z },
      { x: preferred.x + 1.7, z: preferred.z },
      { x: 0, z: 1 },
    ];
    const at = candidates.find(
      (p) =>
        roomWalkable(plan, p) && people.every((other) => Math.hypot(p.x - other.at.x, p.z - other.at.z) > 1.2)
    );
    if (at) people.push({ a, at });
  }
  return people;
}
export function indoorTargets(plan: FloorPlan, actors: Actor[], spots: Iterable<{ a: Actor; at: V2 }> = residentSpots(plan, actors)): RoomTarget[] {
  const portals = plan.passages.map((p) => ({
    id: 'pass/' + p.id,
    at: p,
    approach: p,
    label: passageLabel(plan, p),
    reach: p.kind === 'outside' ? 2.1 : 2,
    passage: p,
  }));
  const fixtures = plan.fixtures
    .filter((f) => f.use)
    .map((f) => {
      const approach = fixtureApproach(f, plan);
      return { id: 'use/' + f.id, at: f, approach, label: f.label!, reach: 1.95, fixture: f };
    });
  const people = Array.from(spots).map(({ a, at }) => ({
    id: 'talk/' + a.id,
    at,
    approach: at,
    label: 'Speak with ' + a.name,
    reach: 2.3,
    npc: a.npc!,
  }));
  return [...portals, ...fixtures, ...people];
}
export function physicalTargets(physics: PropPhysics, p: V2, plan?: FloorPlan) {
  const targets: RoomTarget[] = [];
  for (const v of physics.objects) {
    const s = v.spec,
      d = Math.hypot(v.x - p.x, v.z - p.z);
    if (d > 29 || physics.grip?.id === s.id) continue;
    const f = s.fixture ? { ...s.fixture, x: v.x, z: v.z } : undefined;
    const upright = 1 - 2 * (v.rotation.x ** 2 + v.rotation.z ** 2) > 0.82;
    const seat = upright && (s.key === 'seat' || f?.use === 'seat');
    const id = s.benchId ? 'bench/' + s.benchId : f?.use === 'seat' ? 'use/' + f.id : 'prop/' + s.id;
    const nearSide = {
      x: v.x + ((p.x - v.x) / Math.max(0.05, d)) * (s.hx + 0.66),
      z: v.z + ((p.z - v.z) / Math.max(0.05, d)) * (s.hz + 0.66),
    };
    const approach = plan && f ? fixtureApproach(f, plan) : nearSide;
    targets.push({
      id,
      at: v,
      approach,
      prop: s.id,
      fixture: seat ? f : undefined,
      field: seat ? 'seat' : undefined,
      reach: 2.8 + Math.min(0.6, s.hx),
      label: seat
        ? (f?.label ?? 'Sit on the bench')
        : (s.mass > carryMass ? 'Drag the ' : 'Lift the ') + s.name.toLowerCase(),
    });
  }
  if (!plan)
    for (const plant of rootsNear(p, 4.8)) {
      const tree = /pine|birch|oak|fir|willow|alder/.test(plant.key);
      targets.push({
        id: 'shake/' + locationId(plant),
        plant,
        at: plant,
        approach: { x: plant.x - 0.9, z: plant.z + 0.7 },
        reach: 1.9,
        label: tree ? 'Shake the branches' : 'Brush the leaves',
      });
    }
  return targets;
}
export function targetDistance(target: RoomTarget, p: V2, plan?: FloorPlan) {
  if (target.field === 'board') return Math.hypot(p.x - target.approach.x, p.z - target.approach.z);
  if (plan && !visibleAcrossWall(plan, p, target.at)) return Infinity;
  const flight = plan && stairAt(plan, p);
  if (flight && plan) {
    if (flight.passage.id === target.passage?.id) return 0;
    if (Math.abs(roomLift(plan, p) - roomLift(plan, target.at)) > 1.6 * roomRisePixels) return Infinity;
  }
  if (target.door) {
    const d = target.door,
      local = toBuildingLocal(d.site, p.x, p.z);
    if ((d.rear ? -local.z : local.z) < d.site.d / 2 - 0.22) return Infinity;
  }
  if (target.fixture) {
    const f = target.fixture;
    return Math.hypot(Math.max(0, Math.abs(p.x - f.x) - f.hx), Math.max(0, Math.abs(p.z - f.z) - f.hz));
  }
  return Math.hypot(p.x - target.at.x, p.z - target.at.z);
}
export function outsideReturn(door: Doorway): V2 {
  const l = toBuildingLocal(door.site, door.sill.x, door.sill.z);
  return fromBuildingLocal(door.site, l.x, l.z + (door.rear ? -1 : 1) * 2.05);
}
