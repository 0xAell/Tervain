import * as THREE from 'three';
import { NPCS, type NpcDef } from '../core/content/npcs';
import type { EnemySpawn } from '../core/world/layout';
import { indoorPost } from '../core/world/homes';
import { applyFlash, createBanditRig, createNpcRig, createThornback, poseRig, type Mode, type Pose, type Rig } from './characters';
import { npcStyle, type WorkGesture } from './npcStyle';
import { workSiteFor, type WorkSite } from './npc/workSites';
import { resolveGoal, type Goal } from '../core/rules/schedule';
import { NPC_WALK_SPEED, ResidentWalker, type ResidentContext, type ResidentStep } from '../core/rules/residentWalk';
import { ENEMY_VARIANT } from '../core/content/enemies';
import { HostileActor, lerpAngle, type HostileContext, type HostileState } from '../core/rules/hostileActor';

export { resolveGoal, type Goal };
export { lerpAngle };
export type EnemyState = HostileState;

export {
  finishNpcPath, NPC_ALARM_REACH, NPC_WALK_SPEED, npcGoalPosition, turnToward, type NpcPlace,
} from '../core/rules/residentWalk';

/** What a resident's step is given: the core's context, and whether a point could be on screen. */
export interface ActorContext extends ResidentContext {
  /** A remark, by its line in voice.ts. */
  onBark: (a: NpcActor, line: string) => boolean | void;
  /** Whether a point could be on screen this step; residents out of view are posed less often (A113). */
  seen?: (x: number, y: number, z: number) => boolean;
}

/**
 * Seconds between poses of a resident `distance` metres from the player (A113). Posing every resident every step was a
 * tenth of a frame in the village; far ones are a few pixels tall and take theirs at 30 or 15 Hz, those off screen
 * eight times a second (their shadows still move). Gait phase is a running total, so a pose that comes late is no
 * less in step.
 */
export const NPC_POSE_NEAR = 30, NPC_POSE_FAR = 60;
export function npcPoseInterval(distance: number, seen: boolean): number {
  if (!seen) return 1 / 8;
  return distance > NPC_POSE_FAR ? 4 / 60 : distance > NPC_POSE_NEAR ? 2 / 60 : 0;
}

/** Actual Meshy sole sweeps measured at 60 Hz: 0.78 pose speed gives roughly this stance-cycle travel at 1.8 m stature. */
export const NPC_WALK_CYCLE_METRES = 1.48;
export const NPC_WALK_POSE_SPEED = 0.78;
/** What is done at each indoor post, whoever does it (A70). */
const INDOOR_GESTURES: Record<string, WorkGesture> = { bakery_oven: 'baking', mill_bench: 'general', office_table: 'ledger', reeve_table: 'ledger' };
const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1);
/** Asleep beyond this from the player, their pose is renewed only every NPC_ASLEEP_POSE seconds; beyond the second they are not drawn (A70). */
const NPC_ASLEEP_NEAR = 25, NPC_ASLEEP_FAR = 60, NPC_ASLEEP_POSE = .5;

export class NpcActor extends ResidentWalker {
  /** Their body: a stand-in with nothing to draw until their model arrives after the world opens (stage 2). */
  rig: Rig;
  private anim = 0;
  /** Asleep with nobody near, their pose is only renewed now and then (A70). */
  private poseWait = 0;
  /** Route metres and turn since the last pose, handed to the next one (A113). */
  private poseTravel = 0;
  private poseTurn = 0;

  constructor(def: NpcDef, rig?: Rig, arrived = true) {
    super(def, arrived);
    this.rig = rig ?? createNpcRig(def);
    this.rig.root.traverse((o) => {
      o.userData.npc = def.id;
    });
  }

