import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicalObjectPose, WorldState } from '../core/game/types';
import {
  CARRY,
  CARGO_BODY,
  carryForce,
  holdPoint,
  throwImpulse,
} from '../core/rules/cargo';
import { GRAVITY } from '../core/rules/hero';
import { PROP_WATER_DRAG } from '../core/world/physicalProps';
import { WORLD, type V2 } from '../core/world/layout';
import type { Scenery } from './land';
import {
  rootsNear,
  outdoors,
  carryMass,
  propById,
  propsNear,
  roomProps,
  registerProps,
  type PropSpec,
  type Material,
} from './propCatalogue';
import { outdoorTile, buildRoom, tileSize, floorAt, yawRotation } from './propSurfaces';
import { chamberAt, visibleAcrossWall, type FloorPlan } from './roomPlans';
import { supportHeight } from './relief';
import { coursesInFrame, wetPoint, waterVelocity, type Flow, type Ripple, type WetPoint } from './water';
import { floatHeight, bedDepth } from './swell';
import { deckAt } from './crossing';

export type Turn = PhysicalObjectPose['rotation'];
type Point = PhysicalObjectPose['position'];
export interface PropView extends Point {
  spec: PropSpec;
  rotation: Turn;
  wet: number;
  moving: boolean;
}
interface Live {
  view: PropView;
  body: RAPIER.RigidBody;
  previousSpeed: number;
}
interface WaterEntry extends V2 {
  time: number;
  energy: number;
  radius: number;
  current: V2;
  course: number;
}
type Grip = {
  id: string;
  angle: number;
} & ({ drag: false } | { drag: true; offset: V2 });
export type ContactSound = Material | 'splash' | 'leaves';
const fixed = 1 / 60;
const splashLife = 1.45;
const still = { x: 0, y: 0, z: 0 };
const upright = yawRotation(0);
function immersed(p: Point, height: number, water: WetPoint | null, time: number) {
  if (!water) return 0;
  const surface = water.course === 'ocean' ? floatHeight(p.x, p.z, water.bank, time) / 8 : 0;
  return Math.max(0, Math.min(1, (surface - p.y + height / 2) / height));
}
export const angleOf = (q: Turn) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
const distance = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export function rotate(p: Point, q: Turn): Point {
  const x = 2 * (q.y * p.z - q.z * p.y),
    y = 2 * (q.z * p.x - q.x * p.z),
    z = 2 * (q.x * p.y - q.y * p.x);
  return {
    x: p.x + q.w * x + q.y * z - q.z * y,
    y: p.y + q.w * y + q.z * x - q.x * z,
    z: p.z + q.w * z + q.x * y - q.y * x,
  };
}
function geometry(s: PropSpec, body: RAPIER.RigidBody, world: RAPIER.World) {
  const hh = s.height / 2;
  const collider = (shape: RAPIER.ColliderDesc, mass: number) =>
    world.createCollider(
      shape
        .setMass(mass)
        .setFriction(s.material === 'cloth' ? 0.92 : CARGO_BODY.friction)
        .setRestitution(s.material === 'stone' ? 0.15 : CARGO_BODY.restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
  if (s.shape === 'chair' || s.shape === 'table') {
    const chair = s.shape === 'chair',
      level = chair ? s.height * 0.43 : s.height * 0.89;
    collider(RAPIER.ColliderDesc.cuboid(s.hx, 0.08, s.hz).setTranslation(0, level - hh, 0), s.mass * 0.5);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        collider(
          RAPIER.ColliderDesc.cuboid(0.09, level / 2, 0.09).setTranslation(
            x * (s.hx - 0.1),
            level / 2 - hh,
            z * (s.hz - 0.1)
          ),
          s.mass * (chair ? 0.075 : 0.125)
        );
    if (chair)
      collider(
        RAPIER.ColliderDesc.cuboid(s.hx, (s.height - level) / 2, 0.09).setTranslation(
          0,
          level / 2,
          -s.hz + 0.07
        ),
        s.mass * 0.2
      );
    return;
  }
  const shape =
    s.shape === 'round'
      ? RAPIER.ColliderDesc.cylinder(hh, Math.min(s.hx, s.hz))
      : s.shape === 'rock'
        ? RAPIER.ColliderDesc.roundCuboid(s.hx * 0.7, hh * 0.65, s.hz * 0.7, Math.min(s.hx, s.hz, hh) * 0.33)
        : s.shape === 'log'
          ? RAPIER.ColliderDesc.capsule(
              Math.max(0.015, s.hx - Math.min(s.hz, hh)),
              Math.min(s.hz, hh)
            ).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 })
          : RAPIER.ColliderDesc.roundCuboid(
              Math.max(0.02, s.hx - 0.045),
              Math.max(0.02, hh - 0.045),
              Math.max(0.02, s.hz - 0.045),
              0.045
            );
  collider(shape, s.mass);
}
/** One solver for the current storey or the surrounding outdoor terrain. Distant bodies retain plain save poses. */
export class PropPhysics {
  readonly world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  private events = new RAPIER.EventQueue(true);
  private controller = this.world.createCharacterController(0.018);
  private character = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  // A cast can block the player without the capsule transferring kinematic speed into cargo.
  private capsule = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(0.63, 0.3).setSensor(true),
    this.character
  );
  private bodies = new Map<string, Live>();
  private handles = new Map<number, Live>();
  private solids = new Map<string, RAPIER.RigidBody>();
  private saved = new Map<string, PhysicalObjectPose>();
  private views = new Map<string, PropView>();
  private sector = '';
  private viewRadius = 113;
  private space = '';
  private plan?: FloorPlan;
  private accumulator = 0;
  private time = 0;
  private soundAfter = 0;
  private contactTime = new Map<string, number>();
  private waterEntries: WaterEntry[] = [];
  private foliage = new Map<Scenery, { time: number; force: number }>();
  private brushTime = 0;
  private foot: Point = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  grip?: Grip;
  onContact: (material: ContactSound, energy: number, p: V2) => void = () => {};
  constructor(private state: () => WorldState) {
    registerProps();
    for (const p of state().physicalObjects) this.saved.set(p.id, p);
    this.world.timestep = fixed;
    this.world.numSolverIterations = 6;
  }
  get objects(): Iterable<PropView> {
    return this.views.values();
  }
  outdoorObjects(radius: number) {
    const next = Math.max(113, Math.ceil(radius / 16) * 16);
    if (this.viewRadius !== next) {
      this.viewRadius = next;
      this.sector = '';
      this.sync(undefined, this.foot, this.foot.y, this.yaw);
    }
    return this.objects;
  }
  get held() {
    return this.grip ? this.views.get(this.grip.id) : undefined;
  }
  waterRipples(): Ripple[] {
    return this.waterEntries.map((entry) => {
      const age = this.time - entry.time;
      return {
        x: entry.x + entry.current.x * age * 0.72,
        z: entry.z + entry.current.z * age * 0.72,
        radius: entry.radius + age * (2.2 + entry.energy * 0.8),
        amplitude: entry.energy * (1 - age / splashLife) ** 2,
        course: entry.course,
      };
    });
  }
  object(id: string) {
    return this.views.get(id);
  }
  private base(s: PropSpec) {
    let y = this.plan ? floorAt(this.plan, s) : supportHeight(s);
    const wet = this.plan ? null : wetPoint(s.x, s.z);
    if (wet && !deckAt(s))
      y = s.floats ? -s.height * 0.4 : -bedDepth(wet.bank, wet.halfWidth, wet.course === 'ocean', 0.5);
    return y + s.height / 2 + s.onTop + 0.008;
  }
  private remember(l: Live) {
    const s = l.view.spec,
      p = l.body.translation(),
      q = l.body.rotation(),
      r = yawRotation(s.yaw);
    const changed =
      this.space !== s.space ||
      Math.hypot(p.x - s.x, p.z - s.z) > 0.035 ||
      Math.abs(p.y - this.base(s)) > 0.055 ||
      1 - Math.abs(q.y * r.y + q.w * r.w) > 0.001;
    if (changed || this.grip?.id === s.id)
      this.saved.set(s.id, { id: s.id, space: this.space, position: { ...p }, rotation: { ...q } });
    else this.saved.delete(s.id);
  }
  checkpoint() {
    for (const l of this.bodies.values()) this.remember(l);
    this.state().physicalObjects = [...this.saved.values()];
  }
  private remove(l: Live) {
    this.remember(l);
    for (let i = 0; i < l.body.numColliders(); i++) this.handles.delete(l.body.collider(i).handle);
    this.world.removeRigidBody(l.body);
    this.bodies.delete(l.view.spec.id);
  }
  private add(v: PropView, restored: boolean) {
    const s = v.spec;
    // An authored resting pose belongs to the landscape until it is disturbed.
    // Stacked goods need gravity when their support moves, and water needs to drive its own bodies.
    const resting = !restored && !s.onTop && (!!this.plan || !wetPoint(v.x, v.z) || !!deckAt(v));
    const b = this.world.createRigidBody(
      (resting ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
        .setTranslation(v.x, v.y, v.z)
        .setRotation(v.rotation)
        .setLinearDamping(CARGO_BODY.linearDamping)
        .setAngularDamping(CARGO_BODY.angularDamping)
        .setCcdEnabled(true)
    );
    geometry(s, b, this.world);
    const l = { body: b, view: v, previousSpeed: 0 };
    this.bodies.set(s.id, l);
    for (let i = 0; i < b.numColliders(); i++) this.handles.set(b.collider(i).handle, l);
  }
  private wake(b: RAPIER.RigidBody) {
    if (b.isFixed()) b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    else b.wakeUp();
  }
  sync(room: FloorPlan | undefined, p: V2, footY: number, yaw: number) {
    const key = room ? room.site.id + '/' + room.level : outdoors,
      changed = key !== this.space;
    const sector = room ? key : Math.floor(p.x / 8) + ',' + Math.floor(p.z / 8);
    this.foot = { ...p, y: footY };
    this.yaw = yaw;
    if (!changed && this.sector === sector) return;
    if (changed) {
      const carry = this.held,
        grip = this.grip;
      for (const l of [...this.bodies.values()]) this.remove(l);
      for (const b of this.solids.values()) this.world.removeRigidBody(b);
      this.solids.clear();
      this.views.clear();
      this.foliage.clear();
      this.accumulator = 0;
      this.contactTime.clear();
      this.waterEntries.length = 0;
      this.space = key;
      this.plan = room;
      this.grip = undefined;
      if (room) this.solids.set(key, buildRoom(this.world, room));
      if (carry && grip && !grip.drag) {
        const target = holdPoint(this.foot, yaw, 0);
        target.y += carry.spec.height * 0.32;
        this.saved.set(carry.spec.id, {
          id: carry.spec.id,
          space: key,
          position: target,
          rotation: yawRotation(grip.angle),
        });
        this.grip = grip;
      }
    }
    this.sector = sector;
    if (!room) {
      const needed = new Set<string>(),
        ci = Math.floor(p.x / tileSize),
        cj = Math.floor(p.z / tileSize);
      for (let i = ci - 1; i <= ci + 1; i++)
        for (let j = cj - 1; j <= cj + 1; j++) {
          const k = i + ',' + j;
          needed.add(k);
          if (!this.solids.has(k)) this.solids.set(k, outdoorTile(this.world, i, j));
        }
      for (const [k, b] of this.solids)
        if (!needed.has(k)) {
          this.world.removeRigidBody(b);
          this.solids.delete(k);
        }
    }
    for (const l of [...this.bodies.values()])
      if (!room && distance(l.view, p) > 36 && this.grip?.id !== l.view.spec.id) this.remove(l);
    const candidates = new Set(room ? roomProps(key) : propsNear(p, this.viewRadius));
    for (const pose of this.saved.values()) {
      const s = propById(pose.id);
      if (s && (pose.space ?? s.space) === key && (room || distance(p, pose.position) < this.viewRadius + 16))
        candidates.add(s);
    }
    for (const l of this.bodies.values()) candidates.add(l.view.spec);
    const visible = new Map<string, PropView>();
    for (const s of candidates) {
      const pose = this.saved.get(s.id);
      if ((pose?.space ?? s.space) !== key) continue;
      const pos = pose?.position ?? s;
      if (!room && distance(pos, p) > this.viewRadius + 19 && !this.bodies.has(s.id)) continue;
      const v = this.bodies.get(s.id)?.view ?? {
        spec: s,
        x: pos.x,
        z: pos.z,
        y: pose?.position.y ?? this.base(s),
        rotation: pose?.rotation ?? yawRotation(s.yaw),
        wet: 0,
        moving: false,
      };
      if (!this.bodies.has(s.id) && !room)
        v.wet = immersed(v, s.height, wetPoint(v.x, v.z), this.time);
      visible.set(s.id, v);
      if (!this.bodies.has(s.id) && (room || distance(v, p) < 31)) this.add(v, !!pose);
    }
    this.views = visible;
    this.character.setTranslation({ x: p.x, y: footY + 0.95, z: p.z }, false);
    this.world.propagateModifiedBodyPositionsToColliders();
  }
  private unobstructed(v: PropView) {
    if (this.plan && !visibleAcrossWall(this.plan, this.foot, v)) return false;
    const eye = { ...this.foot, y: this.foot.y + 1.61 },
      d = { x: v.x - eye.x, y: v.y - eye.y, z: v.z - eye.z },
      len = Math.hypot(d.x, d.y, d.z);
    if (!len) return true;
    const hit = this.world.castRay(
      new RAPIER.Ray(eye, { x: d.x / len, y: d.y / len, z: d.z / len }),
      len,
      true,
      undefined,
      undefined,
      undefined,
      this.character,
      (c) => this.handles.get(c.handle)?.view !== v
    );
    return !hit || hit.timeOfImpact >= len - Math.max(0.16, Math.min(v.spec.hx, v.spec.hz));
  }
  nearby(preferred?: string) {
    let nearest: PropView | undefined,
      best = Infinity;
    for (const { view: v } of this.bodies.values()) {
      if (preferred && preferred !== v.spec.id) continue;
      const dx = v.x - this.foot.x,
        dz = v.z - this.foot.z,
        d = Math.hypot(dx, dz);
      if (d > CARRY.reach + Math.min(0.6, v.spec.hx) || Math.abs(v.y - this.foot.y - 1.2) > 2.8) continue;
      const facing = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / Math.max(d, 0.01),
        score = d + 0.62 * (1 - facing);
      if (score < best && this.unobstructed(v)) {
        nearest = v;
        best = score;
      }
    }
    return nearest;
  }
  grab(id?: string) {
    if (this.grip) return false;
    const v = this.nearby(id);
    if (!v) return false;
    const b = this.bodies.get(v.spec.id)!.body;
    const grip = { id: v.spec.id, angle: angleOf(b.rotation()) };
    this.grip =
      v.spec.mass > carryMass
        ? { ...grip, drag: true, offset: { x: v.x - this.foot.x, z: v.z - this.foot.z } }
        : { ...grip, drag: false };
    if (!this.grip.drag) this.wake(b);
    return true;
  }
  turn(dir: number) {
    if (this.grip) this.grip.angle += (dir * Math.PI) / 8;
  }
  release(toss = false, direction?: V2) {
    const g = this.grip;
    if (!g) return;
    const l = this.bodies.get(g.id);
    this.grip = undefined;
    if (!l) return;
    const mass = l.view.spec.mass,
      b = l.body;
    b.resetForces(true);
    b.resetTorques(true);
    if (toss) {
      this.wake(b);
      const from = g.drag ? this.foot : b.translation();
      const yaw =
        direction && distance(from, direction) > 0.45
          ? Math.atan2(direction.x - from.x, direction.z - from.z)
          : this.yaw;
      const speed = throwImpulse(yaw, -0.18, 1);
      const strength = g.drag ? 0.22 : Math.min(1, Math.sqrt(12 / mass));
      b.setLinvel(
        { x: speed.x * strength, y: g.drag ? 0 : speed.y * strength, z: speed.z * strength },
        true
      );
      const roll = g.drag ? 0 : 2.6 * strength;
      b.setAngvel({ x: Math.cos(yaw) * roll, y: 0, z: -Math.sin(yaw) * roll }, true);
    } else {
      b.setLinvel(still, true);
      b.setAngvel(still, true);
    }
    this.remember(l);
  }
  touch(plant: Scenery, force = 1) {
    if (this.time - (this.foliage.get(plant)?.time ?? -5) < 0.36) return;
    this.foliage.set(plant, { time: this.time, force });
    if (force > 0.65) this.onContact('leaves', force * 0.6, plant);
  }
  sway(plant: Scenery) {
    const pulse = this.foliage.get(plant);
    if (!pulse) return 0;
    const t = this.time - pulse.time;
    if (t > 1.9) {
      this.foliage.delete(plant);
      return 0;
    }
    return Math.sin(t * 15) * Math.exp(-2.6 * t) * pulse.force;
  }
  private cargoContact(b: RAPIER.RigidBody, start: Point, offset: Point) {
    if (Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.z) < 1e-7) return;
    const origin = b.translation();
    let first: RAPIER.ColliderShapeCastHit | undefined;
    for (let i = 0; i < b.numColliders(); i++) {
      const part = b.collider(i),
        center = part.translation();
      const hit = this.world.castShape(
        { x: start.x + center.x - origin.x, y: start.y + center.y - origin.y, z: start.z + center.z - origin.z },
        part.rotation(),
        offset,
        part.shape,
        0.008,
        first?.time_of_impact ?? 1,
        false,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        b
      );
      if (hit) first = hit;
    }
    return first;
  }
  private cargoTravel(b: RAPIER.RigidBody, start: Point, offset: Point) {
    return this.cargoContact(b, start, offset)?.time_of_impact ?? 1;
  }
  placeAt(p: V2) {
    const v = this.held;
    if (!v || this.grip?.drag || distance(this.foot, p) > 3.35 || distance(this.foot, p) < 0.65) return false;
    if (this.plan && !visibleAcrossWall(this.plan, this.foot, p)) return false;
    const l = this.bodies.get(v.spec.id)!,
      b = l.body,
      eyeY = this.foot.y + 2.9;
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray({ x: p.x, y: eyeY, z: p.z }, { x: 0, y: -1, z: 0 }),
      5,
      true,
      undefined,
      undefined,
      undefined,
      this.character,
      (c) => this.handles.get(c.handle) !== l
    );
    if (!hit || hit.normal.y < 0.65) return false;
    const dest = { x: p.x, y: eyeY - hit.timeOfImpact + v.spec.height / 2 + 0.035, z: p.z },
      initial = b.translation();
    const delta = { x: dest.x - initial.x, y: dest.y - initial.y, z: dest.z - initial.z };
    const clear = (start: Point, offset: Point) => this.cargoTravel(b, start, offset) >= 0.97;
    if (!clear(initial, delta)) {
      const high = Math.min(eyeY + 0.15, Math.max(dest.y, initial.y) + 0.38);
      const above = { x: initial.x, y: high, z: initial.z },
        over = { x: dest.x, y: high, z: dest.z };
      if (
        !clear(initial, { x: 0, y: high - initial.y, z: 0 }) ||
        !clear(above, { x: delta.x, y: 0, z: delta.z }) ||
        !clear(over, { x: 0, y: dest.y - high, z: 0 })
      )
        return false;
    }
    this.release();
    b.setTranslation(dest, true);
    this.remember(l);
    this.sound(v.spec.material, 0.48, l);
    return true;
  }
  private pull(l: Live) {
    const grip = this.grip!,
      v = l.body.translation(),
      vel = l.body.linvel(),
      s = l.view.spec;
    if (distance(this.foot, v) > CARRY.dropBeyond + Math.max(s.hx, s.hz)) {
      this.release();
      return;
    }
    const target = grip.drag
      ? { x: this.foot.x + grip.offset.x, y: v.y, z: this.foot.z + grip.offset.z }
      : holdPoint(this.foot, this.yaw, 0);
    if (!grip.drag) target.y += 0.43 + s.height * 0.32;
    if (l.body.isFixed()) {
      if (distance(target, v) < 0.04 && Math.abs(Math.sin((grip.angle - angleOf(l.body.rotation())) / 2)) < 0.025)
        return;
      this.wake(l.body);
    }
    const gain = grip.drag ? 0.32 : 1;
    const steer = (offset: number, speed: number) =>
      speed + (carryForce(offset, speed, s.mass) / s.mass) * gain * fixed;
    const x = steer(target.x - v.x, vel.x),
      z = steer(target.z - v.z, vel.z),
      limit = Math.min(1, (grip.drag ? 2.9 : 5.6) / Math.max(0.01, Math.hypot(x, z)));
    let next = { x: x * limit, y: vel.y, z: z * limit };
    if (!grip.drag) {
      const up = Math.max(-3.2, Math.min(3.2, steer(target.y - v.y, vel.y)));
      // Lift off the support first. Then stop the hand's pull at walls and neighboring props.
      const dy = up * fixed * this.cargoTravel(l.body, v, { x: 0, y: up * fixed, z: 0 });
      const reach = this.cargoTravel(
        l.body,
        { ...v, y: v.y + dy },
        { x: next.x * fixed, y: 0, z: next.z * fixed }
      );
      next = { x: next.x * reach, y: dy / fixed + GRAVITY * fixed, z: next.z * reach };
    }
    l.body.setLinvel(next, true);
    const q = l.body.rotation(),
      desired = yawRotation(grip.angle);
    // Follow the shortest rotation toward the selected orientation.
    const sign = q.y * desired.y + q.w * desired.w < 0 ? -1 : 1,
      spin = l.body.angvel(),
      speed = grip.drag ? 2.4 : 5;
    l.body.setAngvel(
      {
        x: -speed * sign * (desired.w * q.x + desired.y * q.z) - spin.x * 0.05,
        y: speed * sign * (desired.y * q.w - desired.w * q.y),
        z: -speed * sign * (desired.w * q.z - desired.y * q.x) - spin.z * 0.05,
      },
      true
    );
  }
  routeClear(from: V2, to: V2) {
    const ground = (p: V2) => (this.plan ? floorAt(this.plan, p) : supportHeight(p));
    const base = ground(from);
    return !this.world.castShape(
      { x: from.x, y: base + 0.95, z: from.z },
      upright,
      { x: to.x - from.x, y: ground(to) - base, z: to.z - from.z },
      this.capsule.shape,
      0.16,
      1,
      false,
      undefined,
      undefined,
      undefined,
      this.grip ? this.bodies.get(this.grip.id)?.body : undefined,
      (c) => this.handles.has(c.handle)
    );
  }
  move(from: V2, to: V2, y: number, pushTime = 0) {
    const dx = to.x - from.x,
      dz = to.z - from.z;
    if (Math.abs(dx) + Math.abs(dz) < 1e-8) return to;
    let close = false;
    for (const { view } of this.bodies.values())
      if (
        this.grip?.id !== view.spec.id &&
        Math.abs(view.x - from.x) < view.spec.hx + 1.6 &&
        Math.abs(view.z - from.z) < view.spec.hz + 1.6
      ) {
        close = true;
        break;
      }
    if (!close) return to;
    this.character.setTranslation({ x: from.x, y: y + 0.95, z: from.z }, false);
    this.world.propagateModifiedBodyPositionsToColliders();
    this.controller.computeColliderMovement(
      this.capsule,
      { x: dx, y: 0, z: dz },
      undefined,
      undefined,
      (c) => {
        const l = this.handles.get(c.handle);
        return !!l && l.view.spec.id !== this.grip?.id;
      }
    );
    if (pushTime > 0 && this.controller.numComputedCollisions()) {
      const travel = Math.hypot(dx, dz),
        speed = travel / pushTime,
        pushed = new Set<Live>();
      for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
        const hit = this.controller.computedCollision(i);
        const l = hit?.collider && this.handles.get(hit.collider.handle);
        if (!hit || !l || pushed.has(l) || l.view.spec.mass > carryMass || Math.abs(hit.normal1.y) > 0.55)
          continue;
        const normal = Math.hypot(hit.normal1.x, hit.normal1.z),
          x = -hit.normal1.x / normal,
          z = -hit.normal1.z / normal,
          approach = (dx * x + dz * z) / travel;
        if (approach < 0.57) continue;
        const mass = l.view.spec.mass,
          v = l.body.linvel(),
          goal = Math.min(2, speed * 0.4) * approach,
          amount = Math.min(goal - v.x * x - v.z * z, (26 * approach * pushTime) / (1 + mass / 16));
        if (amount <= 0) continue;
        this.wake(l.body);
        l.body.applyImpulse({ x: x * amount * mass, y: 0, z: z * amount * mass }, true);
        pushed.add(l);
      }
    }
    const m = this.controller.computedMovement();
    return { x: from.x + m.x, z: from.z + m.z };
  }
  private wakeOnImpact(l: Live, velocity: Point) {
    const hit = this.cargoContact(l.body, l.body.translation(), {
      x: velocity.x * fixed,
      y: velocity.y * fixed,
      z: velocity.z * fixed,
    });
    const target = hit && this.handles.get(hit.collider.handle);
    if (!hit || !target?.body.isFixed()) return;
    const n = hit.normal1;
    const approach = -(velocity.x * n.x + velocity.y * n.y + velocity.z * n.z);
    if (approach > 1.2 && approach * l.view.spec.mass > target.view.spec.mass * 0.42)
      this.wake(target.body);
  }
  supporting(p: V2, base: number, previous: number, hop: number) {
    return this.supportAt(p, base, previous, hop)?.height ?? base;
  }
  supportAt(p: V2, base: number, previous: number, hop: number) {
    if (!this.bodies.size) return;
    const top = Math.max(base + 0.26, previous + 0.17, base + hop + 0.14);
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray({ x: p.x, y: top, z: p.z }, { x: 0, y: -1, z: 0 }),
      Math.max(0.28, top - base + 0.02),
      false,
      undefined,
      undefined,
      undefined,
      this.character,
      (c) => {
        const l = this.handles.get(c.handle);
        return !!l && l.view.spec.id !== this.grip?.id;
      }
    );
    if (!hit || hit.normal.y <= 0.6) return;
    const prop = this.handles.get(hit.collider.handle);
    if (prop) return { height: Math.max(base, top - hit.timeOfImpact), material: prop.view.spec.material };
  }
  private float(l: Live, flow: Flow) {
    const b = l.body,
      p = b.translation(),
      s = l.view.spec,
      water = wetPoint(p.x, p.z);
    const depth = immersed(p, s.height, water, this.time);
    const last = l.view.wet;
    l.view.wet = depth;
    if (!water || !depth) return;
    const v = b.linvel(),
      current = waterVelocity(p, water, flow, this.time);
    if (last < 0.08 && depth >= 0.08 && v.y < -0.9) {
      const energy = Math.min(1.3, -v.y * (0.11 + Math.sqrt(s.hx * s.hz) * 0.19));
      this.sound('splash', Math.min(1, energy), l);
      this.waterEntries.push({
        x: p.x,
        z: p.z,
        time: this.time,
        energy,
        radius: Math.max(0.16, Math.min(1.2, Math.sqrt(s.hx * s.hz))),
        current,
        course: coursesInFrame.indexOf(water.course),
      });
    }
    const drag = PROP_WATER_DRAG * s.mass * depth;
    if (!b.isSleeping() || s.floats)
      b.addForce(
        {
          x: (current.x - v.x) * drag,
          y: (s.floats ? (s.mass * GRAVITY * depth) / 0.46 : 0) - v.y * drag * 2,
          z: (current.z - v.z) * drag,
        },
        true
      );
  }
  private sound(m: ContactSound, energy: number, l: Live) {
    if (
      this.time < this.soundAfter ||
      this.time < (this.contactTime.get(l.view.spec.id) ?? 0) ||
      distance(this.foot, l.view) > 23
    )
      return;
    this.soundAfter = this.time + 0.06;
    this.contactTime.set(l.view.spec.id, this.time + 0.26);
    this.onContact(m, energy, l.view);
  }
  tick(dt: number, room: FloorPlan | undefined, p: V2, y: number, yaw: number, flow: Flow) {
    const walked = distance(this.foot, p);
    if (!room && this.time >= this.brushTime) {
      this.brushTime = this.time + 0.22;
      if (walked > 0.001) for (const plant of rootsNear(p, 1.15)) this.touch(plant, 0.48);
      for (const l of this.bodies.values())
        if (l.view.moving && l.view.y < supportHeight(l.view) + 2.5)
          for (const plant of rootsNear(l.view, 1.1)) this.touch(plant, 0.75);
    }
    this.sync(room, p, y, yaw);
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator + 1e-8 >= fixed) {
      this.accumulator -= fixed;
      this.time += fixed;
      for (const l of this.bodies.values()) {
        const b = l.body,
          held = this.grip?.id === l.view.spec.id;
        if (!held && (b.isFixed() || (b.isSleeping() && !l.view.wet))) continue;
        b.resetForces(false);
        b.resetTorques(false);
        const v = b.linvel();
        l.previousSpeed = Math.hypot(v.x, v.y, v.z);
        if (held) this.pull(l);
        else {
          if (l.previousSpeed > 1.2) this.wakeOnImpact(l, v);
          if (!room) this.float(l, flow);
        }
      }
      this.world.step(this.events);
      this.events.drainCollisionEvents((a, b, started) => {
        if (!started) return;
        const first = this.handles.get(a),
          second = this.handles.get(b),
          l = (first?.previousSpeed ?? 0) > (second?.previousSpeed ?? 0) ? first : second;
        if (l && l.previousSpeed > 1.2) this.sound(l.view.spec.material, Math.min(1, l.previousSpeed / 7), l);
      });
    }
    if (this.waterEntries.length)
      this.waterEntries = this.waterEntries.filter((entry) => this.time - entry.time < splashLife).slice(-8);
    for (const l of this.bodies.values()) {
      const b = l.body,
        pos = b.translation();
      Object.assign(l.view, pos);
      l.view.rotation = b.rotation();
      const vel = b.linvel();
      l.view.moving = Math.hypot(vel.x, vel.y, vel.z) > 0.2;
      if (
        pos.y < -15 ||
        (!room && (pos.x < WORLD.minX || pos.x > WORLD.maxX || pos.z < WORLD.minZ || pos.z > WORLD.maxZ)) ||
        (room && !chamberAt(room, pos) && pos.y < -0.8)
      ) {
        const safe = this.plan ? { x: 0, z: 0 } : l.view.spec.space === outdoors ? l.view.spec : this.foot;
        b.setTranslation(
          { x: safe.x, y: floorAt(this.plan, safe) + l.view.spec.height / 2 + 0.05, z: safe.z },
          true
        );
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }
  dispose() {
    this.events.free();
    this.world.free();
  }
}
