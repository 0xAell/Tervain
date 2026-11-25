import type { V2 } from '../core/world/layout';
import { coursesInFrame, waterProfile, type Flow, type WetPoint } from './channels';
import { foamCell } from './foam';
import { project, unproject, PROJECTION } from './projection';
import type { PropView } from './propPhysics';
import { incomingSwell, sinPhase } from './swell';
import { contactObstacles } from './waterObstacles';

const saturate = (n: number) => Math.max(0, Math.min(1, n));
const swellFrequency = 0.192;
const swellPeriod = 1 / swellFrequency;
export const maxWaterImpacts = 10;

interface Obstacle extends V2 {
  radius: number;
  profile: WetPoint;
  tx: number;
  tz: number;
  face: number;
}
export interface WaterImpact extends V2 {
  radius: number;
  course: number;
  tx: number;
  tz: number;
  /** Seconds since the crest first reached the upstream face. */
  age: number;
  pressure: number;
}

function prepare(p: V2, radius: number, profile: WetPoint): Obstacle {
  if (profile.course === 'ocean') {
    const { tx, tz, phase } = incomingSwell(p, radius, profile.bank);
    return { x: p.x, z: p.z, radius, profile, tx, tz, face: phase };
  }
  return { x: p.x, z: p.z, radius, profile, tx: profile.tx, tz: profile.tz, face: 0 };
}
const fixed = contactObstacles.flatMap(({ obstacle, profile }) =>
  profile ? [prepare(obstacle, obstacle.radius, profile)] : []
);

function wave(o: Obstacle, time: number, flow: Flow, size: number): WaterImpact {
  const { x, z, radius, profile, tx, tz, face } = o,
    course = coursesInFrame.indexOf(profile.course);
  if (profile.course === 'ocean') {
    // The same primary swell travels towards the rock in the surface shader. Short chop changes each hit.
    const crest = time + (0.22 - (face & 255) / 256) / swellFrequency;
    const age = crest - Math.floor(crest / swellPeriod) * swellPeriod;
    const chop = sinPhase((face >>> 8) - (time - age) * 0.255 * 256);
    return { x, z, radius, course, tx, tz, age, pressure: size * (0.95 + chop * 0.23) };
  }
  const basin = profile.kind === 'pool',
    speed = 0.36 + flow[profile.course] * 0.57,
    shed = time * speed + profile.along * 0.137 + profile.across * 0.235;
  return {
    x,
    z,
    radius,
    course,
    tx,
    tz,
    age: (shed - Math.floor(shed)) / speed,
    pressure: size * (basin ? 0.47 : 0.66 + flow[profile.course] * 0.53),
  };
}

const reach = (radius: number) => radius * 1.8 + 3.8;
function overlaps(p: V2, radius: number, left: number, top: number, right: number, bottom: number) {
  const at = project(p.x, p.z),
    r = reach(radius) * PROJECTION * Math.SQRT2;
  return at.x >= left - r && at.x <= right + r && at.y >= top - r * 0.5 && at.y <= bottom + r * 0.5;
}
export function visibleWaterImpacts(
  left: number,
  top: number,
  width: number,
  height: number,
  time: number,
  flow: Flow,
  loose: readonly PropView[]
) {
  const right = left + width,
    bottom = top + height;
  const impacts: WaterImpact[] = [];
  for (const o of fixed) {
    if (overlaps(o, o.radius, left, top, right, bottom)) impacts.push(wave(o, time, flow, 1));
  }
  for (const body of loose) {
    const radius = Math.sqrt(body.spec.hx * body.spec.hz);
    if (body.wet < 0.1 || body.wet > 0.89 || radius < 0.23) continue;
    if (!overlaps(body, radius, left, top, right, bottom)) continue;
    const profile = waterProfile(body.x, body.z);
    if (!profile) continue;
    impacts.push(wave(prepare(body, radius, profile), time, flow, 0.46));
  }
  return impacts;
}
export function impactsForTile(impacts: readonly WaterImpact[], x: number, y: number, width: number) {
  const local = impacts.filter((o) => overlaps(o, o.radius, x, y, x + width, y + width));
  if (local.length <= maxWaterImpacts) return local;
  const center = unproject(x + width * 0.5, y + width * 0.5);
  const distance = (o: WaterImpact) => Math.hypot(o.x - center.x, o.z - center.z) - o.radius;
  return local.sort((a, b) => distance(a) - distance(b)).slice(0, maxWaterImpacts);
}

