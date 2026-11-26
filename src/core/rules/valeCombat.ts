import type { ItemId, WorldState } from '../game/types';
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

export function wears(s: WorldState, item: ItemId) {
  return s.facts.worn_charm === item && (s.inventory[item] ?? 0) > 0;
}
export function bladeDamage(s: WorldState, stroke: SwordStroke, armed = true) {
  if (!armed) return 8;
  const base = (stroke === 'counter' ? 44 : stroke === 'thrust' ? 38 : 29) + (s.facts.blade_honed ? 4 : 0);
  return stroke === 'thrust' && wears(s, 'contract_band') ? Math.round(base * 1.15) : base;
}
