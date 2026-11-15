import { ANIMAL_CALL_REACH, ANIMAL_GESTURE_SECONDS, ANIMAL_SENSES, ANIMAL_TEMPERAMENT, type AnimalClip, type AnimalDefinition } from '../content/animals';
import { WILDLIFE_RETURN_DISTANCE } from '../game/hunting';
import type { Collider, Colliders } from '../world/colliders';
import type { V2 } from '../world/layout';
import { mulberry32 } from '../world/noise';
import { ANIMAL_BEHAVIOUR as BEHAVIOUR } from './animalBehaviour';
import { animalGroundAllowed, animalHabitatAllowed, findAnimalPath, type AnimalSite, type AnimalTerrain } from './animalNavigation';
import { NIGHT } from './dayNight';

/**
 * What an animal does: rest, graze, wander within its range, notice someone coming, stand and watch, warn, run from a
 * hunter or from an alarm its own kind carries, call now and then, come home when it was led away, and settle
 * somewhere new after it has been gone. It decides and moves on the ground; it draws nothing. Whoever draws the animal
 * gives it a body: where it stands, how tall it is, which motions it has and how long they run.
 */

/** A place in the world (m): x east, y up, z south. */
export interface AnimalPoint { x: number; y: number; z: number }

/** The body, as far as the mind needs it. */
export interface AnimalBodyFacts {
  /** Where the body stands. The mind moves it over the ground (x, z); whoever draws it keeps its height (y). */
  readonly position: AnimalPoint;
  /** How tall it stands (m). */
  readonly height: number;
  /** Whether it has this motion. */
  has(clip: AnimalClip): boolean;
  /** It begins another motion. */
  transition(clip: AnimalClip): void;
  /** The way the drawn body faces now (radians): it turns to its heading over a moment, and does not step off before it has. */
  facing(): number;
}

/** Someone the animals walk round. */
export interface WildlifePerson { id: string; x: number; y: number; z: number; radius: number; height: number; active: boolean }

/** What the world tells the animals about themselves that is not theirs to decide. */
export interface WildlifeFacts {
  /** In the world: not skinned and gone. */
  present(mind: AnimalMind): boolean;
  /** Shot dead, lying where it fell. */
  dead(mind: AnimalMind): boolean;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** The animals together: what each one's mind shares with the others. */
export class Wildlife {
  readonly minds: AnimalMind[] = [];
  people: readonly WildlifePerson[] = [];
  /** Where the hunter was last seen, so a returning animal does not settle in front of him (A96 scout). */
  hunter: V2 | null = null;

  constructor(readonly terrain: AnimalTerrain, readonly colliders: Colliders, private readonly facts: WildlifeFacts) {}

  present(mind: AnimalMind): boolean { return this.facts.present(mind); }
  dead(mind: AnimalMind): boolean { return this.facts.dead(mind); }

  /** Everyone an animal walks round: the other animals to be seen, the people, and whoever the focus is. */
  extrasFor(mind: AnimalMind, focus: AnimalPoint): Collider[] {
    return [
      ...this.minds.filter(other => other !== mind && this.present(other)).map(other => ({ id: `animal:${other.definition.id}`, kind: 'circle' as const, x: other.body.position.x, z: other.body.position.z,
        r: other.home.radius, active: true, minY: other.body.position.y, maxY: other.body.position.y + other.body.height })),
      ...this.people.filter(person => person.active).map(person => ({ id: person.id, kind: 'circle' as const, x: person.x, z: person.z, r: person.radius + 0.12,
        active: true, minY: person.y, maxY: person.y + person.height })),
      { id: 'wildlife:player', kind: 'circle', x: focus.x, z: focus.z, r: 0.55, active: true, minY: focus.y, maxY: focus.y + 1.9 },
    ];
  }

