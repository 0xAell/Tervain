import { describe, expect, it } from 'vitest';
import { TRUST_LIMIT } from '../../../src/core/game/constants';
import { ARROW_QUIVER_CAPACITY } from '../../../src/core/game/hunting';
import { reviveState, SAVED_PROP_BOUNDS } from '../../../src/core/game/revive';
import { createInitialState } from '../../../src/core/game/state';
import { ARMED_START_REVISIONS, CONTENT_REVISION, NPC_IDS, SAVE_FORMAT_VERSION, WRECK_BLADE_PICKUP } from '../../../src/core/game/types';

// What a save is revived as is the core's: these revive plain objects, with no storage behind them.

const saved = () => JSON.parse(JSON.stringify(createInitialState())) as Record<string, any>;

describe('reviving a saved journey', () => {
  it('gives back what the game saved, stamped with the present format and content', () => {
    const state = createInitialState();
    state.clock = 321; state.inventory.arrow = 7; state.npcs[NPC_IDS[0]!].trust = 2;
    const revived = reviveState(JSON.parse(JSON.stringify(state)))!;
    expect(revived.clock).toBe(321);
    expect(revived.inventory.arrow).toBe(7);
    expect(revived.npcs[NPC_IDS[0]!].trust).toBe(2);
    expect([revived.saveFormatVersion, revived.contentRevision]).toEqual([SAVE_FORMAT_VERSION, CONTENT_REVISION]);
  });

  it('refuses what is not a journey at all, and a phase or a gate the game never writes', () => {
    expect(reviveState(null)).toBeNull();
    expect(reviveState('journey')).toBeNull();
    expect(reviveState({})).toBeNull();
    const noClock = saved(); delete noClock.clock;
    expect(reviveState(noClock)).toBeNull();
    const phase = saved(); phase.quest.phase = 'triumphant';
    expect(reviveState(phase)).toBeNull();
    const gate = saved(); gate.quest.gate = 'vanished';
    expect(reviveState(gate)).toBeNull();
  });

  it('brings a value outside what the game allows back inside it', () => {
    const raw = saved();
    raw.npcs[NPC_IDS[0]!].trust = 99; raw.npcs[NPC_IDS[1]!].trust = -99;
    raw.inventory.arrow = ARROW_QUIVER_CAPACITY + 50;
    raw.player.health = 1e6; raw.clock = -40; raw.playSeconds = -1;
    raw.quest.allocation = 'everyone'; raw.skills = ['steady_guard', 'flight'];
    const revived = reviveState(raw)!;
    expect([revived.npcs[NPC_IDS[0]!].trust, revived.npcs[NPC_IDS[1]!].trust]).toEqual([TRUST_LIMIT, -TRUST_LIMIT]);
    expect(revived.inventory.arrow).toBe(ARROW_QUIVER_CAPACITY);
    expect(revived.player.health).toBe(revived.player.maxHealth);
    expect([revived.clock, revived.playSeconds, revived.quest.allocation]).toEqual([0, 0, null]);
    expect(revived.skills).toEqual(['steady_guard']);
  });

  it('keeps only whole records of evidence and only encounters that were won', () => {
    const raw = saved();
    raw.evidence = { worker_testimony: 5, dry_ditch: { via: 'observed', source: 'ditch', atClock: 10 } };
    raw.defeated = { bandit_road: true, cut_creature: false };
    const revived = reviveState(raw)!;
    expect(Object.keys(revived.evidence)).not.toContain('worker_testimony');
    expect(Object.values(revived.evidence).every((record) => typeof record!.source === 'string')).toBe(true);
    expect(revived.defeated).toEqual({ bandit_road: true });
  });

  it('keeps a save from before the unarmed start armed, and arms an older one that carried the sword', () => {
    const old = saved();
    old.contentRevision = ARMED_START_REVISIONS[0]; delete old.equippedWeapon;
    const revived = reviveState(old)!;
    expect(revived.inventory.rusted_sword).toBe(1);
    expect(revived.locationChanges[`pickup:${WRECK_BLADE_PICKUP}`]).toBe('taken');
    expect(revived.equippedWeapon).toBe('rusted_sword');
    // A present save that chose to go unarmed stays so, sword or no sword.
    const unarmed = saved(); unarmed.inventory.rusted_sword = 1; unarmed.equippedWeapon = null;
    expect(reviveState(unarmed)!.equippedWeapon).toBeNull();
  });

  it('leaves out a loose thing saved outside the realm, twice, or with no rotation to speak of', () => {
    const raw = saved(), turn = { x: 0, y: 0, z: 0, w: 1 };
    raw.physicalObjects = [
      { id: 'barrel', position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1.05 } },
      { id: 'barrel', position: { x: 4, y: 5, z: 6 }, rotation: turn },
      { id: 'crate', position: { x: SAVED_PROP_BOUNDS.maxX + 1, y: 0, z: 0 }, rotation: turn },
      { id: 'sack', position: { x: 0, y: SAVED_PROP_BOUNDS.minY - 1, z: 0 }, rotation: turn },
      { id: 'keg', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 0.2 } },
      { id: 'pot', position: { x: 0, y: 0, z: NaN }, rotation: turn },
    ];
    const revived = reviveState(raw)!.physicalObjects;
    expect(revived.map((prop) => prop.id)).toEqual(['barrel']);
    expect(revived[0]!.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(revived[0]!.rotation.w).toBeCloseTo(1, 9); // made a unit turn again
    raw.physicalObjects = Array.from({ length: SAVED_PROP_BOUNDS.most + 5 }, (_, i) => ({ id: `p${i}`, position: { x: 0, y: 0, z: 0 }, rotation: turn }));
    expect(reviveState(raw)!.physicalObjects).toHaveLength(SAVED_PROP_BOUNDS.most);
  });
});
