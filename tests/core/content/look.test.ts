import { describe, expect, it } from 'vitest';
import { LOOK, MENU_LOOK } from '../../../src/core/content/look';

// The look of the final image is a handful of numbers in the core; whoever draws the frame applies them.

describe('the look of the final image', () => {
  it('is earthy and contrasty by day: less than full colour, a curve above 1, and a little vignette and grain', () => {
    expect(LOOK.saturation).toBeGreaterThan(0.7);
    expect(LOOK.saturation).toBeLessThan(1);
    expect(LOOK.saturation * LOOK.daySaturation).toBeLessThan(1); // even lifted by day, never more colour than the scene has
    expect(LOOK.contrast).toBeGreaterThan(1);
    expect(LOOK.contrast).toBeLessThan(1.3);
    expect(LOOK.exposure).toBeGreaterThan(1);
    expect(LOOK.vignette).toBeGreaterThan(0);
    expect(LOOK.vignette).toBeLessThan(0.4);
    expect(LOOK.grain).toBeGreaterThan(0);
    expect(LOOK.grain).toBeLessThan(0.05);
    expect(LOOK.earth).toBe(1);
  });

  it('lets only what is bright glow, and only a little', () => {
    expect(LOOK.bloom.threshold).toBeGreaterThan(0.5);
    expect(LOOK.bloom.strength).toBeGreaterThan(0);
    expect(LOOK.bloom.strength).toBeLessThan(0.5);
  });

  it('gives the title a softer curve, a heavier vignette and grain, and a slight fringe', () => {
    expect(MENU_LOOK.contrast).toBeLessThan(LOOK.contrast);
    expect(MENU_LOOK.vignette).toBeGreaterThan(LOOK.vignette);
    expect(MENU_LOOK.grain).toBeGreaterThan(LOOK.grain);
    expect(MENU_LOOK.chromatic).toBeGreaterThan(0);
    expect(MENU_LOOK.chromatic).toBeLessThanOrEqual(0.01);
  });
});
