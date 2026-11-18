import { Colliders, FENCE_WALL_LIFT, PROP_COLLIDER, type CircleCollider, type Collider } from '../world/colliders';
import { cliffiness, shoreDistance } from '../world/coast';
import { LIGHTHOUSE, SEA_LEVEL, WORLD } from '../world/layout';
import { lighthouseSurfacesAt, lighthouseTreadTop } from '../world/lighthouse';
import { PLAYER_BODY_HEIGHT, PLAYER_BODY_RADIUS, PLAYER_FOOT_CLEARANCE, supportedPlayerHeight } from '../world/playerPlacement';
import { ROCK_STEP_HEIGHT } from '../world/rockContacts';
import { roadWeight, type Terrain } from '../world/terrain';
import type { Game } from '../game/game';
import {
  ACTION_COST as COST, ACTION_SECONDS as DUR, BLADE, blowFaced, FISTS, MOUNT_RUN, MOUNT_WALK, DODGE, ENGAGED_REACH, FIRM_FOOTING_SLOPE, GRAVITY, GROUND_FOLLOW_DROP, HIT_AT,
  JUMP_SPEED, MOVE_RESPONSE, resolveGuardedHit, SHEATHE_AFTER, STAMINA, STAMINA_MAX, staminaStep, STEP_HEIGHT, SWIM_DEPTH, SWIM_EXIT,
  SWIM_FLOAT, SWIM_SPEED, SWIM_SPRINT, VAULT, wadeFactor, type Arms, type StaminaState,
} from './hero';
import { HERO_WALK_SPEED, HERO_RUN_SPEED, HERO_GUARD_SPEED, HERO_WALK_CYCLE, HERO_RUN_CYCLE, HERO_RUN_THRESHOLD } from './heroLocomotion';
import { lerpAngle, type HostileActor } from './hostileActor';
import type { ResidentWalker } from './residentWalk';
import { deerBodyBlocked, deerBodyOverlap, gaitBob, MOUNT_SIDE, MOUNT_STAMINA, MOUNT_TIMES, mountStaminaStep, RIDE, steerMount } from './riding';
import { roomFloorSurface, type GroundSurface } from './soundscape';

/**
 * The wanderer, as the player drives him: walking, running, wading and swimming; the blow, the guard, the dodge and
 * the jump; vaulting a fence; getting onto the deer, riding it and getting down; being struck, and dying. It decides
 * and moves; it draws nothing and makes no sound. Whoever draws him extends this with the body, and is told each
 * step what the body should show.
 */

export type WandererState = 'free' | 'light' | 'heavy' | 'dodge' | 'hurt' | 'channel' | 'dead';

/** Getting onto or off the deer (A71): walking to its side, swinging up into the saddle, or stepping down beside it. */
export interface MountMove {
  kind: 'approach' | 'swing' | 'descend';
  t: number;
  id: string;
  seat: number;
  /** Where the deer stands, held there for the whole move. */
  deer: { x: number; y: number; z: number; yaw: number };
  /** The clear spot at its side the hero gets up from or down to. */
  side: { x: number; z: number };
  /** Where this phase began. */
  from: { x: number; z: number; yaw: number };
  stuck: number;
}
const PLAYER_RADIUS = PLAYER_BODY_RADIUS;
const VAULT_NEAR_SPAN = 0.6 + 0.12 + 0.7;
// Rise before crossing the rail, and finish crossing before descending beside it.
const VAULT_TRAVEL_START = 0.2;
function vaultEase(u: number, start = VAULT_TRAVEL_START): number {
  const travel = Math.max(0, Math.min(1, (u - start) / (1 - 2 * start)));
  return travel * travel * (3 - 2 * travel);
}
/** Sample terrain along the whole move, so a sprint/dodge cannot skip a solid face or water strip. */
const TERRAIN_STEP = 0.16;
/** Movable-body contacts share the authoritative player position with the static scenery controller. */
export interface WandererPhysics {
  move(x: number, y: number, z: number, dx: number, dz: number, grounded: boolean): { x: number; y: number; z: number };
  /** Pushes loose bodies along a step already accepted; `move` only asks where he can go (A106). */
  push?(x: number, y: number, z: number, dx: number, dz: number): void;
  /** Highest reachable top below feetY + STEP_HEIGHT, including supports far below a falling body. */
  supportAt(x: number, z: number, feetY: number): number | null;
  ceilingAt(x: number, z: number, radius: number, fromHeadY: number, toHeadY: number): number | null;
  /** Material of the support actually beneath the feet, so wood does not sound like masonry. */
  surfaceAt?(x: number, z: number, feetY: number): GroundSurface | null;
  /** Loose-body clearance along an airborne segment; padding encloses a curved path's chord error. */
  propsBlockBodySweep?(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, padding: number): boolean;
}

/** Inside the realm's walkable bounds (as Terrain.walkable keeps them): where he may be set down. */
const inRealm = (x: number, z: number) => x >= WORLD.minX + 4 && x <= WORLD.maxX - 4 && z >= WORLD.minZ + 4 && z <= WORLD.maxZ - 4;

/** The realm's water as the wanderer meets it: where it stands and moves, and what disturbing it does. */
export interface WandererWater {
  sample(x: number, z: number): { surface: number; bed: number; depth: number; flowX: number; flowZ: number; body?: string } | null;
  splash(x: number, y: number, z: number, energy: number, push?: { x: number; z: number }, kind?: 'splash' | 'plop' | 'enter' | 'stroke' | 'wade'): void;
  disturb(x: number, z: number, radius: number, strength: number, foam?: number): void;
  emit(kind: 'enter' | 'exit' | 'stroke' | 'wade' | 'dive' | 'surface', x: number, y: number, z: number, energy?: number): void;
}

/** The controls as the wanderer reads them: actions, never devices. */
export interface WandererControls {
  /** Movement: x right, y forward; length at most 1. */
  move(): { x: number; y: number };
  held(action: 'block' | 'sprint'): boolean;
  /** True once for each press. */
  pressed(action: 'attack' | 'heavy' | 'dodge' | 'jump'): boolean;
  /** Lets go of a control that is toggled rather than held. */
  clearToggle(action: 'block' | 'sprint'): void;
  /** A menu is open over the game. */
  readonly uiOpen: boolean;
}

/** The sounds his actions make, for whoever plays them. */
export interface WandererSounds {
  footstep(surface: GroundSurface, running: boolean): void;
  jump(surface: GroundSurface): void;
  land(surface: GroundSurface, fallSpeed: number): void;
  dodge(surface: GroundSurface): void;
  swing(heavy: boolean, armed?: boolean): void;
  hit(kind: 'flesh' | 'block' | 'perfect', armed?: boolean): void;
  hurt(): void;
}

/** A hostile as the wanderer meets one, and a resident as a body in his way. */
export type WandererFoe = Pick<HostileActor, 'id' | 'x' | 'y' | 'z' | 'alive' | 'engaged' | 'radius' | 'takeHit' | 'parried'>;
export type WandererNeighbour = Pick<ResidentWalker, 'id' | 'x' | 'y' | 'z' | 'hidden'>;

export interface WandererContext {
  terrain: Terrain;
  /** Wading and swimming follow the realm's water when it is given; without it deep water simply blocks. */
  water?: WandererWater;
  colliders: Colliders;
  input: WandererControls;
  game: Game;
  audio: WandererSounds;
  enemies: readonly WandererFoe[];
  npcs: readonly WandererNeighbour[];
  /** Moving peaceful animals participate in the same swept contacts as residents. */
  wildlifeContacts?: readonly Collider[];
  physics?: WandererPhysics;
  /** The way the camera looks, which movement is relative to. */
  viewYaw: number;
  /** False while reading, paused or in a menu: he holds still and nothing he was doing finishes. */
  controllable: boolean;
  onHitEnemy(foe: WandererFoe, killed: boolean, heavy: boolean): void;
  onHurt(damage: number, blocked: boolean): void;
  onDeath(): void;
  onBoundary(): void;
  onSandStep?(x: number, feet: number, z: number, yaw: number): void;
}

/** What his body is doing, for whoever poses it. */
export type WandererStance = 'idle' | 'walk' | 'run' | 'attack_light' | 'attack_heavy' | 'block' | 'dodge' | 'hurt' | 'work' | 'sit' | 'dead' | 'swim';

/** What the body should show this step. */
export interface WandererPosture {
  mode: WandererStance;
  /** 0..1 through a timed action (a blow, a dodge, a flinch). */
  t: number;
  /** 0..1 of the pace for this stance. */
  speed: number;
  /** The gait's running phase while walking, running or guarding; a plain clock otherwise. */
  time: number;
  grounded: boolean;
  /** Metres walked this step, for feet that follow the ground rather than a clip. */
  travel: number;
  /** Metres a second over the ground. */
  moveSpeed: number;
  /** The way of travel against the way he faces, radians (0 ahead), where guard or aim lets them differ. */
  heading: number;
  /** How far he turned since the last pose, radians; 0 for a jump of the facing. */
  turn: number;
  /** How high above his feet the hips ride: the saddle, its bob, or the arc up to it. */
  seat: number;
  /** His lean into the deer's turn, radians. */
  lean: number;
  /** Astride the deer, or part way onto or off it. */
  straddle: boolean;
  /** Getting up into the saddle: 0 standing beside the deer .. 1 seated. */
  mountSwing: number;
}

