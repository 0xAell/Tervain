import { NPCS, type NpcDef } from '../content/npcs';
import type { NpcId, WorldState } from '../game/types';
import type { CircleCollider, Collider, Colliders } from '../world/colliders';
import { berthFor, indoorPost, roomDoorstep, roomRoute, walkingGround, type Berth } from '../world/homes';
import { ANCHORS, MAINT_ROUTE, type V2 } from '../world/layout';
import type { NavGrid } from '../world/nav';
import type { Terrain } from '../world/terrain';
import { NpcApproachGreeting } from './npcApproachGreeting';
import { arrivalRadius, RESIDENT } from './resident';
import { eligibleBarks, resolveGoal, type Goal } from './schedule';

/**
 * A resident through their day: where their schedule sends them, the way there (out of one room by its doorway, along
 * the paths, in at another), walking it round whoever stands in the way, turning to their place, sitting down, going
 * to bed and getting up, and the remark made to someone passing. It decides; it draws nothing. Whoever draws the
 * resident extends this with the body: its height, how it gets on and off a seat, and how it is shown and posed.
 */

/** A fight this near wakes a sleeper (m), A70. */
export const NPC_ALARM_REACH = RESIDENT.alarmReach;

export interface ResidentContext {
  terrain: Terrain;
  colliders: Colliders;
  /** Peaceful moving bodies, including the seated waystation pet. */
  wildlifeContacts?: readonly Collider[];
  /** Other live residents, keyed by person:<id>; the moving actor excludes itself. */
  residentContacts?: readonly Collider[];
  nav: NavGrid;
  state: WorldState;
  hour: number;
  player: { x: number; z: number; y: number };
  reducedMotion: boolean;
  /** Where a fight is going on, if anywhere (A70): sleepers within NPC_ALARM_REACH sit up awake until it is over. */
  alarms?: readonly { x: number; z: number }[];
  /** A remark, by its line in voice.ts. True when it was made. */
  onBark(resident: ResidentWalker, line: string): boolean | void;
}


/** What a resident is doing with their body, for whoever poses it. */
export type ResidentMode = 'idle' | 'walk' | 'talk' | 'sit' | 'work';

/** What a resident did in one step. */
export interface ResidentStep {
  mode: ResidentMode;
  /** Metres of gait: route actually walked, or a turn stepped round on the spot. */
  gait: number;
  /** Radians turned. */
  turn: number;
  /** On a seat or a bed's edge, turned to it. */
  seated: boolean;
  /** On their bed, sitting on it or lain down. */
  onBed: boolean;
  /** How far the player is (m, on the ground). */
  playerDistance: number;
}

export const NPC_WALK_SPEED = RESIDENT.walkSpeed;
const NPC_RADIUS = RESIDENT.radius;
const NPC_ACCELERATION = RESIDENT.acceleration;
const NPC_BRAKING = RESIDENT.braking;
const npcSeed = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 17);
/**
 * How fast a resident turns, radians a second (A69): about 180° a second walking and 125° standing, easing into the
 * last part of a turn. People turn about with a step or two; they never spin on the spot.
 */
const NPC_TURN_WALKING = RESIDENT.turnWalking, NPC_TURN_STANDING = RESIDENT.turnStanding, NPC_TURN_EASE = RESIDENT.turnEase;
/** A turn on the spot faster than this (radians a second) is stepped round, each radian a stride's arc of gait (A69). */
const NPC_TURN_STEPPED = RESIDENT.turnStepped, NPC_TURN_STRIDE = RESIDENT.turnStride;
/** Within this of their place's heading (radians) a resident settles there: they sit down or start work facing it. */
const NPC_SETTLED = RESIDENT.settled;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Seconds to lie down from sitting on a bed's edge, or to sit up again; and a moment sat on it first (A70). */
const NPC_LIE_SECONDS = RESIDENT.lieSeconds, NPC_SIT_BEFORE_LYING = RESIDENT.sitBeforeLying;

/** Turn `from` toward `to` at no more than `rate` radians a second, easing out over the last part of the turn (A69). */
export function turnToward(from: number, to: number, rate: number, dt: number): number {
  const d = wrapAngle(to - from);
  return wrapAngle(from + Math.sign(d) * Math.min(Math.abs(d) * -Math.expm1(-dt * NPC_TURN_EASE), rate * dt));
}

/** A resident's place: where they stand and which way they face, a seat's height, and who else shares a meeting place. */
export type NpcPlace = V2 & { yaw: number; seat?: number; seatBack?: number; company?: readonly (V2 & { id: NpcId })[] };

/** A stride's rise: 0.3 m over ground, up to a building's tread where the ground falls away below its doorstep (A70). */
function riseOk(terrain: Pick<Terrain, 'groundAt'>, x: number, z: number, y: number, nx: number, nz: number, ny: number): boolean {
  const rise = Math.abs(ny - y);
  return rise <= .3 || rise <= .46 && (ny > terrain.groundAt(nx, nz) + .01 || y > terrain.groundAt(x, z) + .01);
}

