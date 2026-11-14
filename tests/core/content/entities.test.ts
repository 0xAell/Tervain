import { describe, expect, it } from 'vitest';
import { AMBIENT_RESIDENTS } from '../../../src/core/content/ambientPeople';
import { ANCHORS, bySpec, HAMLET_PROPS, INLAND_HAMLET, WORLD } from '../../../src/core/world/layout';
import { FLOAT_LINE, PHYSICAL_PROPS, PROP_WATER_DRAG } from '../../../src/core/world/physicalProps';

describe('loose cargo', () => {
  it('lists every barrel and crate once, inside the world, with a size and a mass', () => {
    expect(new Set(PHYSICAL_PROPS.map((prop) => prop.id)).size).toBe(PHYSICAL_PROPS.length);
    expect(PHYSICAL_PROPS).toHaveLength(HAMLET_PROPS.barrels.length + HAMLET_PROPS.crates.length + 5);
    for (const prop of PHYSICAL_PROPS) {
      expect(['barrel', 'crate']).toContain(prop.kind);
      expect(prop.x).toBeGreaterThan(WORLD.minX); expect(prop.x).toBeLessThan(WORLD.maxX);
      expect(prop.z).toBeGreaterThan(WORLD.minZ); expect(prop.z).toBeLessThan(WORLD.maxZ);
      for (const size of [prop.width, prop.height, prop.depth]) { expect(size).toBeGreaterThan(0.3); expect(size).toBeLessThan(1.2); }
      expect(prop.mass).toBeGreaterThan(0);
      expect(prop.name).toBeTruthy();
    }
  });

  it('makes a barrel heavier than a crate and both light enough to carry', () => {
    const barrel = PHYSICAL_PROPS.find((prop) => prop.kind === 'barrel')!, crate = PHYSICAL_PROPS.find((prop) => prop.kind === 'crate')!;
    expect(barrel.mass).toBeGreaterThan(crate.mass);
    expect(barrel.mass).toBeLessThanOrEqual(20);
  });

  it('floats a barrel higher than a crate, each partly under', () => {
    expect(FLOAT_LINE.barrel).toBeLessThan(FLOAT_LINE.crate);
    for (const line of Object.values(FLOAT_LINE)) { expect(line).toBeGreaterThan(0); expect(line).toBeLessThan(1); }
    expect(PROP_WATER_DRAG).toBeGreaterThan(0);
  });
});

describe('the hamlet’s silent residents', () => {
  it('are three, each on a mark in the inland hamlet with a routine', () => {
    expect(AMBIENT_RESIDENTS.map((resident) => resident.id)).toEqual(['fisher', 'fireside', 'keeper']);
    for (const resident of AMBIENT_RESIDENTS) {
      expect(Math.hypot(resident.x - INLAND_HAMLET.x, resident.z - INLAND_HAMLET.z)).toBeLessThan(INLAND_HAMLET.r + 10);
      expect(resident.cycle.length).toBeGreaterThan(1);
      for (const [mode, seconds] of resident.cycle) { expect(['work', 'idle', 'sit', 'talk']).toContain(mode); expect(seconds).toBeGreaterThan(0); }
      expect(resident.radius).toBeGreaterThan(0.3);
    }
  });

  it('puts the net mender before the net store, the fireside sitter at the fire and the keeper by his door', () => {
    const [fisher, fireside, keeper] = AMBIENT_RESIDENTS;
    const store = bySpec('net_store'), cottage = bySpec('keeper_cottage'), fire = ANCHORS.strand_fire!;
    expect(Math.hypot(fisher!.x - store.x, fisher!.z - store.z)).toBeLessThan(8);
    expect(fisher!.yaw).toBe(store.yaw);
    expect(Math.hypot(fireside!.x - fire.x, fireside!.z - fire.z)).toBeLessThan(2.5);
    expect(fireside!.seated).toBe(true);
    expect(Math.hypot(keeper!.x - cottage.x, keeper!.z - cottage.z)).toBeLessThan(9);
    expect(keeper!.yaw).toBe(cottage.yaw);
  });

  it('sends the mender and the sitter in to sleep after dark, and leaves the keeper at his door', () => {
    expect(AMBIENT_RESIDENTS.map((resident) => resident.sleeps)).toEqual([true, true, false]);
  });
});
