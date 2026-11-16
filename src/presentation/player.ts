import * as THREE from 'three';
import type { Input } from '../platform/input';
import type { Settings } from '../platform/settings';
import { Wanderer, type WandererContext, type WandererPosture } from '../core/rules/wanderer';
import type { AudioEngine } from './audio';
import { createPlayerRig, poseRig, setArmed, setSash, applyFlash, type Pose, type Rig } from './characters';
import type { EnemyActor, NpcActor } from './actors';
import { PlayerHuntingVisual } from './playerHunting';

// The wanderer's rules and what he does with them live in the core (src/core/rules/hero.ts and wanderer.ts); they are
// re-exported here for the scene's callers. This file is his body: the rig, the bow and the knife, and the pose.
export { BLADE, FISTS, MOUNT_RUN, MOUNT_WALK, PERFECT_BLOCK_WINDOW, STAMINA_MAX, SWIM_DEPTH, SWIM_EXIT, SWIM_FLOAT, SWIM_SPEED, SWIM_SPRINT, VAULT, wadeFactor, type Arms } from '../core/rules/hero';
export type {
  MountMove, WandererPhysics as PlayerPhysicsContacts, WandererState as PlayerState, WandererWater as PlayerWater,
} from '../core/rules/wanderer';

/** What the wanderer's step is given: the core's context, with the scene's own controls, sound and actors. */
export interface PlayerCtx extends WandererContext {
  input: Input;
  settings: Settings;
  audio: AudioEngine;
  enemies: EnemyActor[];
  npcs: NpcActor[];
  onHitEnemy: (e: EnemyActor, killed: boolean, heavy: boolean) => void;
}

export class Player extends Wanderer {
  readonly rig: Rig;
  readonly group = new THREE.Group();
  readonly huntingVisual: PlayerHuntingVisual;

  constructor(rig: Rig = createPlayerRig()) {
    super();
    this.rig = rig;
    this.group.add(this.rig.root);
    this.huntingVisual = new PlayerHuntingVisual(this.rig);
    this.showArms('none');
  }

  /** Returns the visible arrow tip, then animates the release hand; ammunition remains gameplay-owned. */
  releaseBow(): { origin: THREE.Vector3; direction: THREE.Vector3 } | null {
    return this.state === 'free' && this.alive && !this.swimming ? this.huntingVisual.release() : null;
  }

  dispose(): void { this.cancelSkinning(); this.huntingVisual.dispose(); }

  override update(dt: number, ctx: PlayerCtx): void { super.update(dt, ctx); }

  /* What the core tells the body, and what the body reports (core/rules/wanderer.ts). */
  // The imported rig reports actual heel strikes and strokes; the stand-in's are counted from distance and time.
  protected override get stridesFromBody(): boolean { return Boolean(this.rig.hero); }
  protected override bodyFootfalls(): number { return this.rig.hero?.consumeFootfalls() ?? 0; }
  protected override bodyStrokes(): number { return this.rig.hero?.consumeStrokes() ?? 0; }
  protected override armsShown(state: 'none' | 'sheathed' | 'drawn'): void { setArmed(this.rig, state); }
  protected override bowShown(equipped: boolean): void { this.huntingVisual.setEquipped(equipped); }
  protected override aimShown(direction: { x: number; y: number; z: number } | null, draw: number): void { this.huntingVisual.setAim(direction, draw); }
  protected override skinningShown(progress: number | null, seconds = 0, height?: number): void { this.huntingVisual.setSkinning(progress, seconds, height); }
  protected override poseCleared(): void { this.huntingVisual.restorePose(); }
  protected override bodyStruck(): void { this.rig.hitFlash = 1; }

  protected override bodyPlaced(): void {
    this.rig.hitFlash = 0;
    this.rig.hero?.reset();
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = this.yaw;
  }

  protected override present(dt: number, ctx: PlayerCtx, posture: WandererPosture): void {
    const pose: Pose = {
      mode: posture.mode, speed: posture.speed, time: posture.time, t: posture.t,
      amp: ctx.settings.reducedMotion ? 0.6 : 1,
      grounded: posture.grounded,
      travel: posture.travel,
      moveSpeed: posture.moveSpeed,
      heading: posture.heading,
      turn: posture.turn,
      // The feet find the ground under them: a stair edge, a root, a slope (A70).
      groundAt: (x: number, z: number) => this.supportAt(x, z, ctx, this.y + 0.35),
      rootY: this.y,
      straddle: posture.straddle,
      mountSwing: posture.mountSwing,
    };
    this.huntingVisual.restorePose();
    // The root stands where he is before the pose, so the feet are planted against this frame's ground.
    this.rig.root.position.set(this.x, this.y + posture.seat, this.z);
    this.rig.root.rotation.y = this.yaw;
    this.rig.root.updateMatrixWorld(true);
    poseRig(this.rig, pose, dt);
    applyFlash(this.rig, this.rig.hitFlash);
    if (this.rig.hitFlash > 0) this.rig.hitFlash = Math.max(0, this.rig.hitFlash - dt * 4);
    this.rig.root.position.set(this.x, this.y + posture.seat, this.z);
    this.rig.root.rotation.y = this.yaw;
    this.rig.root.rotation.z = posture.lean;
    this.huntingVisual.setSkinning(this.skinningProgress, this.channel?.t ?? 0, this.skinningHeight);
    this.huntingVisual.apply(dt);
    // Clothing that shows local standing.
    const inv = ctx.game.state.inventory;
    const sash = (inv.league_sash ?? 0) > 0 ? 0x4d7a54 : (inv.contract_band ?? 0) > 0 ? 0x8a3a30 : (inv.witness_cord ?? 0) > 0 ? 0xd9c98a : null;
    setSash(this.rig, sash);
  }
}
