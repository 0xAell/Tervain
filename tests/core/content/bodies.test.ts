import { describe, expect, it } from 'vitest';
import { ANIMAL_HOME_MARGIN } from '../../../src/core/content/animals';
import { banditScale, ENEMY_FIGURE } from '../../../src/core/content/enemies';
import { figureScale, WOMAN_FIGURE_SCALE } from '../../../src/core/content/npcs';

// The factors that size a figure, which the core's rules then measure as a body, are the core's: the scene draws each
// figure at the size given here, and a body's height is the drawn figure's.

describe('how large a figure is drawn', () => {
  it('draws a resident at the look’s height, a woman a little smaller', () => {
    expect(figureScale(1.02, false)).toBe(1.02);
    expect(figureScale(1, true)).toBe(WOMAN_FIGURE_SCALE);
    expect(WOMAN_FIGURE_SCALE).toBeLessThan(1);
  });

  it('draws a bandit larger than its model, each variant larger still, and the Thornback at its own height', () => {
    expect(banditScale(0)).toBe(ENEMY_FIGURE.banditScale);
    expect(banditScale(1)).toBeCloseTo(ENEMY_FIGURE.banditScale + ENEMY_FIGURE.perVariant, 12);
    expect(ENEMY_FIGURE.thornbackHeight).toBeGreaterThan(1);
  });

  it('seeks an animal’s home for its footprint and a margin', () => {
    expect(ANIMAL_HOME_MARGIN).toBeGreaterThan(0);
  });
});
