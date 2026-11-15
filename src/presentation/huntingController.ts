import * as THREE from 'three';
import { S } from '../core/content/strings';
import type { Game } from '../core/game/game';
import { ANIMAL_SPECIES, HUNTING_ARROW_RANGE, skinningSeconds, type AnimalId } from '../core/game/hunting';
import type { Input } from '../platform/input';
import { codeLabel, type Settings } from '../platform/settings';
import type { AudioEngine } from './audio';
import type { CameraRig } from './cameraRig';
import type { Player } from './player';
import type { WorldScene } from './world';
import type { Hud } from './ui/hud';
import { HuntingArrows, HUNTING_ARROW_GRAVITY, type ArrowImpact, type ArrowShot } from './huntingArrow';
import type { AnimalArrowHit } from './animals/hunting/hit';
import { arrowLaunchDirection, BOW } from '../core/rules/bow';
import { arrowMeets, BowHand, bowAvailable, SHOT, shotTarget, skinningRefusal } from '../core/rules/archery';

interface HuntingHost {
  game: Game; input: Input; player: Player; world: WorldScene; cam: CameraRig;
  audio: AudioEngine; hud: Hud; settings: Settings;
}
interface HuntingImpact extends ArrowImpact { animal?: AnimalArrowHit; treeId?: string; expired?: boolean }
const SPEED = BOW.arrowSpeed;
const center = new THREE.Vector2();

/** The low ballistic arc through the reticle target. Damage is independent of draw time. */
export function arrowDirection(origin: THREE.Vector3, target: THREE.Vector3, speed = SPEED): THREE.Vector3 {
  const d = arrowLaunchDirection(target.x - origin.x, target.y - origin.y, target.z - origin.z, speed, HUNTING_ARROW_GRAVITY);
  return new THREE.Vector3(d.x, d.y, d.z);
}

/**
 * The bow and the knife in the scene: it reads the controls, asks the scene what a ray meets, plays the sounds and
 * shows the arrows. When the bow may be drawn, what the arrow is aimed at and meets, and whether he may skin are the
 * core's (core/rules/archery.ts); what lasts goes through the game's commands.
 */
export class HuntingController {
  readonly arrows = new HuntingArrows();
  private readonly hand = new BowHand();
  private skinId: AnimalId | null = null;
  private shotOrigins = new Map<number, THREE.Vector3>();
  private resolved = new Set<number>();

  constructor(private readonly host: HuntingHost, private readonly canAct: () => boolean) {}

  get drawFraction() { return this.hand.drawFraction; }
  get isDrawing() { return this.hand.drawing; }

  attach() { this.reset(); this.host.world.scene.add(this.arrows.group); }
  detach() { this.reset(); this.arrows.group.removeFromParent(); }
  syncInputMode() { this.host.input.bowMode = this.host.player.bowEquipped(this.host.game); }

  reset() {
    this.cancelDraw();
    this.host.player.cancelSkinning();
    this.skinId = null;
    this.host.cam.setAiming(false);
    this.arrows.clear(); this.shotOrigins.clear(); this.resolved.clear();
    this.host.audio.stopHuntingSounds();
  }

  private cancelDraw() {
    this.hand.cancel();
    this.host.player.setBowAim(null);
    this.host.audio.stopHuntingSounds('bow_draw');
  }

  /** Runs before the player's native skeleton is posed. */
  controls(dt: number, playing: boolean) {
    const { player, input, game, world, cam, audio } = this.host;
    if (!playing || !this.canAct()) {
      this.cancelDraw(); player.cancelSkinning(); cam.setAiming(false); return;
    }
    if (input.pressed('skin')) this.skin();
    if (this.skinId && !this.skinValid(this.skinId)) player.cancelSkinning();
    // Not while getting onto or off the deer either: melee is already locked then (A86 scout).
    const available = bowAvailable({ equipped: player.bowEquipped(game), free: player.state === 'free', alive: player.alive, swimming: player.swimming,
      riding: !!player.mount, mounting: !!player.mountMove, carrying: !!world.physics.holding });
    if (!available) { this.cancelDraw(); cam.setAiming(false); return; }
    const hand = this.hand.step(dt, { pressed: input.pressed('attack'), held: input.isDown('attack'), aimHeld: input.isDown('block'), arrows: game.state.inventory.arrow ?? 0 });
    if (hand.empty) this.host.hud.toast(S('hunting.need_arrow'), 'bad');
    if (hand.started) audio.huntingSound('bow_draw');
    if (hand.letGo) audio.stopHuntingSounds('bow_draw');
    const aiming = hand.aiming;
    cam.setAiming(aiming, this.hand.drawing ? this.drawFraction : 0);
    player.setBowAim(aiming ? {
      x: Math.sin(cam.yaw) * Math.cos(cam.pitch), y: -Math.sin(cam.pitch), z: Math.cos(cam.yaw) * Math.cos(cam.pitch),
    } : null, this.drawFraction);
  }

