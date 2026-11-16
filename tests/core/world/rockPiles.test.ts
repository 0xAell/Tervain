import { beforeAll, describe, expect, it } from 'vitest';
import { coastX } from '../../../src/core/world/coast';
import { buildStaticColliders, type Colliders } from '../../../src/core/world/colliders';
import { Exclusions } from '../../../src/core/world/exclusions';
import { PLANTED_TRUNKS } from '../../../src/core/world/plantedForest';
import { coastalRockPiles, ROCK_PILE_CANDIDATES, ROCK_PILE_CLEARANCE, ROCK_PILE_REACH, type RockPile } from '../../../src/core/world/rockPiles';
import { Terrain } from '../../../src/core/world/terrain';

// Which weathered rock piles the shore keeps is a rule of the world: it runs here on the core alone, on the valley
// and on made-up ground. The scene seats each kept pile on the ground by its own base (presentation/sourceRockPile.ts).

const open = { blocked: () => false };
const flat = (height = 2, slope = 0) => ({ heightAt: () => height, slopeAt: () => slope });
const ids = (piles: readonly RockPile[]) => piles.map((pile) => pile.id);

let terrain: Terrain, exclusions: Exclusions, standing: Colliders;
beforeAll(() => {
  terrain = new Terrain(); exclusions = new Exclusions(terrain); standing = buildStaticColliders(terrain);
  for (const trunk of PLANTED_TRUNKS) standing.circle('trunk', trunk.x, trunk.z, trunk.radius);
}, 60000);

describe('the shore’s rock piles', () => {
  it('keeps two of the six on the valley: the others lean too far or lie on ground already claimed', () => {
    const kept = coastalRockPiles(terrain, exclusions, standing);
    expect(ids(kept)).toEqual(['source-rock-pile:1', 'source-rock-pile:2']);
    const at = (index: number) => {
      const candidate = ROCK_PILE_CANDIDATES[index]!;
      return { x: coastX(candidate.z) + candidate.inland, z: candidate.z, radius: ROCK_PILE_REACH * candidate.s };
    };
    for (const index of [0, 5]) expect(terrain.slopeAt(at(index).x, at(index).z)).toBeGreaterThan(ROCK_PILE_CLEARANCE.slope);
    for (const index of [3, 4]) {
      const { x, z, radius } = at(index);
      expect(exclusions.blocked(x, z, radius + ROCK_PILE_CLEARANCE.exclusions)).toBe(true);
    }
    for (const pile of kept) {
      expect(pile.radius).toBeCloseTo(ROCK_PILE_REACH * pile.s, 12);
      expect(terrain.heightAt(pile.x, pile.z)).toBeGreaterThan(ROCK_PILE_CLEARANCE.aboveSea);
    }
  });

  it('keeps every candidate on open, level ground above the tide, at its own scale and facing', () => {
    const kept = coastalRockPiles(flat(), open, open);
    expect(kept).toHaveLength(ROCK_PILE_CANDIDATES.length);
    kept.forEach((pile, index) => {
      const candidate = ROCK_PILE_CANDIDATES[index]!;
      expect(pile).toEqual({ id: `source-rock-pile:${index}`, x: coastX(candidate.z) + candidate.inland, z: candidate.z, s: candidate.s, yaw: candidate.yaw,
        radius: ROCK_PILE_REACH * candidate.s });
    });
  });

  it('never moves anything to fit one in: a claimed place, a standing obstacle, the water or a steep bank each leave it out', () => {
    const asked: number[] = [];
    const claims = { blocked: (_x: number, _z: number, pad: number) => { asked.push(pad); return true; } };
    expect(coastalRockPiles(flat(), claims, open)).toEqual([]);
    expect(asked[0]).toBeCloseTo(ROCK_PILE_REACH * ROCK_PILE_CANDIDATES[0]!.s + ROCK_PILE_CLEARANCE.exclusions, 12);
    asked.length = 0;
    expect(coastalRockPiles(flat(), open, claims)).toEqual([]);
    expect(asked[0]).toBeCloseTo(ROCK_PILE_REACH * ROCK_PILE_CANDIDATES[0]!.s + ROCK_PILE_CLEARANCE.colliders, 12);
    expect(coastalRockPiles(flat(ROCK_PILE_CLEARANCE.aboveSea - 0.01), open, open)).toEqual([]);
    expect(coastalRockPiles(flat(2, ROCK_PILE_CLEARANCE.slope + 0.01), open, open)).toEqual([]);
  });

  it('keeps piles apart: one too wide to leave room beside a neighbour is left out', () => {
    // At a reach of 30 m each kept pile claims the shore its next neighbour would take, 40 to 70 m away.
    expect(ids(coastalRockPiles(flat(), open, open, 30))).toEqual(['source-rock-pile:0', 'source-rock-pile:2', 'source-rock-pile:4']);
  });
});