  /** A frightened herd or pack animal carries the alarm to its own kind nearby, so a group scatters together (A70). */
  spreadAlarm(from: AnimalMind, position: V2): void {
    const herd = ANIMAL_TEMPERAMENT[from.definition.species].herd;
    if (!herd) return;
    for (const other of this.minds) {
      if (other === from || other.alarm || other.definition.tame || other.definition.species !== from.definition.species) continue;
      if (!this.present(other) || this.dead(other)) continue;
      if (Math.hypot(other.body.position.x - from.body.position.x, other.body.position.z - from.body.position.z) > herd) continue;
      other.alarm = { x: position.x, z: position.z, remaining: 6 }; other.path = []; other.planIn = 0.15 + other.rng() * 0.5;
    }
  }
}

/** What an animal did in one step. */
export interface AnimalStep {
  /** Ground speed this step (m/s). */
  speed: number;
  /** It calls now: which of its two calls (1 or 2), or 0 for none. */
  call: 0 | 1 | 2;
}

export class AnimalMind {
  yaw: number;
  state: AnimalClip;
  stateTime = 0;
  rest: number;
  callIn: number;
  callSent = false;
  alertIn = 0;
  path: V2[] = [];
  blockedFor = 0;
  planIn = 0;
  alarm: { x: number; z: number; remaining: number } | null = null;
  readonly initialYaw: number;
  readonly rng: () => number;

  /** `index` is its place among the animals: it staggers their first calls and seeds its own chances. */
  constructor(readonly definition: AnimalDefinition, readonly home: AnimalSite, index: number, readonly body: AnimalBodyFacts, readonly herd: Wildlife) {
    const rng = mulberry32(Number(definition.id.slice(-7)) + index * 271), randomYaw = rng() * Math.PI * 2;
    this.rng = rng;
    this.yaw = this.initialYaw = definition.homeYaw ?? randomYaw;
    this.state = body.has('Graze') ? 'Graze' : 'Idle'; body.transition(this.state);
    this.rest = BEHAVIOUR.firstRest[0] + rng() * BEHAVIOUR.firstRest[1];
    this.callIn = BEHAVIOUR.firstCall.base + index * BEHAVIOUR.firstCall.stagger + rng() * BEHAVIOUR.firstCall.span;
    herd.minds.push(this);
  }

  /** Begin doing something else. */
  enter(state: AnimalClip): void {
    if (this.state === state) return;
    this.state = state; this.stateTime = 0; this.callSent = false; this.body.transition(state);
  }

  /** Stop where it is and rest a while: grooming or idle if it sits, grazing or idle otherwise. */
  settle(): void {
    this.path = []; this.rest = BEHAVIOUR.rest[0] + this.rng() * BEHAVIOUR.rest[1];
    const state = this.definition.seated ? (this.rng() < BEHAVIOUR.seatedGroomShare ? 'Groom' : 'Idle')
      : this.body.has('Graze') && this.rng() < BEHAVIOUR.grazeShare ? 'Graze' : 'Idle';
    this.enter(state);
  }

