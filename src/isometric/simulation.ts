import type { PropPhysics } from './propPhysics';
import { staticRoom, passesTrunks } from './propCatalogue';
import { Game } from '../core/game/game';
import { NPC_LIST } from '../core/content/npcs';
import { ANIMALS } from '../core/content/animals';
import { ENEMY_ARCHETYPES } from '../core/content/enemies';
import {
  ANIMAL_IDS,
  ANIMAL_MODEL_IDS,
  isHuntableAnimalId,
  skinningSeconds,
  withinSkinningReach,
  type AnimalId,
} from '../core/game/hunting';
import { CLOCK_RATE } from '../core/game/constants';
import { ACTION_COST, GUARD } from '../core/rules/hero';
import { bladeDamage, wears, FOCUS_TIME, FOCUSED_ARROW_DAMAGE, IMPACT_PAUSE, SIDESTEP, followingStroke, sidestepDistance } from '../core/rules/valeCombat';
import { hourOfDay } from '../core/game/state';
import { S } from '../core/content/strings';
import { resolveGoal } from '../core/rules/schedule';
import { interactableTable, MOUNT_ID, type InteractableEntry } from '../core/rules/interactables';
import { ANCHORS, ENEMY_SPAWNS, PLACES, type V2 } from '../core/world/layout';
import type { NpcId, Command, EncounterId, ItemId, PlaceId } from '../core/game/types';
import { supportHeight, travelScale, terrainHeight, footingHeight } from './relief';
import { risePixels } from './projection';
import { Footfalls } from './footfalls';
import { JUMP_TIME, Locomotion } from './locomotion';
import { RoomResidents } from './roomResidents';
import { distance, groundAt, inBuilding, navigable, placeList, project, waterAt } from './land';
import { onBridge, wetPoint, riverVelocity } from './water';
import { worldView } from '../core/game/worldView';
import { FURNITURE } from '../core/world/furniture';
import { fromBuildingLocal } from '../core/world/interiors';
import { RESIDENT_HOMES, INDOOR_POSTS } from '../core/world/homes';
import { bySpec } from '../core/world/layout';
import { buildingEntry } from '../core/world/buildingEntries';
import type { Goal } from '../core/rules/schedule';
import type { InteriorLevel } from '../core/game/types';
import { frontDoor, doorOpen, doorsById, sitesById, crossedDoor, type Doorway } from './doorways';
import {
  roomCanMove,
  roomWalkable,
  floorPlan,
  passageLanding,
  chamberAt,
  roomLift,
  roomRisePixels,
  floorElevation,
  stairAt,
  stairDepth,
  stairRun,
  type Passage,
} from './roomPlans';
import { households } from './households';
import {
  ARROW_RANGE,
  ARROW_SPEED,
  DAMAGE_LABEL_TIME,
  DEFEAT_TIME,
  arrowHeight,
  DRAW_TIME,
  ENEMY_SWING_TIME,
  enemyContactRemaining,
  RELEASE_TIME,
  SWING_TIME,
  SWING_BUFFER,
  SWING_CONTACT,
  SWING_RELEASE,
  PARRY_WINDOW,
  COUNTER_WINDOW,
  type SwordStroke,
  firstContact,
  unit,
  type Activity,
  type Arrow,
  type Draw,
  type Gesture,
  type FieldSound,
  type Contact,
} from './fieldcraft';
import { ITEMS, itemAction } from '../core/content/items';
import {
  fieldTargets,
  physicalTargets,
  gatheringIds,
  indoorTargets,
  outsideTargets,
  targetDistance,
  outsideReturn,
  type RoomTarget,
} from './roomTargets';

export interface Actor extends V2 {
  id: string;
  key: string;
  name: string;
  width: number;
  home: V2;
  move: boolean;
  flip: boolean;
  attack: number;
  timer: number;
  dead: boolean;
  posture?: 'idle' | 'work' | 'rest';
  npc?: NpcId;
  animal?: AnimalId;
  enemy?: EncounterId;
  enemyKind?: keyof typeof ENEMY_ARCHETYPES;
  guardYaw?: number;
  aimed?: Arrow;
  health: number;
  openedUntil?: number;
  recoil?: V2;
}
export function facesLeft(species: string) {
  return ['cat', 'wolf', 'highland_wolf', 'bear'].includes(species);
}
export interface Offer {
  target?: RoomTarget;
  entry?: InteractableEntry;
  label: string;
  score: number;
}
const directions = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
export function facing(dx: number, dz: number) {
  const screen = project(dx, dz);
  return directions[(Math.round(Math.atan2(screen.y * 2, screen.x) / (Math.PI / 4)) + 8) % 8]!;
}
const entries = interactableTable();

const posts = new Map<string, V2>();
function residentPost(id: NpcId, goal: Goal) {
  const cacheKey = [id, goal.anchor, goal.activity, goal.inside].join('/');
  const known = posts.get(cacheKey);
  if (known) return known;
  const post = goal.inside ? INDOOR_POSTS[goal.inside] : goal.activity === 'rest' ? RESIDENT_HOMES[id] : null;
  let target: V2 = ANCHORS[goal.anchor]!;
  if (post && 'building' in post) {
    const b = bySpec(post.building);
    const piece = FURNITURE.filter((f) => f.room.building === b && f.piece === post.piece)[
      'index' in post ? post.index : 0
    ];
    target = fromBuildingLocal(b, piece ? piece.x * 0.86 : 0, piece ? piece.z * 0.82 : 0);
  } else if (post && 'anchor' in post) target = ANCHORS[post.anchor] ?? target;
  if (target) posts.set(cacheKey, target);
  return target;
}

export class Valley {
  readonly actors: Actor[] = [];
  readonly game: Game;
  time = 0;
  bellStruckAt = -Infinity;
  walk = false;
  riding = false;
  guard = false;
  guardTime = 0;
  swimming = false;
  facing = 'south-east';
  strike = 0;
  swordSwing = false;
  stroke: SwordStroke = 'attack';
  private parried = false;
  private opponent?: Actor;
  private focusUntil = 0;
  private swingTarget?: Actor;
  hitStopRemaining = 0;
  dash?: { direction: V2; elapsed: number; origin: V2; trail: V2[] };
  private dashReady = 0;
  tiredUntil = 0;
  private queuedSwing?: { target?: V2; weapon: ItemId | null };
  readonly contacts: Contact[] = [];
  readonly gait = new Footfalls();
  private readonly locomotion = new Locomotion();
  private households = new RoomResidents();
  bow?: Draw;
  readonly arrows: Arrow[] = [];
  activity?: Activity;
  jump = 0;
  landing?: { material: string; wet: boolean };
  private jumpQueued = false;
  stamina = 100;
  private get recovery() { return wears(this.game.state, 'league_sash') ? 1.15 : 1; }