/** Actual foot/body geometry, rather than a conservative navigation cell, decides a short local connection. */
function clearNpcSegment(from: V2, to: V2, ctx: Pick<ResidentContext, 'terrain' | 'colliders'>, height: number, extra: readonly Collider[] = []): boolean {
  const distance = Math.hypot(to.x - from.x, to.z - from.z), steps = Math.max(1, Math.ceil(distance / .15));
  let x = from.x, z = from.z, y = walkingGround(ctx.terrain, x, z);
  if (!Number.isFinite(y)) return false;
  for (let i = 1; i <= steps; i++) {
    const nx = from.x + (to.x - from.x) * i / steps, nz = from.z + (to.z - from.z) * i / steps;
    // Up a building's doorstep and in over its threshold, a tread at a time (A70).
    const ny = walkingGround(ctx.terrain, nx, nz, y);
    if (!ctx.terrain.walkable(nx, nz) || !Number.isFinite(ny) || !riseOk(ctx.terrain, x, z, y, nx, nz, ny)) return false;
    const step = ctx.colliders.move(x, z, nx - x, nz - z, NPC_RADIUS, undefined,
      { minY: Math.min(y, ny) + .02, maxY: Math.max(y, ny) + height }, extra);
    if (Math.hypot(step.x - nx, step.z - nz) > .001) return false;
    x = nx; z = nz; y = ny;
  }
  return true;
}

// Roster membership comes only from authored content; state and collision clearance are evaluated separately.
const sharedGoalRosters = new Map<string, readonly NpcDef[]>();
function sharedGoalRoster(anchor: string): readonly NpcDef[] {
  let peers = sharedGoalRosters.get(anchor);
  if (!peers) {
    const entries = (d: NpcDef) => [...d.schedule, ...d.overrides ?? []];
    peers = Object.values(NPCS).filter(d => entries(d).some(e => e.anchor === anchor && (e.activity === 'stand' || e.activity === 'talk'))).sort((a, b) => a.id.localeCompare(b.id));
    sharedGoalRosters.set(anchor, peers);
  }
  return peers;
}

/**
 * Stable places beside a shared conversation/office anchor; work surfaces and seats retain their authored placement.
 * The others' places at a shared anchor come too: a resident turns toward whoever is there with them (A69).
 */
export function npcGoalPosition(def: NpcDef, goal: Goal, ctx: Pick<ResidentContext, 'terrain' | 'colliders'>, height: number): NpcPlace {
  // An indoor post is a furnished spot found in its room (A70).
  const post = goal.inside ? indoorPost(goal.inside, ctx.terrain, ctx.colliders, height) : null;
  if (post) return { x: post.x, z: post.z, yaw: post.yaw };
  const base = ANCHORS[goal.anchor] ?? { x: 0, z: 0, yaw: 0 };
  if (goal.activity !== 'stand' && goal.activity !== 'talk') return base;
  const peers = sharedGoalRoster(goal.anchor);
  if (peers.length < 2 || !peers.some(d => d.id === def.id)) return base;
  const chosen: (V2 & { id: NpcId })[] = [];
  for (const [i, peer] of peers.entries()) {
    const offsets = sharedGoalOffsets(peers.length, i);
    let stance: V2 = base;
    for (const offset of offsets) {
      const point = { x: base.x + offset.x * Math.cos(base.yaw) + offset.z * Math.sin(base.yaw), z: base.z - offset.x * Math.sin(base.yaw) + offset.z * Math.cos(base.yaw) };
      const y = ctx.terrain.groundAt(point.x, point.z);
      if (!Number.isFinite(y) || !ctx.terrain.walkable(point.x, point.z) || chosen.some(other => Math.hypot(point.x - other.x, point.z - other.z) < .82)
        || ctx.colliders.blocked(point.x, point.z, NPC_RADIUS, { minY: y + .02, maxY: y + height })) continue;
      stance = point; break;
    }
    chosen.push({ x: stance.x, z: stance.z, id: peer.id });
  }
  const own = chosen.find(place => place.id === def.id)!;
  return { x: own.x, z: own.z, yaw: base.yaw, company: chosen.filter(place => place.id !== def.id) };
}

// Candidate offsets depend only on roster size/index. Positions and clearance are still calculated live.
const sharedOffsetLists = new Map<number, Map<number, readonly V2[]>>();
function sharedGoalOffsets(count: number, index: number): readonly V2[] {
  let byIndex = sharedOffsetLists.get(count);
  if (!byIndex) { byIndex = new Map(); sharedOffsetLists.set(count, byIndex); }
  let offsets = byIndex.get(index);
  if (!offsets) {
    const lateral = (index - (count - 1) / 2) * 1.3;
    offsets = [{ x: lateral, z: 0 }, ...[.85, 1.5, 2.2].flatMap(r =>
      [0, Math.PI / 2, -Math.PI / 2, Math.PI].map(angle => ({ x: Math.sin(angle + index * Math.PI) * r, z: Math.cos(angle + index * Math.PI) * r })))];
    byIndex.set(index, offsets);
  }
  return offsets;
}

