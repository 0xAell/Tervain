import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game/game';
import { reviveState } from '../../src/core/game/revive';
import { APPLY_DELAY_MIN } from '../../src/core/game/constants';
import { observedWater, waterTravelMinutes, worldView } from '../../src/core/game/worldView';
import { DIALOGUE_NODES } from '../../src/core/content/dialogue';
import { SLUICE, RESULT_CHECKS } from '../../src/core/world/layout';
import { Valley } from '../../src/isometric/simulation';
import { wetPoint } from '../../src/isometric/channels';
import { speakerReadings } from '../../src/isometric/portraits';
import { sluiceSetting } from '../../src/isometric/sluice';

describe('the sluice and its witnesses', () => {
  it.each(['rillford', 'quarry', 'rotation'] as const)('moves the headgate first and delivers %s water downstream over four minutes', allocation => {
    const game = new Game(), s = game.state;
    s.clock = 720;
    s.quest.gate = 'stabilized';
    const before = observedWater(game.state);
    Object.assign(s.quest, { phase: 'committed', allocation, committedAtClock: s.clock });
    const order = worldView(s);
    const setting = sluiceSetting(order);
    expect(setting.notch).toBe(allocation === 'quarry' ? 12 : 0);
    expect(setting.suffix).toBe(allocation === 'rotation' ? '--rota' : '--set');
    expect(observedWater(game.state).flow.village).toBe(before.flow.village);
    expect(observedWater(game.state).millTurning).toBe(false);
    game.tickClock(APPLY_DELAY_MIN / 2);
    expect(observedWater(game.state).flow.village).toBeCloseTo((before.flow.village + order.flow.village) / 2);
    expect(observedWater(game.state).flow.quarry).toBeCloseTo((before.flow.quarry + order.flow.quarry) / 2);
    expect(game.dispatch({ t:'settle', via:'check_channel' })).toMatchObject({ ok:false, reason:'still_applying' });
    game.tickClock(APPLY_DELAY_MIN / 2);
    expect(observedWater(game.state)).toEqual(order);
    expect(game.dispatch({ t:'settle', via:'check_mill' })).toMatchObject({ ok:true });
    expect(game.state.facts.settled_via).toBe('check_mill');
    if (allocation === 'rotation') {
      game.tickClock(10 * 60);
      expect(sluiceSetting(worldView(game.state))).toMatchObject({ notch:12, suffix:'--rota' });
    }
  });

  it('recovers the water travel clock once when reading an older committed save', () => {
    const game = new Game();
    Object.assign(game.state.quest, { phase:'committed', gate:'stabilized', allocation:'quarry', committedAtClock:null });
    const recovered = new Game(reviveState(game.state)!);
    expect(waterTravelMinutes(recovered.state)).toBe(APPLY_DELAY_MIN);
    recovered.tickClock(APPLY_DELAY_MIN);
    const reloaded = new Game(reviveState(recovered.state)!);
    expect(waterTravelMinutes(reloaded.state)).toBe(0);
    expect(reloaded.dispatch({ t:'settle', via:'check_channel' })).toMatchObject({ ok:true });
  });

  it('gives the keeper and the mill hand dry working positions within reach of their instruments', () => {
    const v = new Valley(new Game());
    const wheel = v.targets().find(t => t.field === 'sluice')!;
    const staff = v.targets().find(t => t.field === 'gauge')!;
    expect(wheel.at).toMatchObject(SLUICE.control);
    expect(wetPoint(wheel.at.x, wheel.at.z)).toBeFalsy();
    expect(staff.at).toMatchObject(RESULT_CHECKS[0]!);
    for (const t of [wheel, staff]) {
      expect(wetPoint(t.approach.x, t.approach.z)).toBeFalsy();
      expect(Math.hypot(t.at.x-t.approach.x, t.at.z-t.approach.z)).toBeLessThan(t.reach);
      v.game.setPlayerTransform(t.approach.x, 0, t.approach.z, 0);
      expect(v.offers().filter(o => o.label === t.label)).toHaveLength(1);
    }
  });

  it('gives each principal line a reading appropriate to the speaker, including opposing verdicts', () => {
    const principals = new Set(['rillford_reeve','quarry_foreman','spring_steward','shrine_warden','caravan_master']);
    const nodes = Object.values(DIALOGUE_NODES).filter(n => principals.has(n.speaker));
    expect([...speakerReadings.keys()].sort()).toEqual(nodes.map(n => n.id).sort());
    expect(speakerReadings.get('mara_after_quarry')).toBe('stern');
    expect(speakerReadings.get('mara_after_rillford')).toBe('warm');
    expect(speakerReadings.get('darin_after_rillford')).toBe('worried');
    expect(speakerReadings.get('edda_after_rotation')).toBe('warm');
  });
});
