import { ENEMY_ARCHETYPES, ENEMY_IDLE_YAW, ENEMY_POST_YAW, type EnemyArchetype } from '../content/enemies';
import type { EncounterId } from '../game/types';
import type { Collider, Colliders } from '../world/colliders';
import type { EnemySpawn } from '../world/layout';
import type { NavGrid } from '../world/nav';
import type { Terrain } from '../world/terrain';
import { EnemyRoute } from './enemyRoute';
import { afterRecovery, HOSTILE, hostileBlowLands, hostileGivesUp, hostileNotices, hostileStruck, hostileTurnsBack } from './hostile';

/**
 * A hostile at their post: noticing the wanderer, the warning, the chase, the wind-up that can be sidestepped, the
 * blow, the recovery, staggering under a blow or a parry, giving up and walking back, and dying. It decides and moves;
 * it draws nothing. Whoever draws the hostile extends this with the body.
 */

/** From one heading toward another by a share, the short way round. */
export function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Preserve the established 60 Hz turn response without making it faster on a higher-refresh display. */
const enemyTurnEase = (perFrame: number, dt: number) => -Math.expm1(Math.log1p(-perFrame) * 60 * dt);

/** What a hostile is doing with their body, for whoever poses it. */
export type HostileMode = 'idle' | 'walk' | 'run' | 'telegraph' | 'strike' | 'dead';

export type HostileState = 'idle' | 'alert' | 'chase' | 'telegraph' | 'strike' | 'recover' | 'stagger' | 'return' | 'dead';

export interface HostileContext {
  terrain: Terrain;
  colliders: Colliders;
  nav?: NavGrid;
  /** Current finite bodies; the controller excludes its own enemy id. */
  contacts?: readonly Collider[];
  player: { x: number; z: number; y: number; alive: boolean; invulnerable: boolean };
  reducedMotion: boolean;
  /** Called at the moment a strike would land. Returns true if it connected (for effects). */
  strikePlayer(hostile: HostileActor, damage: number, heavy: boolean): void;
  onGrowl(hostile: HostileActor): void;
  time: number;
}

export abstract class HostileActor {
  readonly id: EncounterId;
  readonly spawn: EnemySpawn;
  /** Whether their body is here. Until it is they wait unseen at their post, out of every fight. */
  arrived: boolean;
  x: number;
  z: number;
  y = 0;
  yaw = 0;
  hp: number;
  readonly maxHp: number;
  state: HostileState = 'idle';
  protected t = 0;
  protected struck = false;
  protected clock = Math.random() * 5;
  protected gait = 0;
  protected readonly route = new EnemyRoute();
  protected routeState: HostileState = 'idle';
  protected dashDir = { x: 0, z: 0 };
  /** Length of the stagger now playing, so its flinch runs 0 → 1 whether a light blow, a heavy one or a parry set it. */
  protected staggerFor: number = HOSTILE.staggerHeavy;
  engaged = false;
  fade = 1;
  protected idleYaw: number;
  protected readonly cfg: EnemyArchetype & { leash: number };
  readonly name: string;

  constructor(spawn: EnemySpawn, arrived = true) {
    this.spawn = spawn;
    this.arrived = arrived;
    this.id = spawn.id;
    this.x = spawn.x;
    this.z = spawn.z;
    this.idleYaw = ENEMY_POST_YAW[spawn.id] ?? ENEMY_IDLE_YAW;
    this.cfg = { ...ENEMY_ARCHETYPES[spawn.kind], leash: spawn.leash };
    this.hp = this.maxHp = this.cfg.hp;
    this.name = this.cfg.name;
  }

  /* The body, as far as fighting needs it. Whoever draws the hostile answers these. */

  /** How tall they stand (m). */
  protected abstract get height(): number;
  /** They were struck, or their blow was turned: the body flashes this strongly (0..1). */
  protected bodyStruck(_strength: number): void {}
  /** The body is to be seen, or not. */
  protected bodyShown(_visible: boolean): void {}
  /** Before a step: whatever the body has waiting (a model that arrived while play was held). */
  protected bodyReady(): void {}
  /** One step is done: place and pose the body. `t` is the time in the present state, `travel` the metres moved. */
  protected present(_ctx: HostileContext, _mode: HostileMode, _speed01: number, _t: number, _dt: number, _travel: number): void {}

  get alive() {
    return this.arrived && this.state !== 'dead';
  }

  get radius() {
    return this.cfg.radius;
  }

  /** Apply a hit from the player. Returns true if this hit killed the enemy. */
  takeHit(damage: number, heavy: boolean, fromX: number, fromZ: number): boolean {
    if (this.state === 'dead' || !this.arrived) return false;
    const struck = hostileStruck(this.hp, this.state, damage, heavy);
    this.hp = struck.hp;
    this.bodyStruck(1);
    this.engaged = true;
    const d = Math.hypot(this.x - fromX, this.z - fromZ) || 1;
    const away = { x: (this.x - fromX) / d, z: (this.z - fromZ) / d };
    if (struck.killed) {
      this.dashDir = away;
      this.state = 'dead';
      this.t = 0;
      return true;
    }
    // A committed swing is not free to interrupt; heavy blows stagger even a wind-up. A light blow that does not
    // interrupt leaves the lunge's heading alone: the strike keeps coming rather than sliding back (A100 scout).
    if (struck.stagger !== null) {
      this.dashDir = away;
      this.state = 'stagger';
      this.t = this.staggerFor = struck.stagger;
    }
    return false;
  }

