/** Timing for Bellwether Vale's seven-cel blade and drawn bow. Times are in seconds. */
export const SIDESTEP = { duration: 0.18, invulnerable: 0.12, cooldown: 0.46, distance: 2.35 } as const;
export const FOCUS_TIME = 0.65;
export const FOCUSED_ARROW_DAMAGE = Math.round(32 * 1.35);
export const IMPACT_PAUSE = { regular: 0.035, parry: 0.065, heavy: 0.08 } as const;
export type SwordStroke = 'attack' | 'return' | 'thrust' | 'counter';

export function followingStroke(previous: SwordStroke): SwordStroke {
  if (previous === 'return') return 'thrust';
  return previous === 'thrust' ? 'attack' : 'return';
}

/** The integral of a burst that sheds speed as the lead foot plants. */
export function sidestepDistance(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / SIDESTEP.duration));
  return SIDESTEP.distance * t * (2 - t);
}
