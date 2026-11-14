import type { EncounterId } from '../game/types';
import type { EnemySpawn } from '../world/layout';

/** What a kind of hostile is: how tough, how fast, how it strikes and how far it notices the wanderer. */
export interface EnemyArchetype {
  /** Shown above its health bar. */
  name: string;
  hp: number;
  /** Chasing pace (m/s). */
  speed: number;
  /** Distance at which it starts its attack (m). */
  reach: number;
  /** Seconds of wind-up, of strike, and of recovery after it. */
  wind: number;
  strike: number;
  recover: number;
  damage: number;
  /** Distance within which it can notice the wanderer (m). */
  notice: number;
  /** A heavy blow: it lunges as it strikes, costs more to block and can break a guard. */
  heavy: boolean;
  /** Body radius for contact (m). */
  radius: number;
}

export const ENEMY_ARCHETYPES: Record<EnemySpawn['kind'], EnemyArchetype> = {
  thornback: { name: 'Thornback', hp: 110, speed: 4.4, reach: 2.9, wind: 0.95, strike: 0.4, recover: 1.1, damage: 20, notice: 10, heavy: true, radius: 0.85 },
  bandit: { name: 'Toll-jumper', hp: 55, speed: 3.5, reach: 1.9, wind: 0.6, strike: 0.2, recover: 0.9, damage: 11, notice: 12, heavy: false, radius: 0.4 },
};

/** The way each hostile faces while it waits at its post (radians); others face ENEMY_IDLE_YAW. */
export const ENEMY_IDLE_YAW = 1.2;
export const ENEMY_POST_YAW: Partial<Record<EncounterId, number>> = { ford_bandit_b: 4.0 };
/** Which of the two bandit figures stands at each post. */
export const ENEMY_VARIANT: Partial<Record<EncounterId, number>> = { ford_bandit_b: 1 };
