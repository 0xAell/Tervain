/** One-sided reach in metres on a 1.8 m figure, and the fraction of a stride under load. */
export const WALK_STEP = { reach: 0.41, contact: 0.52, lift: 0.108 } as const;
export const RUN_STEP = { reach: 0.47, contact: 0.255, lift: 0.24 } as const;

/** A sole's path through one cycle. The contact portion sweeps evenly under the travelling
 * hips. The returning boot lifts over the ground, then reaches ahead for the next heel strike.
 * Angles use the model's +z forward and its leg bones pointing down -y. */
export function walkingFoot(phase: number, step: typeof WALK_STEP | typeof RUN_STEP, reach: number, lower: number, heading: number, stature: number) {
  const t = phase - Math.floor(phase), contact = step.contact;
  const inContact = t < contact;
  const progress = inContact ? t / contact : (t - contact) / (1 - contact);
  const smooth = progress * progress * (3 - 2 * progress);
  // Hermite's end tangents meet the planted foot at walking speed on both sides of toe-off.
  const swingDistance = -1 + 2 * smooth - 2 * (1 - contact) / contact * progress * (1 - progress) * (1 - 2 * progress);
  const along = reach * (inContact ? 1 - 2 * progress : swingDistance);
  // A nearly stationary gait can ease to rest without raising a boot a full stride high.
  const reachFraction = Math.min(1, reach / (stature * step.reach));
  const lift = inContact ? 0 : step.lift * stature * reachFraction * Math.sin(Math.PI * progress) ** 2;
  const thigh = 0.45 * stature, shin = 0.42 * stature;
  const drop = thigh + shin + lower - lift, x = along * Math.sin(heading), z = along * Math.cos(heading);
  const distance2 = drop * drop + x * x + z * z;
  const knee = Math.acos(Math.max(-1, Math.min(1, (distance2 - thigh * thigh - shin * shin) / (2 * thigh * shin))));
  const hip = Math.atan2(-z, Math.hypot(drop, x)) - Math.atan2(shin * Math.sin(knee), thigh + shin * Math.cos(knee));
  // A heel strike rolls onto a flat sole, then onto the toe. Ease between both ends in the air.
  const pitch = inContact
    ? -0.16 * (1 - Math.min(1, progress * 4)) ** 2 + 0.34 * Math.max(0, (progress - 0.62) / 0.38) ** 2
    : 0.34 - 0.5 * smooth;
  return { hip, knee, side: Math.atan2(x, drop), pitch: pitch * Math.cos(heading) };
}
