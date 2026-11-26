import type { V2 } from '../core/world/layout';
import type { Actor } from './simulation';
import { siteAtPoint } from './doorways';
import { passageLanding, roomCanMove, stairRun, type FloorPlan } from './roomPlans';
import { residentSpots } from './roomTargets';
import { walkingRoute } from './walkingRoute';

interface Occupant {
  a: Actor;
  at: V2;
  goal?: V2;
  path: V2[];
  moving: boolean;
  flip: boolean;
}
const distance = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

function threshold(plan: FloorPlan, upstairs: boolean) {
  const flight = upstairs ? plan.stairs.find(s => s.passage.target === (plan.level === 'loft' ? 'ground' : 'loft')) : undefined;
  if (flight) return { x: flight.passage.x, z: flight.passage.z + flight.direction * (stairRun - 0.09) };
  return plan.passages.find(p => p.kind === 'outside') ?? passageLanding(plan);
}

export class RoomResidents {
  private plan?: FloorPlan;
  private people = new Map<Actor, Occupant>();
  private upstairs = new Set<Actor>();

  /** Interaction and painting consume these same positions, including while someone is crossing the hall. */
  view(plan: FloorPlan | undefined, actors: Actor[], dt = 0) {
    const entered = this.plan !== plan;
    if (entered) {
      this.people.clear();
      this.upstairs.clear();
      this.plan = plan;
    }
    if (!plan) return this.people.values();
    if (!entered && !dt) return this.people.values();
    const posts = new Map(residentSpots(plan, actors).map(s => [s.a, s.at]));
    for (const [a, post] of posts) {
      if (this.people.has(a)) continue;
      const start = entered ? post : threshold(plan, plan.level === 'loft' || this.upstairs.has(a));
      this.people.set(a, { a, at: { ...start }, path: [], moving: false, flip: a.flip });
    }
    for (const a of actors) {
      if (!a.npc) continue;
      if (siteAtPoint(a) === plan.site && a.posture === 'rest') this.upstairs.add(a);
      else this.upstairs.delete(a);
    }
    for (const person of this.people.values()) {
      const { a, at } = person;
      if (a.dead) { this.people.delete(a); continue; }
      const post = posts.get(a);
      const goal = post ?? threshold(plan, plan.level === 'loft' || this.upstairs.has(a));
      if (!person.goal || distance(goal, person.goal) > 0.24) {
        person.goal = { ...goal };
        const clear = (from: V2, to: V2) => roomCanMove(plan, from, to);
        person.path = clear(at, goal) ? [goal] : walkingRoute(at, goal, true, clear);
      }
      person.moving = false;
      let travel = dt * 1.7;
      while (travel > 0 && person.path.length) {
        const next = person.path[0]!, dx = next.x - at.x, dz = next.z - at.z, length = Math.hypot(dx, dz);
        const step = Math.min(travel, length);
        if (step > 0) {
          at.x += dx * step / length;
          at.z += dz * step / length;
          person.moving = true;
          if (Math.abs(dx - dz) > 0.045 * length) person.flip = dx < dz;
        }
        if (step === length) person.path.shift();
        travel -= step;
      }
      if (!post && distance(at, goal) < 0.12) this.people.delete(a);
    }
    return this.people.values();
  }
}
