import { coursesInFrame, type Flow, type WetPoint } from './channels';
import { smoothstep } from '../core/world/noise';
import { contactObstacles } from './waterObstacles';
import { cosPhase, seaClock, seaPhases, sinPhase } from './swell';

export * from './channels';
export { onBridge } from './crossing';

const obstacles = contactObstacles.flatMap(({ profile, obstacle }) =>
  profile?.kind === 'river' ? [{ profile, radius: obstacle.radius * 1.36 }] : []
);
const obstaclesByReach = new Map<number, typeof obstacles>();
const reachKey = (w: WetPoint, station: number) =>
  coursesInFrame.indexOf(w.course) * 1024 + Math.floor(station / 8);
for (const o of obstacles) {
  const p = o.profile;
  for (let i = Math.floor((p.along - 2.2) / 8); i <= Math.floor((p.along + 6.5) / 8); i++) {
    const key = reachKey(p, i * 8),
      bucket = obstaclesByReach.get(key) ?? [];
    bucket.push(o);
    obstaclesByReach.set(key, bucket);
  }
}
/** Signed cross-stream deflection around a wash stone and a recirculating pocket downstream. */
export function stoneFlow(w: WetPoint) {
  let deflection = 0,
    eddy = 0;
  for (const stone of obstaclesByReach.get(reachKey(w, w.along)) ?? []) {
    if (stone.profile.course !== w.course) continue;
    const ahead = w.along - stone.profile.along,
      side = w.across - stone.profile.across;
    if (ahead < -2.2 || ahead > 6.5 || Math.abs(side) > 3.4) continue;
    const r = stone.radius,
      d = Math.sqrt((ahead / r) ** 2 * 0.39 + (side / r) ** 2);
    deflection += (side / Math.max(Math.abs(side), 0.21 * r)) * Math.exp(-d * d * 0.62) * r;
    if (ahead > 0) {
      const tail = r * 0.8 + ahead * 0.18;
      const lee = Math.exp(-ahead * 0.36 - Math.pow(side / tail, 2) * 1.1);
      const shear = Math.exp(-ahead * 0.44 - Math.pow((Math.abs(side) - tail) / 0.33, 2));
      eddy = Math.max(eddy, Math.min(1, lee * 0.86 + shear * 0.6));
    }
  }
  return { deflection, eddy };
}
/** Surface transport for floating debris, with an onshore drift and reversing orbital motion on waves. */
export function waterVelocity(p: { x: number; z: number }, wet: WetPoint, flow: Flow, time: number) {
  if (wet.course !== 'ocean') return riverVelocity(wet, flow);
  const phase = seaPhases(p.x, p.z, wet.bank),
    clock = seaClock(time),
    primary = phase - clock[0],
    cross = (phase >>> 8) - clock[1],
    swell = 0.23 + 0.83 * sinPhase(primary) + 0.34 * sinPhase(cross),
    chop = 0.26 * cosPhase(cross);
  const shore = Math.min(1, Math.max(0, wet.bank) / 1.1);
  return { x: swell * shore, z: (swell * 0.19 + chop) * shore };
}
/** Metres per second, with slower banks and a lateral return behind obstacles. */
export function riverVelocity(p: WetPoint, flow: Flow) {
  if (p.kind !== 'river' || p.course === 'ocean') return { x: 0, z: 0 };
  const depth = Math.min(1, Math.max(0, p.bank) / Math.max(0.65, p.halfWidth));
  const { eddy, deflection } = stoneFlow(p),
    speed = (0.3 + flow[p.course] * 1.5) * Math.sqrt(depth);
  const forward = speed * (1 - eddy * 0.84),
    lateral = speed * deflection * 0.31;
  return { x: p.tx * forward - p.tz * lateral, z: p.tz * forward + p.tx * lateral };
}
export interface Ripple {
  x: number;
  z: number;
  radius: number;
  amplitude: number;
  course: number;
}
/** A damped packet from a footfall. Its slope displaces the reflected image as the ring passes. */
export function rippleAt(r: Ripple, x: number, z: number) {
  const dx = x - r.x,
    dz = z - r.z,
    reach = r.radius + 0.7;
  if (Math.abs(dx) > reach || Math.abs(dz) > reach) return;
  const d = Math.hypot(dx, dz),
    delta = d - r.radius,
    env = Math.max(0, 1 - Math.abs(delta) / 0.66);
  if (!env) return;
  const strength = env * env * r.amplitude,
    grad = (Math.cos(delta * 8.5) * strength) / Math.max(d, 0.15);
  return {
    dx: (dx - dz) * grad,
    dy: (dx + dz) * 0.62 * grad,
    crest: Math.max(0, Math.sin(delta * 8.5 + 0.7)) * strength,
  };
}
export function waveFrame(phase: number, count: number) {
  if (count < 2) return 0;
  const period = 2 * (count - 1),
    position = ((Math.floor(phase) % period) + period) % period;
  return position < count ? position : period - position;
}

/** Fraction of an upright pose below the surface, measured continuously from the dry bank. */
export function waterline(wet: WetPoint, swimmer: boolean) {
  if (wet.course === 'ocean')
    return 0.32 * smoothstep(0, 3, wet.bank) + (swimmer ? 0.14 : 0.06) * smoothstep(3, 4.6, wet.bank);
  if (wet.kind === 'pool') return 0.28 * smoothstep(0, 1.55, wet.bank);
  return 0.31 * smoothstep(0, 2.1, wet.bank);
}