/** Reflected wavefront on the incident face, with shear on either side of a sheltered wake.
 * The WebGL water shader evaluates the same field before refraction and reflection. */
export function waterImpactAt(o: WaterImpact, x: number, z: number, grain: number) {
  const ox = x - o.x,
    oz = z - o.z,
    radius = o.radius,
    limit = reach(radius);
  if (Math.abs(ox) > limit || Math.abs(oz) > limit) return;
  const distance = Math.hypot(ox, oz),
    gap = distance - radius;
  if (gap < -0.16 || distance > limit) return;
  const sea = o.course === 0,
    forward = ox * o.tx + oz * o.tz,
    lateral = oz * o.tx - ox * o.tz,
    side = Math.abs(lateral),
    facing = forward / Math.max(distance, 0.15),
    front = saturate(0.52 - facing * 0.62);
  const pulse = gap - (0.08 + o.age * (sea ? 2.85 : 1.65) - Math.max(0, facing) * 0.54);
  const response = saturate(1 - Math.abs(pulse) / (0.38 + radius * 0.15)),
    bounce = response * saturate(1 - o.age / (sea ? 1.36 : 1.16)) * front * o.pressure;
  const lip = saturate(1 - Math.abs(gap - 0.1) / (0.24 + radius * 0.1)) * front * o.pressure;
  const tailWidth = radius * 0.61 + Math.max(0, forward - radius) * 0.29,
    tail = saturate((forward - radius * 0.52) * 1.4) * saturate((limit - forward) / 2.8),
    shear = tail * saturate(1 - Math.abs(side - tailWidth) / (0.42 + radius * 0.14));
  const shelter = tail * saturate(1 - side / (tailWidth + 0.35)),
    curl = Math.cos(forward * 2.9 - o.age * 4.9 + lateral * 2.3);
  const slope = bounce * Math.cos(pulse * 7.6) * 3.4 + lip * (sea ? bounce : 0.46),
    radial = slope / Math.max(distance, 0.18);
  return {
    x: (ox - oz) * radial + shear * curl * o.pressure * 1.68,
    y: (ox + oz) * radial * 0.48 - shear * curl * o.pressure * 0.88,
    foam:
      (0.46 + grain * 0.54) *
      Math.max(
        bounce * 1.16,
        lip * (sea ? 0.18 + bounce * 0.6 : 0.63),
        shear * o.pressure * (sea ? 0.29 : 0.56) * (0.52 + curl * 0.48)
      ),
    shelter,
  };
}

/** Ballistic, pixel-aligned spray shed from the same crest that disturbs the reflected image. */
export function drawWaterSpray(
  ctx: CanvasRenderingContext2D,
  impacts: readonly WaterImpact[],
  ox: number,
  oy: number
) {
  ctx.save();
  for (const o of impacts) {
    if (o.age >= 0.85 || o.pressure < 0.56) continue;
    const sea = o.course === 0,
      heading = Math.atan2(-o.tz, -o.tx),
      count = Math.min(25, Math.ceil((sea ? 8 : 4) + o.radius * (sea ? 10 : 5)));
    for (let i = 0; i < count; i++) {
      const grain = foamCell(Math.floor(o.x * 5) + i * 9, Math.floor(o.z * 3) - i * 17),
        jitter = foamCell(Math.floor(o.x * 7) - i * 19, Math.floor(o.z * 5) + i * 13),
        age = o.age - grain * 0.19;
      if (age <= 0) continue;
      const up = (sea ? 3.65 + o.radius * 0.2 : 1.52) * o.pressure * (0.7 + jitter * 0.8),
        height = age * (up - age * 4.9);
      if (height <= 0) continue;
      const angle = heading + (jitter - 0.5) * (sea ? 3.4 : 2.85),
        radius = o.radius + 0.06 + age * (0.9 + grain * (sea ? 2.6 : 1.4));
      const p = project(o.x + Math.cos(angle) * radius, o.z + Math.sin(angle) * radius, height);
      ctx.globalAlpha = (1 - Math.min(1, (age * 4.9) / up) * 0.88) * (0.38 + grain * 0.39);
      ctx.fillStyle = grain > 0.55 ? '#e5f1d2' : '#b5ded0';
      ctx.fillRect(Math.round(p.x + ox), Math.round(p.y + oy), sea && grain > 0.77 ? 2 : 1, 1);
    }
  }
  ctx.restore();
}
