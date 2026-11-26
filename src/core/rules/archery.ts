import type { AnimalSpecies } from '../content/animals';
import { HUNTING_ARROW_RANGE, SKINNING_REACH, withinSkinningReach, type AnimalHuntRecord } from '../game/hunting';
import { BOW } from './bow';

/**
 * A shot, from the hand to the hide: when the bow may be drawn, what the arrow is aimed at, how it flies and what it
 * meets, which part of an animal it struck, and where the hunter must stand to skin what he took. The bow's numbers
 * are in bow.ts and the lasting rules (range, the hunter's trade, what a carcass gives) in game/hunting.ts. Nothing
 * here draws: whoever does supplies what a ray meets and is told what happened.
 */

export interface Point3 { x: number; y: number; z: number }

const distanceSquared = (a: Point3, b: Point3) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z);
const distance = (a: Point3, b: Point3) => Math.sqrt(distanceSquared(a, b));
const copy = (p: Point3): Point3 => ({ x: p.x, y: p.y, z: p.z });

/** What a shot is made of besides the bow's own numbers. */
export const SHOT = {
  /** What the camera's ray meets nearer than this past the bow (m) is his own cover, and is not aimed at. */
  pastBow: 0.3,
  /** The arrow is first traced from this height above his feet (m) to the bow: it cannot leave through cover between. */
  chest: 1.25,
  /** Animals within this distance (m) of a shot take fright. */
  alarm: 18,
  /** An animal must be nearer than scenery by more than this (m) to be what the arrow meets. */
  animalWins: 1e-5,
  /** The longest piece of flight traced at once (s), so a thin thing is not stepped over in a long frame. */
  step: 1 / 120,
  /** A wounded animal with nothing else to run from runs from a point this far behind it (m). */
  woundedFleesBehind: 2,
} as const;

/* ============================ The draw ============================ */

/** What his hands and feet are doing, as far as the bow cares. */
export interface BowHandFacts { equipped: boolean; free: boolean; alive: boolean; swimming: boolean; riding: boolean; mounting: boolean; carrying: boolean }

/** The bow can be drawn only in hand, on his feet, with nothing else in hand and nothing else being done. */
export function bowAvailable(facts: BowHandFacts): boolean {
  return facts.equipped && facts.free && facts.alive && !facts.swimming && !facts.riding && !facts.mounting && !facts.carrying;
}

export interface BowHandStep {
  /** The string began to be drawn. */
  started: boolean;
  /** He reached for an arrow on a press and had none. */
  empty: boolean;
  /** The string was let go; the arrow leaves once the world has moved this step. */
  letGo: boolean;
  /** He is aiming: holding the aim, drawing, or between letting go and the arrow leaving. */
  aiming: boolean;
}

/**
 * The draw: a press (or holding both the shot and the aim) starts it if there is an arrow, holding draws to full over
 * `BOW.drawSeconds`, letting go looses. There is no minimum draw, and the draw does not change what the arrow does.
 */
export class BowHand {
  drawing = false;
  private drawTime = 0;
  private pending = false;

  get drawFraction(): number { return Math.min(1, this.drawTime / BOW.drawSeconds); }
  /** Let go, the arrow not yet away. */
  get releasePending(): boolean { return this.pending; }
  /** Drawing, or let go and not yet away. */
  get busy(): boolean { return this.drawing || this.pending; }

  cancel(): void { this.drawing = this.pending = false; this.drawTime = 0; }

  step(dt: number, controls: { pressed: boolean; held: boolean; aimHeld: boolean; arrows: number }): BowHandStep {
    let started = false, empty = false, letGo = false;
    // A complete click between two steps still carries a press, even though it is no longer held.
    if (!this.drawing && !this.pending && (controls.pressed || (controls.held && controls.aimHeld))) {
      if (controls.arrows <= 0) empty = controls.pressed;
      else { this.drawing = true; this.drawTime = 0; started = true; }
    }
    if (this.drawing) {
      this.drawTime = Math.min(BOW.drawSeconds, this.drawTime + dt);
      if (!controls.held) { this.drawing = false; this.pending = true; letGo = true; }
    }
    return { started, empty, letGo, aiming: controls.aimHeld || this.drawing || this.pending };
  }

