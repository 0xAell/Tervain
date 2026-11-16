import { describe, expect, it } from 'vitest';
import {
  ANCHORS, BENCH_SEAT_HEIGHT, BENCHES, FIELD_FENCE_MARGIN, FIELDS, fieldFenceRuns, INSPECT_LOCATIONS, KIT_TABLE, NOTICEBOARD, QUARRY_BOULDERS,
} from '../../../src/core/world/layout';

// The props the core's rules lean on stand where the core says, and the places tied to them follow from that: the
// scene draws each at the core's position (presentation/settlement.ts) instead of typing it again.

const inspect = (id: string) => INSPECT_LOCATIONS.find((point) => point.id === id)!;
/** A yaw of 0 faces +z. */
const facing = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

describe('the props residents and the wanderer use', () => {
  it('seats the inn and ford camp sitters on their benches, at the plank, a hand forward of its middle', () => {
    for (const [anchor, bench, along] of [['inn_bench', BENCHES.inn, -0.35], ['ford_camp', BENCHES.ford, 0.3]] as const) {
      const seat = ANCHORS[anchor]!;
      expect(seat.yaw).toBe(bench.yaw);
      expect(seat.seat).toBe(BENCH_SEAT_HEIGHT);
      expect(Math.hypot(seat.x - bench.x, seat.z - bench.z)).toBeCloseTo(Math.hypot(along, 0.04), 9);
    }
    expect(Object.keys(BENCHES)).toEqual(['inn', 'ford', 'square']);
  });

  it('reads the noticeboard from before its face, within reach, where its keeper stands too', () => {
    const point = inspect('noticeboard'), keeper = ANCHORS.noticeboard!;
    expect([point.x, point.z]).toEqual([NOTICEBOARD.x, 12.8]);
    expect(NOTICEBOARD.z - point.z).toBeCloseTo(NOTICEBOARD.readFrom, 9);
    expect(point.r).toBeGreaterThan(NOTICEBOARD.readFrom);
    // Its keeper stands before the face too, looking at the board.
    expect(keeper.x).toBe(NOTICEBOARD.x);
    expect(keeper.z).toBeLessThan(NOTICEBOARD.z);
    expect(Math.hypot(keeper.x - point.x, keeper.z - point.z)).toBeLessThan(point.r);
  });

  it('inspects the saltward kit at its table', () => {
    expect(inspect('saltward_kit')).toMatchObject({ x: KIT_TABLE.x, z: KIT_TABLE.z });
  });
});

describe('the field fences', () => {
  it('run along three sides of each field, each the margin outside it, and leave its +x side open', () => {
    for (const field of FIELDS) {
      const runs = fieldFenceRuns(field);
      expect(runs).toHaveLength(3);
      // In the field's own frame: x along its width, z along its depth.
      const c = Math.cos(field.yaw), s = Math.sin(field.yaw);
      const local = (p: { x: number; z: number }) => ({ x: (p.x - field.x) * c - (p.z - field.z) * s, z: (p.x - field.x) * s + (p.z - field.z) * c });
      const hw = field.w / 2 + FIELD_FENCE_MARGIN, hd = field.d / 2 + FIELD_FENCE_MARGIN;
      const ends = runs.map(([from, to]) => [local(from), local(to)]);
      for (const [from, to] of ends) for (const p of [from!, to!]) {
        expect(Math.abs(Math.abs(p.x) - hw) < 1e-9 || Math.abs(Math.abs(p.z) - hd) < 1e-9).toBe(true);
      }
      expect(ends[0]!.map((p) => p.z)).toEqual([expect.closeTo(-hd, 9), expect.closeTo(-hd, 9)]);
      expect(ends[1]!.map((p) => p.z)).toEqual([expect.closeTo(hd, 9), expect.closeTo(hd, 9)]);
      expect(ends[2]!.map((p) => p.x)).toEqual([expect.closeTo(-hw, 9), expect.closeTo(-hw, 9)]);
      // Nothing runs along the +x side.
      expect(ends.some(([from, to]) => Math.abs(from!.x - hw) < 1e-9 && Math.abs(to!.x - hw) < 1e-9)).toBe(false);
    }
  });
});

describe('the quarry', () => {
  it('has fourteen boulders inside the quarry, and the crew works before the fourth, a chisel from it, facing it', () => {
    expect(QUARRY_BOULDERS).toHaveLength(14);
    for (const boulder of QUARRY_BOULDERS) {
      expect(boulder.x).toBeGreaterThanOrEqual(100); expect(boulder.x).toBeLessThanOrEqual(112);
      expect(boulder.z).toBeGreaterThanOrEqual(-36); expect(boulder.z).toBeLessThanOrEqual(-14);
    }
    const post = ANCHORS.quarry_face!, boulder = QUARRY_BOULDERS[3]!;
    const nearest = [...QUARRY_BOULDERS].sort((a, b) => Math.hypot(a.x - post.x, a.z - post.z) - Math.hypot(b.x - post.x, b.z - post.z))[0];
    expect(nearest).toBe(boulder);
    // Outside the box it blocks (as wide as the boulder, 3 m deep), and within a stride of it.
    const outside = Math.max(Math.abs(post.x - boulder.x) - boulder.width / 2, Math.abs(post.z - boulder.z) - 1.5);
    expect(outside).toBeGreaterThan(0); expect(outside).toBeLessThan(1.5);
    const look = facing(post.yaw), toward = { x: boulder.x - post.x, z: boulder.z - post.z };
    const cos = (look.x * toward.x + look.z * toward.z) / Math.hypot(toward.x, toward.z);
    expect(Math.acos(cos)).toBeLessThan((20 * Math.PI) / 180);
  });
});
