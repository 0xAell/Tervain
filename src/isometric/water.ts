import { gravelRocks } from './riverHabitat';
import { coursesInFrame, waterProfile, type Flow, type WetPoint } from './channels';
import { crossings, crossingPoint } from './crossing';

export * from './channels';
export { onBridge } from './crossing';

export const riverStones = [
  ...gravelRocks,
  { x: -12.25, z: 2.6, width: 13 },
  { x: -13.7, z: 13.1, width: 10 },
  { x: 32.8, z: -13.8, width: 20 },
  { x: 35.1, z: -9.3, width: 13 },
  { x: 8.4, z: -62, width: 19 },
  { x: 45.6, z: -31.2, width: 12 },
] as const;
const obstacles = [
  ...riverStones.map((s) => ({ at: s, radius: s.width / 16 })),
  ...crossings.flatMap((b) =>
    b.sills.flatMap((s) =>
      [-1, 1].map((side) => ({
        at: crossingPoint(b, s, side * (b.halfWidth - 0.16)),
        radius: 0.46,
      }))
    )
  ),
].map(({ at, radius }) => ({ profile: waterProfile(at.x, at.z), radius }));
const obstaclesByReach = new Map<number, typeof obstacles>();
const reachKey = (w: WetPoint, station: number) =>
  coursesInFrame.indexOf(w.course) * 1024 + Math.floor(station / 8);
for (const o of obstacles) {
  const p = o.profile;
  if (!p) continue;
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
    eddy = 0,
    bow = 0;
  for (const stone of obstaclesByReach.get(reachKey(w, w.along)) ?? []) {
    if (!stone.profile || stone.profile.course !== w.course) continue;
    const ahead = w.along - stone.profile.along,
      side = w.across - stone.profile.across;
    if (ahead < -2.2 || ahead > 6.5 || Math.abs(side) > 3.4) continue;
    const r = stone.radius,
      d = Math.sqrt((ahead / r) ** 2 * 0.39 + (side / r) ** 2);
    deflection += (side < 0 ? -1 : 1) * Math.exp(-d * d * 0.62) * r;
    if (ahead < 0.55 * r) {
      const rim = Math.hypot(ahead * 0.92, side) - r * 0.92;
      bow = Math.max(bow, Math.exp(-(rim * rim) / (0.065 + r * 0.055)) * Math.min(1, (0.62 * r - ahead) / r));
    }
    if (ahead > 0) {
      const tail = r * 0.8 + ahead * 0.18;
      const lee = Math.exp(-ahead * 0.36 - Math.pow(side / tail, 2) * 1.1);
      const shear = Math.exp(-ahead * 0.44 - Math.pow((Math.abs(side) - tail) / 0.33, 2));
      eddy = Math.max(eddy, Math.min(1, lee * 0.86 + shear * 0.6));
    }
  }
  return { deflection, eddy, bow };
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