  /* What walking needs to know of the body (core/rules/residentWalk.ts). */
  protected get height(): number { return this.rig.height; }
  protected override seatApproach(seat: number): number { return this.rig.resident?.seatApproach(seat) ?? 0; }
  protected override get stepsInPlace(): boolean { return this.rig.resident?.stepsInPlace === true; }
  protected override bodyShown(visible: boolean): void { this.rig.root.visible = visible; }
  protected override bodyPlaced(): void { this.placeRig(); }
  // The first drawn frame after a jump poses at once (A87 scout): a sleeper far off lay half a second in no pose.
  protected override bodyJumped(): void { this.poseWait = NPC_ASLEEP_POSE; this.poseTravel = this.poseTurn = 0; }

  /**
   * Their model has arrived (stage 2): it takes the stand-in's place in the scene, where they are now, and they can be met.
   * The next update shows and poses it.
   */
  adoptRig(rig: Rig) {
    const old = this.rig, parent = old.root.parent;
    rig.root.traverse((o) => { o.userData.npc = this.def.id; });
    rig.root.visible = false;
    if (parent) { parent.add(rig.root); parent.remove(old.root); }
    this.rig = rig;
    this.arrived = true;
    this.bodyJumped();
    this.rigChanged = true;
    this.placeRig();
  }

  /** The top of the piece an indoor worker works at, in their own frame like the outdoor work sites (A70). */
  private indoorWorkSite(ctx: ActorContext): WorkSite | undefined {
    const post = this.goal.inside && indoorPost(this.goal.inside, ctx.terrain, ctx.colliders, this.rig.height);
    if (!post) return undefined;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const local = post.corners.map(p => { const dx = p.x - this.x, dz = p.z - this.z; return [dx * c - dz * s, dx * s + dz * c] as const; });
    return { kind: 'counter', top: post.top - this.y, x0: Math.min(...local.map(p => p[0])), x1: Math.max(...local.map(p => p[0])),
      z0: Math.min(...local.map(p => p[1])), z1: Math.max(...local.map(p => p[1])) };
  }