/** A coarse grid can reject a counter's whole cell even when the resident's exact working stance is clear. */
export function finishNpcPath(path: V2[] | null, goal: V2, ctx: Pick<ResidentContext, 'terrain' | 'colliders'>, height: number): V2[] | null {
  const start = path?.at(-1);
  if (!path || !start) return path;
  const distance = Math.hypot(goal.x - start.x, goal.z - start.z);
  if (distance < 0.01 || distance > 4) return path;
  if (!clearNpcSegment(start, goal, ctx, height)) return path;
  // Moving animals and the player are checked each frame rather than turning a temporary visitor into a permanent route gap.
  return [...path, { x: goal.x, z: goal.z }];
}

export abstract class ResidentWalker {
  readonly def: NpcDef;
  /** Whether their body is here. Until it is they keep their schedule unseen: nobody can talk to them, bump into them or hear them. */
  arrived: boolean;
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  /** Indoors with no bed to be seen in, or not in the valley (their schedule's own absence). */
  protected absent = false;
  talking = false;
  /** Conversation reservations pause a route; only an actual voiced turn gestures. */
  speaking = true;
  /** Whom they face while talking: the player unless another person is set (an overheard scene). */
  faceTo: { x: number; z: number } | null = null;
  goal: Goal = { anchor: '', activity: 'stand' };
  protected path: V2[] | null = null;
  protected pi = 0;
  protected clock = 0;
  protected barkCooldown = RESIDENT.firstBark[0] + Math.random() * RESIDENT.firstBark[1];
  protected lastBarkKey = '';
  protected placed = false;
  /** Their body changed since the last update: where they sit or work is measured again with it (A93 scout). */
  protected rigChanged = false;
  protected viaMaint = false;
  protected maintenanceCursor = 0;
  protected destination: NpcPlace = { x: 0, z: 0, yaw: 0 };
  protected speed = 0;
  protected routeRetry = 0;
  protected routeFailures = 0;
  protected stuck = 0;
  protected dynamicWait = 0;
  protected standDelay = 0;
  protected navVersion = -1;
  protected unavailable = false;
  protected waking = false;
  /** Their bed for the night, found once (A70); undefined until looked for, null for someone with none. */
  protected berth: Berth | null | undefined = undefined;
  protected berthVersion = -1;
  /** How far lain down on the bed they are on (0 sitting on its edge, 1 lying), and that bed while they are on it (A70). */
  lie = 0;
  protected lying: Berth | null = null;
  protected seatedFor = 0;
  protected readonly approachGreeting: NpcApproachGreeting | null;
  mode: ResidentMode = 'idle';

  constructor(def: NpcDef, arrived = true) {
    this.def = def;
    this.arrived = arrived;
    this.clock = (npcSeed(def.id) % 1000) / 100;
    this.approachGreeting = def.approachGreeting ? new NpcApproachGreeting(def.approachGreeting) : null;
  }

  /* The body, as far as walking needs it. Whoever draws the resident answers these; a port answers them from its own character. */

  /** How tall they stand (m): what fits under a lintel and beside a table. */
  protected abstract get height(): number;
  /** How far in front of a seat of this height they get down onto it from, on their feet (m); 0 to sit down where the seat is. */
  protected seatApproach(_seat: number): number { return 0; }
  /** Seconds their body takes to get to its feet from a seat. */
  protected get standUpSeconds(): number { return 0; }
  /** Whether they turn on the spot with steps of their own, rather than by walking the turn round. */
  protected get stepsInPlace(): boolean { return false; }
  /** The body is to be seen, or not. */
  protected bodyShown(_visible: boolean): void {}
  /** The body is to stand where they are now. */
  protected bodyPlaced(): void {}
  /** They were put somewhere at once: whatever is drawn of them should catch up at once. */
  protected bodyJumped(): void {}
  /** One step is done: show, place and pose the body. */
  protected present(_step: ResidentStep, _dt: number, _ctx: ResidentContext): void {}

  get id(): NpcId {
    return this.def.id;
  }

  /** Not to be seen or met: away by their schedule, or their model still on its way (stage 2). */
  get hidden(): boolean {
    return this.absent || !this.arrived;
  }

  set hidden(value: boolean) {
    this.absent = value;
  }

  /** Out of sight by their own schedule, whether or not their model is here. */
  get away(): boolean {
    return this.absent;
  }

  get interactable(): boolean {
    return !this.hidden;
  }

  /** Lying in their bed (A70): they see nothing, remark on nothing and hold no scene with anyone. */
  get asleep(): boolean {
    return !this.hidden && this.lie > 0.5;
  }

  /** A standing body others walk round; someone on a bed is out of the way, on it (A70). */
  get solid(): boolean {
    return !this.hidden && this.lie === 0 && this.lying === null;
  }

  /** The bed a resting resident goes to (A70), looked for again only when the static world changes. */
  protected berthOf(ctx: Pick<ResidentContext, 'terrain' | 'colliders'>): Berth | null {
    if (this.berth === undefined || (this.berth === null && this.berthVersion !== ctx.colliders.version)) {
      this.berth = berthFor(this.id, ctx.terrain, ctx.colliders, this.height);
      this.berthVersion = ctx.colliders.version;
    }
    return this.berth;
  }

