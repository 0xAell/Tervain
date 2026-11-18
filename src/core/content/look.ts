/**
 * The look of the final image, as numbers: an earthy, low-saturation picture with softly defined shadows, a vignette and a
 * little grain, and a modest glow on what is bright. Whoever draws the frame applies them; this says what to.
 */
export const LOOK = {
  /** Exposure of every world frame before tone mapping (ACES filmic). */
  exposure: 1.22,
  /** Strength of the daylight contrast curve about a pivot just below mid grey; night fades it to 1. */
  contrast: 1.11,
  /** Colour kept, 1 being all of it. */
  saturation: 0.88,
  /** By day colour is lifted by this much over `saturation`, so sunlit grass stays warm; night fades it to 1. */
  daySaturation: 1.08,
  /** How much the corners darken. */
  vignette: 0.13,
  /** Film grain, strongest in the mid tones. */
  grain: 0.008,
  /** How far greens lean olive and the sky is muted, 0..1. */
  earth: 1,
  /** The glow: the scene brightness above which a pixel glows, and how much of the glow is added. Off at low quality. */
  bloom: { threshold: 0.85, strength: 0.21 },
} as const;

/** The title's look: a little more colour, softer contrast, a heavier vignette and grain, and a slight colour fringe. */
export const MENU_LOOK = { saturation: 0.9, contrast: 1.07, vignette: 0.3, grain: 0.03, earth: 1, chromatic: 0.0012 } as const;
