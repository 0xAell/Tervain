import { beforeAll, describe, expect, it } from 'vitest';
import { NPC_LIST } from '../../../src/core/content/npcs';
import { buildStaticColliders, type Colliders } from '../../../src/core/world/colliders';
import { berthFor, roomDoorstep, roomGrid, roomGridOrigin, roomRoute } from '../../../src/core/world/homes';
import { INTERIORS, roomHalfSize } from '../../../src/core/world/interiors';
import { Terrain } from '../../../src/core/world/terrain';

// A room's grid once read back another room's origin: fractional numbers kept in an object's own fields can come to
// be shared between two objects made by one literal. The grid therefore keeps whole numbers only, and its origin is
// worked out from the room. These hold that shape, and that nothing a resident does changed with it.

let terrain: Terrain, colliders: Colliders;
beforeAll(() => { terrain = new Terrain(); colliders = buildStaticColliders(terrain); }, 120_000);

const room = (id: string) => INTERIORS.find((spec) => spec.building.id === id)!;
const heights = [...new Set(NPC_LIST.map((def) => def.look.height * 1.8))];

describe('a room’s grid', () => {
  it('keeps whole numbers and its cells, and nothing else', () => {
    for (const spec of INTERIORS) {
      const grid = roomGrid(spec, terrain, colliders, 1.728);
      expect(Object.keys(grid).sort(), spec.building.id).toEqual(['free', 'heightMm', 'nx', 'nz', 'version']);
      for (const [key, value] of Object.entries(grid)) {
        if (key === 'free') expect(value).toBeInstanceOf(Uint8Array);
        else expect(Number.isInteger(value), `${spec.building.id}.${key} = ${value}`).toBe(true);
      }
      expect(grid.free.length).toBe(grid.nx * grid.nz);
      expect(grid.heightMm).toBe(1728);
      expect(grid.free.some((cell) => cell === 1), spec.building.id).toBe(true);
    }
  });

  it('begins where the room says: on the back wall, with a row of cells down the doorway’s middle', () => {
    for (const spec of INTERIORS) {
      const { x0, z0 } = roomGridOrigin(spec), { hw, hd } = roomHalfSize(spec);
      expect(z0).toBe(-hd);
      const cellsToDoor = (spec.door.x - x0) / 0.15;
      expect(Math.abs(cellsToDoor - Math.round(cellsToDoor))).toBeLessThan(1e-9);
      expect(x0).toBeLessThanOrEqual(-hw + 1e-9);
      expect(x0).toBeGreaterThan(-hw - 0.15);
      // Worked out afresh each time, from the room alone: asking about another room in between changes nothing.
      roomGridOrigin(room('mill'));
      expect(roomGridOrigin(spec)).toEqual({ x0, z0 });
    }
    expect(roomGridOrigin(room('house_a')).z0).toBe(-2.76);
    expect(roomGridOrigin(room('mill')).z0).toBe(-3.66);
  });

  it('serves bodies within 0.2 m of the height it was built for, as it did when the height was kept in metres', () => {
    for (const a of heights) for (const b of heights) {
      expect(Math.abs(Math.round(a * 1000) - Math.round(b * 1000)) < 200, `${a} and ${b}`).toBe(Math.abs(a - b) < 0.2);
    }
    const house = room('house_b');
    const built = roomGrid(house, terrain, colliders, 1.728);
    expect(roomGrid(house, terrain, colliders, 1.8)).toBe(built); // 7 cm taller: the same grid serves
    const taller = roomGrid(house, terrain, colliders, 1.944); // 21.6 cm taller: built again
    expect(taller).not.toBe(built);
    expect(taller.heightMm).toBe(1944);
    expect(roomGrid(house, terrain, colliders, 1.944)).toBe(taller);
  });

  it('finds the mill hand’s way out of his house whichever grid was built last', () => {
    const house = room('house_a'), mill = room('mill'), height = 1.728;
    const stand = berthFor('mill_hand', terrain, colliders, height)!.stand;
    const way = () => roomRoute(house, stand, roomDoorstep(house), terrain, colliders, height);
    const first = way();
    expect(first).not.toBeNull();
    // The morning of the fault: the house's grid, then the mill's, then the way out of the house.
    roomGrid(mill, terrain, colliders, height);
    expect(roomRoute(mill, roomDoorstep(mill), roomDoorstep(mill), terrain, colliders, height)).not.toBeNull();
    expect(way()).toEqual(first);
    expect(first!.length).toBeGreaterThanOrEqual(2);
    const last = first![first!.length - 1]!, step = roomDoorstep(house);
    expect([last.x, last.z]).toEqual([step.x, step.z]);
  });
});
