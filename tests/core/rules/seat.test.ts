import { describe, expect, it } from 'vitest';
import { seatLegs, type SeatMeasure } from '../../../src/core/rules/seat';

const seat: SeatMeasure = { drop: 0.08, thigh: 0.42, shin: 0.48 };
const hipY = 0.95;

describe('sitting on a real seat', () => {
  it('keeps the thighs level and the knees square on a seat at the shins’ height, with the seat contact on it', () => {
    const height = seat.shin - seat.drop;
    const legs = seatLegs(seat, height, 1, hipY);
    expect(legs.thigh).toBeCloseTo(-1.55, 9);
    expect(legs.knee).toBeCloseTo(1.55, 9);
    expect(legs.lower).toBeCloseTo((height + seat.drop - hipY) / (hipY / 0.95), 9);
  });

  it('slopes the thighs on a higher seat so the soles still reach the ground, never flatter than 0.9 rad', () => {
    const legs = seatLegs(seat, 0.5, 1, hipY);
    const room = 0.5 + seat.drop - seat.shin;
    expect(legs.thigh).toBeCloseTo(-Math.acos(room / seat.thigh), 9);
    expect(legs.thigh).toBeGreaterThan(-1.55);
    expect(legs.knee).toBeCloseTo(-legs.thigh, 9);
    const high = seatLegs(seat, 0.7, 1, hipY);
    expect(high.thigh).toBe(-0.9);
    expect(high.knee).toBe(0.9);
  });

  it('reaches the shins forward on a low seat', () => {
    const low = seatLegs(seat, 0.2, 1, hipY), normal = seatLegs(seat, seat.shin - seat.drop, 1, hipY);
    expect(low.thigh).toBeCloseTo(-1.55, 9);
    expect(low.knee).toBeCloseTo(1.55 - Math.acos((0.2 + seat.drop) / seat.shin), 9);
    expect(low.knee).toBeLessThan(normal.knee);
    expect(low.lower).toBeLessThan(normal.lower);
  });

  it('measures the seat in the figure’s own scale', () => {
    expect(seatLegs(seat, 0.8, 2, hipY)).toEqual(seatLegs(seat, 0.4, 1, hipY));
  });
});