  /** After the world has moved: whether the arrow leaves the string now. */
  loose(): boolean {
    if (!this.pending) return false;
    this.pending = false; this.drawTime = 0;
    return true;
  }
}

/* ============================ What it is aimed at, and what it meets ============================ */

/** Something a ray met. */
export interface RayContact { distance: number; point: Point3 }
/** Scenery a ray met: a tree by its id, or a person or hostile who walks on. */
export interface SceneryContact extends RayContact { treeId?: string; actorId?: string }

/**
 * Where the arrow is aimed: at what the camera's ray meets first beyond the bow, an animal or scenery, or at the end
 * of its range. A hit behind the bow (his own cover, a post at his shoulder) would turn the arrow round.
 */
export function shotTarget<P extends Point3>(eye: Point3, muzzle: Point3, far: P, scenery: RayContact | null | undefined, animal: RayContact | null | undefined): P | Point3 {
  const past = distance(eye, muzzle) + SHOT.pastBow;
  const beyond = (hit: RayContact | null | undefined): hit is RayContact => !!hit && hit.distance > past;
  if (beyond(animal) && (!beyond(scenery) || animal.distance < scenery.distance)) return copy(animal.point);
  return beyond(scenery) ? copy(scenery.point) : far;
}

/** What a ray meets, as whoever holds the scene answers it. */
export interface ShotTraces<Animal extends RayContact> {
  scenery(from: Point3, to: Point3): SceneryContact | null;
  animal(from: Point3, direction: Point3, maxDistance: number): Animal | null;
}

/** What a piece of an arrow's flight met. `lodge` false means it does not stay standing where it struck. */
export interface ArrowContact<Animal extends RayContact = RayContact> {
  point: Point3;
  lodge?: boolean;
  /** Out of range: it is gone, and nothing was struck. */
  expired?: boolean;
  animal?: Animal;
  treeId?: string;
}

/**
 * What an arrow meets between `from` and `to`, having left the string at `origin`: the nearer of an animal and
 * scenery, within its range. Past its range it is gone. A person or a hostile is struck but walks on, so the arrow
 * falls away. The last piece of flight may cross the range: only the part inside it is traced, so a contact beyond
 * cannot win over the arrow simply ending.
 */
export function arrowMeets<Animal extends RayContact>(from: Point3, to: Point3, origin: Point3 | undefined, traces: ShotTraces<Animal>): ArrowContact<Animal> | null {
  if (!origin || !Number.isFinite(origin.x)) return { point: copy(from), lodge: false, expired: true };
  const rangeSquared = HUNTING_ARROW_RANGE * HUNTING_ARROW_RANGE;
  if (distanceSquared(from, origin) >= rangeSquared) return { point: copy(from), lodge: false, expired: true };
  const sx = to.x - from.x, sy = to.y - from.y, sz = to.z - from.z, lengthSquared = sx * sx + sy * sy + sz * sz;
  if (lengthSquared < 1e-16) return null;
  const inverse = 1 / (Math.sqrt(lengthSquared) || 1);
  const direction = { x: sx * inverse, y: sy * inverse, z: sz * inverse };
  const expires = distanceSquared(to, origin) > rangeSquared;
  const end = expires ? leavesSphere(from, direction, origin, HUNTING_ARROW_RANGE) ?? copy(to) : to;
  const scenery = traces.scenery(from, end);
  const animal = traces.animal(from, direction, distance(from, end));
  if (animal && (!scenery || animal.distance < scenery.distance - SHOT.animalWins)) return { point: copy(animal.point), animal, lodge: false };
  if (scenery?.actorId) return { point: copy(scenery.point), lodge: false };
  if (scenery) return { point: copy(scenery.point), treeId: scenery.treeId };
  if (expires) return { point: copy(end), lodge: false, expired: true };
  return null;
}