  /** Find somewhere to go: anywhere in its range when wandering, away from `focus` when fleeing. True when it sets off. */
  seek(focus: AnimalPoint, fleeing: boolean): boolean {
    const { terrain, colliders } = this.herd;
    this.planIn = BEHAVIOUR.plan[0] + this.rng() * BEHAVIOUR.plan[1];
    const start = this.body.position, allExtras = this.herd.extrasFor(this, focus);
    // Yield from a newly approaching actor's avoidance margin; the actual step still resolves the full contacts.
    const extras = allExtras.filter(extra => extra.kind !== 'circle' || Math.hypot(extra.x - start.x, extra.z - start.z) > extra.r + this.home.radius + 0.05);
    const tryTo = (candidate: V2): boolean => {
      const path = findAnimalPath(this.definition, start, candidate, this.home, this.home.radius, terrain, colliders, extras, this.body.height);
      if (!path?.length) return false;
      this.path = path; this.blockedFor = 0; this.enter(fleeing ? 'Run' : 'Walk'); return true;
    };
    for (let attempt = 0; attempt < BEHAVIOUR.wander.attempts; attempt++) {
      const a = fleeing ? Math.atan2(start.x - focus.x, start.z - focus.z) + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * BEHAVIOUR.flee.fan : this.rng() * Math.PI * 2;
      const distance = fleeing ? BEHAVIOUR.flee.base + attempt * BEHAVIOUR.flee.step : BEHAVIOUR.wander.base + this.rng() * Math.max(1, this.definition.roam * BEHAVIOUR.wander.roamShare);
      const candidate = { x: start.x + Math.sin(a) * distance, z: start.z + Math.cos(a) * distance };
      if (Math.hypot(candidate.x - this.home.x, candidate.z - this.home.z) > this.definition.roam) continue;
      if (tryTo(candidate)) return true;
    }
    if (!fleeing) return false;
    // Cornered at the edge of its range with the hunter on the home side (A96 scout: it froze there, to be shot at point
    // blank): it breaks round him, to the place in its range that keeps it farthest from him.
    const away = Math.hypot(start.x - focus.x, start.z - focus.z), roam = this.definition.roam * BEHAVIOUR.cornered.roamShare;
    const around: { x: number; z: number; d: number }[] = [];
    for (let k = 0; k < BEHAVIOUR.cornered.directions; k++) {
      const a = (k / BEHAVIOUR.cornered.directions) * Math.PI * 2;
      let x = start.x + Math.sin(a) * BEHAVIOUR.cornered.reach, z = start.z + Math.cos(a) * BEHAVIOUR.cornered.reach;
      const fromHome = Math.hypot(x - this.home.x, z - this.home.z);
      if (fromHome > roam) { x = this.home.x + (x - this.home.x) * roam / fromHome; z = this.home.z + (z - this.home.z) * roam / fromHome; }
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d >= away - BEHAVIOUR.cornered.slack && Math.hypot(x - start.x, z - start.z) > BEHAVIOUR.cornered.minMove) around.push({ x, z, d });
    }
    around.sort((p, q) => q.d - p.d);
    for (const candidate of around.slice(0, BEHAVIOUR.cornered.keep)) if (tryTo(candidate)) return true;
    return false;
  }

  /** A shot was loosed near it, or it was hit: it runs from where the danger is, and its kind nearby with it. */
  startled(fallback: V2, wounded?: boolean): void {
    const position = !wounded ? fallback
      : this.alarm && this.alarm.remaining > 0 ? { x: this.alarm.x, z: this.alarm.z } : this.herd.hunter ?? fallback;
    this.alarm = { x: position.x, z: position.z, remaining: 8 }; this.path = []; this.planIn = 0; this.callSent = true;
    if (!this.seek({ x: position.x, y: this.herd.terrain.heightAt(position.x, position.z), z: position.z }, true)) this.enter('Alert');
    this.herd.spreadAlarm(this, position);
  }

  /**
   * Back in the world after being gone: it settles somewhere new in its range, so the same wood is a new encounter
   * (A70), and of the places tried the one farthest from the hunter (A96 scout). False when a returning animal has
   * nowhere far enough from him yet; it is asked again later.
   */
  resettle(returning: boolean): boolean {
    const { terrain, colliders, hunter } = this.herd;
    let at: V2 = this.home, best = -Infinity, yaw = this.initialYaw;
    const away = (p: V2) => hunter ? Math.hypot(p.x - hunter.x, p.z - hunter.z) : 0;
    if (hunter) best = away(this.home);
    // Expiry measures the old carcass, not the new site. If the entire return range is too close, wait without
    // probing terrain or resetting the live controller every frame. The caller retries every WILDLIFE_RETRY_SECONDS.
    if (returning && hunter && best + this.definition.roam * .7 < WILDLIFE_RETURN_DISTANCE) return false;
    for (let attempt = 0; attempt < 8 && this.definition.roam > 2 && !this.definition.tame; attempt++) {
      const a = this.rng() * Math.PI * 2, r = this.definition.roam * (0.2 + 0.5 * this.rng());
      const candidate = { x: this.home.x + Math.sin(a) * r, z: this.home.z + Math.cos(a) * r };
      if (!(animalGroundAllowed(terrain, candidate, this.home.radius) && animalHabitatAllowed(this.definition, candidate)
        && !colliders.blocked(candidate.x, candidate.z, this.home.radius))) continue;
      const d = away(candidate);
      if (d > best || at === this.home && !hunter) { at = candidate; best = d; yaw = a; }
      if (!hunter || d >= WILDLIFE_RETURN_DISTANCE) break;
    }
    if (returning && hunter && best < WILDLIFE_RETURN_DISTANCE) return false;
    this.alarm = null; this.path = []; this.yaw = yaw;
    const p = this.body.position;
    p.x = at.x; p.y = terrain.heightAt(at.x, at.z); p.z = at.z;
    this.state = 'Idle'; this.stateTime = 0; this.callSent = false; this.callIn = 20 + this.rng() * 35; this.settle();
    return true;
  }

