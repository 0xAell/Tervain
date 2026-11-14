/**
 * The hunting bow: how an arrow leaves the string, flies, meets water and is carried. Arrow range, skinning and the
 * hunter's trade are durable rules in src/core/game/hunting.ts; the scene's flights (src/presentation/huntingArrow.ts)
 * and the hand's pose read the numbers here.
 */
export const BOW = {
  /** Seconds to a full draw. Damage does not depend on the draw. */
  drawSeconds: 0.7,
  /** An arrow leaves the string at this speed (m/s) and falls under this gravity (m/s²). */
  arrowSpeed: 65,
  gravity: 9.81,
  /** An arrow that has hit nothing is gone after this many seconds. */
  flightSeconds: 7,
  /** Under water an arrow keeps this share of gravity and loses speed at this rate (per second). */
  waterGravity: 0.25,
  waterDrag: 9,
  /** Slower than this in water (m/s) it floats up and drifts, for this many seconds. */
  floatSpeed: 1.2,
  floatSeconds: 30,
  /** The most arrows in flight at once, and the most left standing where they struck. */
  maxFlights: 12,
  maxLodged: 24,
  /** How long the bow stays in hand after the last aim or shot before it goes back on his back (A75). */
  readySeconds: 2.5,
} as const;

/**
 * The low ballistic arc from the string to a target `(dx, dy, dz)` away: the unit direction to loose along so the
 * arrow, at `speed` under `gravity`, passes through it. Out of range, or straight up or down, it points at the target.
 */
export function arrowLaunchDirection(dx: number, dy: number, dz: number, speed: number = BOW.arrowSpeed, gravity: number = BOW.gravity): { x: number; y: number; z: number } {
  const horizontal = Math.hypot(dx, dz);
  const straight = () => { const d = Math.hypot(dx, dy, dz) || 1; return { x: dx / d, y: dy / d, z: dz / d }; };
  if (horizontal < 0.01) return straight();
  const speedSquared = speed * speed;
  const discriminant = speedSquared * speedSquared - gravity * (gravity * horizontal * horizontal + 2 * dy * speedSquared);
  if (discriminant < 0) return straight();
  const tangent = (speedSquared - Math.sqrt(discriminant)) / (gravity * horizontal);
  const cosine = 1 / Math.sqrt(1 + tangent * tangent);
  return { x: dx / horizontal * cosine, y: tangent * cosine, z: dz / horizontal * cosine };
}