export class Wanderer {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  vy = 0;
  vx = 0;
  vz = 0;
  grounded = true;
  state: WandererState = 'free';
  stamina = STAMINA_MAX;
  exhausted = false;
  blocking = false;
  blockTime = 0;
  private timer = 0;
  private dur = 0;
  private hitDone = false;
  private heavy = false;
  private staminaPause = 0;
  /** The meter handed to the core's stamina rule each step; one object, reused. */
  private readonly staminaMeter: StaminaState = { stamina: STAMINA_MAX, pause: 0, exhausted: false };
  private iframes = 0;
  private dodgeDir = { x: 0, z: 0 };
  private stepDist = 0;
  private clock = 0;
  private gaitTime = 0;
  /** The facing at the last pose, for how far the hero turned between poses (A70). */
  private poseYaw = 0;
  channel: { label: string; t: number; dur: number; done: () => void; kind?: 'skinning'; cancelled?: () => void } | null = null;
  shake = 0;
  /** Swimming in water too deep to stand in; the depth of water at the feet (m, 0 on dry ground). */
  swimming = false;
  waterDepth = 0;
  /** Riding the saddled deer (A70): which animal, how high its saddle sits, and its walking and running pace. */
  mount: { id: string; seat: number } | null = null;
  private mountBob = 0;
  /** Getting up or down (A71): input is locked until it ends; null while seated or afoot. */
  mountMove: MountMove | null = null;
  /** The deer's own gallop stamina, and whether it is spent until it has recovered (A71). */
  mountStamina: number = MOUNT_STAMINA.max;
  mountSpent = false;
  galloping = false;
  /** The deer's speed along its facing (negative backing up) and turn rate (rad/s) (A71). */
  rideSpeed = 0;
  rideTurn = 0;
  private lean = 0;
  /** The ridden deer's gait phase (0..1 over a stride), from its animation; null uses speed alone. */
  private gaitPhase: number | null = null;
  /** How high above his feet the hips' root rides this frame: the saddle, its bob, or the arc up to it. */
  seatHeight = 0;
  get leanAngle() { return this.lean; }
  private soaked = 0;
  private wakeClock = 0;
  private strokeClock = 0;
  private splashedAt = -Infinity;
  surface: GroundSurface = 'grass';
  lastMoveSpeed = 0;
  mode: WandererStance = 'idle';
  /** Whether the blade is in hand (only when the wanderer has one). */
  drawn = false;
  private calm = 0;
  private shown: 'none' | 'sheathed' | 'drawn' | null = null;
  /** Whether the bow is equipped, and whether an aim is held. What is drawn follows these. */
  private bowReady = false;
  private aimHeld = false;
  protected skinningHeight: number | undefined;
  private skinningArms: 'none' | 'sheathed' | 'drawn' = 'none';

  /*
   * What the body is told, and what it reports. Each does nothing here; whoever draws the wanderer overrides them.
   */
  /** Whether the body reports its own heel strikes and swimming strokes; where it does not, they follow distance and time. */
  protected get stridesFromBody(): boolean { return false; }
  /** Heel strikes since last asked. */
  protected bodyFootfalls(): number { return 0; }
  /** Swimming strokes since last asked. */
  protected bodyStrokes(): number { return 0; }
  /** The blade: not carried, on the hip, or in hand. */
  protected armsShown(_state: 'none' | 'sheathed' | 'drawn'): void {}
  protected bowShown(_equipped: boolean): void {}
  protected aimShown(_direction: { x: number; y: number; z: number } | null, _draw: number): void {}
  /** Skinning a carcass: how far through (null when not), for how long, and how high the carcass lies above his feet. */
  protected skinningShown(_progress: number | null, _seconds?: number, _height?: number): void {}
  /** Whatever the bow or the knife added to the pose is taken off again. */
  protected poseCleared(): void {}
  /** He has been set down somewhere: the body goes there at once, at rest. */
  protected bodyPlaced(): void {}
  /** A blow landed on him. */
  protected bodyStruck(): void {}
  /** Once a step, after everything is decided. */
  protected present(_dt: number, _ctx: WandererContext, _posture: WandererPosture): void {}

  /** Ownership and equipment are distinct: carrying the wreck's blade never silently equips it. */
  arms(game: Game): Arms {
    return game.state.equippedWeapon === 'rusted_sword' && (game.state.inventory.rusted_sword ?? 0) > 0 ? BLADE : FISTS;
  }

  bowEquipped(game: Game): boolean {
    return String(game.state.equippedWeapon) === 'hunting_bow' &&
      ((game.state.inventory as Partial<Record<string, number>>).hunting_bow ?? 0) > 0;
  }

  get bowAiming(): boolean { return this.bowReady && this.aimHeld && this.state === 'free' && !this.swimming; }

  private equipBow(equipped: boolean): void {
    this.bowReady = equipped;
    if (!equipped) this.aimHeld = false;
    this.bowShown(equipped);
  }

  private aim(direction: { x: number; y: number; z: number } | null, draw = 0): void {
    this.aimHeld = direction !== null && [direction.x, direction.y, direction.z].every(Number.isFinite) &&
      direction.x * direction.x + direction.y * direction.y + direction.z * direction.z > 1e-8;
    this.aimShown(direction, draw);
  }

  /** Gameplay supplies the camera/muzzle target direction and the normalized draw charge. */
  setBowAim(direction: { x: number; y: number; z: number } | null, drawProgress = 0): void {
    if (this.swimming) direction = null;
    this.aim(this.state === 'free' && this.alive ? direction : null, drawProgress);
    if (direction && this.state === 'free' && Number.isFinite(direction.x) && Number.isFinite(direction.z) &&
      Math.hypot(direction.x, direction.z) > .001) this.yaw = Math.atan2(direction.x, direction.z);
  }

  get skinningProgress(): number | null {
    return this.channel?.kind === 'skinning' ? Math.min(1, this.channel.t / this.channel.dur) : null;
  }

  beginSkinning(targetX: number, targetZ: number, duration = 3, done: () => void = () => {}, cancelled?: () => void, targetHeight?: number): boolean {
    if (!this.grounded || ![targetX, targetZ, duration].every(Number.isFinite) || duration <= 0 ||
      !this.beginChannel('Skinning animal', duration, done)) return false;
    this.channel!.kind = 'skinning';
    this.channel!.cancelled = cancelled;
    this.skinningArms = this.shown ?? 'none';
    this.showArms('none');
    this.skinningHeight = targetHeight !== undefined && Number.isFinite(targetHeight) ? targetHeight - this.y : .4;
    this.yaw = Math.atan2(targetX - this.x, targetZ - this.z);
    this.setBowAim(null);
    this.skinningShown(0, 0, this.skinningHeight);
    return true;
  }

  cancelSkinning(): void { if (this.channel?.kind === 'skinning') this.cancelChannel(); }

  /** Equipment changes remain visible while inventory pauses the world; an unfinished blow cannot change weapon halfway through. */
  syncEquipment(game: Game, draw = false) {
    if (this.state === 'light' || this.state === 'heavy') {
      this.state = 'free';
      this.timer = this.dur = 0;
      this.hitDone = true;
    }
    this.blocking = false;
    this.blockTime = 0;
    const armed = this.arms(game) === BLADE;
    this.cancelSkinning();
    this.equipBow(this.bowEquipped(game));
    this.drawn = armed && draw;
    this.calm = 0;
    this.showArms(!armed ? 'none' : this.drawn ? 'drawn' : 'sheathed');
  }

  /** Re-selecting the held blade readies it without cancelling a blow or dropping guard. */
  readyWeapon(game: Game) {
    if (this.alive && this.bowEquipped(game)) { this.equipBow(true); return; }
    if (!this.alive || this.arms(game) !== BLADE) return;
    this.drawn = true;
    this.calm = 0;
    this.showArms('drawn');
  }

  protected showArms(state: 'none' | 'sheathed' | 'drawn') {
    if (this.shown === state) return;
    this.shown = state;
    this.armsShown(state);
  }

  get alive() {
    return this.state !== 'dead';
  }

  get invulnerable() {
    return this.iframes > 0;
  }

  get facing() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  /** Climb into the saddle of an animal standing at (x, z) facing yaw (A70). */
  mountUp(id: string, seat: number, x: number, y: number, z: number, yaw: number) {
    this.cancelSkinning();
    this.mount = { id, seat };
    this.mountMove = null;
    this.rideSpeed = this.rideTurn = 0;
    this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.poseYaw = yaw;
    this.vx = this.vz = this.vy = 0; this.grounded = true; this.blocking = false;
  }

  /** The ridden deer's gait phase from its animation, so the saddle rises with its footfalls (A71). */
  setMountGait(phase: number | null) { this.gaitPhase = phase !== null && Number.isFinite(phase) ? phase : null; }

