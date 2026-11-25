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
import { hourOfDay } from '../core/game/state';
import { S } from '../core/content/strings';
import { resolveGoal } from '../core/rules/schedule';
import { interactableTable, MOUNT_ID, type InteractableEntry } from '../core/rules/interactables';
import { ANCHORS, ENEMY_SPAWNS, PLACES, type V2 } from '../core/world/layout';
import type { NpcId, Command, EncounterId, PlaceId } from '../core/game/types';
import { supportHeight, travelScale, terrainHeight, footingHeight } from './relief';
import { risePixels } from './projection';
import { distance, inBuilding, navigable, placeList, project, waterAt } from './land';
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
  arrowLift,
  DRAW_TIME,
  RELEASE_TIME,
  firstContact,
  unit,
  type Activity,
  type Arrow,
  type Draw,
  type Gesture,
  type FieldSound,
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
  health: number;
}
export function facesLeft(species: string) {
  return ['cat', 'wolf', 'tiger', 'bear'].includes(species);
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
  walk = false;
  riding = false;
  guard = false;
  swimming = false;
  facing = 'south-east';
  strike = 0;
  bow?: Draw;
  readonly arrows: Arrow[] = [];
  activity?: Activity;
  jump = 0;
  stamina = 100;
  props?: PropPhysics;
  standingLift = 0;
  private lastFootSpace = '';
  private clockElapsed = 0;
  onFieldSound: (cue: FieldSound, range?: number) => void = () => {};
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
      this.actors.push({ ...make(npc.id, npc.id, npc.name, home, 33), npc: npc.id });
    }
    for (const id of ANIMAL_IDS) {
      const def = ANIMALS.find((d) => d.id === ANIMAL_MODEL_IDS[id])!;
      const width = { cat: 16, dog: 23, boar: 32, wolf: 29, deer: 39, tiger: 43, lion: 45, bear: 48 }[
        def.species
      ];
      this.actors.push({
        ...make(
          id,
          def.tame ? 'mount' : def.species,
          def.tame ? 'Saddled deer' : def.species,
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
        enemy: spawn.id,
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
    return this.jump ? Math.sin((Math.PI * this.jump) / 0.52) * 1.45 : 0;
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
  get roomKey() {
    const r = this.player.interior;
    return r ? r.building + '/' + r.level : '';
  }
  get lightsOn() {
    return this.game.state.facts['room_dim:' + this.roomKey] !== true;
  }
  targets() {
    const room = this.room;
    const targets = room
      ? indoorTargets(room, this.position, this.actors)
      : [...outsideTargets(this.game.state), ...fieldTargets(this.game.state, this.actors)];
    return this.props
      ? [...targets.filter((t) => t.field !== 'seat'), ...physicalTargets(this.props, this.position, room)]
      : targets;
  }
  canWalk(a: V2, b: V2) {
    const room = this.room;
    return room
      ? roomCanMove(room, a, b) && (!this.props || this.props.roomRouteClear(a, b))
      : navigable(a, b, this.game.state) && (!this.props || passesTrunks(a, b));
  }
  private restoreFootprint() {
    const site = inBuilding(this.player);
    if (!site) return;
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
    this.walk = false;
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
  }
  usePassage(p: Passage) {
    if (p.kind === 'outside') this.leaveRoom();
    else if (p.target) this.changeFloor(p.target);
  }
  private stepInside(dt: number, dx: number, dz: number, run: boolean, walkThrough: boolean) {
    const plan = this.room!,
      p = this.player.interior!,
      length = Math.hypot(dx, dz);
    this.walk = false;
    this.swimming = false;
    if (!length) {
      this.stamina = Math.min(100, this.stamina + dt * 5);
      return;
    }
    const stride =
      dt * (this.props?.grip?.drag ? 2.65 : run && this.stamina > 1 ? 8.2 : this.guard ? 2.4 : 5.4);
    const amount = (walkThrough ? stride : Math.min(stride, length)) / length,
      before = { x: p.x, z: p.z };
    const next = { x: p.x + dx * amount, z: p.z + dz * amount };
    const flight = stairAt(plan, before);
    if (flight && stairDepth(flight, next) >= stairRun)
      next.z = flight.passage.z + flight.direction * (stairRun - 0.01);
    if (roomCanMove(plan, p, next)) {
      p.x = next.x;
      p.z = next.z;
    } else {
      if (roomCanMove(plan, p, { x: next.x, z: p.z })) p.x = next.x;
      if (roomCanMove(plan, p, { x: p.x, z: next.z })) p.z = next.z;
    }
    if (this.props)
      Object.assign(p, this.props.move(before, p, this.localFloor + this.standingLift + this.hop));
    this.facing = facing(dx, dz);
    this.player.yaw = Math.atan2(dx, dz);
    this.walk = distance(before, p) > 0.0001;
    this.stamina = Math.max(0, Math.min(100, this.stamina + dt * (run ? -5 : 5)));
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
  private stepActor(a: Actor, target: V2, speed: number, dt: number) {
    const dist = distance(a, target);
    if (dist < 0.18) return;
    const amount = Math.min(dist, speed * dt),
      dx = (target.x - a.x) / dist,
      dz = (target.z - a.z) / dist;
    const next = { x: a.x + dx * amount, z: a.z + dz * amount };
    if (!navigable(a, next, true)) return;
    a.x = next.x;
    a.z = next.z;
    a.move = true;
    a.flip = project(dx, dz).x < 0 !== facesLeft(a.key);
  }
  step(dt: number, dx: number, dz: number, run: boolean, walkThrough = true) {
    this.time += dt;
    this.clockElapsed += dt;
    this.game.addPlaySeconds(dt);
    if (this.clockElapsed >= 1) {
      this.game.tickClock(this.clockElapsed * CLOCK_RATE);
      this.clockElapsed = 0;
    }
    this.strike = Math.max(0, this.strike - dt);
    this.jump = Math.max(0, this.jump - dt);
    const p = this.player;
    if (!this.player.interior && inBuilding(p)) this.restoreFootprint();
    if (this.player.health <= 0) this.cancelPose();
    if (this.activity && (dx || dz || this.activity.room !== this.roomKey || this.guard))
      this.activity = undefined;
    if (this.bow && (this.game.state.equippedWeapon !== 'hunting_bow' || this.guard)) this.bow = undefined;
    if (this.bow) {
      if ((dx || dz) && this.bow.phase !== 'loose') this.aimDirection(dx, dz);
      dx = dz = 0;
    }
    if (this.room) this.stepInside(dt, dx, dz, run, walkThrough);
    else {
      const water = onBridge(p) ? null : wetPoint(p.x, p.z);
      const wade = water?.kind === 'river' ? Math.min(1, water.bank / 1.9) : 0;
      const norm = Math.hypot(dx, dz);
      this.walk = false;
      if (norm > 0 && p.health > 0 && this.strike < 0.2) {
        dx /= norm;
        dz /= norm;
        this.facing = facing(dx, dz);
        const fast = run && !this.props?.grip && this.stamina > 1 && !this.swimming;
        const speed = this.props?.grip?.drag
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
        const stride = Math.min(
          walkThrough ? Infinity : norm,
          dt * speed * (1 - wade * 0.27) * travelScale(p.x, p.z, dx, dz)
        );
        const x = p.x + dx * stride,
          z = p.z + dz * stride;
        const start = { x: p.x, z: p.z };
        if (this.canWalk(p, { x, z })) {
          p.x = x;
          p.z = z;
        } else {
          if (this.canWalk(p, { x, z: p.z })) p.x = x;
          if (this.canWalk(p, { x: p.x, z })) p.z = z;
        }
        if (this.props)
          Object.assign(p, this.props.move(start, p, this.localFloor + this.standingLift + this.hop));
        this.walk = distance(start, p) > 0.0001;
        const entered = inBuilding(p);
        if (entered) {
          const door = crossedDoor(start, p, entered);
          if (door) this.enterDoor(door);
        }
        p.yaw = Math.atan2(dx, dz);
        this.stamina = Math.max(0, Math.min(100, this.stamina + dt * (fast ? -7 : 5)));
      } else this.stamina = Math.min(100, this.stamina + dt * 10);
      if (!this.room && wade && water && !this.jump && p.health > 0 && !onBridge(p)) {
        const v = riverVelocity(water, worldView(this.game.state).flow),
          pull = dt * wade * (this.guard ? 0.06 : 0.24);
        const next = { x: p.x + v.x * pull, z: p.z + v.z * pull };
        if (!onBridge(next) && this.canWalk(p, next)) {
          p.x = next.x;
          p.z = next.z;
        }
      }
      this.swimming = !this.room && waterAt(p.x, p.z) === 'sea' && !onBridge(p);
      if (this.swimming) this.riding = false;
    }
    this.updateFooting();
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
    this.stepArrows(dt);
    this.stepBow(dt);
    if (this.activity) {
      const a = this.activity;
      if (targetDistance(a.target, this.position, this.room) > a.target.reach || this.player.health <= 0)
        this.activity = undefined;
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
        if (a.dead) continue;
        const spawn = ENEMY_SPAWNS.find((e) => e.id === a.enemy)!;
        const def = ENEMY_ARCHETYPES[spawn.kind],
          near = this.room ? Infinity : distance(a, p);
        if (near < def.notice * 1.6 && distance(a, a.home) < spawn.leash + 6 && p.health > 0) {
          if (near > def.reach && !a.attack) this.stepActor(a, p, def.speed, dt);
          else if (!a.timer && near <= def.reach) {
            a.attack = 0.85;
            a.timer = def.wind + def.recover + 0.6;
          }
          if (a.attack > 0.39 && a.attack - dt <= 0.39 && near < def.reach + 0.5) {
            this.cancelPose();
            this.action({
              t: 'damagePlayer',
              amount: this.guard ? Math.ceil(def.damage * 0.18) : def.damage,
            });
            this.onFieldSound(this.guard ? 'block' : 'hit');
            this.onMessage(this.guard ? 'Blow guarded' : a.name + ' struck you');
          }
        } else this.stepActor(a, a.home, def.speed * 0.65, dt);
      }
    }
  }
  cancelPose() {
    this.activity = undefined;
    this.bow = undefined;
  }
  perform(kind: Gesture, target: RoomTarget, duration: number, finish?: () => void) {
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
      contact: kind === 'gather' ? duration * 0.55 : duration,
      room: this.roomKey,
      finish,
    };
    return true;
  }
  get displayPosition(): V2 {
    const a = this.activity,
      p = this.position;
    if (!a) return p;
    const toward = unit(p.x - a.target.at.x, p.z - a.target.at.z);
    const reach = a.kind === 'sit' ? 0 : a.kind === 'gather' ? 0.9 : a.kind === 'stir' ? 1.85 : 1.5;
    const at = { x: a.target.at.x + toward.x * reach, z: a.target.at.z + toward.z * reach };
    if (a.kind === 'sit') {
      at.x += 0.27;
      at.z += 0.2;
    }
    const t = Math.min(1, a.elapsed / 0.16, (a.duration - a.elapsed) / 0.16);
    return { x: p.x + (at.x - p.x) * t, z: p.z + (at.z - p.z) * t };
  }
  interactField(target: RoomTarget) {
    if (target.field === 'pet') {
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
    this.bow.head = head;
    this.facing = facing(dx, dz);
    this.player.yaw = Math.atan2(dx, dz);
  }
  startAttack(target?: V2, head?: string) {
    if (this.props?.grip) {
      this.props.release(true, target);
      return;
    }
    if (
      this.room ||
      this.strike ||
      this.bow ||
      this.activity ||
      this.jump ||
      this.swimming ||
      this.player.health <= 0
    )
      return;
    const p = this.player;
    if (this.game.state.equippedWeapon !== 'hunting_bow') {
      this.strike = 0.48;
      const hit = this.actors
        .filter((a) => a.enemy && !a.dead && distance(a, p) < 3.3)
        .sort((a, b) => distance(a, target ?? p) - distance(b, target ?? p))[0];
      if (hit) {
        this.facing = facing(hit.x - p.x, hit.z - p.z);
        this.damageEnemy(hit, this.game.state.equippedWeapon === 'rusted_sword' ? 29 : 8);
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
  private stepBow(dt: number) {
    const bow = this.bow;
    if (!bow) return;
    bow.elapsed += dt;
    if (bow.phase === 'draw' && bow.elapsed >= DRAW_TIME) {
      bow.phase = 'hold';
      bow.elapsed = 0;
    }
    if (bow.phase === 'hold' && bow.released) {
      if (!this.action({ t: 'fireBow' })) {
        this.bow = undefined;
        return;
      }
      bow.phase = 'loose';
      bow.elapsed = 0;
      this.arrows.push({
        x: this.player.x,
        z: this.player.z,
        direction: { ...bow.direction },
        travelled: 0,
        launchHeight: supportHeight(this.player),
        grade: bow.grade ?? 0,
        head: bow.head,
      });
      this.onFieldSound('bow_release');
    } else if (bow.phase === 'loose' && bow.elapsed >= RELEASE_TIME) this.bow = undefined;
  }
  private damageEnemy(a: Actor, amount: number) {
    a.health -= amount;
    if (a.enemy && a.health <= 0 && this.action({ t: 'defeat', id: a.enemy })) {
      a.dead = true;
      this.onMessage(a.name + ' defeated');
    }
  }
  private stepArrows(dt: number) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i]!,
        dir = arrow.direction;
      const length = Math.min(dt * ARROW_SPEED, ARROW_RANGE - arrow.travelled);
      let impact: Actor | undefined,
        stop = length,
        blocked = false;
      // Short world-space samples stop thin walls even when a frame is late.
      const steps = Math.max(1, Math.ceil(length / 0.35));
      for (let j = 1; j <= steps; j++) {
        const d = (length * j) / steps;
        const x = arrow.x + dir.x * d,
          z = arrow.z + dir.z * d;
        if (
          inBuilding({ x, z }) ||
          terrainHeight(x, z) >=
            arrow.launchHeight +
              (arrow.travelled + d) * arrow.grade +
              arrowLift(arrow.travelled + d) / risePixels
        ) {
          stop = d;
          blocked = true;
          break;
        }
      }
      for (const a of this.actors) {
        if (a.dead || !(a.enemy || isHuntableAnimalId(a.animal)) || inBuilding(a)) continue;
        const d = firstContact(arrow, dir, stop, a, Math.max(0.55, a.width / 35));
        if (!Number.isFinite(d)) continue;
        const distance = arrow.travelled + d,
          above =
            arrow.launchHeight + distance * arrow.grade + arrowLift(distance) / risePixels - supportHeight(a);
        if (above < 0 || above > Math.max(3.1, a.width / risePixels)) continue;
        if (d < stop || (d === stop && !blocked && !impact)) {
          impact = a;
          stop = d;
        }
      }
      arrow.x += dir.x * stop;
      arrow.z += dir.z * stop;
      arrow.travelled += stop;
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
      else if (impact?.enemy) this.damageEnemy(impact, 32);
      if (impact || blocked || arrow.travelled >= ARROW_RANGE - 0.001) {
        this.onFieldSound(impact ? 'arrow_flesh' : 'arrow_ground', arrow.travelled);
        this.arrows.splice(i, 1);
      }
    }
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
        ['archive_door', 'archive_shutter', 'ledger'].includes(entry.id) ||
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