/** Where a ray from `from` along the unit `direction` meets the sphere about `centre`: the nearer crossing ahead. */
function leavesSphere(from: Point3, direction: Point3, centre: Point3, radius: number): Point3 | null {
  const cx = centre.x - from.x, cy = centre.y - from.y, cz = centre.z - from.z;
  const along = cx * direction.x + cy * direction.y + cz * direction.z;
  const offSquared = cx * cx + cy * cy + cz * cz - along * along, radiusSquared = radius * radius;
  if (offSquared > radiusSquared) return null;
  const half = Math.sqrt(radiusSquared - offSquared), near = along - half, far = along + half;
  if (far < 0) return null;
  const t = near < 0 ? far : near;
  return { x: from.x + direction.x * t, y: from.y + direction.y * t, z: from.z + direction.z * t };
}

/* ============================ The flight ============================ */

/** An arrow in the air. Its place and speed are the caller's own points, moved here. */
export interface ArrowFlight<P extends Point3 = Point3> {
  readonly id: number;
  readonly position: P;
  readonly velocity: P;
  /** Seconds since it left the string. */
  age: number;
  /** In water: it falls slowly and loses its speed. */
  wet: boolean;
}

/** Water an arrow can fall into: its surface and current. */
export interface ArrowWater { sample(x: number, z: number): { surface: number; flowX: number; flowZ: number } | null }

/** What happens to arrows in a step, for whoever draws and sounds them. Called in the order things happen. */
export interface ArrowEvents<P extends Point3, C extends { point: Point3; lodge?: boolean }> {
  /** It broke the water's surface at this point, at this speed (m/s). */
  entered?(flight: ArrowFlight<P>, point: P, speed: number): void;
  /** It met something; it is no longer in flight, and stands at the contact's point. */
  met(flight: ArrowFlight<P>, contact: C): void;
  /** Spent in the water: no longer in flight, it floats up from where it is. */
  floated?(flight: ArrowFlight<P>): void;
  /** Its time ran out, or a newer arrow took its place among the few that fly at once. */
  gone(flight: ArrowFlight<P>): void;
  /** It is still flying after this step. */
  flew?(flight: ArrowFlight<P>): void;
}

/**
 * The arrows in the air. Each flies in short analytic pieces under gravity, so the arc is the same at any frame rate
 * and a thin thing is met even in a long frame; in water it falls slowly, loses its speed and, spent, floats.
 * `point` makes the caller's own kind of point, so a scene can use its vectors and a test plain numbers.
 */
export class ArrowFlights<P extends Point3 = Point3> {
  private readonly flights: ArrowFlight<P>[] = [];
  private nextId = 1;

  constructor(private readonly point: (x: number, y: number, z: number) => P, private readonly maxFlights: number = BOW.maxFlights) {}

  get count(): number { return this.flights.length; }

  /** Loose an arrow from `origin` along `direction`; null for a direction or speed that is none. Past the most that fly at once, the oldest is gone. */
  launch(origin: Point3, direction: Point3, speed: number, gone?: (flight: ArrowFlight<P>) => void): ArrowFlight<P> | null {
    const lengthSquared = direction.x * direction.x + direction.y * direction.y + direction.z * direction.z;
    if (![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite) || lengthSquared < 1e-8 || !Number.isFinite(speed) || speed <= 0) return null;
    while (this.flights.length >= this.maxFlights) gone?.(this.flights.shift()!);
    // The unit direction, then the speed, as two multiplications: the same numbers a vector library gives.
    const inverse = 1 / (Math.sqrt(lengthSquared) || 1);
    const flight: ArrowFlight<P> = { id: this.nextId++, position: this.point(origin.x, origin.y, origin.z),
      velocity: this.point(direction.x * inverse * speed, direction.y * inverse * speed, direction.z * inverse * speed), age: 0, wet: false };
    this.flights.push(flight);
    return flight;
  }