  props?: PropPhysics;
  standingLift = 0;
  private lastFootSpace = '';
  private clockElapsed = 0;
  private rising?: { x: number; z: number; since: number; room: string };
  onFieldSound: (cue: FieldSound, range?: number, pan?: number) => void = () => {};
  onMessage: (text: string) => void = () => {};
  constructor(game: Game) {
    this.game = game;
    const make = (id: string, key: string, name: string, p: V2, width: number): Actor => ({
      id,
      key,
      name,
      home: p,
      x: p.x,
      z: p.z,
      width,
      move: false,
      flip: false,
      attack: 0,
      timer: 0,
      dead: false,
      health: 100,
    });
    for (const npc of NPC_LIST) {
      const goal = resolveGoal(npc, game.state, hourOfDay(game.state.clock));
      const home = residentPost(npc.id, goal) ?? ANCHORS[npc.home]!;
      this.actors.push({ ...make(npc.id, npc.id, npc.name, home, 33), npc: npc.id,
        dead: !game.state.npcs[npc.id].available, posture: goal.activity === 'rest' ? 'rest' : goal.activity === 'work' ? 'work' : 'idle' });
    }
    for (const id of ANIMAL_IDS) {
      const def = ANIMALS.find((d) => d.id === ANIMAL_MODEL_IDS[id])!;
      // Keep encounter IDs from existing saves while dressing these hunting grounds with local wildlife.
      const species = def.species;
      const width = { cat: 16, dog: 23, boar: 32, hill_boar: 35, wolf: 29, highland_wolf: 32, deer: 39, bear: 48 }[species];
      this.actors.push({
        ...make(
          id,
          def.tame ? 'mount' : species,
          def.tame ? 'Saddled deer' : def.species === 'hill_boar' ? 'hill boar' : def.species === 'highland_wolf' ? 'highland wolf' : species,
          def.home,
          width
        ),
        animal: id,
      });
    }
    for (const spawn of ENEMY_SPAWNS) {
      const def = ENEMY_ARCHETYPES[spawn.kind];
      this.actors.push({
        ...make(spawn.id, spawn.kind, def.name, spawn, spawn.kind === 'thornback' ? 50 : 34),
        enemy: spawn.id, enemyKind: spawn.kind, guardYaw: 1.2,
        health: def.hp,
      });
    }
    this.facing = facing(Math.sin(game.state.player.yaw), Math.cos(game.state.player.yaw));
    const saved = this.player.interior,
      site = saved && sitesById.get(saved.building);
    if (saved && site && inBuilding(this.player) === site) {
      const valid = site.id !== 'archive' || this.archiveOpen;
      if (!valid) this.leaveRoom();
      else if (!roomWalkable(floorPlan(site, saved.level), saved))
        Object.assign(saved, passageLanding(floorPlan(site, saved.level)));
    } else {
      delete this.player.interior;
      this.restoreFootprint();
    }
    this.updateFooting();
    for (const record of Object.values(game.state.hunting)) {
      if (record) record.position.y = supportHeight(record.position);
    }
  }
  enableProps(physics: PropPhysics) {
    this.props = physics;
    this.lastFootSpace = '';
    this.updateFooting();
  }
  private get localFloor() {
    const r = this.room;
    return r ? roomLift(r, this.position) / roomRisePixels : supportHeight(this.position);
  }
  get hop() {
    return this.jump ? Math.sin((Math.PI * this.jump) / JUMP_TIME) * 1.45 : 0;
  }
  requestJump() {
    if (this.swimming || this.bow || this.dash || this.player.health <= 0) return;
    if (this.jump) {
      if (this.jump <= 0.08) this.jumpQueued = true;
      return;
    }
    this.cancelPose();
    this.jump = JUMP_TIME;
  }
  grabProp(id?: string) {
    if (!this.props || this.riding || this.swimming || this.player.health <= 0 || this.bow || this.jump)
      return false;
    const v = this.props.nearby(id);
    if (!v) return false;
    this.cancelPose();
    const a = this.position,
      dx = v.x - a.x,
      dz = v.z - a.z;
    if (Math.hypot(dx, dz) > 0.01) {
      this.player.yaw = Math.atan2(dx, dz);
      this.facing = facing(dx, dz);
    }
    return this.props.grab(v.spec.id);
  }
  private contactSurface(at: V2) {
    const room = this.room;
    if (this.props) {
      const base = room ? roomLift(room, at) / roomRisePixels : supportHeight(at);
      const support = this.props.supportAt(at, base, base + this.standingLift, 0);
      if (support && support.height > base + 0.1) return { material: support.material, wet: false };
    }
    if (room) return { material: room.stone ? 'stone' : 'wood', wet: false };
    if (onBridge(at)) return { material: 'wood', wet: false };
    const water = wetPoint(at.x, at.z);
    return water ? { material: water.kind, wet: true } : { material: groundAt(at.x, at.z), wet: false };
  }
  private readonly footMaterial = (at: V2) => this.contactSurface(at).material;
  private updateFooting() {
    const plan = this.room,
      inside = this.player.interior;
    const base = this.localFloor,
      space = this.roomKey || 'vale';
    if (space !== this.lastFootSpace) {
      this.standingLift = 0;
      this.lastFootSpace = space;
      this.props?.sync(plan, this.position, base, this.player.yaw);
    }
    this.standingLift = this.props
      ? Math.max(0, this.props.supporting(this.position, base, base + this.standingLift, this.hop) - base)
      : 0;
    this.player.y =
      this.standingLift +
      (plan && inside
        ? terrainHeight(plan.site.x, plan.site.z) +
          footingHeight +
          floorElevation[plan.level] +
          roomLift(plan, inside) / roomRisePixels
        : supportHeight(this.player));
  }
  get player() {
    return this.game.state.player;
  }
  get position(): V2 {
    return this.player.interior ?? this.player;
  }
  get room() {
    const inside = this.player.interior;
    if (!inside) return undefined;
    const plan = floorPlan(sitesById.get(inside.building)!, inside.level);
    return this.props ? staticRoom(plan) : plan;
  }
  openChest?: string;
  get skyHour() {
    return hourOfDay(this.game.state.clock + this.clockElapsed * CLOCK_RATE);
  }
  get combatTarget() {
    if (!this.room && this.player.health > 0 && this.focusUntil > this.time && this.opponent && distance(this.opponent, this.player) < 22) return this.opponent;
  }
  private focusEnemy(enemy: Actor, duration = 2) {
    this.opponent = enemy;
    this.focusUntil = this.time + duration;
  }
  get roomKey() {
    const r = this.player.interior;
    return r ? r.building + '/' + r.level : '';
  }
  get lightsOn() {
    return this.game.state.facts['room_dim:' + this.roomKey] !== true;
  }
  get roomResidents() { return this.households.view(this.room, this.actors); }
  targets() {
    const room = this.room;
    const targets = room
      ? indoorTargets(room, this.actors, this.roomResidents)
      : [...outsideTargets(this.game.state), ...fieldTargets(this.game.state, this.actors)];
    return this.props
      ? [...targets.filter((t) => t.field !== 'seat'), ...physicalTargets(this.props, this.position, room)]
      : targets;
  }
  private outdoorPassable(a: V2, b: V2, lift = 0) {
    return navigable(a, b, this.game.state, lift) && (!this.props || passesTrunks(a, b));
  }
  canWalk(a: V2, b: V2) {
    const room = this.room;
    const passable = room ? roomCanMove(room, a, b) : this.outdoorPassable(a, b);
    return passable && (!this.props || this.props.routeClear(a, b));
  }
  private restoreFootprint() {
    const site = inBuilding(this.player);
    if (!site) return;
    this.locomotion.reset();
    const front = frontDoor(site);
    const door = doorOpen(front, this.game.state) ? front : doorsById.get(site.id + '/shutter');
    if (door && doorOpen(door, this.game.state)) this.enterDoor(door);
    else {
      const p = outsideReturn(front);
      this.game.setPlayerTransform(p.x, supportHeight(p), p.z, this.player.yaw);
    }
  }
  enterDoor(door: Doorway) {
    if (this.room || !doorOpen(door, this.game.state)) return false;
    const site = door.site,
      inside = fromBuildingLocal(site, 0, 0);
    this.game.setPlayerTransform(inside.x, 0, inside.z, this.player.yaw);
    this.player.interior = {
      building: site.id,
      level: 'ground',
      ...passageLanding(floorPlan(site, 'ground')),
      rear: door.rear,
    };
    this.openChest = undefined;
    this.riding = false;
    this.swimming = false;
    this.jump = 0;
    this.strike = 0;
    this.swingTarget = undefined;
    this.opponent = undefined;
    for (const actor of this.actors) actor.openedUntil = undefined;
    this.contacts.length = 0;
    this.walk = false;
    this.locomotion.reset();
    this.cancelPose();
    this.arrows.length = 0;
    this.updateFooting();
    return true;
  }
  leaveRoom() {
    const inside = this.player.interior;
    if (!inside) return;
    this.cancelPose();
    const site = sitesById.get(inside.building)!;
    const door = inside.rear ? (doorsById.get(site.id + '/shutter') ?? frontDoor(site)) : frontDoor(site);
    const p = outsideReturn(door);
    this.game.setPlayerTransform(p.x, supportHeight(p), p.z, site.yaw + (door.rear ? Math.PI : 0));
    this.facing = facing(Math.sin(this.player.yaw), Math.cos(this.player.yaw));
    this.walk = false;
    this.locomotion.reset();
    this.updateFooting();
  }
  changeFloor(level: InteriorLevel) {
    const inside = this.player.interior;
    if (!inside) return;
    this.cancelPose();
    const plan = floorPlan(sitesById.get(inside.building)!, level);
    Object.assign(inside, passageLanding(plan, inside.level), { level });
    this.updateFooting();
    this.walk = false;
    this.locomotion.reset();
  }
  usePassage(p: Passage) {
    if (p.kind === 'outside') this.leaveRoom();
    else if (p.target) this.changeFloor(p.target);
  }
  private stepInside(dt: number, dx: number, dz: number, run: boolean, walkThrough: boolean, pace: number) {
    const plan = this.room!,
      p = this.player.interior!,
      length = Math.hypot(dx, dz);
    this.walk = false;
    this.swimming = false;
    if (this.activity || this.bow || this.player.health <= 0) {
      this.locomotion.reset();
      this.stamina = Math.min(100, this.stamina + dt * 5 * this.recovery);
      return;
    }
    const before = { x: p.x, z: p.z },
      flight = stairAt(plan, before),
      speed = this.props?.grip?.drag ? 2.65 : run && this.stamina > 1 ? 8.2 : this.guard ? 2.4 : 5.4,
      direct = !!(flight || this.props?.grip || this.standingLift || this.guard),
      motion = this.locomotion.advance(dx, dz, dt, speed * pace, walkThrough, direct);
    this.stamina = Math.max(0, Math.min(100, this.stamina + dt * (length && run ? -5 : 5 * this.recovery)));
    if (!motion) return;
    const stride = walkThrough ? motion.stride : Math.min(motion.stride, length);
    const next = { x: p.x + motion.x * stride, z: p.z + motion.z * stride };
    if (flight && stairDepth(flight, next) >= stairRun)
      next.z = flight.passage.z + flight.direction * (stairRun - 0.01);
    if (roomCanMove(plan, p, next)) {
      p.x = next.x;
      p.z = next.z;
    } else {
      if (roomCanMove(plan, p, { x: next.x, z: p.z })) p.x = next.x;
      if (roomCanMove(plan, p, { x: p.x, z: next.z })) p.z = next.z;
    }
    if (this.props) {
      const push = length && walkThrough && !this.jump ? dt : 0;
      Object.assign(
        p,
        this.props.move(before, p, this.localFloor + this.standingLift + this.hop, push)
      );
    }
    if (length) {
      this.facing = facing(dx, dz);
      this.player.yaw = Math.atan2(dx, dz);
    }
    this.walk = distance(before, p) > 0.0001;
    if (!this.walk) this.locomotion.reset();
    if (
      flight &&
      stairAt(plan, p) === flight &&
      (p.z - before.z) * flight.direction > 0 &&
      stairDepth(flight, p) >= stairRun - 0.22
    ) {
      this.usePassage(flight.passage);
      return;
    }
    const door = plan.passages.find((link) => link.kind === 'outside');
    if (walkThrough && door && Math.abs(p.x - door.x) <= 1.13 && before.z < door.z && p.z >= door.z)
      this.usePassage(door);
  }
  get mount() {
    return this.actors.find((a) => a.animal === 'deer-mount')!;
  }
  get archiveOpen() {
    return (
      this.game.state.locationChanges.archive_door === 'open' ||
      this.game.state.locationChanges.archive_shutter === 'forced'
    );
  }
  action(command: Command) {
    if (command.t === 'hitAnimal') {
      const p = command.hit.position;
      command = { ...command, hit: { ...command.hit, position: { ...p, y: supportHeight(p) } } };
    }
    const r = this.game.dispatch(command);
    if (!r.ok) this.onMessage(r.reason.replaceAll('_', ' ').replaceAll(':', ' · '));
    return r.ok;
  }
  private withinMeleeHeight(enemy: Actor) {
    const p = this.player;
    const from = supportHeight(p) + this.standingLift + this.hop, to = supportHeight(enemy);
    if (Math.abs(from - to) > 2.25) return false;
    for (const t of [0.33, 0.67]) {
      const x = p.x + (enemy.x - p.x) * t, z = p.z + (enemy.z - p.z) * t;
      if (inBuilding({ x, z }) || terrainHeight(x, z) > from + (to - from) * t + 1.5) return false;
    }
    return true;
  }
  private stepActor(a: Actor, target: V2, speed: number, dt: number) {
    const dist = distance(a, target);
    if (dist < 0.18) return;
    const amount = Math.min(dist, speed * dt),
      dx = (target.x - a.x) / dist,
      dz = (target.z - a.z) / dist;
    const next = { x: a.x + dx * amount, z: a.z + dz * amount };
    if (!navigable(a, next, true) || (!a.npc && inBuilding(next) && !inBuilding(a))) return;
    a.x = next.x;
    a.z = next.z;
    a.move = true;
    const side = dx - dz;
    if (Math.abs(side) > 0.045) a.flip = (side < 0) !== facesLeft(a.key);
  }
  /** Sweep short segments through the same doors, terrain, trees and physical props as a traveller. */
  private displace(body: V2, direction: V2, metres: number) {
    const pieces = Math.ceil(metres / 0.18);
    for (let i = 0; i < pieces; i++) {
      const next = { x: body.x + direction.x * metres / pieces, z: body.z + direction.z * metres / pieces };
      if (inBuilding(next) || !this.canWalk(body, next)) break;
      Object.assign(body, next);
    }
  }
  requestDash(dx = 0, dz = 0) {
    if (this.dash || this.room || this.riding || this.swimming || this.jump || this.props?.grip ||
        this.player.health <= 0 || this.time < this.dashReady || this.strike > SWING_TIME - SWING_CONTACT) return false;
    if (this.stamina < ACTION_COST.dodge) {
      this.tiredUntil = this.time + 0.45;
      return false;
    }
    const target = this.combatTarget;
    const direction = dx || dz ? unit(dx, dz) : target && !target.dead
      ? unit(this.player.x - target.x, this.player.z - target.z)
      : { x: Math.sin(this.player.yaw), z: Math.cos(this.player.yaw) };
    this.cancelPose();
    this.strike = 0;
    this.swingTarget = undefined;
    this.guard = false;
    this.guardTime = 0;
    this.locomotion.reset();
    this.player.yaw = Math.atan2(direction.x, direction.z);
    this.facing = facing(direction.x, direction.z);
    const origin = { x: this.player.x, z: this.player.z };
    this.dash = { direction, elapsed: 0, origin, trail: [origin] };
    this.dashReady = this.time + SIDESTEP.cooldown;
    this.stamina -= ACTION_COST.dodge;
    this.onFieldSound('sidestep');
    return true;
  }
  get parryWindow() {
    return PARRY_WINDOW + (wears(this.game.state, 'witness_cord') ? 0.04 : 0);
  }
  get bowFocus() {
    return this.bow?.phase === 'hold' ? Math.min(1, (this.bow.elapsed + 1e-9) / (FOCUS_TIME * (wears(this.game.state, 'witness_cord') ? 0.82 : 1))) : 0;
  }
  step(dt: number, dx: number, dz: number, run: boolean, walkThrough = true, pace = 1) {
    run = run && pace > 0.55;
    this.time += dt;
    if ((run && (dx || dz) && this.stamina <= 1) || (this.guard && this.stamina < 1)) this.tiredUntil = this.time + 0.45;
    this.clockElapsed += dt;
    this.game.addPlaySeconds(dt);
    if (this.clockElapsed >= 1) {
      this.game.tickClock(this.clockElapsed * CLOCK_RATE);
      this.clockElapsed = 0;
    }
    this.landing = undefined;
    for (let i = this.contacts.length - 1; i >= 0; i--) {
      const hit = this.contacts[i]!;
      if (this.time - hit.born >= (hit.defeated ? DEFEAT_TIME : DAMAGE_LABEL_TIME)) this.contacts.splice(i, 1);
    }
    if (this.hitStopRemaining > 0 && dt > 0) {
      const hold = Math.min(dt, this.hitStopRemaining);
      this.hitStopRemaining -= hold;
      this.dashReady += hold;
      if (this.opponent && this.focusUntil > this.time - dt) this.focusUntil += hold;
      for (const a of this.actors) if (a.openedUntil && a.openedUntil > this.time - dt) a.openedUntil += hold;
      dt -= hold;
      if (dt <= 0.0000001) return;
    }
    // Guard can take over once the committed blow has landed.
    if (this.guard && this.strike && this.strike <= SWING_BUFFER && !this.guardTime) {
      this.strike = 0;
      this.queuedSwing = undefined;
    }
    const previousStrike = this.strike;
    this.guardTime = this.guard ? this.guardTime + dt : 0;
    if (!this.guard) this.parried = false;
    this.strike = Math.max(0, this.strike - dt);
    // Leave one presented ground contact between jumps, including its sound and foot impressions.
    if (this.jumpQueued && !this.jump) {
      this.jumpQueued = false;
      if (!this.strike && !this.activity && !this.guard && !this.riding && !this.props?.grip)
        this.requestJump();
    }
    const previousJump = this.jump;
    this.jump = Math.max(0, this.jump - dt);
    const p = this.player;
    if (!this.player.interior && inBuilding(p)) this.restoreFootprint();
    if (this.player.health <= 0) this.cancelPose();
    if (this.activity && (dx || dz || this.activity.room !== this.roomKey || this.guard)) this.releaseActivity();
    if (this.bow && (this.game.state.equippedWeapon !== 'hunting_bow' || this.guard)) this.bow = undefined;
    const dodge = this.dash;
    const dashStart = dodge?.elapsed ?? 0;
    const from = { x: this.position.x, z: this.position.z },
      fromRoom = this.roomKey;
    if (this.room) this.stepInside(dt, dx, dz, run, walkThrough, pace);
    else {
      const water = onBridge(p) ? null : wetPoint(p.x, p.z);
      // Drag and current act only during the grounded part of this step.
      const grounded = dt > 0 ? Math.max(0, dt - previousJump) / dt : Number(previousJump === 0);
      const wade = water?.kind === 'river' ? grounded * Math.min(1, water.bank / 1.9) : 0;
      const norm = Math.hypot(dx, dz);
      this.walk = false;
      const canMove = p.health > 0 && this.strike <= SWING_TIME - SWING_CONTACT && !dodge && !this.activity;
      if (!canMove) this.locomotion.reset();
      if (dodge) {
        this.guard = false;
        dodge.elapsed = Math.min(SIDESTEP.duration, dashStart + dt);
        this.displace(p, dodge.direction, sidestepDistance(dodge.elapsed) - sidestepDistance(dashStart));
        if (dodge.trail.length < 3 && dodge.elapsed >= dodge.trail.length * 0.05)
          dodge.trail.push({ x: p.x, z: p.z });
        if (dodge.elapsed >= SIDESTEP.duration) this.dash = undefined;
      }
      if (this.swordSwing && previousStrike && !this.riding && !this.props?.grip) {
        const into = (remaining: number) => Math.max(0, Math.min(1, (SWING_TIME - remaining - SWING_RELEASE) / (SWING_CONTACT - SWING_RELEASE)));
        const travel = (into(this.strike) - into(previousStrike)) * (this.stroke === 'thrust' ? 0.55 : 0.38);
        const clearance = this.swingTarget ? Math.max(0, distance(p, this.swingTarget) - 1.05) : travel;
        if (travel > 0) this.displace(p, { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }, Math.min(clearance, travel));
      }
      const fast = run && !this.bow && !this.props?.grip && this.stamina > 1 && !this.swimming && !this.guard;
      const speed = this.bow ? 1.75 : this.props?.grip?.drag
        ? 2.6
        : this.riding
          ? fast
            ? 14
            : 9
          : this.swimming
            ? 3
            : this.guard
              ? 2
              : fast
                ? 9
                : 5;
      const direct = !!(
        this.props?.grip || this.standingLift || this.riding || this.swimming || this.guard
      );
      const motion = canMove ? this.locomotion.advance(dx, dz, dt, speed * pace, walkThrough, direct) : undefined;
      if (motion) {
        if (norm && !previousStrike && !this.bow) this.facing = facing(dx, dz);
        const stride = Math.min(
          walkThrough ? Infinity : norm,
          motion.stride * (1 - wade * 0.27) * travelScale(p.x, p.z, motion.x, motion.z)
        );
        const x = p.x + motion.x * stride,
          z = p.z + motion.z * stride;
        const start = { x: p.x, z: p.z };
        if (this.outdoorPassable(p, { x, z }, this.hop)) {
          p.x = x;
          p.z = z;
        } else {
          if (this.outdoorPassable(p, { x, z: p.z }, this.hop)) p.x = x;
          if (this.outdoorPassable(p, { x: p.x, z }, this.hop)) p.z = z;
        }
        if (this.props) {
          const push = norm && walkThrough && !this.jump && !this.riding && !this.swimming ? dt : 0;
          Object.assign(p, this.props.move(start, p, this.localFloor + this.standingLift + this.hop, push));
        }
        this.walk = distance(start, p) > 0.0001;
        if (!this.walk) this.locomotion.reset();
        const entered = inBuilding(p);
        if (entered) {
          const door = crossedDoor(start, p, entered);
          if (door) this.enterDoor(door);
        }
        if (norm && !previousStrike && !this.bow) p.yaw = Math.atan2(dx, dz);
      }
      if (norm && canMove) {
        this.stamina = Math.max(0, Math.min(100, this.stamina + dt * (fast ? -7 : 5 * this.recovery)));
      } else if (!dodge) this.stamina = Math.min(100, this.stamina + dt * 10 * this.recovery);
      if (!this.room && wade && water && !this.jump && p.health > 0 && !onBridge(p)) {
        const v = riverVelocity(water, worldView(this.game.state).flow),
          pull = dt * wade * (this.guard ? 0.06 : 0.24);
        const next = { x: p.x + v.x * pull, z: p.z + v.z * pull };
        if (!onBridge(next) && this.outdoorPassable(p, next)) {
          Object.assign(p, this.props?.move(p, next, this.localFloor + this.standingLift) ?? next);
        }
      }
      this.swimming = !this.room && !this.jump && waterAt(p.x, p.z) === 'sea' && !onBridge(p);
      if (this.swimming) this.riding = false;
    }
    this.updateFooting();
    const room = this.room;
    const landed = previousJump > 0 && !this.jump && fromRoom === this.roomKey && p.health > 0;
    let groundedTime = dt;
    if (landed) {
      const fraction = previousJump / dt;
      from.x += (this.position.x - from.x) * fraction;
      from.z += (this.position.z - from.z) * fraction;
      groundedTime -= previousJump;
      this.landing = this.contactSurface(from);
      if (!room && !this.riding)
        this.gait.land(from, p.yaw, this.time - groundedTime, this.landing.material);
    }
    this.gait.advance(
      from,
      this.position,
      groundedTime,
      this.time,
      this.walk && !this.jump && p.health > 0 && fromRoom === this.roomKey,
      this.footMaterial,
      this.riding,
      this.swimming
    );
    if (!room && p.health > 0) this.stepSwing(previousStrike);
    if (this.props) {
      if (this.riding || this.swimming || p.health <= 0) this.props.release();
      this.props.tick(
        dt,
        this.room,
        this.position,
        this.localFloor + this.standingLift + this.hop,
        p.yaw,
        worldView(this.game.state).flow
      );
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      if (this.advanceArrow(this.arrows[i]!, dt)) this.arrows.splice(i, 1);
    }
    this.stepBow(dt);
    if (this.activity) {
      const a = this.activity;
      if (targetDistance(a.target, this.position, this.room) > a.target.reach || this.player.health <= 0)
        this.releaseActivity();
      else {
        a.elapsed += dt;
        if (a.kind === 'sit') this.stamina = Math.min(100, this.stamina + dt * 12);
        if (a.finish && a.elapsed >= a.contact) {
          const finish = a.finish;
          a.finish = undefined;
          finish();
        }
        if (a.elapsed >= a.duration) this.activity = undefined;
      }
    }
    for (const [id, loc] of placeList)
      if (!this.game.state.discovered[id] && distance(p, loc) < loc.r)
        this.game.dispatch({ t: 'discover', place: id });
    for (const [i, a] of this.actors.entries()) {
      a.move = false;
      const previousAttack = a.attack;
      a.attack = Math.max(0, a.attack - dt);
      a.timer = Math.max(0, a.timer - dt);
      if (a.npc) {
        a.dead = !this.game.state.npcs[a.npc].available;
        if (a.dead) continue;
        const def = NPC_LIST.find((d) => d.id === a.npc)!;
        const goal = resolveGoal(def, this.game.state, hourOfDay(this.game.state.clock));
        const pos = residentPost(a.npc, goal) ?? a.home;
        a.posture = goal.activity === 'rest' ? 'rest' : goal.activity === 'work' ? 'work' : 'idle';
        const currentRoom = inBuilding(a),
          targetRoom = inBuilding(pos);
        let step = pos;
        if (currentRoom !== targetRoom) {
          const b = currentRoom ?? targetRoom;
          if (b) {
            const door = buildingEntry(b);
            const outside = fromBuildingLocal(b, door.x, door.z + 0.45),
              inside = fromBuildingLocal(b, door.x, door.z - 0.45);
            step = currentRoom
              ? distance(a, inside) < 0.6
                ? outside
                : inside
              : distance(a, outside) < 0.6
                ? inside
                : outside;
          }
        }
        this.stepActor(a, step, 1.7, dt);
      } else if (a.animal) {
        const record = this.game.state.hunting[a.animal];
        a.dead = record?.status === 'dead' || record?.status === 'skinned';
        if (a.dead && record) {
          a.x = record.position.x;
          a.z = record.position.z;
          continue;
        }
        if (this.activity?.kind === 'pet' && this.activity.target.animal === a) {
          a.flip = project(p.x - a.x, p.z - a.z).x < 0 !== facesLeft(a.key);
          continue;
        }
        if (a === this.mount) {
          if (this.riding) {
            a.x = p.x;
            a.z = p.z;
            a.move = this.walk;
            const side = Math.sin(p.yaw) - Math.cos(p.yaw);
            if (a.move && Math.abs(side) > 0.05) a.flip = (side < 0) !== facesLeft(a.key);
          }
          continue;
        }
        const def = ANIMALS.find((d) => d.id === ANIMAL_MODEL_IDS[a.animal!])!;
        if (def.seated) continue;
        const near = this.room ? Infinity : distance(a, p),
          phase = this.time * 0.13 + i;
        if (isHuntableAnimalId(a.animal) && near < 6 && near > 0.05)
          this.stepActor(
            a,
            { x: a.x + ((a.x - p.x) / near) * 3, z: a.z + ((a.z - p.z) / near) * 3 },
            def.run * 2,
            dt
          );
        else if (Math.sin(phase * 0.7) > -0.25)
          this.stepActor(
            a,
            {
              x: a.home.x + Math.cos(phase) * def.roam * 0.44,
              z: a.home.z + Math.sin(phase * 0.81) * def.roam * 0.44,
            },
            def.walk * 2,
            dt
          );
      } else if (a.enemy) {
        a.dead = !!this.game.state.defeated[a.enemy];
        if (a.recoil) {
          const speed = Math.hypot(a.recoil.x, a.recoil.z);
          const decay = Math.exp(-dt * 13);
          this.displace(a, unit(a.recoil.x, a.recoil.z), speed * (1 - decay) / 13);
          a.recoil.x *= decay;
          a.recoil.z *= decay;
          if (speed * decay < 0.12) a.recoil = undefined;
        }
        if (a.dead) continue;
        const spawn = ENEMY_SPAWNS.find((e) => e.id === a.enemy)!;
        const def = ENEMY_ARCHETYPES[spawn.kind],
          near = this.room ? Infinity : distance(a, p);
        if (near < def.notice * 1.6 && distance(a, a.home) < spawn.leash + 6 && p.health > 0) {
          const current = this.combatTarget;
          const preferred = !current || current === a || (!current.dead && (current.openedUntil ?? 0) <= this.time && distance(current, p) > near + 3);
          if (near < 10 && preferred)
            this.focusEnemy(a);
          if (near < 1.05 && !dodge) {
            const away = near > 0.001 ? unit(a.x - p.x, a.z - p.z) : { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
            this.displace(a, away, (1.05 - near) * (1 - Math.exp(-dt * 22)));
          }
          if ((a.openedUntil ?? 0) > this.time) continue;
          if (spawn.kind === 'skirmisher') {
            if (a.aimed && previousAttack > 0 && a.attack <= 0) {
              this.arrows.push(a.aimed);
              a.aimed = undefined;
              a.openedUntil = this.time + 0.7;
              this.fieldSoundAt('bow_release', a);
            } else if (!a.aimed && !a.attack) {
              if (near < 5.5 && a.timer > 0.65) this.stepActor(a, { x: a.x * 2 - p.x, z: a.z * 2 - p.z }, def.speed, dt);
              else if (near > def.reach) this.stepActor(a, p, def.speed, dt);
              else if (!a.timer && near > 0.1) {
                const aim: Arrow = { x: a.x, z: a.z, owner: a.enemy, travelled: 0, launchHeight: supportHeight(a),
                  grade: (supportHeight(p) - supportHeight(a) - 0.65) / near, direction: unit(p.x - a.x,p.z - a.z) };
                if (!this.traceArrow(aim, near).blocked) {
                  a.aimed = aim; a.attack = def.wind; a.timer = def.wind + def.recover;
                  a.flip = project(p.x-a.x,p.z-a.z).x < 0;
                  if (preferred) this.focusEnemy(a);
                  this.fieldSoundAt('bow_draw', a); this.fieldSoundAt('enemy_windup', a);
                }
              }
            }
            continue;
          }
          if (spawn.kind === 'deserter' && !a.attack) {
            const wanted = Math.atan2(p.x - a.x, p.z - a.z), yaw = a.guardYaw ?? wanted;
            const turn = Math.atan2(Math.sin(wanted-yaw), Math.cos(wanted-yaw));
            a.guardYaw = yaw + Math.sign(turn) * Math.min(Math.abs(turn), dt * 2.05);
            a.flip = project(Math.sin(a.guardYaw), Math.cos(a.guardYaw)).x < 0;
          }
          if (near > def.reach && !a.attack) this.stepActor(a, p, def.speed, dt);
          else if (!a.timer && near <= def.reach && this.withinMeleeHeight(a)) {
            a.attack = ENEMY_SWING_TIME;
            a.flip = project(p.x - a.x, p.z - a.z).x < 0 !== facesLeft(a.key);
            a.timer = def.wind + def.recover + 0.6;
            if (preferred) this.focusEnemy(a);
            this.fieldSoundAt('enemy_windup', a);
          }
          const contact = enemyContactRemaining(def.heavy);
          if (previousAttack > contact && a.attack <= contact && near < def.reach + 0.5 && this.withinMeleeHeight(a)) {
            if (dodge && dashStart + previousAttack - contact < SIDESTEP.invulnerable) continue;
            // Resolve guard age at contact even when a slower display overshoots the strike frame.
            const guardAge = this.guardTime - (contact - a.attack);
            const parry = this.guard && !this.parried && !previousStrike && !this.jump && !this.props?.grip &&
              !this.riding && !this.swimming && this.game.state.equippedWeapon === 'rusted_sword' &&
              this.stamina >= 1 && guardAge >= 0 && guardAge <= this.parryWindow + 1e-9;
            this.cancelPose();
            if (parry) {
              this.parried = true;
              a.attack = 0;
              a.openedUntil = this.time + COUNTER_WINDOW;
              a.timer = Math.max(a.timer, COUNTER_WINDOW + 0.2);
              this.facing = facing(a.x - p.x, a.z - p.z);
              p.yaw = Math.atan2(a.x - p.x, a.z - p.z);
              this.focusEnemy(a);
              this.repel(a, p, 4.8);
              this.hitStopRemaining = Math.max(this.hitStopRemaining, IMPACT_PAUSE.parry);
              this.fieldSoundAt('parry', a);
              this.contactAt(p, a, 'parry', { actorId: a.id });
              continue;
            }
            const cost = ACTION_COST.blockHit * (def.heavy ? GUARD.heavyCost : 1) *
              (this.game.state.skills.includes('steady_guard') ? GUARD.steadyGuard : 1);
            const blocked = this.guard && this.stamina >= cost * GUARD.tiredBelow;
            if (this.guard) {
              this.stamina = Math.max(0, this.stamina - cost);
              if (!blocked) this.tiredUntil = this.time + 0.45;
            }
            const damage = blocked ? Math.ceil(def.damage * 0.18) : def.damage;
            this.action({ t: 'damagePlayer', amount: damage });
            this.hitStopRemaining = Math.max(this.hitStopRemaining, def.heavy ? IMPACT_PAUSE.heavy : IMPACT_PAUSE.regular);
            this.fieldSoundAt(blocked ? 'block' : 'player_hit', a);
            this.contactAt(p, a, blocked ? 'guard' : 'body', {
              damage, actorId: 'player',
              heavy: def.heavy,
            });
            this.onMessage(blocked ? 'Blow guarded' : a.name + ' struck you');
          }
        } else {
          a.aimed = undefined;
          this.stepActor(a, a.home, def.speed * 0.65, dt);
        }
      }
    }
    this.households.view(this.room, this.actors, dt);
    if (previousStrike && !this.strike && this.queuedSwing) {
      const { target, weapon } = this.queuedSwing;
      this.queuedSwing = undefined;
      if (weapon === this.game.state.equippedWeapon && !this.props?.grip) this.startAttack(target, undefined, followingStroke(this.stroke));
    }
  }
  private releaseActivity() {
    if (this.activity && this.activity.room === this.roomKey) {
      const at = this.displayPosition, p = this.position;
      this.rising = { x: at.x - p.x, z: at.z - p.z, since: this.time, room: this.roomKey };
    }
    this.activity = undefined;
  }
  cancelPose() {
    this.jumpQueued = false;
    this.releaseActivity();
    this.bow = undefined;
    this.queuedSwing = undefined;
  }
  perform(kind: Gesture, target: RoomTarget, duration: number, finish?: () => void, contact?: number) {
    if (
      this.activity ||
      this.bow ||
      this.strike ||
      this.jump ||
      this.swimming ||
      this.riding ||
      this.player.health <= 0 ||
      targetDistance(target, this.position, this.room) > target.reach
    )
      return false;
    this.props?.release();
    this.walk = false;
    const p = this.position;
    if (kind === 'sit') this.facing = target.fixture?.key === 'furniture_chair' ? 'south-west' : 'south-east';
    else this.facing = facing(target.at.x - p.x, target.at.z - p.z);
    this.activity = {
      kind,
      target,
      duration,
      elapsed: 0,
      contact: contact ?? (kind === 'gather' ? duration * 0.55 : duration),
      room: this.roomKey,
      finish,
    };
    return true;
  }
  get displayPosition(): V2 {
    const a = this.activity,
      p = this.position;
    if (!a) {
      const rest = this.rising;
      if (!rest || rest.room !== this.roomKey) return p;
      const age = Math.min(1, (this.time - rest.since) / 0.36);
      if (age >= 1) return p;
      const blend = 1 - age * age * (3 - 2 * age);
      return { x: p.x + rest.x * blend, z: p.z + rest.z * blend };
    }
    const toward = unit(p.x - a.target.at.x, p.z - a.target.at.z);
    const reach = a.kind === 'sit' ? 0 : a.kind === 'gather' ? 0.9 : a.kind === 'stir' ? 1.85 : 1.5;
    const at = { x: a.target.at.x + toward.x * reach, z: a.target.at.z + toward.z * reach };
    if (a.kind === 'sit') {
      at.x += 0.27;
      at.z += 0.2;
    }
    const span = a.kind === 'sit' ? 0.38 : 0.24;
    const t = Math.max(0, Math.min(1, a.elapsed / span, (a.duration - a.elapsed) / span));
    const reachScale = a.kind === 'sit' ? 1 : Math.min(1, 0.62 / Math.max(0.001, distance(p, at)));
    const blend = t * t * (3 - 2 * t) * reachScale;
    return { x: p.x + (at.x - p.x) * blend, z: p.z + (at.z - p.z) * blend };
  }
  interactField(target: RoomTarget) {
    if (target.field === 'bell') {
      this.perform('work', target, 0.95, () => {
        this.bellStruckAt = this.time;
        this.fieldSoundAt('village_bell', target.at);
        this.onMessage('The bronze bell rings across the square.');
      }, 0.32);
    } else if (target.field === 'well') {
      this.perform('work', target, 1.5, () => {
        const water = worldView(this.game.state).rationing;
        this.fieldSoundAt(water === 'severe' ? 'bucket_dry' : 'bucket_water', target.at);
        if (water !== 'severe') this.stamina = Math.min(100, this.stamina + (water === 'eased' ? 35 : 15));
        this.onMessage(water === 'severe' ? 'The bucket scrapes the bottom. Only a few drops.'
          : water === 'eased' ? 'The bucket comes up full. You take a long drink.'
            : 'A little water gathers in the bucket. You take a sip.');
      }, 1.06);
    } else if (target.field === 'pet') {
      const a = target.animal!;
      this.perform('pet', target, 1.45, () =>
        this.onMessage(a.key === 'dog' ? 'The dog wags its tail.' : 'The cat leans into your hand.')
      );
    } else if (target.field === 'seat' || target.fixture?.use === 'seat')
      this.perform('sit', target, Infinity);
    else if (target.field === 'gather') {
      const p = target.pickup!;
      this.perform('gather', target, 0.97, () => {
        if (!this.action({ t: 'pickup', pickupId: p.id, item: p.item, qty: p.qty })) return;
        this.onMessage(S(ITEMS[p.item].nameKey) + ' × ' + p.qty);
        const slots = this.game.state.quickSlots,
          slot = slots.indexOf(null);
        if (slot >= 0 && itemAction(p.item) && !slots.includes(p.item))
          this.action({ t: 'assignQuickSlot', slot, item: p.item });
      });
    } else if (target.field === 'dress') {
      const id = target.animal!.animal!,
        record = this.game.state.hunting[id];
      if (record?.status !== 'dead' || !withinSkinningReach(this.player, record.position)) return;
      if (!this.game.state.inventory.skinning_knife) {
        this.onMessage('You need a skinning knife.');
        return;
      }
      this.perform('dress', target, skinningSeconds(this.game.state.huntTally), () => {
        if (this.action({ t: 'skinAnimal', id })) {
          this.onFieldSound('skinning_complete');
          this.onMessage('Collected hide and raw meat');
        }
      });
    }
  }
  get skinningActive() {
    return this.activity?.kind === 'dress';
  }
  aimDirection(dx: number, dz: number, head?: string) {
    if (!this.bow || this.bow.phase === 'loose' || Math.hypot(dx, dz) < 0.001) return;
    this.bow.direction = unit(dx, dz);
    const from = this.player,
      range = Math.hypot(dx, dz),
      look = range < 1.5 ? 10 : range;
    const end = { x: from.x + this.bow.direction.x * look, z: from.z + this.bow.direction.z * look };
    this.bow.grade = (supportHeight(end) - supportHeight(from)) / look;
    this.bow.aimDistance = Math.min(ARROW_RANGE, look);
    this.bow.head = head;
    this.facing = facing(dx, dz);
    this.player.yaw = Math.atan2(dx, dz);
  }
  startAttack(target?: V2, head?: string, followup: SwordStroke = 'attack') {
    if (this.props?.grip) {
      this.props.release(true, target);
      return;
    }
    if (
      this.room ||
      this.dash ||
      this.bow ||
      this.activity ||
      this.jump ||
      this.swimming ||
      this.player.health <= 0
    )
      return;
    const p = this.player;
    const weapon = this.game.state.equippedWeapon;
    if (this.strike) {
      if (weapon !== 'hunting_bow' && this.strike <= SWING_BUFFER)
        this.queuedSwing = { target: target && { x: target.x, z: target.z }, weapon };
      return;
    }
    if (weapon !== 'hunting_bow') {
      this.strike = SWING_TIME;
      this.swordSwing = weapon === 'rusted_sword';
      const priority = (a: Actor) => !target && this.swordSwing && (a.openedUntil ?? 0) > this.time ? -4 : 0;
      const hit = this.actors
        .filter((a) => a.enemy && !a.dead && distance(a, p) < 3.3 && !inBuilding(a) && this.withinMeleeHeight(a))
        .sort((a, b) => priority(a) - priority(b) + distance(a, target ?? p) - distance(b, target ?? p))[0];
      this.stroke = this.swordSwing && hit && (hit.openedUntil ?? 0) > this.time
        ? 'counter' : this.swordSwing ? followup : 'attack';
      if (hit) {
        if (this.stroke === 'counter') hit.openedUntil = undefined;
        this.focusEnemy(hit);
      }
      this.swingTarget = hit;
      const face = hit ?? target;
      if (face && distance(face, p) > 0.01) {
        this.facing = facing(face.x - p.x, face.z - p.z);
        p.yaw = Math.atan2(face.x - p.x, face.z - p.z);
      }
      return;
    }
    if (this.riding) {
      this.onMessage('Dismount to draw the bow.');
      return;
    }
    if (!this.game.state.inventory.arrow) {
      this.onMessage('Your quiver is empty.');
      return;
    }
    this.walk = false;
    this.onFieldSound('bow_draw');
    this.bow = {
      phase: 'draw',
      elapsed: 0,
      released: false,
      direction: { x: Math.sin(p.yaw), z: Math.cos(p.yaw) },
    };
    if (target) this.aimDirection(target.x - p.x, target.z - p.z, head);
  }
  releaseAttack() {
    if (this.bow && this.bow.phase !== 'loose') this.bow.released = true;
  }
  attack(target?: V2) {
    this.startAttack(target);
    this.releaseAttack();
  }
  private nockedArrow(bow: Draw): Arrow {
    return {
      x: this.player.x,
      z: this.player.z,
      direction: { ...bow.direction },
      travelled: 0,
      launchHeight: supportHeight(this.player),
      grade: bow.grade ?? 0,
      head: bow.head,
    };
  }
  bowGuide() {
    const bow = this.bow;
    if (!bow || bow.phase === 'loose') return;
    const arrow = this.nockedArrow(bow);
    const { distance } = this.traceArrow(arrow, bow.aimDistance ?? 10);
    return { arrow, distance };
  }
  private stepBow(dt: number) {
    const bow = this.bow;
    if (!bow) return;
    const previousFocus = this.bowFocus;
    bow.elapsed += dt;
    if (bow.phase === 'loose') {
      if (bow.elapsed >= RELEASE_TIME) this.bow = undefined;
      return;
    }
    let flightTime = dt;
    if (bow.phase === 'draw') {
      if (bow.elapsed < DRAW_TIME) return;
      flightTime = bow.elapsed - DRAW_TIME;
      bow.phase = 'hold';
      bow.elapsed = flightTime;
    }
    if (previousFocus < 1 && this.bowFocus >= 1 && !bow.released) this.onFieldSound('bow_focus');
    if (!bow.released) return;
    if (!this.action({ t: 'fireBow' })) {
      this.bow = undefined;
      return;
    }
    const arrow = this.nockedArrow(bow);
    arrow.focused = previousFocus >= 1;
    bow.focused = arrow.focused;
    bow.phase = 'loose';
    bow.elapsed = flightTime;
    this.onFieldSound(arrow.focused ? 'focused_release' : 'bow_release');
    if (!this.advanceArrow(arrow, flightTime)) this.arrows.push(arrow);
    if (bow.elapsed >= RELEASE_TIME) this.bow = undefined;
  }
  private stepSwing(previous: number) {
    const release = SWING_TIME - SWING_RELEASE;
    if (previous > release && this.strike <= release)
      this.onFieldSound(this.stroke === 'thrust' ? 'thrust' : this.stroke === 'counter' ? 'counter_swing' : this.swordSwing ? 'blade_swing' : 'unarmed_swing');
    const contact = SWING_TIME - SWING_CONTACT;
    if (previous <= contact || this.strike > contact) return;
    const enemy = this.swingTarget;
    this.swingTarget = undefined;
    const p = this.player;
    if (!enemy || enemy.dead || distance(enemy, p) >= 3.3 || !this.withinMeleeHeight(enemy)) return;
    const counter = this.stroke === 'counter';
    if (enemy.enemyKind === 'deserter' && !counter && this.stroke !== 'thrust' && this.meetsShield(enemy, p)) {
      this.hitStopRemaining = IMPACT_PAUSE.regular;
      this.fieldSoundAt('block', enemy);
      this.contactAt(enemy, p, 'guard', { actorId: enemy.id });
      this.onMessage('Shield held · circle behind or finish a thrust');
      return;
    }
    if (enemy.enemyKind === 'deserter' && this.stroke === 'thrust') this.breakGuard(enemy);
    const damage = bladeDamage(this.game.state, counter ? 'counter' : this.stroke, this.swordSwing);
    const defeated = this.damageEnemy(enemy, damage);
    const heavy = counter || this.stroke === 'thrust' || defeated;
    this.hitStopRemaining = Math.max(this.hitStopRemaining, heavy ? IMPACT_PAUSE.heavy : IMPACT_PAUSE.regular);
    this.repel(enemy, p, heavy ? 8.1 : 4.5);
    this.contactAt(enemy, p, counter ? 'counter' : this.swordSwing ? 'blade' : 'body', { damage, defeated, actorId: enemy.id });
    this.fieldSoundAt(counter ? 'counter_hit' : this.swordSwing ? 'blade_hit' : 'unarmed_hit', enemy);
    if (defeated) this.fieldSoundAt('enemy_down', enemy);
  }
  private fieldSoundAt(cue: FieldSound, at: V2, range = distance(at, this.player)) {
    const dx = at.x - this.player.x,
      dz = at.z - this.player.z;
    const pan = Math.max(-0.85, Math.min(0.85, (dx - dz) * 0.065));
    this.onFieldSound(cue, range, pan);
  }
  private meetsShield(a: Actor, from: V2) {
    if ((a.openedUntil ?? 0) > this.time || (a.attack > 0 && a.attack < enemyContactRemaining(true))) return false;
    const direction = unit(from.x - a.x, from.z - a.z), yaw = a.guardYaw ?? 0;
    return direction.x * Math.sin(yaw) + direction.z * Math.cos(yaw) > 0.22;
  }
  private breakGuard(a: Actor) {
    a.attack = 0; a.openedUntil = this.time + COUNTER_WINDOW; a.timer = COUNTER_WINDOW + 0.3;
    this.fieldSoundAt('parry', a);
    this.onMessage('Guard broken · strike now');
  }
  private damageEnemy(a: Actor, amount: number) {
    if (a.aimed) { a.aimed = undefined; a.attack = 0; a.timer = 1; }
    a.health = Math.max(0, a.health - amount);
    this.focusEnemy(a, a.health ? 2 : DEFEAT_TIME);
    if (a.enemy && a.health <= 0 && this.action({ t: 'defeat', id: a.enemy })) {
      a.dead = true;
      this.onMessage(a.name + ' defeated');
      return true;
    }
    return false;
  }
  private repel(actor: Actor, from: V2, speed: number) {
    const dir = unit(actor.x - from.x, actor.z - from.z);
    actor.recoil = { x: dir.x * speed, z: dir.z * speed };
  }
  private contactAt(
    at: V2,
    from: V2,
    kind: Contact['kind'],
    result: Pick<Contact, 'damage' | 'heavy' | 'defeated' | 'actorId'>
  ) {
    this.contacts.push({
      ...result,
      x: at.x,
      z: at.z,
      dx: at.x - from.x,
      dz: at.z - from.z,
      kind,
      height: supportHeight(at) + 1.7,
      born: this.time,
    });
  }
  /** The guide and the arrowhead sweep the same path through walls, terrain and actors. */
  private traceArrow(arrow: Arrow, length: number) {
    const dir = arrow.direction;
    let impact: Actor | undefined;
    let stop = length;
    let blocked = false;
    const obstructed = (d: number) => {
      const x = arrow.x + dir.x * d;
      const z = arrow.z + dir.z * d;
      return inBuilding({ x, z }) || terrainHeight(x, z) >= arrowHeight(arrow, arrow.travelled + d);
    };
    const steps = Math.max(1, Math.ceil(length / 0.35));
    for (let j = 1; j <= steps; j++) {
      const d = (length * j) / steps;
      if (!obstructed(d)) continue;
      let low = (length * (j - 1)) / steps;
      stop = d;
      // Resolve within a fraction of a screen pixel, regardless of the display refresh rate.
      for (let refinement = 0; refinement < 6; refinement++) {
        const mid = (low + stop) / 2;
        if (obstructed(mid)) stop = mid;
        else low = mid;
      }
      blocked = true;
      break;
    }
    for (const a of this.actors) {
      if (arrow.owner) break;
      if (a.dead || !(a.enemy || isHuntableAnimalId(a.animal))) continue;
      const d = firstContact(arrow, dir, stop, a, Math.max(0.55, a.width / 35));
      if (!Number.isFinite(d) || inBuilding(a)) continue;
      const above = arrowHeight(arrow, arrow.travelled + d) - supportHeight(a);
      if (above < 0 || above > Math.max(3.1, a.width / risePixels)) continue;
      if (d < stop || (d === stop && !blocked && !impact)) {
        impact = a;
        stop = d;
      }
    }
    return { distance: stop, blocked, impact };
  }
  private advanceArrow(arrow: Arrow, dt: number) {
    const length = Math.min(dt * ARROW_SPEED * (arrow.owner ? 0.57 : arrow.focused ? 1.35 : 1), ARROW_RANGE - arrow.travelled);
    const { distance, blocked, impact } = this.traceArrow(arrow, length);
    const dir = arrow.direction;
    if (arrow.owner && !this.room && this.player.health > 0 && !(this.dash && this.dash.elapsed < SIDESTEP.invulnerable)) {
      const t = firstContact(arrow, dir, distance, this.player, 0.62);
      const above = arrowHeight(arrow, arrow.travelled + t) - supportHeight(this.player) - this.hop - this.standingLift;
      if (Number.isFinite(t) && above > 0.1 && above < 3) {
        const block = this.guard && this.stamina >= ACTION_COST.blockHit;
        if (block) this.stamina -= ACTION_COST.blockHit;
        const damage = block ? 2 : ENEMY_ARCHETYPES.skirmisher.damage;
        this.action({ t: 'damagePlayer', amount: damage });
        this.contactAt(this.player, arrow, block ? 'guard' : 'body', { actorId: 'player', damage });
        this.fieldSoundAt(block ? 'block' : 'player_hit', this.player);
        this.hitStopRemaining = IMPACT_PAUSE.regular;
        return true;
      }
    }
    arrow.x += dir.x * distance;
    arrow.z += dir.z * distance;
    arrow.travelled += distance;
    if (!impact && !blocked) return arrow.travelled >= ARROW_RANGE - 0.001;
    let defeated = false;
    if (impact?.animal)
      this.action({
        t: 'hitAnimal',
        hit: {
          id: impact.animal,
          zone: arrow.head === impact.id ? 'head' : 'body',
          position: { x: impact.x, y: supportHeight(impact), z: impact.z },
          yaw: Math.atan2(dir.x, dir.z),
        },
      });
    else if (impact?.enemy) {
      if (impact.enemyKind === 'deserter') {
        if (arrow.focused) this.breakGuard(impact);
        else if (this.meetsShield(impact, { x: impact.x - dir.x, z: impact.z - dir.z })) {
          this.fieldSoundAt('block', impact);
          this.contactAt(impact, {x: impact.x-dir.x, z: impact.z-dir.z}, 'guard', {actorId: impact.id});
          return true;
        }
      }
      defeated = this.damageEnemy(impact, arrow.focused ? FOCUSED_ARROW_DAMAGE : 32);
      impact.recoil = { x: dir.x * (arrow.focused ? 7 : 3), z: dir.z * (arrow.focused ? 7 : 3) };
      if (arrow.focused && !impact.attack) impact.timer = Math.max(impact.timer, 0.24);
      this.hitStopRemaining = Math.max(this.hitStopRemaining, defeated ? IMPACT_PAUSE.heavy : IMPACT_PAUSE.regular);
    }
    this.contacts.push({
      x: arrow.x,
      z: arrow.z,
      dx: dir.x,
      dz: dir.z,
      born: this.time,
      height: arrowHeight(arrow, arrow.travelled),
      kind: impact ? arrow.focused ? 'focused' : 'body' : 'earth',
      damage: impact?.enemy ? arrow.focused ? FOCUSED_ARROW_DAMAGE : 32 : undefined,
      defeated,
      actorId: impact?.id,
    });
    this.fieldSoundAt(impact ? arrow.focused ? 'focused_hit' : 'arrow_flesh' : 'arrow_ground', arrow);
    if (defeated) this.fieldSoundAt('enemy_down', arrow);
    return true;
  }
  chooseNearby(offers: Offer[]) {
    return (
      offers.length > 1 &&
      (!offers[0]!.target || (!!offers[0]!.target?.field && offers[1]!.score - offers[0]!.score < 0.65))
    );
  }
  offers(): Offer[] {
    const p = this.player,
      nearThreat = this.actors.some((a) => a.enemy && !a.dead && distance(a, p) < 4);
    const plan = this.room;
    const offers: Offer[] = [];
    for (const target of this.targets()) {
      const d = targetDistance(target, this.position, plan);
      if (d <= target.reach)
        offers.push({
          target,
          label: target.label,
          score:
            d +
            (target.plant ? 5 : target.prop && !target.field ? 2.4 : 0) -
            (target.door || target.passage?.target || target.passage?.kind === 'outside' ? 0.32 : 0),
        });
    }
    if (plan) return offers.sort((a, b) => a.score - b.score);
    for (const entry of entries) {
      if (
        (entry.act.do === 'pickup' && gatheringIds.has(entry.act.pickup)) ||
        ['archive_door', 'archive_shutter', 'ledger', 'inspect:noticeboard'].includes(entry.id) ||
        !entry.offered(this.game.state)
      )
        continue;
      const at = entry.place;
      let loc: V2;
      if (at.at === 'resident') {
        loc = this.actors.find((a) => a.npc === at.npc)!;
        if (inBuilding(p) !== inBuilding(loc)) continue;
      } else if (at.at === 'mount') loc = this.mount;
      else if (at.at === 'rider') loc = p;
      else loc = at;
      const d = distance(p, loc);
      if (
        d > entry.reach + 0.45 ||
        entry.needs.some(
          (n) =>
            (n === 'no_threat_near' && nearThreat) ||
            (n === 'riding' && !this.riding) ||
            n === 'riding_at_doorway' ||
            (n === 'can_mount' &&
              (this.riding || this.swimming || MOUNT_ID !== ANIMAL_MODEL_IDS['deer-mount']))
        )
      )
        continue;
      const label =
        at.at === 'resident'
          ? 'Speak with ' + NPC_LIST.find((x) => x.id === at.npc)!.name
          : entry.prompt(this.game.state);
      offers.push({ entry, label, score: d + entry.priority });
    }
    return offers.sort((a, b) => a.score - b.score);
  }
  nearestPlace(): PlaceId {
    return (Object.keys(PLACES) as PlaceId[]).sort(
      (a, b) => distance(this.player, PLACES[a]) - distance(this.player, PLACES[b])
    )[0]!;
  }
  placeName() {
    return this.room ? households[this.room.site.id]!.name : S('place.' + this.nearestPlace());
  }
  roomName() {
    const room = this.room;
    if (!room) return '';
    const chamber = chamberAt(room, this.position);
    return chamber && chamber.name !== room.name ? room.name + ' · ' + chamber.name : room.name;
  }
}