  protected restBerth(): Berth | null {
    return this.goal.activity === 'rest' ? this.berth ?? null : null;
  }

  /** Initial load/time-skip placement only; running schedules always walk rather than teleporting at a distance. */
  snapToGoal(ctx: ResidentContext) {
    const g = resolveGoal(this.def, ctx.state, ctx.hour);
    this.goal = g;
    const a = this.destination = this.placeFor(g, ctx);
    this.x = a.x;
    this.z = a.z;
    this.yaw = a.yaw;
    this.path = null;
    this.pi = 0;
    this.maintenanceCursor = 0;
    this.speed = this.stuck = this.dynamicWait = this.standDelay = this.routeRetry = this.routeFailures = 0;
    this.navVersion = ctx.colliders.version;
    // Loaded at night, a resident with a bed is found lying in it, never vanished at their door (A70).
    const berth = g.activity === 'rest' ? this.berthOf(ctx) : null;
    this.absent = g.activity === 'rest' && !berth;
    this.lying = berth;
    this.lie = berth ? 1 : 0;
    this.seatedFor = berth ? 2 : 0;
    this.bodyJumped();
    this.waking = false;
    this.placed = true;
    this.y = walkingGround(ctx.terrain, this.x, this.z);
    this.bodyShown(!this.hidden);
    this.bodyPlaced();
  }

  protected atDestination() {
    return Math.hypot(this.x - this.destination.x, this.z - this.destination.z) <= arrivalRadius(this.goal.activity);
  }

  /** On their way somewhere: a route still to walk. A passing remark is made on the move, and doors open for them (A69). */
  get underway(): boolean {
    return !this.hidden && this.path !== null && !this.atDestination();
  }

  /** Turned to their place's heading: only then do they sit down on its seat or start work at it (A69). */
  protected settled() {
    return Math.abs(wrapAngle(this.destination.yaw - this.yaw)) < NPC_SETTLED;
  }

  protected seatedHere() {
    return (this.goal.activity === 'sit' || this.restBerth() !== null) && this.atDestination() && this.settled();
  }

  /** Which way a resident faces at their place: toward whoever shares it with them now, else its own heading (A69). */
  protected placeYaw(ctx: ResidentContext): number {
    const company = this.destination.company?.filter((peer) => {
      if (!ctx.state.npcs[peer.id]?.available) return false;
      const goal = resolveGoal(NPCS[peer.id], ctx.state, ctx.hour);
      return goal.anchor === this.goal.anchor && (goal.activity === 'stand' || goal.activity === 'talk');
    });
    if (!company?.length) return this.destination.yaw;
    const x = company.reduce((sum, peer) => sum + peer.x, 0) / company.length, z = company.reduce((sum, peer) => sum + peer.z, 0) / company.length;
    return Math.atan2(x - this.x, z - this.z);
  }

  /**
   * Where a resident goes for a goal. A seat is sat down on from in front of it, where their clips begin getting down on
   * their feet, rather than from inside the bench; the seat's height is then taken from that spot's ground (A69).
   */
  protected placeFor(goal: Goal, ctx: ResidentContext): NpcPlace {
    // To bed: before its edge, facing out of it, to sit down on it and lie down (A70).
    const berth = goal.activity === 'rest' ? this.berthOf(ctx) : null;
    if (berth) return { x: berth.stand.x, z: berth.stand.z, yaw: berth.yaw, seat: berth.seat, seatBack: berth.seatBack };
    const place = npcGoalPosition(this.def, goal, ctx, this.height);
    // Resting at a seat ends where they stood up from it, not inside the bench.
    if ((goal.activity !== 'sit' && goal.activity !== 'rest') || place.seat === undefined) return place;
    const back = this.seatApproach(place.seat);
    if (!(back > .01)) return place;
    const x = place.x + Math.sin(place.yaw) * back, z = place.z + Math.cos(place.yaw) * back;
    const y = ctx.terrain.groundAt(x, z), seatGround = ctx.terrain.groundAt(place.x, place.z);
    // Only where a person can stand; otherwise they sit down from the seat's own place.
    if (!Number.isFinite(y) || !Number.isFinite(seatGround) || !ctx.terrain.walkable(x, z)
      || ctx.colliders.blocked(x, z, NPC_RADIUS, { minY: y + .02, maxY: y + this.height })) return place;
    return { ...place, x, z, seat: place.seat + seatGround - y, seatBack: back };
  }

  /** Out of their door, a resident faces the way they are going rather than the door they went in by (A69). */
  protected faceRoute() {
    const next = this.path?.[this.pi];
    this.yaw = next && Math.hypot(next.x - this.x, next.z - this.z) > .05 ? Math.atan2(next.x - this.x, next.z - this.z) : this.destination.yaw;
  }

