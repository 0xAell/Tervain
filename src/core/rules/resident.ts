import type { Activity } from '../content/npcs';

/**
 * How a resident moves about the day's places: pace, how they speed up and stop, how they turn, when they have
 * arrived, how they go to bed and what wakes them, and how often they pass a remark. Where they should be is in
 * schedule.ts; their homes and indoor posts in world/homes.ts. The scene's NpcActor applies these to its rig.
 */
export const RESIDENT = {
  /** Walking pace (m/s), body radius (m), and how they gather pace and brake (m/s²). */
  walkSpeed: 1.55,
  radius: 0.35,
  acceleration: 3.2,
  braking: 4,
  /**
   * How fast a resident turns, radians a second (A69): about 180° a second walking and 125° standing, easing into the
   * last part of a turn. People turn about with a step or two; they never spin on the spot.
   */
  turnWalking: 3.2,
  turnStanding: 2.2,
  turnEase: 7,
  /** A turn on the spot faster than this (radians a second) is stepped round, each radian a stride's arc of gait (A69). */
  turnStepped: 0.6,
  turnStride: 0.3,
  /** Within this of their place's heading (radians) a resident settles there: they sit down or start work facing it. */
  settled: 0.3,
  /** They have arrived within this distance of a work place or a seat (m), or of anywhere else. */
  arriveExact: 0.06,
  arriveNear: 0.15,
  /** Seconds to lie down from sitting on a bed's edge, or to sit up again; and a moment sat on it first (A70). */
  lieSeconds: 1.8,
  sitBeforeLying: 1.2,
  /** A fight this near wakes a sleeper (m), A70. */
  alarmReach: 40,
  /** Passing remarks: only with the wanderer within this distance (m); seconds to the first and between later ones, [least, random span]. */
  barkReach: 6.5,
  firstBark: [8, 10],
  bark: [28, 20],
} as const;

/** How near their place a resident must come to have arrived, by what they will do there. */
export const arrivalRadius = (activity: Activity): number => (activity === 'work' || activity === 'sit' ? RESIDENT.arriveExact : RESIDENT.arriveNear);
