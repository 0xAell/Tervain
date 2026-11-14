/**
 * How the animals behave between the hunter's visits: how long they rest, when they call, how they wander, watch, flee
 * and break out when cornered. Paces, notice and flee distances and temperaments per species are in
 * content/animals.ts; habitat and path rules in animalNavigation.ts. The scene (src/presentation/animals.ts) runs the
 * states Idle, Graze, Walk, Run, Alert, Call, Groom and Sleep with these numbers. A pair is [least, random span].
 */
export const ANIMAL_BEHAVIOUR = {
  /** Seconds at rest before the next move: the first after the world opens, later ones, and after finding no way to go. */
  firstRest: [3, 7],
  rest: [4, 9],
  restNoPath: [4, 5],
  /** A seated animal's seconds between grooming or sleeping. */
  seatedRest: [9, 14],
  /** Seconds to the first call: a base, staggered by this much per animal, plus a random span. Later calls: `call`. */
  firstCall: { base: 18, stagger: 2.1, span: 25 },
  call: [35, 40],
  /** An animal calls only with the hunter in earshot and this much further off than its flee distance (m). */
  callClearance: 1,
  /** The call is voiced this long into its gesture (s); a call gesture lasts at least `callSeconds`. */
  callAt: 0.25,
  callSeconds: 3.8,
  /** A gesture is over this long after its clip ends (s). */
  gestureSlack: 0.2,
  /** Share of rests a grazer spends grazing rather than standing; a seated animal grooming; the cat asleep by night. */
  grazeShare: 0.75,
  seatedGroomShare: 0.2,
  catSleepShare: 0.55,
  /** Share of the times a predator holding its ground warns the hunter off with a call rather than watching. */
  warnShare: 0.3,
  /** Seconds before it looks up at the hunter again: a seated animal, and others ([least, random span]). */
  seatedAlert: 14,
  alert: [13, 12],
  /** A wander goes this far (m) plus up to this share of the animal's range, tried this many times. */
  wander: { base: 4, roamShare: 0.65, attempts: 10 },
  /** A flight starts directly away at `base` metres, each retry `step` further and fanned by `fan` radians. */
  flee: { base: 7, step: 0.45, fan: 0.34 },
  /**
   * Cornered at the edge of its range: of `directions` points `reach` metres about it, pulled within `roamShare` of
   * its range, it tries the `keep` that leave it farthest from the hunter, none closer to him than now less `slack`
   * nor nearer than `minMove`.
   */
  cornered: { directions: 16, reach: 8, roamShare: 0.95, keep: 6, slack: 0.5, minMove: 2 },
  /** Seconds between plans ([least, random span]); held up this long while fleeing, it plans again. */
  plan: [0.9, 0.4],
  replanBlocked: 0.4,
  /** Turning: radians a second on the move and when watching; it turns in place beyond `turnFirst` radians. */
  turn: 3.5,
  watchTurn: 1.4,
  turnFirst: 0.18,
  /** A waypoint is reached within this distance (m); making no headway for this long (s), it gives up and rests. */
  arrive: 0.25,
  stalled: 0.1,
  giveUp: 1,
  /** The tame mount, left out of its habitat beyond this distance from the hunter (m), is led home. */
  ledHomeBeyond: 90,
  /** Under a rider it gallops above this pace (m/s) and walks above the other. */
  rideRun: 2.6,
  rideWalk: 0.15,
} as const;