  /** Runs after camera following and native animal posing, so contacts use this frame's visible triangles. */
  afterWorld(dt: number, playing: boolean) {
    if (!playing || !this.canAct()) return;
    // Movement can enter deep water after controls ran. Cancel before releasing, while existing arrows keep flying.
    if (this.host.player.swimming) { this.cancelDraw(); this.host.cam.setAiming(false); }
    if (this.hand.loose()) this.release();
    this.arrows.quiver = !this.host.settings.reducedMotion;
    const water = this.host.world.water as WorldScene['water'] | undefined;
    this.arrows.update(dt, (from, to, shot) => this.sweep(from, to, shot), (shot, impact) => this.impact(shot, impact as HuntingImpact), water && {
      sample: (x, z) => water.sample(x, z),
      enter: (p, speed) => water.splash(p.x, p.y, p.z, Math.min(0.35, 0.08 + speed / 160), { x: 0, z: 0 }, 'plop'),
    });
  }

  private release() {
    const { player, game, world, cam, audio, hud } = this.host;
    const muzzle = player.releaseBow();
    if (!muzzle) return;
    const result = game.dispatch({ t: 'fireBow' });
    if (!result.ok) { hud.toast(S(`hunting.${result.reason}`), 'bad'); return; }
    audio.huntingSound('bow_release');
    cam.bowKick(this.host.settings.reducedMotion);
    world.animals.alertShot(player);
    const ray = new THREE.Raycaster();
    cam.camera.updateMatrixWorld(); ray.setFromCamera(center, cam.camera);
    const far = ray.ray.at(HUNTING_ARROW_RANGE, new THREE.Vector3());
    const scenery = world.physics.traceProjectile(ray.ray.origin, far);
    const animal = world.animals.traceArrow(ray.ray.origin, ray.ray.direction, HUNTING_ARROW_RANGE);
    // A camera ray hit behind the bow (the hero's own cover, a shoulder-close post) would turn the arrow round (A70).
    const aimed = shotTarget(ray.ray.origin, muzzle.origin, far, scenery, animal);
    const target = new THREE.Vector3(aimed.x, aimed.y, aimed.z);
    const direction = arrowDirection(muzzle.origin, target);
    const shot = this.arrows.launch(muzzle.origin, direction, SPEED);
    if (!shot) return;
    this.shotOrigins.set(shot.id, muzzle.origin.clone());
    while (this.shotOrigins.size > 32) this.shotOrigins.delete(this.shotOrigins.keys().next().value!);
    // The visible bow cannot put an arrow through cover between the player and the arrow tip.
    const cover = world.physics.traceProjectile({ x: player.x, y: player.y + SHOT.chest, z: player.z }, muzzle.origin);
    if (cover) {
      this.impact(shot, { point: new THREE.Vector3().copy(cover.point), treeId: cover.treeId });
      // Resolve that obstruction on the first swept step too, then remove the flight exactly once.
      this.shotOrigins.set(shot.id, new THREE.Vector3(Infinity, Infinity, Infinity));
    }
  }

  private sweep(from: THREE.Vector3, to: THREE.Vector3, shot: ArrowShot): HuntingImpact | null {
    const { physics, animals } = this.host.world;
    const met = arrowMeets<AnimalArrowHit>(from, to, this.shotOrigins.get(shot.id), {
      scenery: (a, b) => physics.traceProjectile(a, b),
      animal: (a, direction, reach) => animals.traceArrow(a as THREE.Vector3, new THREE.Vector3(direction.x, direction.y, direction.z), reach),
    });
    return met && { ...met, point: new THREE.Vector3(met.point.x, met.point.y, met.point.z) };
  }