  /**
   * The body where it is: on its feet at (x, y, z) facing yaw, or, lain down on a bed, rolled onto its side about the
   * seated hips until they rest on the bed's middle, head to its far end (A70).
   */
  private placeRig() {
    const root = this.rig.root, berth = this.lying;
    root.position.set(this.x, this.y, this.z);
    root.rotation.set(0, this.yaw, 0);
    if (!berth || this.lie <= 0) return;
    const s = this.lie * this.lie * (3 - 2 * this.lie);
    const sitting = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
    // Rolled about the way they face: their head goes to whichever side the bed's far end lies.
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(sitting);
    const roll = side.x * berth.head.x + side.z * berth.head.z > 0 ? -Math.PI / 2 : Math.PI / 2;
    const lying = sitting.clone().multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, roll));
    const pivot = new THREE.Vector3(0, berth.seat + .08, -berth.seatBack);
    const target = new THREE.Vector3(berth.hip.x, berth.hip.y, berth.hip.z).sub(pivot.clone().applyQuaternion(lying));
    root.position.lerp(target, s);
    root.quaternion.copy(sitting.slerp(lying, s));
  }

  /** One step of the resident is done: the body is shown, put where they are and posed for what they did. */
  protected override present(step: ResidentStep, dt: number, ctx: ActorContext): void {
    const { mode, gait, seated, onBed, playerDistance } = step;
    const drawn = !this.hidden && !(this.lie === 1 && playerDistance > NPC_ASLEEP_FAR);
    this.rig.root.visible = drawn;
    this.placeRig();
    // A resident waiting at a doorway cannot keep walking in place. Only resolved route metres, or a turn stepped round on
    // the spot, advance the gait.
    this.anim += gait / (NPC_WALK_CYCLE_METRES * (this.rig.height / 1.8));
    const style = npcStyle(this.def.id);
    const pose: Pose = {
      mode,
      speed: mode === 'walk' && dt > 0 ? NPC_WALK_POSE_SPEED * Math.min(1, gait / dt / NPC_WALK_SPEED) : 0,
      time: mode === 'walk' ? this.anim : this.clock,
      t: 0,
      // Locomotion remains distance-matched; Reduced Motion reduces idle/work gestures rather than making moving feet shuffle.
      amp: ctx.reducedMotion && mode !== 'walk' ? 0.4 : 1,
      travel: gait,
      moveSpeed: dt > 0 ? gait / dt : 0,
      turn: step.turn,
      workGesture: (this.goal.inside && INDOOR_GESTURES[this.goal.inside]) || style.work,
      // The real counter, rock face or ground the work is done against (A70).
      workSite: mode === 'work' ? (this.goal.inside ? this.indoorWorkSite(ctx) : workSiteFor(this.goal.anchor, this, ctx.terrain)) : undefined,
      seated: mode !== 'walk' && seated,
      seatHeight: onBed ? this.lying!.seat : this.destination.seat,
      seatBack: onBed ? this.lying!.seatBack : this.destination.seatBack,
      // Standing about, a resident folds their arms, looks round, shifts their weight (still when motion is reduced).
      idle: ctx.reducedMotion ? undefined : { seed: style.faceSeed, clock: this.clock },
    };
    // Asleep away from the player, the pose is renewed now and then rather than every frame (A70).
    this.poseWait += dt;
    this.poseTravel += pose.travel ?? 0;
    this.poseTurn += pose.turn ?? 0;
    const lazy = this.lie === 1 && playerDistance > NPC_ASLEEP_NEAR;
    const every = lazy ? NPC_ASLEEP_POSE : npcPoseInterval(playerDistance, ctx.seen?.(this.x, this.y + this.rig.height / 2, this.z) ?? true);
    if (drawn && this.poseWait >= every - 1e-6) {
      const span = lazy ? Math.min(this.poseWait, 2 * NPC_ASLEEP_POSE) : Math.min(this.poseWait, Math.max(dt, every));
      if (span > dt) { pose.travel = this.poseTravel; pose.turn = this.poseTurn; pose.moveSpeed = this.poseTravel / span; }
      poseRig(this.rig, pose, span);
      this.poseWait = this.poseTravel = this.poseTurn = 0;
    } else if (!drawn) { this.poseWait = NPC_ASLEEP_POSE; this.poseTravel = this.poseTurn = 0; }
  }

  get headPosition(): THREE.Vector3 {
    const seated = (this.goal.activity === 'sit' || this.lying !== null) && this.atDestination() && this.mode !== 'walk';
    // Authored rigs never write the procedural lower: they take the seated drop (A70).
    const lower = this.rig.resident ? undefined : this.rig.cur?.lower;
    const supported = Number.isFinite(lower) ? Math.max(-.65, Math.min(0, lower!)) * ((this.rig.hipY || .95) / .95) : seated ? -.45 : 0;
    const up = new THREE.Vector3(this.x, this.y + 1.95 * this.def.look.height + supported, this.z);
    if (!this.lying || this.lie <= 0) return up;
    // Lain down, their head is on the bed beyond their hips (A70).
    const { hip, head } = this.lying, s = this.lie * this.lie * (3 - 2 * this.lie);
    return up.lerp(new THREE.Vector3(hip.x + head.x * .75, hip.y + .1, hip.z + head.z * .75), s);
  }
}

/* ============================ Enemies ============================ */

/** What a hostile's step is given: the core's context, with the scene's own actor in its callbacks. */
export interface EnemyContext extends HostileContext {
  strikePlayer: (e: EnemyActor, damage: number, heavy: boolean) => void;
  onGrowl: (e: EnemyActor) => void;
}

export class EnemyActor extends HostileActor {
  /** Their body: a stand-in with nothing to draw until a bandit's model arrives after the world opens (stage 2). */
  rig: Rig;
  private showOnUpdate = false;

  constructor(spawn: EnemySpawn, rig?: Rig, arrived = true) {
    super(spawn, arrived);
    this.rig = spawn.kind === 'thornback' ? createThornback() : rig ?? createBanditRig(ENEMY_VARIANT[spawn.id] ?? 0);
    this.rig.root.traverse((o) => {
      o.userData.enemy = spawn.id;
    });
  }

