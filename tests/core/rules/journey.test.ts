import { describe, expect, it } from 'vitest';
import { NPC_IDS } from '../../../src/core/game/types';
import {
  AUTOSAVE_SECONDS, bellGain, CHECKPOINT_CLEARANCE, checkpointAllowed, couldWitness, DEATH, DROUGHT_BELL, HIT_STOP, noThreatNear, THREAT_REACH,
  OVERHEAR_REACH, SPEECH_SOON_REACH, UNDER_WORLD, WITNESS_REACH, WITNESSES, WOUNDED_BELOW,
} from '../../../src/core/rules/journey';

const foe = (x: number, z: number, more: Partial<{ alive: boolean; engaged: boolean }> = {}) => ({ x, z, alive: true, engaged: true, ...more });

describe('danger nearby', () => {
  it('is a living foe that has noticed him within 14 m', () => {
    expect(noThreatNear(0, 0, [])).toBe(true);
    expect(noThreatNear(0, 0, [foe(THREAT_REACH - 0.1, 0)])).toBe(false);
    expect(noThreatNear(0, 0, [foe(THREAT_REACH, 0)])).toBe(true);
    expect(noThreatNear(0, 0, [foe(3, 0, { alive: false })])).toBe(true);
    expect(noThreatNear(0, 0, [foe(3, 0, { engaged: false })])).toBe(true);
    expect(noThreatNear(0, 0, [foe(40, 0), foe(0, -5)])).toBe(false);
  });
});

describe('where he comes back', () => {
  it('never moves to within 18 m of a living foe or an undefeated post', () => {
    expect(checkpointAllowed(0, 0, [], [])).toBe(true);
    expect(checkpointAllowed(0, 0, [{ x: CHECKPOINT_CLEARANCE - 0.1, z: 0 }], [])).toBe(false);
    expect(checkpointAllowed(0, 0, [{ x: CHECKPOINT_CLEARANCE, z: 0 }], [])).toBe(true);
    expect(checkpointAllowed(0, 0, [], [{ x: 0, z: 10 }])).toBe(false);
    expect(checkpointAllowed(0, 0, [{ x: 60, z: 0 }], [{ x: 0, z: 40 }])).toBe(true);
  });

  it('holds the fallen view 3.6 s, slows his foes to a quarter, and restores him in full', () => {
    expect(DEATH).toEqual({ fadeSeconds: 3.6, foePace: 0.25, heal: 100 });
  });

  it('sets him back on safe ground after 0.35 s more than 1.2 m under it', () => {
    expect(UNDER_WORLD).toEqual({ depth: 1.2, seconds: 0.35 });
  });
});

describe('witnesses of a trespass', () => {
  it('are only the shrine’s keepers, awake, present, available and within 15 m', () => {
    expect(WITNESSES).toEqual(['shrine_warden', 'spring_steward']);
    for (const id of NPC_IDS) expect(couldWitness(id, 5, true, false, true)).toBe(WITNESSES.includes(id));
    expect(couldWitness('shrine_warden', WITNESS_REACH, true, false, true)).toBe(true);
    expect(couldWitness('shrine_warden', WITNESS_REACH + 0.01, true, false, true)).toBe(false);
    expect(couldWitness('shrine_warden', 5, false, false, true)).toBe(false);
    expect(couldWitness('shrine_warden', 5, true, true, true)).toBe(false);
    expect(couldWitness('shrine_warden', 5, true, false, false)).toBe(false);
  });
});

describe('the drought bell', () => {
  it('fades with distance to nothing at 220 m', () => {
    expect(bellGain(0)).toBe(1);
    expect(bellGain(110)).toBeCloseTo(0.5, 12);
    expect(bellGain(220)).toBe(0);
    expect(bellGain(500)).toBe(0);
  });

  it('tolls twice every 42 s in the drought, and three quicker strokes for the all-clear', () => {
    expect(DROUGHT_BELL).toMatchObject({ every: 42, strikes: 2, allClearStrikes: 3 });
    expect(DROUGHT_BELL.allClearGapMs).toBeLessThan(DROUGHT_BELL.strikeGapMs);
  });
});

describe('pacing', () => {
  it('saves every 90 s and stops the world longer for a heavy blow than a light one', () => {
    expect(AUTOSAVE_SECONDS).toBe(90);
    expect(HIT_STOP.heavy).toBeGreaterThan(HIT_STOP.light);
    expect(HIT_STOP.heavy).toBeLessThan(0.1);
    expect(WOUNDED_BELOW).toBe(0.3);
  });
});

describe('talk in earshot', () => {
  it('is overheard from 16 m of the two speakers, and their lines are asked for from further off', () => {
    expect(OVERHEAR_REACH).toBe(16);
    expect(SPEECH_SOON_REACH).toBe(30);
    // Lines are made ready before the wanderer is close enough to hear them.
    expect(SPEECH_SOON_REACH).toBeGreaterThan(OVERHEAR_REACH);
    // Whoever can witness a deed stands within earshot of talk at the same spot.
    expect(OVERHEAR_REACH).toBeGreaterThanOrEqual(WITNESS_REACH);
  });
});
