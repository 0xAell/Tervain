import { Game } from '../core/game/game';
import { NPC_LIST } from '../core/content/npcs';
import { ANIMALS } from '../core/content/animals';
import { ENEMY_ARCHETYPES } from '../core/content/enemies';
import { ANIMAL_IDS, ANIMAL_MODEL_IDS, isHuntableAnimalId, type AnimalId } from '../core/game/hunting';
import { CLOCK_RATE } from '../core/game/constants';
import { hourOfDay } from '../core/game/state';
import { S } from '../core/content/strings';
import { resolveGoal } from '../core/rules/schedule';
import { interactableTable, MOUNT_ID, type InteractableEntry } from '../core/rules/interactables';
import { ANCHORS, ENEMY_SPAWNS, PLACES, type V2 } from '../core/world/layout';
import type { NpcId, Command, EncounterId, PlaceId } from '../core/game/types';
import { distance, inBuilding, navigable, placeList, project, waterAt } from './land';
import { onBridge, wetPoint, riverVelocity } from './water';
import { worldView } from '../core/game/worldView';
import { FURNITURE } from '../core/world/furniture';
import { fromBuildingLocal } from '../core/world/interiors';
import { RESIDENT_HOMES, INDOOR_POSTS } from '../core/world/homes';
import { bySpec } from '../core/world/layout';
import { buildingEntry } from '../core/world/buildingEntries';
import type { Goal } from '../core/rules/schedule';

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
export interface Offer {
  entry?: InteractableEntry;
  skin?: AnimalId;
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
  swing = 'attack';
  jump = 0;
  stamina = 100;
  private clockElapsed = 0;
  private skinning: { id: AnimalId; remaining: number } | null = null;
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
  }
  get player() {
    return this.game.state.player;
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
    a.flip = project(dx, dz).x < 0;
  }
  step(dt: number, dx: number, dz: number, run: boolean) {
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
    const water = onBridge(p) ? null : wetPoint(p.x, p.z);
    const wade = water?.kind === 'river' ? Math.min(1, water.bank / 1.9) : 0;
    const norm = Math.hypot(dx, dz);
    this.walk = false;
    if (norm > 0 && p.health > 0 && this.strike < 0.2) {
      dx /= norm;
      dz /= norm;
      this.facing = facing(dx, dz);
      const fast = run && this.stamina > 1 && !this.swimming;
      const speed = this.riding ? (fast ? 14 : 9) : this.swimming ? 3 : this.guard ? 2 : fast ? 9 : 5;
      const x = p.x + dx * dt * speed * (1 - wade * 0.27),
        z = p.z + dz * dt * speed * (1 - wade * 0.27);
      const start = { x: p.x, z: p.z };
      if (navigable(p, { x, z }, this.archiveOpen)) {
        p.x = x;
        p.z = z;
      } else {
        if (navigable(p, { x, z: p.z }, this.archiveOpen)) p.x = x;
        if (navigable(p, { x: p.x, z }, this.archiveOpen)) p.z = z;
      }
      this.walk = distance(start, p) > 0.0001;
      p.yaw = Math.atan2(dx, dz);
      this.stamina = Math.max(0, Math.min(100, this.stamina + dt * (fast ? -7 : 5)));
    } else this.stamina = Math.min(100, this.stamina + dt * 10);
    if (wade && water && !this.jump && p.health > 0 && !onBridge(p)) {
      const v = riverVelocity(water, worldView(this.game.state).flow),
        pull = dt * wade * (this.guard ? 0.06 : 0.24);
      const next = { x: p.x + v.x * pull, z: p.z + v.z * pull };
      if (!onBridge(next) && navigable(p, next, this.archiveOpen)) {
        p.x = next.x;
        p.z = next.z;
      }
    }
    this.swimming = waterAt(p.x, p.z) === 'sea' && !onBridge(p);
    if (this.swimming) this.riding = false;
    if (this.skinning) {
      if (this.walk) this.skinning = null;
      else if ((this.skinning.remaining -= dt) <= 0) {
        this.action({ t: 'skinAnimal', id: this.skinning.id });
        this.skinning = null;
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
        const near = distance(a, p),
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
          near = distance(a, p);
        if (near < def.notice * 1.6 && distance(a, a.home) < spawn.leash + 6 && p.health > 0) {
          if (near > def.reach && !a.attack) this.stepActor(a, p, def.speed, dt);
          else if (!a.timer && near <= def.reach) {
            a.attack = 0.85;
            a.timer = def.wind + def.recover + 0.6;
          }
          if (a.attack > 0.39 && a.attack - dt <= 0.39 && near < def.reach + 0.5) {
            this.action({
              t: 'damagePlayer',
              amount: this.guard ? Math.ceil(def.damage * 0.18) : def.damage,
            });
            this.onMessage(this.guard ? 'Blow guarded' : a.name + ' struck you');
          }
        } else this.stepActor(a, a.home, def.speed * 0.65, dt);
      }
    }
  }
  attack(target?: V2) {
    if (this.strike > 0 || this.player.health <= 0) return;
    const p = this.player,
      bow = this.game.state.equippedWeapon === 'hunting_bow';
    const hit = this.actors
      .filter(
        (a) =>
          !a.dead &&
          (a.enemy || (bow && a.animal && isHuntableAnimalId(a.animal))) &&
          distance(a, p) < (bow ? 45 : 3.3)
      )
      .sort((a, b) => distance(a, target ?? p) - distance(b, target ?? p))[0];
    if (bow) {
      const animal = hit?.animal;
      if (
        !this.action({
          t: 'fireBow',
          hit: animal
            ? { id: animal, zone: 'body', position: { x: hit!.x, y: p.y, z: hit!.z }, yaw: p.yaw }
            : undefined,
        })
      )
        return;
    }
    this.swing = bow ? 'bow' : 'attack';
    this.strike = bow ? 0.65 : 0.48;
    if (hit) {
      this.facing = facing(hit.x - p.x, hit.z - p.z);
      if (hit.enemy) {
        hit.health -= bow ? 32 : this.game.state.equippedWeapon === 'rusted_sword' ? 29 : 8;
        if (hit.health <= 0) {
          this.action({ t: 'defeat', id: hit.enemy });
          this.onMessage(hit.name + ' defeated');
        }
      }
    }
  }
  offers(): Offer[] {
    const p = this.player,
      nearThreat = this.actors.some((a) => a.enemy && !a.dead && distance(a, p) < 4);
    const offers: Offer[] = [];
    for (const entry of entries) {
      if (!entry.offered(this.game.state)) continue;
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
    for (const a of this.actors)
      if (a.animal && this.game.state.hunting[a.animal]?.status === 'dead' && distance(a, p) < 2.8)
        offers.push({ skin: a.animal, label: 'Skin ' + a.name, score: 0 });
    return offers.sort((a, b) => a.score - b.score);
  }
  skin(id: AnimalId) {
    if (!this.game.state.inventory.skinning_knife) {
      this.onMessage('You need a skinning knife.');
      return;
    }
    this.skinning = { id, remaining: 3.2 };
    this.onMessage('Skinning · stand still');
  }
  get skinningActive() {
    return this.skinning !== null;
  }
  nearestPlace(): PlaceId {
    return (Object.keys(PLACES) as PlaceId[]).sort(
      (a, b) => distance(this.player, PLACES[a]) - distance(this.player, PLACES[b])
    )[0]!;
  }
  placeName() {
    return S('place.' + this.nearestPlace());
  }
}