  /** Carried by a rider: it stands, walks or runs where he steers, out of its own routine. Returns its gait. */
  carry(at: { x: number; z: number; yaw: number; speed: number }): 'Idle' | 'Walk' | 'Run' {
    const p = this.body.position;
    p.x = at.x; p.z = at.z; this.yaw = at.yaw; this.path = []; this.alarm = null;
    const pace = Math.abs(at.speed), gait = pace > BEHAVIOUR.rideRun ? 'Run' as const : pace > BEHAVIOUR.rideWalk ? 'Walk' as const : 'Idle' as const;
    this.enter(gait);
    return gait;
  }

  /**
   * One step of its own life. `focus` is the wanderer, `nightness` 0 by day to 1 at night. Null when it is not in the
   * world or lies dead: there is nothing of it to move.
   */
  step(dt: number, focus: AnimalPoint, nightness: number): AnimalStep | null {
    const { terrain, colliders } = this.herd, definition = this.definition;
    const p = this.body.position, distance = Math.hypot(p.x - focus.x, p.z - focus.z);
    // Left far from its rest, the mount is led home once well beyond the hunter's sight (A70).
    if (definition.tame && !definition.seated && distance > BEHAVIOUR.ledHomeBeyond && !animalHabitatAllowed(definition, p)) {
      p.x = this.home.x; p.z = this.home.z; this.yaw = this.initialYaw; this.path = []; this.settle();
    }
    if (!this.herd.present(this) || this.herd.dead(this)) return null;
    if (this.alarm) { this.alarm.remaining -= dt; if (this.alarm.remaining <= 0) this.alarm = null; }
    const fleeingFrom: AnimalPoint = this.alarm ? { x: this.alarm.x, y: p.y, z: this.alarm.z } : focus;
    this.stateTime += dt; this.callIn -= dt; this.alertIn = Math.max(0, this.alertIn - dt); this.planIn = Math.max(0, this.planIn - dt);
    const speeds = ANIMAL_SENSES[definition.species];
    const holding = !definition.tame && !definition.seated && !this.alarm && distance < speeds.flee;
    if (definition.seated) {
      if (distance < speeds.notice && this.alertIn <= 0 && this.state !== 'Alert') { this.enter('Alert'); this.alertIn = BEHAVIOUR.seatedAlert; }
    } else if (!definition.tame && (distance < speeds.flee * ANIMAL_TEMPERAMENT[definition.species].holdUntil || this.alarm)) {
      if (!this.alarm) this.herd.spreadAlarm(this, focus);
      if (this.planIn <= 0 && (this.state !== 'Run' || !this.path.length || this.blockedFor > BEHAVIOUR.replanBlocked)) {
        if (!this.seek(fleeingFrom, true)) { this.path = []; this.enter('Alert'); }
      }
    } else if (distance < speeds.notice && this.alertIn <= 0 && this.state !== 'Run' && this.state !== 'Alert') {
      this.path = []; this.enter('Alert'); this.alertIn = BEHAVIOUR.alert[0] + this.rng() * BEHAVIOUR.alert[1];
    } else if (!definition.tame && distance < speeds.flee && this.state !== 'Alert' && this.state !== 'Call') {
      // A predator inside its flee distance but standing its ground watches the hunter, and now and then warns him off.
      this.path = []; this.enter(this.rng() < BEHAVIOUR.warnShare && this.body.has('Call') ? 'Call' : 'Alert');
    }
    const callNow = this.state === 'Call' && !this.callSent && this.stateTime >= BEHAVIOUR.callAt;
    let speed = 0;
    if (this.state === 'Walk' || this.state === 'Run') {
      const target = this.path[0];
      if (target) {
        const dx = target.x - p.x, dz = target.z - p.z, length = Math.hypot(dx, dz);
        const desiredYaw = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw));
        this.yaw += clamp(turn, -dt * BEHAVIOUR.turn, dt * BEHAVIOUR.turn);
        // The drawn body eases toward this heading. It does not move along the new path while it still faces the old one.
        const facing = this.body.facing();
        const facingTurn = Math.atan2(Math.sin(desiredYaw - facing), Math.cos(desiredYaw - facing));
        const turning = Math.abs(turn) > BEHAVIOUR.turnFirst || Math.abs(facingTurn) > BEHAVIOUR.turnFirst;
        // Its own pace, whatever the body: whoever draws it plays the stride to match.
        const step = turning ? 0 : Math.min(length, dt * (this.state === 'Run' ? definition.run : definition.walk));
        const extras = this.herd.extrasFor(this, focus);
        const next = colliders.move(p.x, p.z, dx / Math.max(length, 1e-5) * step, dz / Math.max(length, 1e-5) * step, this.home.radius,
          undefined, { minY: p.y + 0.03, maxY: p.y + this.body.height }, extras);
        if (animalGroundAllowed(terrain, next, this.home.radius) && animalHabitatAllowed(definition, next)
          && Math.hypot(next.x - this.home.x, next.z - this.home.z) <= definition.roam + 0.01) {
          const travel = Math.hypot(next.x - p.x, next.z - p.z);
          p.x = next.x; p.z = next.z; speed = travel / Math.max(dt, 1e-5);
        }
        this.blockedFor = !turning && speed < BEHAVIOUR.stalled ? this.blockedFor + dt : 0;
        if (length < BEHAVIOUR.arrive || step >= length && speed > 0) this.path.shift();
        if (this.blockedFor > BEHAVIOUR.giveUp || !this.path.length) this.settle();
      } else this.settle();
    } else {
      if (this.state === 'Alert') {
        const yaw = Math.atan2(focus.x - p.x, focus.z - p.z), turn = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
        this.yaw += clamp(turn, -dt * BEHAVIOUR.watchTurn, dt * BEHAVIOUR.watchTurn);
      }
      const gesture = this.state === 'Call' || this.state === 'Alert' || this.state === 'Groom' ? this.state : null;
      const gestureDuration = gesture === 'Call' ? Math.max(BEHAVIOUR.callSeconds, ANIMAL_GESTURE_SECONDS.Call) : gesture ? ANIMAL_GESTURE_SECONDS[gesture] : 0;
      if (gesture && this.stateTime > gestureDuration + BEHAVIOUR.gestureSlack) {
        // Still alarmed with nowhere to run, it stays on watch rather than grazing beside the hunter (A96 scout).
        if (holding || this.alarm && !definition.tame) { this.stateTime = 0; this.enter('Alert'); } else this.settle();
      }
      this.rest -= dt;
      if (this.callIn <= 0 && distance < ANIMAL_CALL_REACH[definition.species] && distance > speeds.flee + BEHAVIOUR.callClearance && ['Idle', 'Graze'].includes(this.state)) {
        // Not in its sleep (A96 scout: the cat woke to call whenever its timer ran out at night).
        this.enter('Call'); this.callIn = BEHAVIOUR.call[0] + this.rng() * BEHAVIOUR.call[1];
      } else if (this.rest <= 0 && ['Idle', 'Graze', 'Sleep'].includes(this.state)) {
        if (definition.seated) { this.enter(nightness > NIGHT.catSleeps && this.rng() < BEHAVIOUR.catSleepShare ? 'Sleep' : 'Groom'); this.rest = BEHAVIOUR.seatedRest[0] + this.rng() * BEHAVIOUR.seatedRest[1]; }
        else if (!this.seek(focus, false)) this.rest = BEHAVIOUR.restNoPath[0] + this.rng() * BEHAVIOUR.restNoPath[1];
      }
    }
    if (!callNow) return { speed, call: 0 };
    this.callSent = true;
    return { speed, call: this.rng() < 0.5 ? 1 : 2 };
  }
}