  /* What fighting needs to know of the body (core/rules/hostileActor.ts). */
  protected get height(): number { return this.rig.height; }
  protected override bodyStruck(strength: number): void { this.rig.hitFlash = strength; }
  protected override bodyShown(visible: boolean): void { this.rig.root.visible = visible; }

  /** Put as the saved journey has them (core); one who had fallen and is whole again stands upright. */
  override restore(defeated: boolean): void {
    super.restore(defeated);
    if (!defeated) this.rig.body.rotation.set(0, 0, 0);
  }
  protected override bodyReady(): void { if (this.showOnUpdate) { this.showOnUpdate = false; this.rig.root.visible = true; } }

  /** A bandit's model has arrived (stage 2): it takes the stand-in's place where they wait, and they can fight. */
  adoptRig(rig: Rig) {
    const old = this.rig, parent = old.root.parent;
    rig.root.traverse((o) => { o.userData.enemy = this.id; });
    // The stand-in never left the origin (a waiting bandit is not updated): the model is set at their post, and shown
    // once the next update has posed it there, not in its bind pose at the origin while play is held (A93 scout).
    rig.root.position.set(this.x, this.y, this.z);
    rig.root.rotation.set(0, this.yaw, 0);
    rig.root.visible = false;
    this.showOnUpdate = true;
    if (parent) { parent.add(rig.root); parent.remove(old.root); }
    this.rig = rig;
    this.arrived = true;
  }

  /** One step of the hostile is done: the body is put where they are and posed for what they did. */
  protected override present(ctx: EnemyContext, mode: Mode, speed01: number, t: number, dt: number, travel: number): void {
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = this.yaw;
    const actionT = mode === 'telegraph' ? Math.min(1, t / this.cfg.wind) : mode === 'strike' ? Math.min(1, t / this.cfg.strike) : 0;
    // Resident/player gait already follows resolved metres. Do the same for humanoid enemies,
    // retaining their existing free-travel cycle rates (run 1.5 Hz, return 0.9 Hz) and amplitude.
    // Switching state must not rescale a lifetime clock or animate footsteps against a blocking contact.
    let poseMode = this.state === 'stagger' ? 'hurt' : mode;
    const locomotion = mode === 'walk' || mode === 'run';
    if (this.rig.kind === 'humanoid' && locomotion) {
      if (travel > 1e-6 && dt > 0) {
        const nominalSpeed = this.cfg.speed * (mode === 'run' ? 1 : 0.7);
        this.gait += travel / (nominalSpeed / (mode === 'run' ? 1.5 : 0.9));
        speed01 *= Math.min(1, travel / (dt * nominalSpeed));
      } else {
        poseMode = 'idle';
        speed01 = 0;
      }
    }
    const movingPose = poseMode === 'walk' || poseMode === 'run';
    const pose: Pose = { mode: poseMode, speed: speed01,
      // A contact holds only gait. The resolved idle must still breathe/look around on its continuous clock.
      time: this.rig.kind === 'humanoid' && movingPose ? this.gait : this.clock * (poseMode === 'run' ? 1.5 : 0.9),
      travel, moveSpeed: dt > 0 ? travel / dt : 0,
      t: this.state === 'stagger' ? 1 - Math.max(0, this.t) / this.staggerFor : actionT, amp: ctx.reducedMotion ? 0.5 : 1 };
    poseRig(this.rig, pose, dt);
    if (this.state === 'dead' && !this.rig.resident) {
      // Fall over (a figure on its own rig falls in its death clip instead).
      const k = Math.min(1, this.t / 0.6);
      this.rig.body.rotation.z = this.rig.kind === 'thornback' ? k * 1.4 : 0;
      this.rig.body.rotation.x = this.rig.kind === 'humanoid' ? -1.5 * k : 0;
    }
    applyFlash(this.rig, this.rig.hitFlash);
    if (this.rig.hitFlash > 0) this.rig.hitFlash = Math.max(0, this.rig.hitFlash - dt * 4);
  }

  get headPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y + this.rig.height + 0.35, this.z);
  }

}

export { NPCS };
