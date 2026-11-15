import { describe, expect, it } from 'vitest';
import { HEAL_KEY_ITEM, ITEMS } from '../../../src/core/content/items';

describe('the heal key', () => {
  it('uses a poultice, the dressing that heals most of anything carried, not food or herbs', () => {
    expect(HEAL_KEY_ITEM).toBe('poultice');
    const item = ITEMS[HEAL_KEY_ITEM];
    expect(item.kind).toBe('consumable');
    const healing = Object.values(ITEMS).flatMap((other) => other.healAmount ?? []);
    expect(item.healAmount).toBe(Math.max(...healing));
  });
});