  /** Called when the player perfectly blocks this enemy's strike. */
  parried(fromX = this.x, fromZ = this.z) {
    if (this.state === 'dead') return;
    const d = Math.hypot(this.x - fromX, this.z - fromZ) || 1;
    this.dashDir = { x: (this.x - fromX) / d, z: (this.z - fromZ) / d };
    this.state = 'stagger';
    this.t = this.staggerFor = HOSTILE.staggerParried;
    this.bodyStruck(0.5);
  }

  reset(ctx: { terrain: Terrain }) {
    if (this.state === 'dead') return;
    this.state = 'idle';
    this.hp = this.maxHp;
    this.x = this.spawn.x;
    this.z = this.spawn.z;
    this.engaged = false;
    this.y = ctx.terrain.groundAt(this.x, this.z);
    this.gait = 0;
    this.route.reset();
  }

  /** One finite capsule sweep for pursuit, recoil and creature lunges. */
  protected moveStep(dx: number, dz: number, ctx: HostileContext): number {
    let nx = this.x + dx, nz = this.z + dz;
    if (!ctx.terrain.walkable(nx, nz, 1)) {
      if (ctx.terrain.walkable(nx, this.z, 1)) nz = this.z;
      else if (ctx.terrain.walkable(this.x, nz, 1)) nx = this.x;
      else return 0;
    }
    const y = ctx.terrain.groundAt(this.x, this.z), ny = ctx.terrain.groundAt(nx, nz);
    if (!Number.isFinite(ny) || Math.abs(ny - y) > .32) return 0;
    const r = ctx.colliders.move(this.x, this.z, nx - this.x, nz - this.z, this.radius, `enemy:${this.id}`,
      { minY: Math.min(y, ny) + .02, maxY: Math.max(y, ny) + this.height }, ctx.contacts);
    const travel = Math.hypot(r.x - this.x, r.z - this.z);
    // A capsule introduced inside another body must not depenetrate by a visible teleport.
    if (travel > Math.hypot(dx, dz) + .02 || !ctx.terrain.walkable(r.x, r.z, 1)
      || Math.abs(ctx.terrain.groundAt(r.x, r.z) - y) > .32) return 0;
    this.x = r.x; this.z = r.z;
    return travel;
  }