  step<C extends { point: Point3; lodge?: boolean }>(dt: number, sweep: (from: P, to: P, flight: ArrowFlight<P>) => C | null, events: ArrowEvents<P, C>, water?: ArrowWater): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const shot = this.flights[i]!, position = shot.position, velocity = shot.velocity;
      // A downward aim while wading can put the bow below the water before the arrow leaves: it is already under, so
      // it is slowed without having broken the surface.
      if (water && !shot.wet && shot.age === 0) {
        const launchWater = water.sample(position.x, position.z);
        if (launchWater && position.y < launchWater.surface) shot.wet = true;
      }
      let remaining = Math.min(dt, Math.max(0, BOW.flightSeconds - shot.age));
      let ended = false;
      while (remaining > 1e-8) {
        const step = Math.min(remaining, SHOT.step);
        const from = this.point(position.x, position.y, position.z);
        const to = this.point(from.x + velocity.x * step, from.y + velocity.y * step, from.z + velocity.z * step);
        const gravity = shot.wet ? BOW.gravity * BOW.waterGravity : BOW.gravity;
        to.y -= .5 * gravity * step * step;
        const contact = sweep(from, to, shot);
        // Breaking the surface, and from then on the water's drag. Not when the arrow struck something first, such as
        // a bridge deck a hand's breadth above the stream.
        if (water && !shot.wet) {
          const w = water.sample(to.x, to.z);
          if (w && from.y >= w.surface && to.y < w.surface) {
            const t = (from.y - w.surface) / Math.max(1e-6, from.y - to.y);
            const crossing = this.point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t);
            if (!contact || distanceSquared(contact.point, from) >= distanceSquared(crossing, from)) {
              shot.wet = true;
              events.entered?.(shot, crossing, Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z));
            }
          }
        }
        shot.age += step;
        velocity.y -= gravity * step;
        if (shot.wet) { const keep = Math.exp(-BOW.waterDrag * step); velocity.x *= keep; velocity.y *= keep; velocity.z *= keep; }
        if (contact) {
          position.x = contact.point.x; position.y = contact.point.y; position.z = contact.point.z;
          ended = true;
          events.met(shot, contact);
          break;
        }
        position.x = to.x; position.y = to.y; position.z = to.z;
        remaining -= step;
        if (shot.wet && Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z) < BOW.floatSpeed) {
          // Spent in the water: wood floats, so it rises and lies on the surface.
          ended = true;
          events.floated?.(shot);
          break;
        }
      }
      if (ended) this.flights.splice(i, 1);
      else if (shot.age >= BOW.flightSeconds) { this.flights.splice(i, 1); events.gone(shot); }
      else events.flew?.(shot);
    }
  }

  /** Every arrow in the air is gone. */
  clear(gone?: (flight: ArrowFlight<P>) => void): void {
    for (const flight of this.flights) gone?.(flight);
    this.flights.length = 0;
  }
}

/* ============================ Which part was struck ============================ */

/**
 * Where each animal's skull lies in its body at rest: how high up its height the skull's middle is (0 feet .. 1 top),
 * and how far back from the nose it reaches as a share of its length. By model, since each has its own proportions.
 */
export const SKULLS: Record<string, { height: number; rear: number }> = {
  'bear-a': { height: .75, rear: .27 }, 'bear-b': { height: .76, rear: .26 },
  lion: { height: .64, rear: .30 }, tiger: { height: .81, rear: .22 },
  'wolf-a': { height: .82, rear: .22 }, 'wolf-b': { height: .79, rear: .21 }, 'wolf-c': { height: .80, rear: .28 },
  'cat-a': { height: .76, rear: .22 }, 'cat-b': { height: .83, rear: .23 }, 'cat-c': { height: .76, rear: .21 },
  'dog-a': { height: .81, rear: .21 }, 'dog-b': { height: .78, rear: .19 },
  'boar-a': { height: .64, rear: .33 }, 'boar-b': { height: .65, rear: .28 }, 'boar-c': { height: .65, rear: .28 },
  stag: { height: .70, rear: .23 }, 'deer-mount': { height: .69, rear: .23 },
  'deer-a': { height: .70, rear: .24 }, 'deer-b': { height: .66, rear: .24 },
};

/** The skull's band about its middle, as shares of the animal's height, and how much of the head a point must be. */
export const SKULL_BAND = { below: 0.22, above: 0.075, headShare: 0.22 } as const;

/**
 * Which part of an animal an arrow struck, from where the point lies on its body at rest: `height` up it (0..1),
 * `fromNose` back along it (0..1), and `headShare`, how much of that point moves with the head and jaw. A head shot
 * kills. Antlers move with the head, so on a deer a point above the skull stops the arrow and harms nothing (null).
 * A cat's face blends so far into its chest and neck that the head's share says nothing: its skull alone decides.
 */
