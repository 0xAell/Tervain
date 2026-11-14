import { describe, expect, it } from 'vitest';
import { BARKS, NPCS, type NpcDef } from '../../../src/core/content/npcs';
import { createInitialState } from '../../../src/core/game/state';
import { eligibleBarks, hourIn, resolveGoal } from '../../../src/core/rules/schedule';

const resident = (overrides: Partial<NpcDef>): NpcDef => ({ ...NPCS.rillford_reeve, ...overrides });

describe('hours of the day', () => {
  it('includes the first hour of a span and excludes its last', () => {
    expect(hourIn(8, 8, 12)).toBe(true);
    expect(hourIn(11.99, 8, 12)).toBe(true);
    expect(hourIn(12, 8, 12)).toBe(false);
    expect(hourIn(7.99, 8, 12)).toBe(false);
  });

  it('carries a span past midnight', () => {
    expect(hourIn(23, 20, 6)).toBe(true);
    expect(hourIn(0, 20, 6)).toBe(true);
    expect(hourIn(5.99, 20, 6)).toBe(true);
    expect(hourIn(6, 20, 6)).toBe(false);
    expect(hourIn(12, 20, 6)).toBe(false);
  });
});

describe('where a resident should be', () => {
  it('follows the schedule hour by hour, with the indoor post where one is named', () => {
    const state = createInitialState();
    expect(resolveGoal(NPCS.rillford_reeve, state, 7)).toEqual({ anchor: 'reeve_door', activity: 'work', inside: 'reeve_table' });
    expect(resolveGoal(NPCS.rillford_reeve, state, 9)).toEqual({ anchor: 'noticeboard', activity: 'talk' });
    expect(resolveGoal(NPCS.rillford_reeve, state, 13)).toEqual({ anchor: 'dry_channel', activity: 'stand' });
  });

  it('lets an override replace the schedule only while its conditions and hours hold', () => {
    const def = resident({
      schedule: [{ from: 0, to: 24, anchor: 'noticeboard', activity: 'talk' }],
      overrides: [{ when: [{ t: 'phase', atLeast: 'committed' }], from: 6, to: 20, anchor: 'village_square', activity: 'talk' }],
    });
    const before = createInitialState();
    expect(resolveGoal(def, before, 10).anchor).toBe('noticeboard');
    const after = createInitialState();
    after.quest.phase = 'committed';
    expect(resolveGoal(def, after, 10)).toEqual({ anchor: 'village_square', activity: 'talk' });
    expect(resolveGoal(def, after, 22).anchor).toBe('noticeboard');
  });

  it('applies an override without hours at any hour, and the first matching override wins', () => {
    const def = resident({
      schedule: [{ from: 0, to: 24, anchor: 'noticeboard', activity: 'talk' }],
      overrides: [
        { when: [], anchor: 'dry_channel', activity: 'stand' },
        { when: [], anchor: 'village_square', activity: 'talk' },
      ],
    });
    for (const hour of [0, 6, 12, 23.5]) expect(resolveGoal(def, createInitialState(), hour)).toEqual({ anchor: 'dry_channel', activity: 'stand' });
  });

  it('sends a resident home to rest when no span covers the hour', () => {
    const def = resident({ schedule: [{ from: 8, to: 12, anchor: 'noticeboard', activity: 'talk' }], overrides: [] });
    expect(resolveGoal(def, createInitialState(), 3)).toEqual({ anchor: def.home, activity: 'rest' });
  });

  it('gives every authored resident a goal at every quarter hour', () => {
    const state = createInitialState();
    for (const def of Object.values(NPCS)) {
      for (let hour = 0; hour < 24; hour += 0.25) {
        const goal = resolveGoal(def, state, hour);
        expect(goal.anchor, `${def.id} at ${hour}`).toBeTruthy();
        expect(['work', 'stand', 'sit', 'talk', 'rest']).toContain(goal.activity);
      }
    }
  });
});

describe('passing remarks', () => {
  it('offers only the speaker’s own remarks whose conditions and hours hold', () => {
    const state = createInitialState();
    for (const def of Object.values(NPCS)) {
      for (const hour of [3, 9, 15, 21]) {
        const pool = eligibleBarks(def.id, state, hour);
        for (const bark of pool) {
          expect(bark.npc).toBe(def.id);
          if (bark.hours) expect(hourIn(hour, bark.hours[0], bark.hours[1])).toBe(true);
        }
        const unconditional = BARKS.filter((b) => b.npc === def.id && !b.when && !b.hours);
        for (const bark of unconditional) expect(pool).toContain(bark);
      }
    }
  });

  it('drops a remark tied to the unsettled quarrel once the matter is settled', () => {
    const before = createInitialState();
    const early = eligibleBarks('mill_hand', before, 10).map((b) => b.line);
    expect(early).toContain('bess.bark.wheel');
    const settled = createInitialState();
    settled.quest.phase = 'settled';
    settled.quest.allocation = 'rillford';
    const late = eligibleBarks('mill_hand', settled, 10).map((b) => b.line);
    expect(late).not.toContain('bess.bark.wheel');
    expect(late).toContain('bess.bark.evening');
  });
});