  protected planRoute(ctx: ResidentContext, maintenance = false) {
    const from = { x: this.x, z: this.z }, to = this.destination;
    const continuingMaintenance = this.viaMaint;
    this.viaMaint = false;
    const rooms = (ctx.terrain as Partial<Terrain>).rooms;
    const inside = rooms?.at(from.x, from.z) ?? null, into = rooms?.at(to.x, to.z) ?? null;
    if (inside || into) {
      // In and out of a room by its doorway, on the room's own fine grid; between rooms by the paths outside (A70).
      const parts: (V2[] | null)[] = [];
      if (inside && inside === into) parts.push(roomRoute(inside, from, to, ctx.terrain, ctx.colliders, this.height));
      else {
        let start: V2 = from;
        if (inside) { parts.push(roomRoute(inside, from, roomDoorstep(inside), ctx.terrain, ctx.colliders, this.height)); start = roomDoorstep(inside); }
        const outside = into ? roomDoorstep(into) : to;
        if (Math.hypot(outside.x - start.x, outside.z - start.z) > .2) {
          parts.push(Math.hypot(outside.x - start.x, outside.z - start.z) <= 3 && clearNpcSegment(start, outside, ctx, this.height)
            ? [{ x: outside.x, z: outside.z }] : finishNpcPath(ctx.nav.findPath(start, outside), outside, ctx, this.height));
        }
        if (into) parts.push(roomRoute(into, outside, to, ctx.terrain, ctx.colliders, this.height));
      }
      this.path = parts.every(p => p) ? parts.flat() as V2[] : null;
    } else if (Math.hypot(to.x - from.x, to.z - from.z) <= 3 && clearNpcSegment(from, to, ctx, this.height)) {
      this.path = [{ x: to.x, z: to.z }];
    } else if (maintenance && this.def.id === 'maintenance_worker' && ctx.state.facts.ila_method === 'shortcut'
      && (continuingMaintenance || Math.hypot(this.x - MAINT_ROUTE[0]!.x, this.z - MAINT_ROUTE[0]!.z) < 30) && this.maintenanceCursor < MAINT_ROUTE.length) {
      let route = MAINT_ROUTE.slice(this.maintenanceCursor);
      const last = route.at(-1)!;
      if (continuingMaintenance && this.maintenanceCursor >= 2 && this.stuck > 1.5) {
        // Once through the gate, a new static obstruction needs a quarry-side detour, never a return to the ledge.
        const reconnect = finishNpcPath(ctx.nav.findPath(from, last), last, ctx, this.height);
        const end = reconnect?.at(-1);
        if (reconnect?.length && end && Math.hypot(end.x - last.x, end.z - last.z) < .15) route = reconnect;
      }
      const rest = finishNpcPath(ctx.nav.findPath(last, to), to, ctx, this.height);
      this.path = rest?.length ? [...route, ...rest] : route;
      this.viaMaint = true;
    } else this.path = finishNpcPath(ctx.nav.findPath(from, to), to, ctx, this.height);
    if (this.path?.length === 0) this.path = null;
    this.pi = 0;
    this.stuck = 0;
    this.routeFailures = this.path ? 0 : Math.min(3, this.routeFailures + 1);
    this.routeRetry = Math.min(8, 2 ** this.routeFailures) + (npcSeed(this.id) % 10) / 10;
  }

  protected passedWaypoint(point: V2) {
    if (!this.viaMaint) return;
    const index = MAINT_ROUTE.findIndex(p => p.x === point.x && p.z === point.z);
    if (index >= 0) this.maintenanceCursor = Math.max(this.maintenanceCursor, index + 1);
  }

  protected readonly contactScratch: Collider[] = [];
  protected readonly playerContact: CircleCollider = { id: 'player', kind: 'circle', x: 0, z: 0, r: .4, active: true };

  protected contacts(ctx: ResidentContext): Collider[] {
    const out = this.contactScratch, ownId = `person:${this.id}`;
    out.length = 0;
    for (const c of ctx.wildlifeContacts ?? []) if (c.active && c.id !== ownId) out.push(c);
    for (const c of ctx.residentContacts ?? []) if (c.active && c.id !== ownId) out.push(c);
    const player = this.playerContact;
    player.x = ctx.player.x; player.z = ctx.player.z;
    player.minY = ctx.player.y + .02; player.maxY = ctx.player.y + 1.9;
    out.push(player);
    return out;
  }

  /** A visitor in an open lane can be passed; an occupied doorway/workplace remains a polite wait. */
  protected tryPassing(ctx: ResidentContext, contacts: readonly Collider[]) {
    let joinIndex = this.pi, target = this.path?.[joinIndex];
    if (!target) return false;
    // A short grid corner is not the destination. Reconnect farther along the route, dropping the bypassed corners.
    while (Math.hypot(target.x - this.x, target.z - this.z) < 3 && joinIndex < this.path!.length - 1) target = this.path![++joinIndex]!;
    const dx = target.x - this.x, dz = target.z - this.z, distance = Math.hypot(dx, dz);
    // Within reach of their own place, with someone standing in the way: a step aside, then in (A70).
    if (distance < 3) return joinIndex === this.path!.length - 1 && this.stepAside(target, distance, ctx, contacts);
    const fx = dx / distance, fz = dz / distance;
    for (const side of [1, -1]) for (const width of [1.1, 1.65, 2.2]) {
      const a = { x: this.x + fz * width * side, z: this.z - fx * width * side };
      const b = { x: a.x + fx * 2.5, z: a.z + fz * 2.5 };
      const c = { x: this.x + fx * 2.8, z: this.z + fz * 2.8 };
      if (![a, b, c].every((point, i) => clearNpcSegment(i === 0 ? this : i === 1 ? a : b, point, ctx, this.height, contacts))) continue;
      // The remainder may cross an old corner's wall: static geometry must validate the new connection as well.
      if (!clearNpcSegment(c, target, ctx, this.height)) continue;
      for (const point of this.path!.slice(this.pi, joinIndex)) this.passedWaypoint(point);
      this.path = [a, b, c, ...this.path!.slice(joinIndex)];
      this.pi = 0; this.dynamicWait = 0; this.stuck = 0;
      return true;
    }
    return false;
  }

