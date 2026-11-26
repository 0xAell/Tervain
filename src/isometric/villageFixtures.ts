import { ANCHORS, BELL, COOKFIRES, FOREST_WAYMARKERS, LANTERNS, NOTICEBOARD, WELL, type V2 } from '../core/world/layout';

export const warmingFire = { x: ANCHORS.strand_fire!.x - 0.7, z: ANCHORS.strand_fire!.z + 1.9 };

/** Ground contacts, usable sides, and native sprite widths for the village square. */
export const villageFixtures = [
  { key: 'well', at: WELL, width: 33, approach: { x: WELL.x + 1.6, z: WELL.z + 1 }, reach: 2.8, label: 'Draw water from the well' },
  { key: 'bell', at: BELL, width: 27, approach: { x: BELL.x + 1.75, z: BELL.z - 0.8 }, reach: 2.6, label: 'Pull the bell rope' },
  { key: 'board', at: NOTICEBOARD, width: 29, approach: { x: NOTICEBOARD.x, z: NOTICEBOARD.z - NOTICEBOARD.readFrom }, reach: 3.45, label: 'Read the noticeboard' },
] as const;

const post = (at: V2, radius: number, height: number, x = 0, z = 0) =>
  ({ x: at.x + x, z: at.z + z, radius, height });
export const fixtureFootprints = [
  post(WELL, 1.29, 1.05),
  post(BELL, 0.20, 3.6, -0.9, 0.8), post(BELL, 0.20, 3.6, 0.9, -0.8),
  post(NOTICEBOARD, 0.18, 2.5, -0.85, 0.68), post(NOTICEBOARD, 0.18, 2.5, 0.85, -0.68),
  post(warmingFire, 0.66, 0.36),
  ...COOKFIRES.map((p) => post(p, 0.86, 1.48)),
  ...LANTERNS.map((p) => post(p, 0.16, 3.4)),
  ...FOREST_WAYMARKERS.map((p) => post(p, 0.43, 1.65)),
];

/** Sweep the walker's feet against the same ground contacts used by loose objects. */
export function passesFixtures(from: V2, to: V2, lift: number) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const length = dx * dx + dz * dz;
  if (!length) return true;
  for (const p of fixtureFootprints) {
    const r = p.radius + 0.26, x = from.x - p.x, z = from.z - p.z;
    if (lift > p.height || Math.abs(x) > Math.abs(dx) + r || Math.abs(z) > Math.abs(dz) + r) continue;
    const closest = -(x * dx + z * dz) / length;
    if (closest <= 0) continue;
    const t = Math.min(1, closest);
    if ((x + dx * t) ** 2 + (z + dz * t) ** 2 < r * r) return false;
  }
  return true;
}