export function arrowZone(model: string, species: AnimalSpecies, at: { height: number; fromNose: number; headShare: number }): 'head' | 'body' | null {
  const skull = SKULLS[model];
  if (!skull) return 'body';
  if (species === 'deer' && at.height > skull.height + SKULL_BAND.above) return null;
  const inSkull = at.fromNose <= skull.rear && at.height >= skull.height - SKULL_BAND.below && at.height <= skull.height + SKULL_BAND.above;
  const face = species === 'cat' || at.headShare >= SKULL_BAND.headShare;
  return inSkull && face ? 'head' : 'body';
}

/** A carcass stops an arrow and takes no harm from it: whatever part was struck, nothing is. */
export function zoneOnBody(zone: 'head' | 'body' | null, dead: boolean): 'head' | 'body' | null {
  return dead ? null : zone;
}

/** Where a wounded animal runs from when it has nothing else to run from: a point behind it. */
/** An animal as a shot finds it: whether it can be hunted at all, whether it is away on its way home, and how it fared. */
export interface ShotWitness { huntable: boolean; returning: boolean; status?: AnimalHuntRecord['status'] }

/**
 * Who takes fright at a shot: game that can be hunted, is in the world (not away on its way home) and is alive or only
 * wounded, within `radius` of where the bow was loosed. Pets and the mount cannot be hunted, so a shot does not scatter
 * them, and a carcass does not run.
 */
export function takesFright(animal: ShotWitness, distance: number, radius: number = SHOT.alarm): boolean {
  return animal.huntable && !animal.returning && (animal.status === undefined || animal.status === 'injured') && distance <= radius;
}

/**
 * The arrow is first traced from his chest to the bow (`SHOT.chest`). Cover between the two is what the arrow strikes,
 * at once: the drawn bow cannot put an arrow through a post he stands behind. `scenery` answers what a line meets.
 */
export function coverAtBow<H>(hunter: Point3, bow: Point3, scenery: (from: Point3, to: Point3) => H | null): H | null {
  return scenery({ x: hunter.x, y: hunter.y + SHOT.chest, z: hunter.z }, bow);
}

export function woundedFleesFrom(position: { x: number; z: number }, yaw: number): { x: number; z: number } {
  return { x: position.x - Math.sin(yaw) * SHOT.woundedFleesBehind, z: position.z - Math.cos(yaw) * SHOT.woundedFleesBehind };
}

/* ============================ Skinning ============================ */

export const SKINNING = {
  /**
   * A carcass is skinned once it lies still: it falls for this long (s) from the pose it died in, and then the body that
   * draws it is measured where it rests, which on the web build takes a few frames more on a shared budget.
   */
  collapseSeconds: 0.9,
  /** He must stand within this (m) of the stance. */
  stanceSlack: 0.4,
  /** The cut is sighted from this high above his feet to this much above the carcass's chest; that much short of it may be blocked (m). */
  eye: 0.95, lift: 0.04, slack: 0.06,
  /** The stance lies out from the carcass's chest by at least this, or half its width and this more, and this far outside its fallen body (m). */
  least: 0.55, beside: 0.35, clear: 0.38,
  /** ...but no further from where the carcass is recorded than the skinning reach less this (m), so the prompt and the cut agree. */
  inside: 0.45,
} as const;

/**
 * Where the hunter stands to skin a carcass: out from its chest toward him, clear of its fallen body (antlers and
 * all), and within reach of where it is recorded. `footprint` is the fallen body's bounds on the ground, if known.
 */