  /**
   * The last few metres to a free place, round someone standing in the way: a short step to one side, then straight in.
   * Before, a resident who had arrived first could hold the next one off for the whole meeting (A70). A place someone
   * stands on is still waited for, as a doorway or a work edge is.
   */
  protected stepAside(target: V2, distance: number, ctx: ResidentContext, contacts: readonly Collider[]) {
    if (distance < .2) return false;
    if (contacts.some(c => c.kind === 'circle' && Math.hypot(c.x - target.x, c.z - target.z) < c.r + NPC_RADIUS)) return false;
    const fx = (target.x - this.x) / distance, fz = (target.z - this.z) / distance;
    for (const side of [1, -1]) for (const width of [.8, 1.1, 1.4]) {
      const aside = { x: this.x + fz * width * side, z: this.z - fx * width * side };
      if (!clearNpcSegment(this, aside, ctx, this.height, contacts) || !clearNpcSegment(aside, target, ctx, this.height, contacts)) continue;
      this.path = [aside, { x: target.x, z: target.z }];
      this.pi = 0; this.dynamicWait = 0; this.stuck = 0;
      return true;
    }
    return false;
  }

  update(dt: number, ctx: ResidentContext) {
    dt = Number.isFinite(dt) ? Math.min(2, Math.max(0, dt)) : 0;
    const avail = ctx.state.npcs[this.def.id].available;
    if (!avail) {
      this.unavailable = true;
      this.speed = 0;
      this.absent = true;
      this.bodyShown(false);
      return;
    }
    if (!this.placed) this.snapToGoal(ctx);
    else if (this.rigChanged) {
      // The stand-in had no seat approach, so its spot sat inside the bench. Unseen until now, someone already at their
      // spot is put at the real one; someone on the way heads there instead.
      if (this.atDestination()) this.snapToGoal(ctx);
      else { this.destination = this.placeFor(this.goal, ctx); this.path = null; }
    }
    this.rigChanged = false;
    const contacts = this.contacts(ctx);
    const goal = resolveGoal(this.def, ctx.state, ctx.hour);
    const changed = goal.anchor !== this.goal.anchor || goal.activity !== this.goal.activity || goal.inside !== this.goal.inside;
    if (changed || this.unavailable) {
      const wasResting = this.goal.activity === 'rest';
      let appeared = false;
      // Getting up from a seat takes its clip's own time to stand: they walk off on their feet, not mid-rise (A69).
      if (this.mode === 'sit' || this.goal.activity === 'sit' && this.talking || this.lying) this.standDelay = Math.max(.85, this.standUpSeconds);
      this.goal = goal;
      if (goal.activity === 'rest') this.berthOf(ctx);
      this.destination = this.placeFor(goal, ctx);
      if (this.absent && goal.activity !== 'rest') {
        if (wasResting || this.waking) {
          // Share a doorway in turns, rather than materialising two bodies on the same home anchor.
          this.waking = true;
        } else {
          this.absent = false;
          appeared = true;
        }
      }
      if (goal.activity === 'rest') this.waking = false;
      this.unavailable = false;
      this.routeFailures = 0;
      this.routeRetry = 0;
      if (!this.atDestination()) this.planRoute(ctx, true);
      else this.path = null;
      if (appeared) this.faceRoute();
    }
    if (this.waking) {
      const y = ctx.terrain.groundAt(this.x, this.z);
      const resolved = ctx.colliders.resolve(this.x, this.z, NPC_RADIUS, `person:${this.id}`, { minY: y + .02, maxY: y + this.height }, contacts);
      if (Math.hypot(resolved.x - this.x, resolved.z - this.z) < .001) { this.absent = false; this.waking = false; this.faceRoute(); }
    }

    this.routeRetry = Math.max(0, this.routeRetry - dt);
    if (this.navVersion !== ctx.colliders.version) { this.navVersion = ctx.colliders.version; this.routeRetry = 0; }
    if (!this.absent && !this.talking && !this.atDestination() && this.routeRetry === 0 && (!this.path || this.stuck > 1.5 && this.dynamicWait === 0)) this.planRoute(ctx, this.viaMaint);

    this.clock += dt;
    const yawBefore = this.yaw;
    let moving = false;
    let travelled = 0;
    let dynamicBlocked = false;
    const substeps = Math.max(1, Math.ceil(dt / .05)), stepDt = dt / substeps;
    for (let sub = 0; sub < substeps; sub++) {
      // Lain down, they first sit up on the bed's edge, then get to their feet, then walk (A70).
      if (this.talking || this.absent || this.lie > 0 || this.standDelay > 0) {
        this.speed = 0;
        if (this.lie === 0) this.standDelay = Math.max(0, this.standDelay - stepDt);
        continue;
      }
      while (this.path && this.pi < this.path.length) {
        const wp = this.path[this.pi]!, d = Math.hypot(wp.x - this.x, wp.z - this.z);
        const last = this.pi === this.path.length - 1;
        // A waypoint near enough counts as passed only if the way on to the next is clear from here (A87 scout): a route
        // replanned off its usual line begins with a short step clear of furniture, and skipping it sent the resident
        // straight into a fireplace or a pillar, replanning the same route there ever after.
        const onward = this.path[this.pi + 1];
        if (d <= (last ? arrivalRadius(this.goal.activity) : .2)
          && (last || d <= .02 || !onward || clearNpcSegment(this, onward, ctx, this.height, contacts))) { this.passedWaypoint(wp); this.pi++; continue; }
        // Short, verified corner cuts keep a route from stopping at every grid vertex.
        const next = this.path[this.pi + 1];
        // Indoors the route is already drawn clear of the furniture: no corner is cut there (A70).
        if (next && d < .55 && !(ctx.terrain as Partial<Terrain>).rooms?.at(this.x, this.z)) {
          const n = Math.hypot(next.x - wp.x, next.z - wp.z), t = Math.min(1, .7 / (n || 1));
          const ahead = { x: wp.x + (next.x - wp.x) * t, z: wp.z + (next.z - wp.z) * t };
          if (clearNpcSegment(this, ahead, ctx, this.height, contacts)) { this.passedWaypoint(wp); this.pi++; continue; }
        }
        break;
      }
      if (this.path && this.pi >= this.path.length) this.path = null;
      if (!this.path) { this.speed = 0; continue; }
      const wp = this.path[this.pi]!;
      const dx = wp.x - this.x;
      const dz = wp.z - this.z;
      const d = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      this.yaw = turnToward(this.yaw, yaw, NPC_TURN_WALKING, stepDt);
      const alignment = Math.max(0, Math.cos(yaw - this.yaw));
      const final = this.pi === this.path.length - 1;
      let wanted = Math.min(NPC_WALK_SPEED, Math.sqrt(2 * NPC_BRAKING * Math.max(0, final ? d - arrivalRadius(this.goal.activity) : d))) * alignment;
      const ahead = Math.min(d, .65), y = walkingGround(ctx.terrain, this.x, this.z, this.y);
      const hit = ctx.colliders.cast(this.x, this.z, this.x + dx / d * ahead, this.z + dz / d * ahead, NPC_RADIUS,
        new Set([`person:${this.id}`]), { minY: y + .02, maxY: y + this.height }, contacts, true);
      if (hit) {
        const dynamic = contacts.some(c => c.id === hit.collider.id);
        // A wall only grazed (a door jamb, a table's corner) is slid along rather than braked for (A70).
        if (dynamic || -(hit.nx * dx + hit.nz * dz) / d > .35) wanted = Math.min(wanted, Math.sqrt(2 * NPC_BRAKING * Math.max(0, hit.t * ahead - .025)));
        dynamicBlocked ||= dynamic;
      }
      const change = (wanted > this.speed ? NPC_ACCELERATION : NPC_BRAKING) * stepDt;
      this.speed += Math.max(-change, Math.min(change, wanted - this.speed));
      const step = Math.min(d, this.speed * alignment * stepDt);
      const nx = this.x + dx / d * step, nz = this.z + dz / d * step, ny = walkingGround(ctx.terrain, nx, nz, y);
      if (!ctx.terrain.walkable(nx, nz) || !Number.isFinite(ny) || !riseOk(ctx.terrain, this.x, this.z, y, nx, nz, ny)) { this.speed = 0; continue; }
      const result = ctx.colliders.move(this.x, this.z, nx - this.x, nz - this.z, NPC_RADIUS, `person:${this.id}`,
        { minY: Math.min(y, ny) + .02, maxY: Math.max(y, ny) + this.height }, contacts);
      const travel = Math.hypot(result.x - this.x, result.z - this.z), ground = walkingGround(ctx.terrain, result.x, result.z, y);
      // An overlapping visitor must not throw a resident across the lane in a single resolve call.
      if (travel > step + .025 || !ctx.terrain.walkable(result.x, result.z) || !Number.isFinite(ground) || !riseOk(ctx.terrain, this.x, this.z, y, result.x, result.z, ground)) { this.speed = 0; continue; }
      this.x = result.x; this.z = result.z; this.y = ground;
      travelled += travel;
      if (result.hit && travel < step * .2) this.speed = 0;
    }

    const travel = travelled;
    moving = travel > 1e-6;
    this.stuck = this.path && !this.talking && this.standDelay === 0 && travel < dt * .03 ? this.stuck + dt : 0;
    this.dynamicWait = dynamicBlocked ? this.dynamicWait + dt : 0;
    if (this.dynamicWait > 1.25 && this.stuck > .5) this.tryPassing(ctx, contacts);

    if (!moving) {
      if (this.talking) {
        // Seated, they talk from their seat; standing, they turn to whom they are talking to (A69).
        if (!this.seatedHere()) {
          const to = this.faceTo ?? ctx.player;
          this.yaw = turnToward(this.yaw, Math.atan2(to.x - this.x, to.z - this.z), NPC_TURN_STANDING, dt);
        }
      } else if (!this.path && this.atDestination()) {
        const a = this.destination;
        this.yaw = turnToward(this.yaw, this.placeYaw(ctx), NPC_TURN_STANDING, dt);
        // Off to rest from a seat, they are on their feet first (A69).
        // Someone without a bed still goes in at their door; everyone else goes to bed (A70).
        if (this.goal.activity === 'rest' && !this.restBerth() && this.standDelay === 0 && Math.hypot(this.x - a.x, this.z - a.z) < 1.2) this.absent = true;
      }
    }
    // A turn on the spot is stepped round rather than glided like a statue on a turntable (A69).
    const turned = Math.abs(wrapAngle(this.yaw - yawBefore));
    const stepping = !moving && !this.absent && dt > 0 && turned > NPC_TURN_STEPPED * dt;
    // With their own turn clips they step round where they stand (A71); otherwise the walk is stepped round in place.
    const inPlace = this.stepsInPlace;
    const gait = moving ? travel : stepping && !inPlace ? turned * NPC_TURN_STRIDE * (this.height / 1.8) : 0;

    this.y = walkingGround(ctx.terrain, this.x, this.z, this.y);

    // Sat on their bed a moment, they lie down; spoken to, they sit up to talk, and lie down again after (A70).
    const seatedNow = this.seatedHere();
    const berth = this.restBerth();
    if (berth && seatedNow && !moving) { this.lying = berth; this.seatedFor += dt; } else if (!this.lying) this.seatedFor = 0;
    const alarmed = !!ctx.alarms?.some(a => Math.hypot(a.x - this.x, a.z - this.z) < NPC_ALARM_REACH);
    const lieWanted = berth !== null && this.lying === berth && seatedNow && !this.talking && !alarmed && this.seatedFor >= NPC_SIT_BEFORE_LYING;
    this.lie = Math.max(0, Math.min(1, this.lie + (lieWanted ? 1 : -1) * dt / NPC_LIE_SECONDS));
    // Sat up and off to somewhere else: the bed's edge is left as any seat is.
    if (this.lie === 0 && this.lying && (this.lying !== berth || !seatedNow)) { this.lying = null; this.seatedFor = 0; }
    const playerDistance = Math.hypot(ctx.player.x - this.x, ctx.player.z - this.z);

    let mode: ResidentMode = 'idle';
    // On a bed, sitting on it or lain down, they keep their seat until they are on their feet again (A70).
    const onBed = this.lying !== null && (this.lie > 0 || seatedNow);
    const seated = seatedNow || onBed;
    if (moving || (stepping && !inPlace)) mode = 'walk';
    else if (this.talking) mode = this.speaking ? 'talk' : seated ? 'sit' : 'idle';
    else if (onBed) mode = 'sit';
    else if (!this.path && this.atDestination()) {
      // Work only reads as work at a work place, facing it; a seat is sat on once they have turned to it (A69).
      const act = this.goal.activity;
      mode = act === 'work' && this.settled() ? 'work' : (act === 'sit' || this.restBerth()) && seated ? 'sit' : 'idle';
    }
    this.mode = mode;
    // Shown, placed and posed by whoever draws them: what they did this step is all a body needs to know.
    this.present({ mode, gait, turn: wrapAngle(this.yaw - yawBefore), seated, onBed, playerDistance }, dt, ctx);

    // Ambient remarks when the player passes close; the sleeping make none (A70).
    if (!this.hidden && this.lie === 0) {
      if (this.approachGreeting && this.def.approachGreeting) {
        const distance = Math.hypot(ctx.player.x - this.x, ctx.player.z - this.z, ctx.player.y - this.y);
        this.approachGreeting.update(dt, distance, !this.talking,
          () => ctx.onBark(this, this.def.approachGreeting!.line) === true);
        return;
      }
      this.barkCooldown -= dt;
      const pd = Math.hypot(ctx.player.x - this.x, ctx.player.z - this.z);
      if (this.barkCooldown <= 0 && pd < RESIDENT.barkReach && !this.talking) {
        const pool = eligibleBarks(this.def.id, ctx.state, ctx.hour);
        if (pool.length > 0) {
          const pick = pool[Math.floor(Math.random() * pool.length)]!;
          if (pick.line !== this.lastBarkKey || pool.length === 1) {
            this.lastBarkKey = pick.line;
            ctx.onBark(this, pick.line);
          }
        }
        this.barkCooldown = RESIDENT.bark[0] + Math.random() * RESIDENT.bark[1];
      }
    }
  }


}

