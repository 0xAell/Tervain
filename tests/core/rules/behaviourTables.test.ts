import { describe, expect, it } from 'vitest';
import { ANIMALS, ANIMAL_SPEEDS } from '../../../src/core/content/animals';
import { NPCS } from '../../../src/core/content/npcs';
import { ANIMAL_BEHAVIOUR } from '../../../src/core/rules/animalBehaviour';
import { arrivalRadius, RESIDENT } from '../../../src/core/rules/resident';

describe('how the animals behave', () => {
  it('rests for a few seconds between moves and calls well under twice a minute', () => {
    for (const span of [ANIMAL_BEHAVIOUR.firstRest, ANIMAL_BEHAVIOUR.rest, ANIMAL_BEHAVIOUR.restNoPath, ANIMAL_BEHAVIOUR.seatedRest, ANIMAL_BEHAVIOUR.call, ANIMAL_BEHAVIOUR.alert, ANIMAL_BEHAVIOUR.plan]) {
      expect(span).toHaveLength(2);
      expect(span[0]).toBeGreaterThan(0); expect(span[1]).toBeGreaterThan(0);
    }
    expect(ANIMAL_BEHAVIOUR.call[0]).toBeGreaterThanOrEqual(30);
    expect(ANIMAL_BEHAVIOUR.rest[0] + ANIMAL_BEHAVIOUR.rest[1]).toBeLessThan(ANIMAL_BEHAVIOUR.call[0]);
  });

  it('staggers the first calls so the nineteen do not call together', () => {
    const { base, stagger } = ANIMAL_BEHAVIOUR.firstCall;
    const firsts = ANIMALS.map((_, index) => base + index * stagger);
    expect(new Set(firsts).size).toBe(ANIMALS.length);
    expect(firsts.at(-1)! - firsts[0]!).toBeGreaterThan(30);
  });

  it('keeps every share between nothing and always', () => {
    for (const share of [ANIMAL_BEHAVIOUR.grazeShare, ANIMAL_BEHAVIOUR.seatedGroomShare, ANIMAL_BEHAVIOUR.catSleepShare, ANIMAL_BEHAVIOUR.warnShare, ANIMAL_BEHAVIOUR.wander.roamShare, ANIMAL_BEHAVIOUR.cornered.roamShare]) {
      expect(share).toBeGreaterThan(0); expect(share).toBeLessThan(1);
    }
  });

  it('flees farther than it wanders at first, fanning out on each retry', () => {
    expect(ANIMAL_BEHAVIOUR.flee.base).toBeGreaterThan(ANIMAL_BEHAVIOUR.wander.base);
    expect(ANIMAL_BEHAVIOUR.flee.fan * Math.ceil((ANIMAL_BEHAVIOUR.wander.attempts - 1) / 2)).toBeLessThan(Math.PI);
    expect(ANIMAL_BEHAVIOUR.cornered.keep).toBeLessThan(ANIMAL_BEHAVIOUR.cornered.directions);
  });

  it('turns to its path faster than it turns to watch, and walks under a rider below a gallop', () => {
    expect(ANIMAL_BEHAVIOUR.turn).toBeGreaterThan(ANIMAL_BEHAVIOUR.watchTurn);
    expect(ANIMAL_BEHAVIOUR.rideWalk).toBeLessThan(ANIMAL_BEHAVIOUR.rideRun);
    const deer = ANIMAL_SPEEDS.deer;
    expect(ANIMAL_BEHAVIOUR.rideRun).toBeGreaterThan(deer.walk);
    expect(ANIMAL_BEHAVIOUR.rideRun).toBeLessThan(deer.run);
  });

  it('leads the mount home only from beyond the farthest notice distance', () => {
    const farthest = Math.max(...Object.values(ANIMAL_SPEEDS).map((pace) => pace.notice));
    expect(ANIMAL_BEHAVIOUR.ledHomeBeyond).toBeGreaterThan(farthest * 3);
  });
});

describe('how a resident moves', () => {
  it('walks at 1.55 m/s, slower than the wanderer, and brakes harder than it gathers pace', () => {
    expect(RESIDENT.walkSpeed).toBe(1.55);
    expect(RESIDENT.braking).toBeGreaterThan(RESIDENT.acceleration);
    // From a walk they stop within a third of a metre.
    expect(RESIDENT.walkSpeed * RESIDENT.walkSpeed / (2 * RESIDENT.braking)).toBeLessThan(0.33);
  });

  it('turns quicker on the move than standing', () => {
    expect(RESIDENT.turnWalking).toBeGreaterThan(RESIDENT.turnStanding);
    expect(RESIDENT.turnStepped).toBeLessThan(RESIDENT.turnStanding);
  });

  it('must stand exactly at a work place or seat, and only near any other place', () => {
    expect(arrivalRadius('work')).toBe(RESIDENT.arriveExact);
    expect(arrivalRadius('sit')).toBe(RESIDENT.arriveExact);
    for (const activity of ['stand', 'talk', 'rest'] as const) expect(arrivalRadius(activity)).toBe(RESIDENT.arriveNear);
    expect(RESIDENT.arriveExact).toBeLessThan(RESIDENT.arriveNear);
  });

  it('sits a moment on the bed’s edge before lying down, and is woken by a fight within 40 m', () => {
    expect(RESIDENT.sitBeforeLying).toBeLessThan(RESIDENT.lieSeconds);
    expect(RESIDENT.alarmReach).toBe(40);
  });

  it('passes a remark only to a wanderer nearer than any resident’s speaking distance, no more than twice a minute', () => {
    for (const def of Object.values(NPCS)) expect(def.interactRadius ?? 2.7).toBeLessThan(RESIDENT.barkReach);
    expect(RESIDENT.bark[0]).toBeGreaterThanOrEqual(28);
    expect(RESIDENT.firstBark[0]).toBeLessThan(RESIDENT.bark[0]);
  });
});