  protected moveToward(tx: number, tz: number, speed: number, dt: number, ctx: HostileContext, stopDist = 0) {
    if (Math.hypot(tx - this.x, tz - this.z) <= stopDist) return false;
    const waypoint = this.route.waypoint(this, { x: tx, z: tz }, dt, ctx, this.radius, this.height);
    if (!waypoint) return false;
    const dx = waypoint.x - this.x, dz = waypoint.z - this.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) return false;
    const remaining = Math.hypot(tx - this.x, tz - this.z) - stopDist;
    const step = Math.min(speed * dt, d, remaining);
    const ox = this.x, oz = this.z;
    const travel = this.moveStep(dx / d * step, dz / d * step, ctx);
    this.route.resolved(travel, step, dt);
    if (travel > 1e-6) this.yaw = lerpAngle(this.yaw, Math.atan2(this.x - ox, this.z - oz), enemyTurnEase(0.25, dt));
    return travel > 1e-6;
  }

  update(dt: number, ctx: HostileContext) {
    // Waiting for their model, they keep their post out of sight (stage 2).
    if (!this.arrived) return;
    this.bodyReady();
    if (this.routeState !== this.state) {
      this.route.reset();
      this.routeState = this.state;
    }
    const previousX = this.x, previousZ = this.z;
    this.clock += dt;
    if (this.state === 'dead') {
      this.t += dt;
      this.fade = Math.max(0, 1 - Math.max(0, this.t - 4) / 3);
      this.bodyShown(this.fade > 0.01);
      this.place(ctx, 'dead', 0, 0, dt);
      return;
    }
    const p = ctx.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    const fromSpawn = Math.hypot(this.x - this.spawn.x, this.z - this.spawn.z);
    let mode: HostileMode = 'idle';
    let speed01 = 0;

    switch (this.state) {
      case 'idle': {
        if (p.alive && dist < this.cfg.notice) {
          const facing = Math.atan2(dx, dz);
          // Shortest angular difference, valid however far the stored yaw has drifted.
          const da = Math.abs(Math.atan2(Math.sin(facing - this.yaw), Math.cos(facing - this.yaw)));
          if (hostileNotices(this.cfg, this.cfg.leash, dist, da, fromSpawn, ctx.colliders.segmentBlocked(this.x, this.z, p.x, p.z))) {
            this.state = 'alert';
            this.t = HOSTILE.alert;
            this.engaged = true;
            ctx.onGrowl(this);
          }
        }
        // Idle bandits shift and look about; the creature paces its patch.
        this.yaw = lerpAngle(this.yaw, this.idleYaw + Math.sin(this.clock * 0.4) * 0.5, enemyTurnEase(0.02, dt));
        if (this.spawn.kind === 'thornback') {
          const a = this.clock * 0.25;
          this.moveToward(this.spawn.x + Math.cos(a) * 3, this.spawn.z + Math.sin(a) * 3, 0.9, dt, ctx);
          mode = 'walk';
          speed01 = 0.35;
        }
        break;
      }
      case 'alert':
        this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), enemyTurnEase(0.2, dt));
        this.t -= dt;
        if (this.t <= 0) this.state = 'chase';
        break;
      case 'chase': {
        mode = 'run';
        speed01 = 1;
        if (hostileGivesUp(this.cfg, this.cfg.leash, p.alive, dist, fromSpawn)) {
          this.state = 'return';
          this.engaged = false;
          break;
        }
        if (dist <= this.cfg.reach) {
          this.state = 'telegraph';
          this.t = 0;
          this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), enemyTurnEase(0.25, dt));
          this.route.reset();
          break;
        }
        this.moveToward(p.x, p.z, this.cfg.speed, dt, ctx, this.cfg.reach * HOSTILE.approach);
        break;
      }
      case 'telegraph': {
        // The wind-up tracks the player only at the start, so sidestepping works.
        this.t += dt;
        if (this.t < this.cfg.wind * HOSTILE.trackShare) this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), enemyTurnEase(0.25, dt));
        mode = 'telegraph';
        if (this.t >= this.cfg.wind) {
          this.state = 'strike';
          this.t = 0;
          this.struck = false;
          this.dashDir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
        }
        break;
      }
      case 'strike': {
        this.t += dt;
        mode = 'strike';
        if (this.cfg.heavy) {
          // The creature lunges forward during its strike.
          this.moveStep(this.dashDir.x * HOSTILE.lunge * dt, this.dashDir.z * HOSTILE.lunge * dt, ctx);
        }
        if (!this.struck && this.t >= this.cfg.strike * HOSTILE.blowAt) {
          this.struck = true;
          const ax = Math.sin(this.yaw);
          const az = Math.cos(this.yaw);
          const d = Math.hypot(p.x - this.x, p.z - this.z);
          const cos = d > 0 ? ((p.x - this.x) * ax + (p.z - this.z) * az) / d : 1;
          if (hostileBlowLands(this.cfg, d, cos, p.alive)) ctx.strikePlayer(this, this.cfg.damage, this.cfg.heavy);
        }
        // A perfect block parries during the strike call: keep the stagger instead of overwriting it.
        if (this.state !== 'strike') break;
        if (this.t >= this.cfg.strike) {
          this.state = 'recover';
          this.t = 0;
        }
        break;
      }
      case 'recover':
        this.t += dt;
        mode = 'idle';
        if (this.t >= this.cfg.recover) this.state = afterRecovery(this.cfg, dist, p.alive);
        break;
      case 'stagger':
        this.t -= dt;
        mode = 'idle';
        {
          this.moveStep(this.dashDir.x * HOSTILE.knockback * dt, this.dashDir.z * HOSTILE.knockback * dt, ctx);
        }
        if (this.t <= 0) this.state = p.alive ? 'chase' : 'return';
        break;
      case 'return': {
        mode = 'walk';
        speed01 = HOSTILE.returnPace;
        this.moveToward(this.spawn.x, this.spawn.z, this.cfg.speed * HOSTILE.returnPace, dt, ctx, 0.6);
        // They regain their health while they return, and rest again at the post.
        this.hp = Math.min(this.maxHp, this.hp + dt * HOSTILE.returnHeal);
        if (Math.hypot(this.x - this.spawn.x, this.z - this.spawn.z) < HOSTILE.home) {
          this.state = 'idle';
          this.engaged = false;
        }
        if (hostileTurnsBack(this.cfg, this.cfg.leash, p.alive, dist, fromSpawn)) {
          this.state = 'chase';
          this.engaged = true;
        }
        break;
      }
    }
    this.place(ctx, mode, speed01, this.t, dt, Math.hypot(this.x - previousX, this.z - previousZ));
  }

  /** Stand on the ground where they are, then let the body follow. */
  private place(ctx: HostileContext, mode: HostileMode, speed01: number, t: number, dt: number, travel = 0) {
    this.y = ctx.terrain.groundAt(this.x, this.z);
    this.present(ctx, mode, speed01, t, dt, travel);
  }

  /** True while the wind-up is visible (used by the HUD to show a threat cue as well as the animation). */
  get telegraphing() {
    return this.state === 'telegraph';
  }
}