  /**
   * Begin getting onto the deer standing at `deer` (A71): walk to a clear spot at its side (the nearer clear one), then
   * swing up over MOUNT_TIMES.swing. Returns false when neither side is clear or he cannot start now.
   */
  beginMount(id: string, seat: number, deer: { x: number; y: number; z: number; yaw: number }, ctx: Pick<WandererContext, 'colliders'>): boolean {
    if (this.mount || this.mountMove || this.vault || !this.grounded || !this.alive || this.state !== 'free' || this.swimming) return false;
    const bounds = { minY: deer.y + PLAYER_FOOT_CLEARANCE, maxY: deer.y + PLAYER_BODY_HEIGHT };
    const sides = [1, -1].map((s) => ({ x: deer.x + Math.cos(deer.yaw) * MOUNT_SIDE * s, z: deer.z - Math.sin(deer.yaw) * MOUNT_SIDE * s }))
      .filter((p) => !ctx.colliders.blocked(p.x, p.z, PLAYER_RADIUS, bounds))
      .sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z));
    const side = sides[0];
    if (!side) return false;
    this.cancelSkinning();
    this.blocking = false;
    const near = Math.hypot(side.x - this.x, side.z - this.z) < 0.08;
    this.mountMove = { kind: near ? 'swing' : 'approach', t: 0, id, seat, deer: { ...deer }, side, from: { x: this.x, z: this.z, yaw: this.yaw }, stuck: 0 };
    return true;
  }

  /** Begin stepping down beside the deer (A71); in deep water or with no clear side he is put down at once. */
  beginDismount(ctx: Pick<WandererContext, 'terrain' | 'colliders' | 'water'>): boolean {
    if (!this.mount || this.mountMove) return false;
    const spot = this.dismountSpot(ctx);
    if (!spot) { this.dismount(ctx); return false; }
    this.mountMove = { kind: 'descend', t: 0, id: this.mount.id, seat: this.mount.seat, deer: { x: this.x, y: this.y, z: this.z, yaw: this.yaw },
      side: spot, from: { x: this.x, z: this.z, yaw: this.yaw }, stuck: 0 };
    this.mount = null;
    this.rideSpeed = this.rideTurn = 0;
    this.vx = this.vz = 0;
    return true;
  }

  /** Stop getting up or down where it is safe (A71): back where he stood before swinging up, or already beside the deer. */
  cancelMount(ctx: Pick<WandererContext, 'terrain'>) {
    const m = this.mountMove;
    if (!m) return;
    this.mountMove = null;
    if (m.kind === 'approach') return;
    const at = m.kind === 'swing' ? m.from : m.side;
    this.x = at.x; this.z = at.z;
    this.y = ctx.terrain.supportAt(at.x, at.z, this.y + 0.5);
    this.vx = this.vz = this.vy = 0; this.grounded = true;
  }

  /** How far through getting up (0 afoot .. 1 seated), for the pose and the saddle height. */
  get mountProgress(): number {
    const m = this.mountMove;
    if (!m || m.kind === 'approach') return this.mount ? 1 : 0;
    const s = Math.min(1, m.t / (m.kind === 'swing' ? MOUNT_TIMES.swing : MOUNT_TIMES.descend));
    return m.kind === 'swing' ? s : 1 - s;
  }

  /** Advance getting up or down; true while it holds the hero (his own movement and facing then wait). */
  private stepMountMove(dt: number, ctx: WandererContext): boolean {
    const m = this.mountMove;
    if (!m) return false;
    if (this.state !== 'free' || !this.alive || this.swimming) { this.cancelMount(ctx); return false; }
    m.t += dt;
    this.vx = this.vz = 0;
    if (m.kind === 'approach') {
      const dx = m.side.x - this.x, dz = m.side.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        m.kind = 'swing'; m.t = 0; m.from = { x: this.x, z: this.z, yaw: this.yaw };
        return true;
      }
      const step = Math.min(d, HERO_WALK_SPEED * dt), bx = this.x, bz = this.z;
      this.tryMove(dx / d * step, dz / d * step, ctx);
      this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
      m.stuck = Math.hypot(this.x - bx, this.z - bz) < step * 0.3 ? m.stuck + dt : 0;
      if (m.stuck > 0.5 || m.t > MOUNT_TIMES.approachMax) this.mountMove = null;
      return true;
    }
    const dur = m.kind === 'swing' ? MOUNT_TIMES.swing : MOUNT_TIMES.descend;
    const s = Math.min(1, m.t / dur), e = s * s * (3 - 2 * s);
    const a = m.kind === 'swing' ? m.from : m.deer, b = m.kind === 'swing' ? m.deer : m.side;
    this.x = a.x + (b.x - a.x) * e;
    this.z = a.z + (b.z - a.z) * e;
    if (m.kind === 'swing') this.yaw = lerpAngle(m.from.yaw, m.deer.yaw, Math.min(1, e * 1.6));
    if (s < 1) return true;
    if (m.kind === 'swing') this.mountUp(m.id, m.seat, m.deer.x, this.y, m.deer.z, m.deer.yaw);
    else {
      this.mountMove = null;
      this.y = this.supportAt(this.x, this.z, ctx, this.y + 0.5);
      this.vy = 0; this.grounded = true;
    }
    return true;
  }

  /** In the saddle: steer the deer with bounded turning and pace, its whole body kept out of walls and doorways (A71). */
  private rideStep(dt: number, wx: number, wz: number, mag: number, wantGallop: boolean, ctx: WandererContext) {
    const gallop = wantGallop && !this.mountSpent;
    const precise = Boolean(ctx.physics);
    const startBlocked = deerBodyBlocked(ctx.colliders, this.x, this.y, this.z, this.yaw, precise);
    // Starting in trouble (set down where its body overlaps), a move may not make it worse: not deeper into scenery, never
    // further into a doorway or room (A71). Before, every body check was skipped, and a deer could be ridden indoors.
    const start = startBlocked ? deerBodyOverlap(ctx.colliders, this.x, this.y, this.z, this.yaw, precise) : null;
    const worse = (x: number, y: number, z: number, yaw: number) => {
      if (!start) return deerBodyBlocked(ctx.colliders, x, y, z, yaw, precise);
      const now = deerBodyOverlap(ctx.colliders, x, y, z, yaw, precise);
      return now.scenery > start.scenery || now.rooms > start.rooms;
    };
    const next = steerMount({ speed: this.rideSpeed, yaw: this.yaw }, wx, wz, mag, gallop, dt);
    if (!worse(this.x, this.y, this.z, next.yaw)) {
      this.yaw = next.yaw; this.rideTurn = next.turn;
    } else this.rideTurn = 0;
    this.rideSpeed = next.speed;
    const f = this.facing, travel = this.rideSpeed * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(travel) / 0.08));
    let hit = false;
    for (let i = 0; i < steps && !hit; i++) {
      const px = this.x, py = this.y, pz = this.z, ask = travel / steps;
      this.tryMove(f.x * ask, f.z * ask, ctx);
      if (worse(this.x, this.y, this.z, this.yaw)) { this.x = px; this.y = py; this.z = pz; hit = true; }
      else if (Math.hypot(this.x - px, this.z - pz) < Math.abs(ask) * 0.3) hit = true;
    }
    // A deer that walks into something stops dead rather than grinding along it.
    if (hit) this.rideSpeed = 0;
    this.vx = f.x * this.rideSpeed; this.vz = f.z * this.rideSpeed;
    this.galloping = gallop && this.rideSpeed > RIDE.walk + 0.3;
    this.mountStamina = mountStaminaStep(this.mountStamina, this.galloping, dt);
    if (this.mountStamina <= MOUNT_STAMINA.spent) { this.mountSpent = true; ctx.input.clearToggle('sprint'); }
    else if (this.mountSpent && this.mountStamina >= MOUNT_STAMINA.resume) this.mountSpent = false;
  }

  /** Step down beside the mount; returns where he stands. */
  dismount(ctx: Pick<WandererContext, 'terrain' | 'colliders' | 'water'>): void {
    if (this.mountMove) this.cancelMount(ctx);
    if (!this.mount) return;
    this.mount = null;
    this.rideSpeed = this.rideTurn = 0;
    // Step down to a side that is clear, inside the realm and not deep water; failing that, a clear side inside the realm
    // (A70). Never past the realm's edge (A90 scout: it could set him 2.2 m beyond it).
    const deep = (x: number, z: number) => this.deepUnder(x, z, ctx);
    let placed = false;
    for (const side of [1, -1, 2, -2, 3, -3]) {
      const a = this.yaw + side * Math.PI / 2, d = Math.abs(side) === 3 ? 2.2 : Math.abs(side) === 2 ? 1.6 : 1.1;
      const x = this.x + Math.sin(a) * d, z = this.z + Math.cos(a) * d;
      if (inRealm(x, z) && !ctx.colliders.blocked(x, z, PLAYER_RADIUS) && !deep(x, z)) { this.x = x; this.z = z; placed = true; break; }
    }
    if (!placed) for (const side of [1, -1]) {
      const a = this.yaw + side * Math.PI / 2, x = this.x + Math.sin(a) * 1.1, z = this.z + Math.cos(a) * 1.1;
      if (inRealm(x, z) && !ctx.colliders.blocked(x, z, PLAYER_RADIUS)) { this.x = x; this.z = z; break; }
    }
    // In deep water he is set down at the surface and swims; elsewhere on the ground.
    const water = ctx.water?.sample(this.x, this.z), support = ctx.terrain.supportAt(this.x, this.z, this.y + 0.5);
    this.y = water && water.surface - support > 0.9 ? water.surface - 1.1 : support;
    this.vx = this.vz = this.vy = 0; this.grounded = true;
  }

  /** A clear, shallow spot beside the saddle to step down to, or null (A71). */
  /** Water deeper than 0.9 m over what he would stand on: a bridge deck above a deep stream is footing (A100 scout). */
  private deepUnder(x: number, z: number, ctx: Pick<WandererContext, 'terrain' | 'water'>): boolean {
    const water = ctx.water?.sample(x, z);
    return !!water && water.depth > 0.9 && water.surface - ctx.terrain.supportAt(x, z, this.y + 0.5) > 0.9;
  }

  private dismountSpot(ctx: Pick<WandererContext, 'terrain' | 'colliders' | 'water'>): { x: number; z: number } | null {
    const deep = (x: number, z: number) => this.deepUnder(x, z, ctx);
    if (deep(this.x, this.z)) return null;
    const bounds = { minY: this.y + PLAYER_FOOT_CLEARANCE, maxY: this.y + PLAYER_BODY_HEIGHT };
    for (const side of [1, -1]) {
      const a = this.yaw + side * Math.PI / 2, x = this.x + Math.sin(a) * MOUNT_SIDE, z = this.z + Math.cos(a) * MOUNT_SIDE;
      if (inRealm(x, z) && !ctx.colliders.blocked(x, z, PLAYER_RADIUS, bounds) && !deep(x, z)) return { x, z };
    }
    return null;
  }

  setPosition(x: number, z: number, yaw: number, terrain: Terrain, feetY?: number, afloat = false) {
    this.vault = null;
    this.mount = null;
    this.mountMove = null;
    this.rideSpeed = this.rideTurn = 0;
    this.cancelSkinning();
    this.poseCleared();
    this.aim(null);
    this.skinningShown(null);
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    // A placement is not a turn: the pose takes this facing as its own (A91 scout: a respawn stepped round on the spot).
    this.poseYaw = yaw;
    // Afloat (a swimmer saved or caught where he swims), he is put back at the saved height, above the bed: the standing
    // rule took him to the seabed, the camera under with him (A89 scout).
    this.y = afloat && feetY !== undefined && Number.isFinite(feetY) ? Math.max(feetY, terrain.groundAt(x, z) + 0.05) : supportedPlayerHeight(terrain, x, z, feetY);
    this.vx = this.vy = this.vz = 0;
    this.grounded = true;
    this.state = 'free';
    this.timer = this.dur = 0;
    this.hitDone = false;
    this.heavy = false;
    this.iframes = 0;
    this.shake = 0;
    this.blocking = false;
    this.blockTime = 0;
    this.dodgeDir = { x: 0, z: 0 };
    this.lastMoveSpeed = 0;
    this.stepDist = 0;
    this.gaitTime = 0;
    this.staminaPause = 0;
    this.exhausted = this.stamina <= 0.01;
    this.drawn = false;
    this.calm = 0;
    this.swimming = false;
    this.waterDepth = 0;
    this.soaked = this.wakeClock = this.strokeClock = 0;
    this.mode = 'idle';
    this.channel = null;
    this.bodyPlaced();
  }

  beginChannel(label: string, dur: number, done: () => void) {
    if (this.state !== 'free' || this.swimming) return false;
    this.state = 'channel';
    this.channel = { label, t: 0, dur, done };
    this.blocking = false;
    this.vx = this.vz = this.lastMoveSpeed = 0;
    return true;
  }

  cancelChannel() {
    if (this.state === 'channel') {
      const cancelled = this.channel?.cancelled;
      if (this.channel?.kind === 'skinning') this.showArms(this.skinningArms);
      this.state = 'free';
      this.channel = null;
      this.skinningShown(null);
      this.poseCleared();
      cancelled?.();
    }
  }

  private surfaceAt(ctx: WandererContext): GroundSurface {
    const movableSurface = ctx.physics?.surfaceAt?.(this.x, this.z, this.y);
    if (movableSurface) return movableSurface;
    if (ctx.terrain.deckAt(this.x, this.z)) return 'deck';
    const floor = roomFloorSurface(ctx.terrain, this.x, this.z);
    if (floor) return floor;
    const support = this.supportAt(this.x, this.z, ctx);
    if (support > ctx.terrain.groundAt(this.x, this.z) + 0.02) {
      // The lighthouse list also contains low stone doorsteps; only the elevated stair/gallery treads are wood.
      const wood = lighthouseSurfacesAt(this.x, this.z).some((height) => height >= lighthouseTreadTop(0) - 1e-6 &&
        Math.abs(ctx.terrain.heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z) + height - support) < 0.02);
      return wood ? 'deck' : 'stone';
    }
    if (ctx.water ? this.waterDepth > 0.06 : ctx.terrain.carveAt(this.x, this.z) > 0.12 || ctx.terrain.seaDepth(this.x, this.z) > 0.12) return 'water';
    if (roadWeight(this.x, this.z) > 0.55) return 'road';
    if (ctx.terrain.slopeAt(this.x, this.z) > 0.5) return 'stone';
    if (shoreDistance(this.x, this.z) < 26 && cliffiness(this.z) < 0.5 && this.x < -200) return 'sand';
    return 'grass';
  }

  protected supportAt(x: number, z: number, ctx: WandererContext, feetY = this.y): number {
    const base = Math.max(ctx.terrain.supportAt(x, z, feetY), ctx.physics?.supportAt(x, z, feetY) ?? -Infinity);
    // Low furniture is landed on, not sunk into, where the body fits above it (a stool under a table does not) (A70).
    const top = ctx.colliders.lowTopAt(x, z, PLAYER_RADIUS * 0.6, feetY);
    if (top === null || top <= base) return base;
    const above = { minY: top + PLAYER_FOOT_CLEARANCE, maxY: top + PLAYER_BODY_HEIGHT, excludePrecise: Boolean(ctx.physics) };
    return ctx.colliders.blocked(x, z, PLAYER_RADIUS, above) ? base : top;
  }

  /** Reachable standing windows select stairs for walking, but a fast fall must also meet surfaces crossed this frame. */
  private fallingSupport(nextY: number, support: number, ctx: WandererContext): number {
    if (nextY >= this.y || support >= this.y - STEP_HEIGHT) return support;
    const samples = Math.min(64, Math.max(1, Math.ceil((this.y - nextY) / 0.4)));
    for (let i = 1; i <= samples; i++) {
      const feetY = this.y + (nextY - this.y) * i / samples;
      const crossed = this.supportAt(this.x, this.z, ctx, feetY);
      // A nearby overhead tread is never a foothold above the descending body's previous feet.
      if (crossed <= this.y + 1e-6) support = Math.max(support, crossed);
    }
    return support;
  }

  /** Source-supported rocks use the modest ledge budget; authored stairs retain their established step height. */
  private stepHeightAt(x: number, z: number, support: number, ctx: WandererContext): number {
    const rock = ctx.terrain.rockSupportAt?.(x, z, this.y);
    return rock !== null && rock !== undefined && support > ctx.terrain.groundAt(x, z) + .02 &&
      Math.abs(rock - support) < .01 ? ROCK_STEP_HEIGHT : STEP_HEIGHT;
  }

  /** A hillside is contact geometry, not a horizontal fence derived from a slope cutoff. */
  private travelAllowed(x: number, z: number, feetY: number, ctx: WandererContext): boolean {
    if (ctx.terrain.walkable(x, z, Infinity, feetY)) return true;
    // Water too deep to walk in is waded or swum, anywhere inside the realm.
    if (!ctx.water || x < WORLD.minX + 4 || x > WORLD.maxX - 4 || z < WORLD.minZ + 4 || z > WORLD.maxZ - 4) return false;
    if (ctx.terrain.valleyRadius(x, z) > 1.02) return false;
    // With the realm's water known, the terrain's own guess at deep water (a carved bed, ground below the sea's level)
    // no longer fences: a bed with little or no water in it is walked, one with more waded or swum (A89 scout: some
    // 960 m2 of dry or trickling ditch stood as invisible walls).
    return true;
  }

  /** Gravity along exposed steep ground lets loose footing slide downhill instead of holding a vertical pose. */
  private downhillGravity(ctx: WandererContext): { x: number; z: number; slip: number } {
    if (!this.grounded || ctx.terrain.deckAt(this.x, this.z)) return { x: 0, z: 0, slip: 0 };
    const bareGround = ctx.terrain.groundAt(this.x, this.z);
    if (this.supportAt(this.x, this.z, ctx) > bareGround + 0.02) return { x: 0, z: 0, slip: 0 };
    const slope = ctx.terrain.slopeAt(this.x, this.z);
    if (slope <= FIRM_FOOTING_SLOPE) return { x: 0, z: 0, slip: 0 };
    const e = 0.3;
    const groundAt = ctx.terrain.heightAt?.bind(ctx.terrain) ?? ctx.terrain.groundAt.bind(ctx.terrain);
    const dx = (groundAt(this.x + e, this.z) - groundAt(this.x - e, this.z)) / (2 * e);
    const dz = (groundAt(this.x, this.z + e) - groundAt(this.x, this.z - e)) / (2 * e);
    const slip = Math.min(1, Math.max(0, (slope - FIRM_FOOTING_SLOPE) / 0.3));
    const normalLengthSquared = 1 + dx * dx + dz * dz;
    return { x: -GRAVITY * dx / normalLengthSquared * slip, z: -GRAVITY * dz / normalLengthSquared * slip, slip };
  }

  private readonly contactRows: Collider[] = [];
  private readonly residentContactRows = new WeakMap<object, CircleCollider>();
  private readonly enemyContactRows = new WeakMap<object, CircleCollider>();

  private bodyContact(actor: { id: string; x: number; y: number; z: number }, radius: number, prefix: string, records: WeakMap<object, CircleCollider>): CircleCollider {
    let contact = records.get(actor);
    if (!contact) {
      contact = { id: `${prefix}:${actor.id}`, kind: 'circle', x: 0, z: 0, r: radius, active: true, minY: 0, maxY: 0 };
      records.set(actor, contact);
    }
    contact.x = actor.x; contact.z = actor.z; contact.r = radius;
    contact.minY = actor.y; contact.maxY = actor.y + 2.1;
    return contact;
  }

  /** Borrowed until the next query; movement and settling consume these contacts synchronously. */
  private contacts(ctx: WandererContext): Collider[] {
    const contacts = this.contactRows;
    contacts.length = 0;
    if (ctx.wildlifeContacts) for (const contact of ctx.wildlifeContacts) contacts.push(contact);
    for (const n of ctx.npcs) {
      if (n.hidden || !ctx.game.state.npcs[n.id]?.available) continue;
      contacts.push(this.bodyContact(n, .35, 'person', this.residentContactRows));
    }
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      contacts.push(this.bodyContact(e, e.radius, 'enemy', this.enemyContactRows));
    }
    return contacts;
  }

  /** A movable-body slide may not place the player inside an actor or back through static scenery. */
  private contactClear(x: number, y: number, z: number, ctx: WandererContext, people: readonly Collider[]): boolean {
    const bounds = { minY: y + PLAYER_FOOT_CLEARANCE, maxY: y + PLAYER_BODY_HEIGHT, excludePrecise: Boolean(ctx.physics) };
    if (ctx.colliders.blocked(x, z, PLAYER_RADIUS, bounds)) return false;
    const clear = ctx.colliders.resolve(x, z, PLAYER_RADIUS, undefined, bounds, people);
    return Math.hypot(clear.x - x, clear.z - z) < 0.001;
  }

  /** Actors can approach a stationary player. Correct those contacts through the same swept scenery constraint. */
  private settleContacts(ctx: WandererContext) {
    const bounds = { minY: this.y + PLAYER_FOOT_CLEARANCE, maxY: this.y + PLAYER_BODY_HEIGHT, excludePrecise: Boolean(ctx.physics) };
    const people = this.contacts(ctx);
    const target = ctx.colliders.resolve(this.x, this.z, PLAYER_RADIUS, undefined, bounds, people);
    if (!target.hit) return;
    if (Math.hypot(target.x - this.x, target.z - this.z) > PLAYER_RADIUS * 2 + 0.05) return;
    const scenerySafe = ctx.colliders.move(this.x, this.z, target.x - this.x, target.z - this.z, PLAYER_RADIUS, undefined, bounds);
    const safe = ctx.physics?.move(this.x, this.y, this.z, scenerySafe.x - this.x, scenerySafe.z - this.z, this.grounded) ?? { ...scenerySafe, y: this.y };
    const ground = this.supportAt(safe.x, safe.z, ctx, safe.y);
    // A push out of one body never crosses another: out of a sack pile against a wall it used to land the hero on the far
    // side of the wall (A70). Only what he stands in may lie between.
    const inside = new Set(ctx.colliders.near(this.x, this.z, PLAYER_RADIUS).map((c) => c.id));
    if (ctx.colliders.cast(this.x, this.z, safe.x, safe.z, 0, inside, bounds)) return;
    if (!this.travelAllowed(safe.x, safe.z, safe.y, ctx) || ground - this.y > (this.grounded ? this.stepHeightAt(safe.x, safe.z, ground, ctx) : 0.18)) return;
    if (this.grounded && ground > this.y && this.stepHeightAt(safe.x, safe.z, ground, ctx) === ROCK_STEP_HEIGHT &&
      ctx.colliders.ceilingAt(safe.x, safe.z, PLAYER_RADIUS,
      this.y + PLAYER_BODY_HEIGHT, ground + PLAYER_BODY_HEIGHT) !== null) return;
    if (!this.contactClear(safe.x, this.grounded ? Math.max(safe.y, ground) : safe.y, safe.z, ctx, people)) return;
    ctx.physics?.push?.(this.x, this.y, this.z, scenerySafe.x - this.x, scenerySafe.z - this.z);
    this.x = safe.x;
    this.z = safe.z;
    if (this.grounded && this.y - ground <= GROUND_FOLLOW_DROP) this.y = ground;
  }

  /** Sweep every move (including dodge, attack and recoil), including real movable-body contacts. */
  /** A vault in progress (A125): from where he left the ground over a fence to where he lands. */
  vault: { t: number; from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; peak: number; seconds: number; travelStart: number } | null = null;

  /**
   * A vault over the fence before him, if there is one within reach and he approaches across it (A125). The fences
   * stand as walls above their rails, so this is the only way over them: a short arc from this side to the ground beyond.
   */
  private fenceVault(ctx: WandererContext, approach?: { x: number; z: number }): Wanderer['vault'] {
    const fx = approach?.x ?? Math.sin(this.yaw), fz = approach?.z ?? Math.cos(this.yaw);
    let people: Collider[] | undefined;
    for (const c of ctx.colliders.withId(PROP_COLLIDER.fence)) {
      if (c.kind !== 'box' || !c.active) continue;
      const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      const lx = (this.x - c.x) * cos - (this.z - c.z) * sin, lz = (this.x - c.x) * sin + (this.z - c.z) * cos;
      // A capsule can still strike an end post with its centre just beyond the rail.
      // Keep those crossings vaultable; outside its radius an ordinary jump clears the end.
      if (Math.abs(lx) > c.hw + VAULT.reach || Math.abs(lz) >= c.hd + PLAYER_RADIUS) continue;
      // Use the requested approach while moving; the body can still be turning toward it. Reject tangent/away motion.
      const side = Math.sign(lx) || 1, nx = -side * cos, nz = side * sin;
      if (fx * nx + fz * nz < VAULT.facing) continue;
      const across = -side * (c.hw + VAULT.land);
      const land = { x: c.x + across * cos + lz * sin, z: c.z - across * sin + lz * cos };
      const ground = ctx.terrain.heightAt(land.x, land.z);
      // The far side must be open ground at about this height, and clear of any other fence.
      if (!Number.isFinite(ground) || Math.abs(ground - this.y) > VAULT.step || !ctx.terrain.walkable(land.x, land.z)) continue;
      const landingBounds = { minY: ground + PLAYER_FOOT_CLEARANCE, maxY: ground + PLAYER_BODY_HEIGHT };
      if (ctx.colliders.blocked(land.x, land.z, PLAYER_RADIUS, landingBounds)) continue;
      const top = c.maxY === undefined ? this.y + 1.1 : c.maxY - FENCE_WALL_LIFT;
      const span = Math.hypot(land.x - this.x, land.z - this.z);
      const vault = { t: 0, from: { x: this.x, y: this.y, z: this.z }, to: { x: land.x, y: ground, z: land.z }, peak: Math.max(top + 0.25, this.y + 0.5),
        seconds: VAULT.seconds * Math.max(1, span / VAULT_NEAR_SPAN), travelStart: VAULT_TRAVEL_START };
      // The scripted arc bypasses ordinary movement collision: check body clearance before taking it.
      const ignored = new Set([c]); // Only this rail is crossed; neighboring fences still block the arc.
      // At u=1/2 the linear base is the endpoint mean, including on slopes.
      const lift = vault.peak - (vault.from.y + vault.to.y) / 2;
      // Taller rails need more takeoff time. Keep feet above the rail throughout horizontal travel,
      // without raising the apex or changing the total duration. The lower symmetric arc is monotone to its apex.
      const clearHeight = top + PLAYER_FOOT_CLEARANCE;
      const lowerArc = (u: number) => Math.min(vault.from.y, vault.to.y) + Math.abs(vault.to.y - vault.from.y) * u + lift * Math.sin(Math.PI * u);
      if (lowerArc(vault.travelStart) < clearHeight) {
        let lo = vault.travelStart, hi = 0.5;
        for (let n = 0; n < 16; n++) {
          const mid = (lo + hi) / 2;
          if (lowerArc(mid) < clearHeight) lo = mid; else hi = mid;
        }
        vault.travelStart = hi;
      }
      const travelSpan = 1 - 2 * vault.travelStart;
      // The shortened smoothstep travel phase has maximum second derivative 6 / span².
      const horizontalGuard = span * (6 / (travelSpan * travelSpan)) / (8 * 20 * 20);
      let previous = vault.from;
      let clear = true;
      for (let i = 1; i <= 20; i++) {
        const u = i / 20, ease = vaultEase(u, vault.travelStart);
        const next = { x: vault.from.x + (vault.to.x - vault.from.x) * ease,
          z: vault.from.z + (vault.to.z - vault.from.z) * ease,
          y: vault.from.y + (vault.to.y - vault.from.y) * u + lift * Math.sin(Math.PI * u) };
        // The sine's bow above each chord is bounded by amplitude * du² * pi² / 8.
        const arcGuard = Math.abs(lift) * Math.PI * Math.PI / (8 * 20 * 20);
        const bounds = { minY: Math.min(previous.y, next.y) + PLAYER_FOOT_CLEARANCE,
          maxY: Math.max(previous.y, next.y) + PLAYER_BODY_HEIGHT + arcGuard };
        if (ctx.colliders.cast(previous.x, previous.z, next.x, next.z, PLAYER_RADIUS, ignored, bounds, people ??= this.contacts(ctx)) ||
          ctx.physics?.propsBlockBodySweep?.(previous, next, arcGuard + horizontalGuard)) { clear = false; break; }
        previous = next;
      }
      if (clear) return vault;
    }
    return null;
  }

  /** Actor-only sweeps must not collide with the rail this vault deliberately crosses. */
  private readonly vaultActorSweep = new Colliders();

  /** Advance the planned arc only while actors and moving cargo leave the next segment clear. */
  private stepVault(dt: number, ctx: WandererContext): void {
    const v = this.vault!;
    const nextT = Math.min(1, v.t + dt / v.seconds);
    const u = nextT, ease = vaultEase(u, v.travelStart);
    const x = v.from.x + (v.to.x - v.from.x) * ease;
    const z = v.from.z + (v.to.z - v.from.z) * ease;
    const base = v.from.y + (v.to.y - v.from.y) * u;
    const lift = v.peak - (v.from.y + v.to.y) / 2;
    const y = base + lift * Math.sin(Math.PI * u);
    const du = nextT - v.t;
    // Enclose the curved segment, including the shortened smoothstep travel phase of the arc.
    const span = Math.hypot(v.to.x - v.from.x, v.to.z - v.from.z);
    const liftBound = Math.abs(lift) + Math.abs(v.to.y - v.from.y);
    // The planning sweep omits the foot clearance; an airborne body must enclose the full foot too.
    // A lowered travelStart (a high rail) shortens the travel phase, so the bound follows this vault's own span.
    const travelSpan = Math.max(1e-3, 1 - 2 * v.travelStart);
    const padding = PLAYER_FOOT_CLEARANCE + du * du * (span * 6 / (travelSpan * travelSpan) + liftBound * Math.PI * Math.PI) / 8;
    const actors = this.contacts(ctx);
    const actorBounds = { minY: Math.min(this.y, y) - padding,
      maxY: Math.max(this.y, y) + PLAYER_BODY_HEIGHT + padding };
    if (this.vaultActorSweep.cast(this.x, this.z, x, z, PLAYER_RADIUS + padding, undefined, actorBounds, actors) ||
      ctx.physics?.propsBlockBodySweep?.({ x: this.x, y: this.y, z: this.z }, { x, y, z }, padding)) {
      // Actors or cargo can enter after takeoff. Stay at the last clear pose, then fall through ordinary collision handling.
      this.vault = null;
      this.vx = this.vz = this.vy = 0;
      this.grounded = false;
      return;
    }
    v.t = nextT;
    this.x = x; this.y = y; this.z = z;
    this.vx = (v.to.x - v.from.x) / v.seconds; this.vz = (v.to.z - v.from.z) / v.seconds;
    this.yaw = Math.atan2(v.to.x - v.from.x, v.to.z - v.from.z);
    if (u >= 1) {
      this.vault = null;
      this.y = this.supportAt(this.x, this.z, ctx);
      // The smoothstep arc ends at rest; its average travel speed must not carry him past the checked landing.
      this.vx = this.vy = this.vz = 0;
      this.grounded = true;
      ctx.audio.land(this.surface, 3.5);
    }
  }

  private tryMove(dx: number, dz: number, ctx: WandererContext): boolean {
    const beforeX = this.x;
    const beforeZ = this.z;
    const contacts = this.contacts(ctx);
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / TERRAIN_STEP));
    const sx = dx / count;
    const sz = dz / count;
    let boundaryReported = false;
    const attempt = (mx: number, mz: number) => {
      if (Math.abs(mx) < 1e-8 && Math.abs(mz) < 1e-8) return false;
      const bounds = { minY: this.y + PLAYER_FOOT_CLEARANCE, maxY: this.y + PLAYER_BODY_HEIGHT, excludePrecise: Boolean(ctx.physics) };
      const result = ctx.colliders.move(this.x, this.z, mx, mz, PLAYER_RADIUS, undefined, bounds, contacts);
      // A step never carries him further than he asked: the excess is a push out of a body he half-entered mid-jump (a window
      // lintel), and its far side lies past the wall (A70).
      if (Math.hypot(result.x - this.x, result.z - this.z) > Math.hypot(mx, mz) + 0.25) return false;
      const physical = ctx.physics?.move(this.x, this.y, this.z, result.x - this.x, result.z - this.z, this.grounded) ?? { ...result, y: this.y };
      const nx = physical.x;
      const nz = physical.z;
      const g = this.supportAt(nx, nz, ctx, physical.y);
      if (!this.travelAllowed(nx, nz, physical.y, ctx) || g - this.y > (this.grounded ? this.stepHeightAt(nx, nz, g, ctx) : this.swimming ? 0.45 : 0.18)) {
        if (!boundaryReported && ctx.terrain.valleyRadius(nx, nz) > 1.02) {
          boundaryReported = true;
          ctx.onBoundary();
        }
        return false;
      }
      // Lifting onto a supported stone must not push the head through an authored deck/ceiling.
      if (this.grounded && g > this.y && this.stepHeightAt(nx, nz, g, ctx) === ROCK_STEP_HEIGHT &&
        ctx.colliders.ceilingAt(nx, nz, PLAYER_RADIUS,
        this.y + PLAYER_BODY_HEIGHT, g + PLAYER_BODY_HEIGHT) !== null) return false;
      // If a crowded doorway cannot satisfy every contact, retain the last scenery-safe position.
      if (!this.contactClear(nx, this.grounded ? Math.max(physical.y, g) : physical.y, nz, ctx, contacts)) return false;
      // Only a step taken pushes the barrels: a refused one shoved them up to three times a sub-step (A106, A103 scout).
      // The step asked for (the cargo itself shortens the step taken): a crate in the way is leant on, as before.
      ctx.physics?.push?.(this.x, this.y, this.z, result.x - this.x, result.z - this.z);
      this.x = nx;
      this.z = nz;
      if (this.grounded) {
        if (this.y - g > GROUND_FOLLOW_DROP) this.grounded = false;
        else this.y = g;
      }
      for (const normal of result.normals) {
        const inward = this.vx * normal.x + this.vz * normal.z;
        if (inward < 0) { this.vx -= normal.x * inward; this.vz -= normal.z * inward; }
      }
      return Math.hypot(nx - beforeX, nz - beforeZ) > 1e-7;
    };
    for (let i = 0; i < count; i++) {
      if (!attempt(sx, sz)) {
        // Ground steps/water edges do not have authored planes; legal axes still give a useful slide.
        const xFirst = Math.abs(sx) >= Math.abs(sz);
        if (xFirst) { attempt(sx, 0); attempt(0, sz); }
        else { attempt(0, sz); attempt(sx, 0); }
      }
    }
    return Math.hypot(this.x - beforeX, this.z - beforeZ) > 1e-6;
  }

  private startAction(kind: 'light' | 'heavy', arms: Arms) {
    this.state = kind;
    this.heavy = kind === 'heavy';
    this.dur = arms.dur[kind];
    this.timer = 0;
    this.hitDone = false;
    this.blocking = false;
  }

  private spend(n: number) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaPause = STAMINA.pauseAfterAction;
    if (this.stamina <= 0.01) this.exhausted = true;
  }

  /** Damage from an enemy strike. Handles block, perfect block, dodge invulnerability and guard break. */
  receiveHit(damage: number, heavy: boolean, from: WandererFoe, ctx: WandererContext) {
    if (!ctx.controllable || this.state === 'dead' || this.iframes > 0) return;
    // A strike cannot land through scenery or on someone on a different floor.
    if (Math.abs(from.y - this.y) > 2.1 || ctx.colliders.cast(this.x, this.z, from.x, from.z, 0, undefined, { minY: Math.min(this.y, from.y) + 0.65, maxY: Math.max(this.y, from.y) + 1.35 })) return;
    const dx = from.x - this.x;
    const dz = from.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const f = this.facing;
    const facing = blowFaced(dx, dz, f.x, f.z);
    // A blow breaks any channel, not only skinning: a rite or brace left set would freeze its bar and never finish (A71).
    this.cancelChannel();
    this.setBowAim(null);
    if (this.blocking && facing && this.state === 'free') {
      const arms = this.arms(ctx.game);
      const guarded = resolveGuardedHit({ damage, heavy, arms, blockTime: this.blockTime, stamina: this.stamina, steadyGuard: ctx.game.state.skills.includes('steady_guard') });
      // Only a blade turns a blow aside; a guard of bare forearms softens it.
      if (guarded.parried) {
        ctx.audio.hit('perfect');
        from.parried(this.x, this.z);
        this.shake = Math.max(this.shake, 0.1);
        ctx.onHurt(0, true);
        return;
      }
      this.spend(guarded.cost);
      ctx.audio.hit('block', arms === BLADE);
      this.shake = Math.max(this.shake, 0.18);
      if (guarded.guardBroken) {
        // Guard break on a heavy blow: a brief stagger, never a lock.
        this.state = 'hurt';
        this.timer = 0;
        this.dur = DUR.hurt;
        this.blocking = false;
        this.vx = this.vz = 0;
      }
      this.applyDamage(guarded.damage, true, ctx);
      return;
    }
    ctx.audio.hit('flesh');
    ctx.audio.hurt();
    this.shake = Math.max(this.shake, 0.35);
    this.state = 'hurt';
    this.timer = 0;
    this.dur = DUR.hurt;
    this.blocking = false;
    this.bodyStruck();
    this.applyDamage(damage, false, ctx);
    const kx = -dx / d;
    const kz = -dz / d;
    // In the saddle the blow does not shove him off his seat: the deer's footing decides where he is (A94).
    if (!this.mount) this.tryMove(kx * 0.5, kz * 0.5, ctx);
    this.vx = this.vz = 0;
  }

  private applyDamage(amount: number, blocked: boolean, ctx: WandererContext) {
    if (amount > 0) ctx.game.dispatch({ t: 'damagePlayer', amount });
    ctx.onHurt(amount, blocked);
    if (ctx.game.state.player.health <= 0) {
      this.vault = null;
      this.cancelChannel(); // death never leaves a channel behind (A71)
      // Killed in the saddle (or getting into or out of it), he falls beside the deer rather than lying in the air at the
      // saddle's height (A91 scout); the app lets the deer go once play resumes.
      if (this.mount || this.mountMove) this.dismount(ctx);
      this.state = 'dead';
      this.timer = 0;
      this.blocking = false;
      this.vx = this.vz = 0;
      ctx.onDeath();
    }
  }

  /** Deep enough to swim, or shallow enough to stand again: the switch between the two, with its splash. */
  private updateSwimming(water: ReturnType<WandererWater['sample']>, ctx: WandererContext) {
    this.waterDepth = water ? Math.max(0, Math.min(water.depth, water.surface - this.y)) : 0;
    if (!ctx.water) return;
    // A bridge, rock or loose body's top is footing: water below it cannot immerse the feet above it. In the sea, out of
    // one's depth is judged from the calm level, not each passing wave (A89 scout): the swell is far taller than the
    // 0.2 m between starting and ending a swim, so standing in the surf began and ended one with every wave.
    const still = water ? (water.body === 'sea' ? SEA_LEVEL : water.surface) : 0;
    const standingDepth = water ? Math.max(0, still - this.supportAt(this.x, this.z, ctx)) : 0;
    if (!this.swimming && water && this.alive && standingDepth >= SWIM_DEPTH && (this.grounded || this.y <= water.surface - SWIM_FLOAT + 0.05)) {
      this.swimming = true;
      // Whatever was in hand stops: no blows, guard, aim or work in deep water, and the blade goes back in its sheath
      // (A91 scout: it stayed in hand through the swim while a foe was near).
      if (this.state === 'channel') this.cancelChannel();
      this.drawn = false;
      if (this.state === 'light' || this.state === 'heavy' || this.state === 'dodge') { this.state = 'free'; this.timer = this.dur = 0; this.hitDone = true; }
      this.blocking = false;
      this.setBowAim(null);
      this.grounded = false;
      // A plunge already threw its spray as the feet broke the surface; wading out of one's depth is quieter.
      if (this.clock - this.splashedAt < 0.6) ctx.water.emit('enter', this.x, water.surface, this.z, 0.8);
      else ctx.water.splash(this.x, water.surface, this.z, 0.3, { x: this.vx * 0.3, z: this.vz * 0.3 }, 'enter');
      this.vy = Math.min(0, this.vy) * 0.35;
    } else if (this.swimming && (!water || standingDepth < SWIM_EXIT || !this.alive)) {
      this.swimming = false;
      this.vy = 0;
      // Feet find the bed; the ordinary footing takes over from here.
      const ground = this.supportAt(this.x, this.z, ctx);
      if (this.y - ground <= GROUND_FOLLOW_DROP + 0.4) { this.y = Math.max(this.y, ground); this.grounded = true; }
    }
    if (this.waterDepth > 0.75) this.soaked = 1;
  }

  /** A footfall: the surface's own step, or in deeper water a wading slosh and the ripples it leaves. */
  private footfall(ctx: WandererContext, sprinting: boolean) {
    const water = ctx.water && this.waterDepth > 0.32 && !this.swimming ? ctx.water.sample(this.x, this.z) : null;
    if (!water) {
      if (this.surface === 'sand' && this.grounded && !this.mount) ctx.onSandStep?.(this.x, this.y, this.z, this.yaw);
      ctx.audio.footstep(this.surface, sprinting);
      return;
    }
    const f = this.facing, pace = Math.min(1, this.lastMoveSpeed / HERO_RUN_SPEED);
    ctx.water!.splash(this.x + f.x * 0.25, water.surface, this.z + f.z * 0.25, 0.05 + 0.2 * pace, { x: this.vx * 0.25, z: this.vz * 0.25 }, 'wade');
  }

  update(dt: number, ctx: WandererContext) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Reading/paused controls may still request a pose; never drift or finish an action behind that UI.
    if (!ctx.controllable && this.alive) {
      this.vx = this.vz = this.lastMoveSpeed = 0;
      this.blocking = false;
      this.present(0, ctx, this.posture(0));
      return;
    }
    this.settleContacts(ctx);
    const frameX = this.x;
    const frameZ = this.z;
    this.clock += dt;
    const inp = ctx.input;
    const hasBow = this.bowEquipped(ctx.game);
    this.equipBow(hasBow);
    if (this.state !== 'free') this.setBowAim(null);
    // Getting up or down locks the controls until it ends (A71).
    const control = ctx.controllable && !this.mountMove;
    this.iframes = Math.max(0, this.iframes - dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.staminaPause = Math.max(0, this.staminaPause - dt);
    // Water: how deep it stands here, and whether that is deep enough to swim.
    this.updateSwimming(ctx.water?.sample(this.x, this.z) ?? null, ctx);

    // Movement intent relative to the camera.
    const mv = control && (this.state === 'free' || this.state === 'light' || this.state === 'heavy') ? inp.move() : { x: 0, y: 0 };
    const fx = Math.sin(ctx.viewYaw);
    const fz = Math.cos(ctx.viewYaw);
    const rx = -Math.cos(ctx.viewYaw);
    const rz = Math.sin(ctx.viewYaw);
    let wx = fx * mv.y + rx * mv.x;
    let wz = fz * mv.y + rz * mv.x;
    const len = Math.hypot(wx, wz);
    const mag = Math.min(1, len);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const hasInput = mag > 0.05;

    // Blocking.
    // The block key is read first: a toggled press made during a blow, a dodge or a flinch raises the guard once it ends,
    // as holding the key does, rather than being dropped at the frame's end (A101 scout).
    const blockKey = control && !hasBow && inp.held('block');
    const wantBlock = blockKey && !this.swimming && !this.mount && (this.state === 'free');
    if (wantBlock && !this.blocking) this.blockTime = 0;
    this.blocking = wantBlock;
    if (this.blocking) this.blockTime += dt;
    if (!control && inp.uiOpen) inp.clearToggle('block');

    // Sprint.
    const sprintHeld = control && inp.held('sprint') && hasInput && !this.blocking && !this.bowAiming;
    if (sprintHeld && this.state === 'free' && this.stamina <= STAMINA.sprintMin) this.exhausted = true;
    const sprinting = sprintHeld && this.stamina > STAMINA.sprintMin && !this.exhausted && this.state === 'free';
    if (sprintHeld && this.exhausted) inp.clearToggle('sprint');

    // Actions (edge-triggered).
    const arms = this.arms(ctx.game);
    if (control && this.state === 'free' && !this.swimming && !this.mount) {
      if (!hasBow && inp.pressed('attack') && !this.blocking && this.stamina >= arms.cost.light) {
        this.startAction('light', arms);
        this.spend(arms.cost.light);
        ctx.audio.swing(false, arms === BLADE);
      } else if (!hasBow && inp.pressed('heavy') && !this.exhausted && this.stamina >= arms.cost.heavy) {
        this.startAction('heavy', arms);
        this.spend(arms.cost.heavy);
        ctx.audio.swing(true, arms === BLADE);
      } else if (inp.pressed('dodge') && !this.exhausted && this.stamina >= COST.dodge) {
        this.state = 'dodge';
        this.timer = 0;
        this.dur = DUR.dodge;
        this.iframes = DODGE.iframes;
        this.blocking = false;
        this.spend(COST.dodge);
        ctx.audio.dodge(this.surface);
        this.dodgeDir = hasInput ? { x: wx, z: wz } : { x: -fx, z: -fz };
        this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
      } else if (inp.pressed('jump') && this.grounded && this.stamina >= COST.jump && (this.vault = this.fenceVault(ctx, hasInput ? { x: wx, z: wz } : undefined))) {
        // Facing a fence within reach, the jump is a vault over it (A125).
        this.grounded = false;
        this.vy = 0;
        this.stamina = Math.max(0, this.stamina - COST.jump);
        this.staminaPause = STAMINA.pauseAfterJump;
        ctx.audio.jump(this.surface);
      } else if (inp.pressed('jump') && this.grounded && this.stamina >= COST.jump) {
        this.vy = JUMP_SPEED;
        this.grounded = false;
        this.stamina = Math.max(0, this.stamina - COST.jump);
        this.staminaPause = STAMINA.pauseAfterJump;
        ctx.audio.jump(this.surface);
      }
    }

    // The blade comes out for a fight and goes back on the hip once things are quiet.
    const hasBlade = arms === BLADE;
    const engaged = ctx.enemies.some((e) => e.alive && e.engaged && Math.hypot(e.x - this.x, e.z - this.z) < ENGAGED_REACH);
    if (!hasBlade) this.drawn = false;
    else if (this.state === 'light' || this.state === 'heavy' || this.blocking || engaged) {
      this.drawn = true;
      this.calm = 0;
    } else if (this.state === 'free') {
      this.calm += dt;
      if (this.calm > SHEATHE_AFTER) this.drawn = false;
    }
    this.showArms(this.channel?.kind === 'skinning' ? 'none' : !hasBlade ? 'none' : this.drawn ? 'drawn' : 'sheathed');

    // State timers.
    let pendingBlow = false;
    let speed = 0;
    switch (this.state) {
      case 'free': {
        let target = sprinting ? HERO_RUN_SPEED : this.blocking || this.bowAiming ? HERO_GUARD_SPEED : HERO_WALK_SPEED;
        if (this.swimming) target = sprinting ? SWIM_SPRINT : SWIM_SPEED;
        // In the saddle the deer sets the pace: an easy walk, a run with sprint held (A70).
        else if (this.mount) target = sprinting ? MOUNT_RUN : MOUNT_WALK;
        else if (ctx.water) target *= wadeFactor(this.waterDepth);
        const back = mv.y < -0.3 && !this.blocking ? 0.7 : 1;
        speed = hasInput ? target * back * mag : 0;
        break;
      }
      case 'light':
      case 'heavy': {
        this.timer += dt;
        const hitAt = this.heavy ? HIT_AT.heavy : HIT_AT.light;
        const p = this.timer / this.dur;
        // Lunge slightly during the blow, and let the player steer the swing a little.
        speed = p < hitAt + 0.2 ? (this.heavy ? 1.2 : 1.6) : 0;
        if (hasInput && p < hitAt) this.yaw = lerpAngle(this.yaw, Math.atan2(wx, wz), 1 - Math.exp(-dt * 4));
        if (!this.hitDone && p >= hitAt) {
          this.hitDone = true;
          pendingBlow = true;
        }
        if (this.timer >= this.dur) { this.state = 'free'; speed = 0; }
        break;
      }
      case 'dodge': {
        const from = Math.min(this.dur, this.timer);
        const to = Math.min(this.dur, this.timer + dt);
        this.timer += dt;
        speed = 0;
        // Integral of the authored deceleration: equal dodge distance at 30/60/120 Hz, no backwards final frame.
        const distance = DODGE.speed * ((to - from) - (to * to - from * from) / (2 * this.dur));
        this.vx = this.vz = 0;
        this.tryMove(this.dodgeDir.x * distance, this.dodgeDir.z * distance, ctx);
        if (this.timer >= this.dur) this.state = 'free';
        break;
      }
      case 'hurt':
        this.timer += dt;
        if (this.timer >= this.dur) this.state = 'free';
        break;
      case 'channel': {
        const ch = this.channel;
        if (ch) {
          // A move requested on the final skinning frame still interrupts the cut before loot can be granted.
          if (ch.kind === 'skinning' && control && Math.hypot(inp.move().x, inp.move().y) > .05) {
            this.cancelChannel();
            break;
          }
          ch.t += dt;
          if (ch.t >= ch.dur) {
            if (ch.kind === 'skinning') this.showArms(this.skinningArms);
            this.channel = null;
            this.state = 'free';
            this.skinningShown(null);
            ch.done();
          } else if (control && ch.kind !== 'skinning' && Math.hypot(inp.move().x, inp.move().y) > .6) {
            this.cancelChannel();
          }
        } else this.state = 'free';
        break;
      }
      case 'dead':
        this.timer += dt;
        break;
    }

    // Getting up or down holds him; seated, the deer carries him (A71).
    const moving = this.stepMountMove(dt, ctx);
    // Struck in the saddle he flinches there: the deer goes on carrying him, without his steering, and keeps its body clear
    // of walls. Before, the on-foot step ran on the gallop's speed, and the deer was carried into a wall after him (A94).
    const flinching = this.state === 'hurt';
    const riding = !moving && this.mount !== null && (this.state === 'free' || flinching);
    if (riding) this.rideStep(dt, wx, wz, hasInput && !flinching ? mag : 0, !flinching && control && inp.held('sprint') && hasInput, ctx);
    else if (!moving) {
    // Horizontal motion with light inertia.
    const lunging = this.state === 'light' || this.state === 'heavy';
    const forward = this.facing;
    // Releasing a direction in mid-air cannot apply ground friction. Directional input still provides modest air control.
    const coasting = !this.grounded && !this.swimming && !hasInput && this.state === 'free';
    const slope = this.channel?.kind === 'skinning' ? { x: 0, z: 0, slip: 0 } : this.downhillGravity(ctx);
    const rate = this.swimming ? MOVE_RESPONSE.swim : this.grounded ? MOVE_RESPONSE.ground + (MOVE_RESPONSE.sliding - MOVE_RESPONSE.ground) * slope.slip : MOVE_RESPONSE.air;
    // The water carries a swimmer along with it and pulls at a wader's legs.
    const current = ctx.water && (this.swimming || this.grounded) ? ctx.water.sample(this.x, this.z) : null;
    const carry = this.swimming ? 1 : 0.35 * Math.min(1, this.waterDepth / 1.2);
    const targetVx = (coasting ? this.vx : (lunging ? forward.x : wx) * speed) + slope.x / rate + (current?.flowX ?? 0) * carry;
    const targetVz = (coasting ? this.vz : (lunging ? forward.z : wz) * speed) + slope.z / rate + (current?.flowZ ?? 0) * carry;
    const k = 1 - Math.exp(-dt * rate);
    const displacementX = targetVx * dt + (this.vx - targetVx) * k / rate;
    const displacementZ = targetVz * dt + (this.vz - targetVz) * k / rate;
    this.vx += (targetVx - this.vx) * k;
    this.vz += (targetVz - this.vz) * k;
    if (this.state !== 'dodge' && !this.vault && (Math.abs(this.vx) > 0.01 || Math.abs(this.vz) > 0.01)) {
      // Without the water model, any water slows a step; with it, wading depth sets the pace above.
      const sf = !ctx.water && (ctx.terrain.carveAt(this.x, this.z) > 0.12 || ctx.terrain.seaDepth(this.x, this.z) > 0.12) && !ctx.terrain.deckAt(this.x, this.z) ? 0.72 : 1;
      const fromX = this.x;
      const fromZ = this.z;
      const intendedX = displacementX * sf;
      const intendedZ = displacementZ * sf;
      this.tryMove(intendedX, intendedZ, ctx);
      const actualX = this.x - fromX;
      const actualZ = this.z - fromZ;
      if (Math.abs(actualX - intendedX) > 0.001) this.vx = actualX / (dt * sf);
      if (Math.abs(actualZ - intendedZ) > 0.001) this.vz = actualZ / (dt * sf);
    }
    }
    if (!riding) {
      this.galloping = false;
      this.mountStamina = mountStaminaStep(this.mountStamina, false, dt);
      if (this.mountStamina >= MOUNT_STAMINA.resume) this.mountSpent = false;
    }
    this.lastMoveSpeed = Math.hypot(this.x - frameX, this.z - frameZ) / dt;

    // Facing.
    if (this.state === 'free' && !riding && !moving) {
      if (this.bowAiming) { /* Aim direction is supplied by the camera's selected target. */ }
      else if (this.blocking) this.yaw = lerpAngle(this.yaw, ctx.viewYaw, 1 - Math.exp(-dt * 14));
      else if (this.swimming && hasInput) this.yaw = lerpAngle(this.yaw, Math.atan2(wx, wz), 1 - Math.exp(-dt * 5));
      else if (this.lastMoveSpeed > 0.4 && hasInput) this.yaw = lerpAngle(this.yaw, Math.atan2(this.vx, this.vz), 1 - Math.exp(-dt * 12));
    }

    if (this.vault) this.stepVault(dt, ctx);
    else {
      // Feet follow legal small steps exactly; leaving a ledge starts a fall instead of snapping to its bottom.
      let ground = this.supportAt(this.x, this.z, ctx);
      const swimWater = this.swimming ? ctx.water?.sample(this.x, this.z) ?? null : null;
      if (swimWater) {
        // A damped spring holds the swimmer at the surface: a plunge sinks and bobs back, the swell lifts and lowers him.
        this.vy += (swimWater.surface - SWIM_FLOAT - this.y) * 22 * dt;
        this.vy *= Math.exp(-dt * 6.5);
        this.y += this.vy * dt;
        if (this.y < ground) { this.y = ground; this.vy = Math.max(0, this.vy); }
      } else if (this.grounded) {
        if (this.y - ground > GROUND_FOLLOW_DROP) this.grounded = false;
        else { this.y = ground; this.vy = 0; }
      }
      if (!this.grounded && !swimWater) {
        // Analytic ballistic step keeps jump height and fall travel consistent across frame rates.
        const nextY = this.y + this.vy * dt - 0.5 * GRAVITY * dt * dt;
        ground = this.fallingSupport(nextY, ground, ctx);
        const staticCeiling = ctx.colliders.ceilingAt(this.x, this.z, PLAYER_RADIUS, this.y + PLAYER_BODY_HEIGHT, nextY + PLAYER_BODY_HEIGHT);
        const movableCeiling = ctx.physics?.ceilingAt(this.x, this.z, PLAYER_RADIUS, this.y + PLAYER_BODY_HEIGHT, nextY + PLAYER_BODY_HEIGHT) ?? null;
        const ceiling = staticCeiling === null ? movableCeiling : movableCeiling === null ? staticCeiling : Math.min(staticCeiling, movableCeiling);
        const fromY = this.y;
        this.y = ceiling === null ? nextY : ceiling - PLAYER_BODY_HEIGHT - 0.0001;
        // Falling into water: spray as the feet break the surface.
        const below = ctx.water && this.vy < -2.5 ? ctx.water.sample(this.x, this.z) : null;
        if (below && fromY > below.surface && this.y <= below.surface) {
          ctx.water!.splash(this.x, below.surface, this.z, Math.min(1, -this.vy / 12), { x: this.vx * 0.2, z: this.vz * 0.2 }, 'splash');
          this.splashedAt = this.clock;
        }
        this.vy = ceiling === null ? this.vy - GRAVITY * dt : 0;
        if (this.vy <= 0 && this.y <= ground) {
          // Stepping down a kerb is silent; a jump or a real drop lands audibly.
          if (this.vy < -3.2) ctx.audio.land(this.surface, -this.vy);
          this.y = ground;
          this.vy = 0;
          this.grounded = true;
        }
      }
    }

    if (pendingBlow) this.resolveBlow(ctx);

    // Stamina.
    const meter = this.staminaMeter;
    meter.stamina = this.stamina; meter.pause = this.staminaPause; meter.exhausted = this.exhausted;
    const spending = sprinting && this.state === 'free' && this.lastMoveSpeed > 1 && !this.mount;
    if (staminaStep(meter, dt, spending ? (this.swimming ? 'swim' : 'run') : null, this.blocking)) inp.clearToggle('sprint');
    this.stamina = meter.stamina; this.staminaPause = meter.pause; this.exhausted = meter.exhausted;

    // Footsteps and surface.
    this.surface = this.surfaceAt(ctx);
    if (!this.stridesFromBody && !this.mount && !moving && this.grounded && this.lastMoveSpeed > 0.8 && (this.state === 'free')) {
      this.stepDist += this.lastMoveSpeed * dt;
      const stride = sprinting ? HERO_RUN_CYCLE / 2 : HERO_WALK_CYCLE / 2;
      if (this.stepDist > stride) {
        this.stepDist -= stride;
        this.footfall(ctx, sprinting);
      }
    } else if (this.lastMoveSpeed < 0.3) this.stepDist = 0;
    if (ctx.water) this.waterEffects(dt, ctx);


    this.present(dt, ctx, this.posture(dt));
    // A body that reports its heel strikes is heard at each of them: surface sounds follow its visible contacts.
    const footfalls = this.bodyFootfalls() * (this.mount ? 0 : 1);
    for (let i = 0; i < footfalls; i++) this.footfall(ctx, sprinting);
    if (this.swimming && ctx.water) {
      let strokes = this.bodyStrokes();
      if (!this.stridesFromBody) {
        this.strokeClock += dt * 0.78;
        strokes = Math.floor(this.strokeClock);
        this.strokeClock -= strokes;
      }
      const w = strokes > 0 ? ctx.water.sample(this.x, this.z) : null;
      if (w) {
        const f = this.facing, pace = Math.min(1, this.lastMoveSpeed / SWIM_SPRINT);
        ctx.water.splash(this.x + f.x * 0.75, w.surface, this.z + f.z * 0.75, 0.08 + 0.22 * pace, { x: f.x * 0.6, z: f.z * 0.6 }, 'stroke');
      }
    }
    ctx.game.setPlayerTransform(this.x, this.y, this.z, this.yaw);
  }

  /** Ripples around legs or a swimming body, and the drip of climbing out after a swim. */
  private waterEffects(dt: number, ctx: WandererContext) {
    const water = ctx.water!;
    if (this.swimming || this.waterDepth > 0.15) {
      this.wakeClock += dt;
      if (this.wakeClock > 0.09) {
        this.wakeClock = 0;
        const speed = this.lastMoveSpeed;
        if (speed > 0.25 || this.swimming) {
          water.disturb(this.x, this.z, this.swimming ? 0.45 : 0.3, (this.swimming ? 0.006 : 0.004) * Math.min(3, 0.5 + speed), 0.05 * Math.min(1, speed / 2));
        }
      }
    }
    if (this.soaked > 0 && this.waterDepth < 0.02 && !this.swimming && this.grounded) {
      water.emit('exit', this.x, this.y + 1, this.z, 0.6);
      this.soaked = 0;
    }
  }

  /** Resolve the moment a swing lands against everything in its arc. */
  private resolveBlow(ctx: WandererContext) {
    const arms = this.arms(ctx.game);
    const kind = this.heavy ? 'heavy' : 'light';
    const range = arms.range[kind];
    const half = arms.arc[kind];
    const f = this.facing;
    let any = false;
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.x;
      const dz = e.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.radius || Math.abs(e.y - this.y) > 2.1) continue;
      if (ctx.colliders.cast(this.x, this.z, e.x, e.z, 0, undefined, { minY: Math.min(this.y, e.y) + 0.65, maxY: Math.max(this.y, e.y) + 1.35 })) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dz * f.z) / (d || 1))));
      if (ang > half) continue;
      const dmg = arms[kind];
      const killed = e.takeHit(dmg, this.heavy, this.x, this.z);
      ctx.audio.hit('flesh', arms === BLADE);
      ctx.onHitEnemy(e, killed, this.heavy);
      any = true;
    }
    if (any) this.shake = Math.max(this.shake, this.heavy ? 0.25 : 0.12);
  }

  /** What the body should show, from what he is doing: the stance, the gait, and how he sits the deer. */
  private posture(dt: number): WandererPosture {
    let mode: WandererStance = 'idle';
    let t = 0;
    switch (this.state) {
      case 'light':
        mode = 'attack_light';
        t = this.timer / this.dur;
        break;
      case 'heavy':
        mode = 'attack_heavy';
        t = this.timer / this.dur;
        break;
      case 'dodge':
        mode = 'dodge';
        t = this.timer / this.dur;
        break;
      case 'hurt':
        mode = 'hurt';
        t = this.timer / this.dur;
        break;
      case 'channel':
        mode = 'work';
        break;
      case 'dead':
        mode = 'dead';
        break;
      default:
        if (this.swimming) mode = 'swim';
        else if (this.blocking) mode = 'block';
        else if (this.lastMoveSpeed > HERO_RUN_THRESHOLD + (this.mode === 'run' ? -0.3 : 0.3)) mode = 'run';
        else if (this.lastMoveSpeed > 0.12) mode = 'walk';
    }
    if (!this.grounded && !this.swimming && this.state === 'free') mode = 'run';
    // Struck while swimming, he keeps swimming (A91 scout): the hurt pose stood him upright with a jump's legs.
    if (this.swimming && this.state === 'hurt') mode = 'swim';
    if ((this.mount || (this.mountMove && this.mountMove.kind !== 'approach')) && (this.state === 'free' || this.mount && this.state === 'hurt')) mode = 'sit';
    this.mode = mode;
    const speedNorm = Math.min(1, this.lastMoveSpeed / (mode === 'swim' ? SWIM_SPEED : mode === 'run' ? HERO_RUN_SPEED : HERO_WALK_SPEED));
    // Integrate gait phase from actual travel. Multiplying a lifetime clock by changing speed made legs snap on turns/stops.
    const gait = mode === 'walk' || mode === 'run' || mode === 'block';
    if (gait && this.grounded) this.gaitTime += this.lastMoveSpeed * dt / (mode === 'run' ? HERO_RUN_CYCLE : HERO_WALK_CYCLE);
    // Guarding or aiming, he moves other than the way he faces: the legs follow the way of travel (A70). How far he
    // turned since the last pose plants his feet as he turns on the spot; a jump of the facing (a load) is not a turn.
    const strafing = this.state === 'free' && (this.blocking || this.bowAiming) && !this.swimming;
    const heading = strafing && this.lastMoveSpeed > 0.12 ? Math.atan2(Math.sin(Math.atan2(this.vx, this.vz) - this.yaw), Math.cos(Math.atan2(this.vx, this.vz) - this.yaw)) : 0;
    const turned = Math.atan2(Math.sin(this.yaw - this.poseYaw), Math.cos(this.yaw - this.poseYaw));
    this.poseYaw = this.yaw;
    // In the saddle he sits on the deer's back, rising and falling a little with its gait.
    // The bob follows the deer's own footfalls when its gait is known (A71), its speed otherwise.
    this.mountBob += this.mount ? dt * this.lastMoveSpeed * 2.4 : 0;
    const mm = this.mountMove;
    let seat = 0;
    if (this.mount) seat = this.mount.seat + (this.gaitPhase !== null ? gaitBob(this.gaitPhase, this.rideSpeed) : Math.abs(Math.sin(this.mountBob)) * Math.min(0.06, this.lastMoveSpeed * 0.012));
    else if (mm && mm.kind !== 'approach') {
      // Swinging up the hips arc onto the saddle; stepping down they drop beside it.
      const s = this.mountProgress, e = s * s * (3 - 2 * s);
      seat = mm.seat * e + (mm.kind === 'swing' ? 0.22 : 0.1) * Math.sin(Math.PI * s);
    }
    this.seatHeight = seat;
    // He leans into the deer's turns, more the faster it goes.
    const leanTarget = this.mount ? Math.max(-RIDE.leanMax, Math.min(RIDE.leanMax, -this.rideTurn * Math.abs(this.rideSpeed) * RIDE.lean)) : 0;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 6));
    return {
      mode, t, speed: speedNorm, time: gait ? this.gaitTime : this.clock,
      grounded: this.grounded,
      travel: this.grounded && gait ? this.lastMoveSpeed * dt : 0,
      moveSpeed: this.lastMoveSpeed,
      heading,
      turn: Math.abs(turned) < 1.2 ? turned : 0,
      seat,
      lean: this.lean,
      straddle: this.mount !== null || (this.mountMove !== null && this.mountMove.kind !== 'approach'),
      mountSwing: this.mountProgress,
    };
  }
}
