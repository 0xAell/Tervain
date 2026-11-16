/**
 * The follow camera's feel: how far behind the wanderer it sits, how far it may tilt and zoom, the tighter view while
 * aiming the bow, and how it behaves in a room. What it keeps clear of is in cameraObstruction.ts and cameraCrowns.ts;
 * the ride view's offset is RIDE_CAMERA in riding.ts.
 */
export const CAMERA = {
  /** Vertical field of view (degrees) and the clip planes (m). */
  fov: 60,
  near: 0.1,
  far: 1400,
  /** The boom's length at the start (m) and the range the wheel can set it to. */
  distance: 6.2,
  minDistance: 2.6,
  maxDistance: 9,
  /** Metres of boom per unit of wheel input. */
  zoomRate: 0.004,
  /** The tilt the view is built with (radians, positive looks down on him), the tilt on entering a journey, and its limits. */
  pitch: 0.32,
  entryPitch: 0.3,
  minPitch: -0.65,
  maxPitch: 1.25,
  /** The boom pivots this far above his feet (m). */
  pivotHeight: 1.55,
  /** How quickly the pivot follows him (per second), and its height with reduced motion. */
  follow: 18,
  followHeightReduced: 10,
  /** A blow moves the view by at most this (m). */
  maxRecoil: 0.04,
} as const;

/** The aim view (B11): boom length, shift to the screen's right and lift of the pivot, in metres; its field of view (degrees), narrowing by `drawFov` more at full draw. */
export const AIM_VIEW = { boom: 2.3, right: 1.0, up: 0.3, fov: 48, drawFov: 4 };

export const ROOM_CAMERA = {
  /** Inside a room the lens stays this far under the wall top (the tie beams and rafters), never floating up among them. */
  ceilingClearance: 0.8,
  /** The hero is inside a room from this far outside its footprint (m), and stays so until this far. */
  enter: 0.5,
  leave: 1.2,
  /** The camera itself counts as inside within this margin of the room. */
  hold: 0.6,
} as const;