  private impact(shot: ArrowShot, impact: HuntingImpact) {
    if (this.resolved.has(shot.id)) return;
    this.resolved.add(shot.id); this.shotOrigins.delete(shot.id);
    while (this.resolved.size > 32) this.resolved.delete(this.resolved.values().next().value!);
    if (impact.expired) return;
    const { audio, world, game } = this.host;
    if (impact.animal) {
      const hit = impact.animal;
      world.animals.showArrowImpact(hit, shot.velocity.clone().normalize());
      if (hit.zone) {
        game.dispatch({ t: 'hitAnimal', hit: { id: hit.id, zone: hit.zone, position: hit.position, yaw: hit.yaw } });
        world.animals.syncHunting(game.state.hunting);
        audio.huntingSound('arrow_flesh', impact.point, this.listener());
        this.host.hud.bowHit(game.state.hunting[hit.id]?.status === 'dead' ? 'kill' : 'hit');
      } else audio.huntingSound('arrow_ground', impact.point, this.listener());
    } else if (!this.underWater(impact.point)) {
      // Only the actual finite wood contact may shake a tree; nearby ground and cargo do not.
      if (impact.treeId) world.strikeTree?.(impact.point.x, impact.point.y, impact.point.z, 1, impact.treeId);
      audio.huntingSound(impact.treeId ? 'arrow_wood' : 'arrow_ground', impact.point, this.listener());
    }
  }

  /** A shaft stopped by a stream bed or the sea floor was already heard entering the water. */
  private underWater(point: THREE.Vector3) {
    const surface = (this.host.world.water as WorldScene['water'] | undefined)?.world.surfaceAt(point.x, point.z) ?? null;
    return surface !== null && point.y < surface - 0.02;
  }

  private listener() {
    const { cam } = this.host;
    return { x: cam.camera.position.x, y: cam.camera.position.y, z: cam.camera.position.z, heading: cam.yaw };
  }

  /** The HUD and activation report the same prerequisite; active channels also recheck their footing and reach. */
  private skinUnavailable(id: AnimalId, starting = true): string | null {
    const { player, game, world } = this.host;
    return skinningRefusal({
      record: game.state.hunting[id],
      knives: game.state.inventory.skinning_knife ?? 0,
      hunter: { x: player.x, y: player.y, z: player.z, alive: player.alive, grounded: player.grounded, swimming: player.swimming,
        free: player.state === 'free', riding: !!player.mount, mounting: !!player.mountMove },
      carrying: !!world.physics.holding,
      bowBusy: this.hand.busy,
      carcass: () => world.animals.skinningFrame(id, player),
      sight: (from, to) => world.physics.traceProjectile(from, to),
    }, starting);
  }

  private skinValid(id: AnimalId) { return this.skinUnavailable(id, false) === null; }

  skin() {
    const { player, world, game, hud, audio } = this.host;
    if (!this.canAct()) return;
    if (player.skinningProgress !== null) { player.cancelSkinning(); return; }
    const carcass = world.animals.nearestCarcass(player);
    if (!carcass) return;
    const unavailable = this.skinUnavailable(carcass.id);
    if (unavailable) { hud.toast(S(unavailable), unavailable === 'hunting.need_knife' ? 'bad' : undefined); return; }
    const frame = world.animals.skinningFrame(carcass.id, player)!;
    this.cancelDraw(); this.host.cam.setAiming(false);
    const started = player.beginSkinning(frame.target.x, frame.target.z, skinningSeconds(game.state.huntTally), () => {
      audio.stopHuntingSounds('skinning');
      if (this.canAct() && this.skinValid(carcass.id)) {
        game.setPlayerTransform(player.x, player.y, player.z, player.yaw);
        const result = game.dispatch({ t: 'skinAnimal', id: carcass.id });
        if (result.ok) { world.animals.syncHunting(game.state.hunting); audio.huntingSound('skinning_complete'); }
        else hud.toast(S(`hunting.${result.reason}`), 'bad');
      }
      this.skinId = null;
    }, () => {
      audio.stopHuntingSounds('skinning'); this.skinId = null;
      hud.toast(S('hunting.cancelled'));
    }, frame.target.y);
    if (started) { this.skinId = carcass.id; audio.huntingSound('skinning', frame.target, this.listener()); }
  }

  updateHud() {
    const { player, world, game, hud, input } = this.host;
    if (!this.canAct()) { hud.setHunting(null); return; }
    const carcass = this.skinId ? { id: this.skinId } : world.animals.nearestCarcass(player);
    const unavailable = carcass ? this.skinUnavailable(carcass.id) : null;
    hud.setHunting({
      bowEquipped: player.bowEquipped(game), aiming: player.bowAiming, drawing: this.hand.drawing,
      drawFraction: this.drawFraction, arrows: game.state.inventory.arrow ?? 0,
      aimKey: input.label('block', codeLabel), drawKey: input.label('attack', codeLabel), skinKey: input.label('skin', codeLabel),
      carcassName: carcass ? S(`animal.${ANIMAL_SPECIES[carcass.id]}`) : undefined,
      canSkin: !!carcass && unavailable === null,
      skinUnavailable: unavailable ? S(unavailable) : undefined,
      skinProgress: player.skinningProgress,
    });
  }
}