export function skinningStance(chest: { x: number; z: number }, hunter: { x: number; z: number }, animal: { yaw: number; width: number },
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number } | null, recorded: { x: number; z: number }): { x: number; z: number } {
  let dx = hunter.x - chest.x, dz = hunter.z - chest.z;
  if (dx * dx + dz * dz < .01) { dx = Math.cos(animal.yaw); dz = -Math.sin(animal.yaw); }
  const inverse = 1 / (Math.sqrt(dx * dx + dz * dz) || 1);
  dx *= inverse; dz *= inverse;
  let reach = Math.max(SKINNING.least, animal.width * .5 + SKINNING.beside);
  if (footprint) {
    const exitX = Math.abs(dx) > 1e-5 ? ((dx > 0 ? footprint.maxX + SKINNING.clear : footprint.minX - SKINNING.clear) - chest.x) / dx : Infinity;
    const exitZ = Math.abs(dz) > 1e-5 ? ((dz > 0 ? footprint.maxZ + SKINNING.clear : footprint.minZ - SKINNING.clear) - chest.z) / dz : Infinity;
    reach = Math.max(reach, Math.min(exitX, exitZ) + .01);
  }
  let x = chest.x + dx * reach, z = chest.z + dz * reach;
  const limit = SKINNING_REACH - SKINNING.inside, off = Math.hypot(x - recorded.x, z - recorded.z);
  if (off > limit) { x = recorded.x + (x - recorded.x) * limit / off; z = recorded.z + (z - recorded.z) * limit / off; }
  return { x, z };
}

/**
 * The carcass he would skin: the nearest one lying dead within the skinning reach of him on the ground. Whether it is
 * near enough in height, and the rest, is skinningRefusal's to say, so that the prompt can name it and tell him why not.
 */
export function nearestCarcass<T extends { record: { status: AnimalHuntRecord['status']; position: { x: number; z: number } } | null | undefined }>(
  candidates: readonly T[], hunter: { x: number; z: number }, reach: number = SKINNING_REACH): { candidate: T; distance: number } | null {
  let nearest: { candidate: T; distance: number } | null = null;
  for (const candidate of candidates) {
    const record = candidate.record;
    if (record?.status !== 'dead') continue;
    const distance = Math.hypot(record.position.x - hunter.x, record.position.z - hunter.z);
    if (distance <= reach && (!nearest || distance < nearest.distance)) nearest = { candidate, distance };
  }
  return nearest;
}

/** What is known when he would skin, or goes on skinning. */
export interface SkinningFacts {
  record: AnimalHuntRecord | undefined;
  knives: number;
  hunter: Point3 & { alive: boolean; grounded: boolean; swimming: boolean; free: boolean; riding: boolean; mounting: boolean };
  carrying: boolean;
  /** The bow is being drawn, or let go and the arrow not yet away. */
  bowBusy: boolean;
  /** The carcass as it lies, asked only once the rest allows: whether it has come to rest, where to stand and where its chest is. Null while it cannot be told. */
  carcass(): { ready: boolean; stance: { x: number; z: number }; target: Point3 } | null;
  /** What stands between two points, if anything, and how far along. */
  sight(from: Point3, to: Point3): { distance: number } | null;
}

/**
 * Why he cannot skin, as the key of the line that says so, or null if he can. The checks run in this order, so the
 * first thing in the way is the one named. `starting` adds what only stops a start: hands full, the bow drawn, busy.
 */
export function skinningRefusal(facts: SkinningFacts, starting = true): string | null {
  const { record, hunter } = facts;
  if (record?.status !== 'dead') return 'hunting.animal_alive';
  if (facts.knives < 1) return 'hunting.need_knife';
  if (!hunter.alive || !hunter.grounded || hunter.swimming) return 'hunting.skin_need_footing';
  if (starting) {
    if (facts.carrying) return 'hunting.skin_put_down';
    if (facts.bowBusy) return 'hunting.skin_release_bow';
    if (!hunter.free || hunter.riding || hunter.mounting) return 'hunting.skin_busy';
  }
  const carcass = facts.carcass();
  if (!carcass?.ready) return 'hunting.skin_wait';
  if (!withinSkinningReach(hunter, record.position) || Math.hypot(carcass.stance.x - hunter.x, carcass.stance.z - hunter.z) > SKINNING.stanceSlack) return 'hunting.too_far';
  const from = { x: hunter.x, y: hunter.y + SKINNING.eye, z: hunter.z };
  const target = { x: carcass.target.x, y: carcass.target.y + SKINNING.lift, z: carcass.target.z };
  const obstruction = facts.sight(from, target);
  return obstruction && obstruction.distance < Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z) - SKINNING.slack ? 'hunting.skin_blocked' : null;
}
