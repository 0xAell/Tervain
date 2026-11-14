import { describe, expect, it } from 'vitest';
import { chooseInteractable, type Interactable } from '../../../src/core/rules/interaction';
import { Colliders } from '../../../src/core/world/colliders';

const flat = { groundAt: () => 0 };
const player = { x: 0, y: 0, z: 0, yaw: 0 };
const thing = (id: string, x: number, z: number, more: Partial<Interactable> = {}): Interactable => ({
  id, pos: () => ({ x, z }), r: 3, prompt: () => id, enabled: () => true, act: () => {}, ...more,
});
const choose = (items: Interactable[], colliders = new Colliders(), viewYaw = 0, occluded?: () => boolean) =>
  chooseInteractable(items, player, viewYaw, flat, colliders, occluded)?.id ?? null;

describe('choosing what the player can act on', () => {
  it('offers the nearest thing within its own reach', () => {
    expect(choose([thing('far', 0, 2.5), thing('near', 0, 1.8)])).toBe('near');
    expect(choose([thing('out', 0, 3.2)])).toBeNull();
    expect(choose([thing('wide', 0, 3.2, { r: 4 })])).toBe('wide');
  });

  it('measures reach to the target’s height, from the eye at 1.4 m', () => {
    // A target on the ground plane is taken 1 m above it; one named far overhead is out of reach.
    expect(choose([thing('shelf', 0, 2.9, { pos: () => ({ x: 0, z: 2.9, y: 1.4 }) })])).toBe('shelf');
    expect(choose([thing('rafters', 0, 2.9, { pos: () => ({ x: 0, z: 2.9, y: 4 }) })])).toBeNull();
  });

  it('needs the player to face it or look at it, except right at his feet', () => {
    const behind = thing('behind', 0, -2);
    expect(choose([behind])).toBeNull();
    // Looking back over the shoulder is enough.
    expect(choose([behind], new Colliders(), Math.PI)).toBe('behind');
    expect(choose([thing('at_feet', 0, -1.2)])).toBe('at_feet');
  });

  it('skips what is disabled', () => {
    expect(choose([thing('off', 0, 1.5, { enabled: () => false }), thing('on', 0, 2.5)])).toBe('on');
  });

  it('lets a lower priority win over a nearer thing, two metres a step', () => {
    expect(choose([thing('near', 0, 1.5), thing('preferred', 0, 2.5, { priority: -1 })])).toBe('preferred');
    expect(choose([thing('near', 0, 1.5), thing('slightly', 0, 2.5, { priority: -0.4 })])).toBe('near');
  });

  it('is blocked by scenery between the eye and the target, but not by the thing itself or what it names', () => {
    const wall = new Colliders();
    wall.circle('pillar', 0, 1.2, 0.3);
    expect(choose([thing('lever', 0, 2.4)], wall)).toBeNull();
    expect(choose([thing('pillar', 0, 2.4)], wall)).toBe('pillar');
    expect(choose([thing('lever', 0, 2.4, { ignoreColliders: ['pillar'] })], wall)).toBe('lever');
    const aside = new Colliders();
    aside.circle('pillar', 1.5, 1.2, 0.3);
    expect(choose([thing('lever', 0, 2.4)], aside)).toBe('lever');
  });

  it('is blocked by a moving body the caller reports in the way', () => {
    expect(choose([thing('lever', 0, 2.4)], new Colliders(), 0, () => true)).toBeNull();
    expect(choose([thing('lever', 0, 2.4)], new Colliders(), 0, () => false)).toBe('lever');
  });
});
