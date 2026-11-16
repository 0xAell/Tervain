import { describe, expect, it } from 'vitest';
import { NPCS } from '../../../src/core/content/npcs';
import { ARROW_QUIVER_CAPACITY } from '../../../src/core/game/hunting';
import { createInitialState } from '../../../src/core/game/state';
import type { WorldState } from '../../../src/core/game/types';
import { chooseInteractable, type Interactable } from '../../../src/core/rules/interaction';
import { fixedPlace, interactableTable, MOUNT_ID, RESIDENT_REACH_HEIGHT, RIDER_REACH_HEIGHT, type InteractableEntry } from '../../../src/core/rules/interactables';
import { Colliders, FIELD_FENCE_HALF_THICKNESS, PROP_COLLIDER } from '../../../src/core/world/colliders';
import { ARCHIVE_SHUTTER, HUNTER_SUPPLY, HUNTER_TABLE, hunterTableSurfaceY, INSPECT_LOCATIONS, LEDGER, PICKUP_LOCATIONS, RESULT_CHECKS, RITE_ALTAR, SHORTCUT, SLUICE } from '../../../src/core/world/layout';

// What the wanderer can act on is a table in the core: reach, priority, prompt, when the state offers it, what it
// does. These tests hold the table's contents and its rules; the scene only places moving things and carries out
// the action (src/presentation/interactions.ts).

const table = interactableTable();
const entry = (id: string): InteractableEntry => { const found = table.find((candidate) => candidate.id === id); if (!found) throw new Error(`no interactable ${id}`); return found; };
const fresh = () => createInitialState();
const withState = (change: (state: WorldState) => void) => { const state = fresh(); change(state); return state; };

describe('the table of interactables', () => {
  it('lists the camp, the mount, every resident, observation and pickup, and the quest\'s fixtures, each once', () => {
    const ids = table.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 6)).toEqual(['hunter_notes', 'hunter_restock', 'hunter_sell_meat', 'mount_deer', 'dismount', 'dismount_door']);
    expect(ids.filter((id) => id.startsWith('npc:'))).toEqual(Object.keys(NPCS).map((id) => `npc:${id}`));
    expect(ids.filter((id) => id.startsWith('inspect:'))).toEqual(INSPECT_LOCATIONS.map((point) => `inspect:${point.id}`));
    expect(ids.filter((id) => id.startsWith('pickup:'))).toEqual(PICKUP_LOCATIONS.map((pickup) => `pickup:${pickup.id}`));
    expect(ids.slice(-(6 + RESULT_CHECKS.length))).toEqual(['lever', 'sluice', 'archive_door', 'archive_shutter', 'ledger', 'rite', ...RESULT_CHECKS.map((check) => check.id)]);
    expect(table).toHaveLength(6 + Object.keys(NPCS).length + INSPECT_LOCATIONS.length + PICKUP_LOCATIONS.length + 6 + RESULT_CHECKS.length);
  });

  it('gives each its reach and its place in the order of offers', () => {
    const facts = Object.fromEntries(table.map((item) => [item.id, [item.reach, item.priority]]));
    expect(facts.hunter_notes).toEqual([HUNTER_SUPPLY.r, 1]);
    expect(facts.hunter_restock).toEqual([HUNTER_SUPPLY.r, -0.6]);
    expect(facts.hunter_sell_meat).toEqual([2.2, -0.6]);
    expect(facts.mount_deer).toEqual([2.6, -0.4]);
    expect(facts.dismount).toEqual([3, -5]);
    expect(facts.dismount_door).toEqual([3, -6]);
    for (const def of Object.values(NPCS)) expect(facts[`npc:${def.id}`]).toEqual([def.interactRadius ?? 2.7, -1]);
    for (const point of INSPECT_LOCATIONS) expect(facts[`inspect:${point.id}`]).toEqual([point.r, 0]);
    for (const pickup of PICKUP_LOCATIONS) expect(facts[`pickup:${pickup.id}`]).toEqual([pickup.r, -0.5]);
    expect(facts.lever).toEqual([SHORTCUT.lever.r, 0]);
    expect(facts.sluice).toEqual([SLUICE.control.r, 0]);
    expect(facts.archive_door).toEqual([2.4, 0]);
    expect(facts.archive_shutter).toEqual([ARCHIVE_SHUTTER.r, 0]);
    expect(facts.ledger).toEqual([LEDGER.r, 0]);
    expect(facts.rite).toEqual([RITE_ALTAR.r, 0]);
    for (const check of RESULT_CHECKS) expect(facts[check.id]).toEqual([check.r, 0]);
    // Every reach is a positive number of metres and every priority a number.
    for (const item of table) { expect(item.reach).toBeGreaterThan(0); expect(Number.isFinite(item.priority)).toBe(true); }
  });

  it('says which solids are the thing itself', () => {
    expect(entry('hunter_notes').ignoreColliders).toEqual([PROP_COLLIDER.hunterBoard, PROP_COLLIDER.hunterBoardPost]);
    expect(PROP_COLLIDER.hunterBoard).toBe('hunter_board');
    expect(FIELD_FENCE_HALF_THICKNESS).toBeGreaterThan(0);
    expect(entry('mount_deer').ignoreColliders).toEqual([`animal:${MOUNT_ID}`]);
    expect(entry('inspect:templar_waymarker').ignoreColliders).toEqual([PROP_COLLIDER.waymarker(0)]);
    expect(entry('inspect:saltward_kit').ignoreColliders).toEqual([PROP_COLLIDER.kitTable]);
    expect(entry('rite').ignoreColliders).toEqual(['altar']);
    expect(table.filter((item) => item.ignoreColliders).map((item) => item.id)).toEqual(['hunter_notes', 'mount_deer', 'inspect:templar_waymarker', 'inspect:saltward_kit', 'rite']);
  });

  it('places fixed things itself and leaves moving ones to the scene', () => {
    const flat = { heightAt: () => 2 };
    expect(fixedPlace(entry('lever').place, flat)).toEqual({ x: SHORTCUT.lever.x, z: SHORTCUT.lever.z });
    expect(fixedPlace(entry('ledger').place, flat)).toEqual({ x: LEDGER.x, z: LEDGER.z });
    // On the hunter's table: above its top, which stands on the highest ground under its legs.
    expect(hunterTableSurfaceY(flat)).toBeCloseTo(2 + HUNTER_TABLE.topAboveFooting, 10);
    expect(fixedPlace(entry('hunter_notes').place, flat)!.y).toBeCloseTo(2 + HUNTER_TABLE.topAboveFooting + HUNTER_TABLE.signCentreAboveTop, 10);
    expect(fixedPlace(entry('hunter_restock').place, flat)).toEqual({ x: HUNTER_SUPPLY.x, z: HUNTER_SUPPLY.z, y: 2 + HUNTER_TABLE.topAboveFooting + 0.12 });
    const sloped = { heightAt: (x: number) => x * 0.1 };
    expect(hunterTableSurfaceY(sloped)).toBeGreaterThan(sloped.heightAt(HUNTER_SUPPLY.x) + HUNTER_TABLE.topAboveFooting);
    for (const id of ['mount_deer', 'dismount', `npc:${Object.keys(NPCS)[0]}`, `pickup:${PICKUP_LOCATIONS[0]!.id}`]) expect(fixedPlace(entry(id).place, flat), id).toBeNull();
    expect(entry('dismount').place).toEqual({ at: 'rider', above: RIDER_REACH_HEIGHT });
    expect(entry(`npc:${Object.keys(NPCS)[0]}`).place).toMatchObject({ at: 'resident', above: RESIDENT_REACH_HEIGHT });
  });
});

describe('when the game\'s state offers each', () => {
  it('offers the lever until the gate is open, and the ledger once the archive is', () => {
    expect(entry('lever').offered(fresh())).toBe(true);
    expect(entry('lever').offered(withState((s) => { s.locationChanges.shortcut = 'open'; }))).toBe(false);
    expect(entry('ledger').offered(fresh())).toBe(false);
    expect(entry('ledger').offered(withState((s) => { s.locationChanges.archive_door = 'open'; }))).toBe(true);
    expect(entry('ledger').offered(withState((s) => { s.locationChanges.archive_shutter = 'forced'; }))).toBe(true);
    expect(entry('archive_door').offered(withState((s) => { s.locationChanges.archive_door = 'open'; }))).toBe(false);
    expect(entry('archive_shutter').offered(fresh())).toBe(true);
    for (const done of ['forced', 'sealed']) expect(entry('archive_shutter').offered(withState((s) => { s.locationChanges.archive_shutter = done; }))).toBe(false);
  });

  it('offers a pickup until it is taken, and the dry channel until an allocation is committed', () => {
    const pickup = PICKUP_LOCATIONS[0]!;
    expect(entry(`pickup:${pickup.id}`).offered(fresh())).toBe(true);
    expect(entry(`pickup:${pickup.id}`).offered(withState((s) => { s.locationChanges[`pickup:${pickup.id}`] = 'taken'; }))).toBe(false);
    expect(entry('inspect:dry_channel').offered(withState((s) => { s.quest.phase = 'decision_ready'; }))).toBe(true);
    for (const phase of ['committed', 'settled'] as const) expect(entry('inspect:dry_channel').offered(withState((s) => { s.quest.phase = phase; }))).toBe(false);
    // The other observations stay.
    expect(entry(`inspect:${INSPECT_LOCATIONS.find((point) => point.id !== 'dry_channel')!.id}`).offered(withState((s) => { s.quest.phase = 'settled'; }))).toBe(true);
  });

  it('offers the result checks only while an allocation is committed', () => {
    for (const check of RESULT_CHECKS) {
      expect(entry(check.id).offered(fresh())).toBe(false);
      expect(entry(check.id).offered(withState((s) => { s.quest.phase = 'committed'; }))).toBe(true);
      expect(entry(check.id).offered(withState((s) => { s.quest.phase = 'settled'; }))).toBe(false);
    }
  });

  it('offers a resident while they are available', () => {
    const id = Object.keys(NPCS)[0] as keyof typeof NPCS;
    expect(entry(`npc:${id}`).offered(fresh())).toBe(true);
    expect(entry(`npc:${id}`).offered(withState((s) => { s.npcs[id].available = false; }))).toBe(false);
  });

  it('offers the hunter\'s trade by the rules of hunting: by day, meat to sell, a hide with room in the quiver, arrows spared', () => {
    const noon = (change: (state: WorldState) => void = () => {}) => withState((s) => { s.clock = 12 * 60; change(s); });
    // His notes can always be read; nothing to trade, nothing offered.
    expect(entry('hunter_notes').offered(fresh())).toBe(true);
    expect(entry('hunter_sell_meat').offered(noon())).toBe(false);
    expect(entry('hunter_restock').offered(noon())).toBe(false);
    // Meat sells by day, not at night and not while he is away.
    expect(entry('hunter_sell_meat').offered(noon((s) => { s.inventory.raw_meat = 2; }))).toBe(true);
    expect(entry('hunter_sell_meat').offered(withState((s) => { s.clock = 23 * 60; s.inventory.raw_meat = 2; }))).toBe(false);
    expect(entry('hunter_sell_meat').offered(noon((s) => { s.inventory.raw_meat = 2; s.npcs.trail_hunter.available = false; }))).toBe(false);
    // A hide buys arrows while the quiver has room for them.
    expect(entry('hunter_restock').offered(noon((s) => { s.inventory.animal_hide = 1; }))).toBe(true);
    expect(entry('hunter_restock').offered(noon((s) => { s.inventory.animal_hide = 1; s.inventory.arrow = ARROW_QUIVER_CAPACITY; }))).toBe(false);
    // With no arrows, no hide and the table's arrows taken, he spares some: the prompt says so.
    const spared = noon((s) => { s.locationChanges['pickup:hunter_arrows'] = 'taken'; s.inventory.arrow = 0; });
    expect(entry('hunter_restock').offered(spared)).toBe(true);
    expect(entry('hunter_restock').prompt(spared)).not.toBe(entry('hunter_restock').prompt(noon((s) => { s.inventory.animal_hide = 1; })));
  });

  it('names what each needs of the moment, which only the scene can tell', () => {
    expect(entry('hunter_sell_meat').needs).toEqual(['no_threat_near']);
    expect(entry('mount_deer').needs).toEqual(['can_mount', 'no_threat_near']);
    expect(entry('dismount').needs).toEqual(['riding']);
    expect(entry('dismount_door').needs).toEqual(['riding_at_doorway']);
    for (const def of Object.values(NPCS)) expect(entry(`npc:${def.id}`).needs).toEqual(['resident_in_sight', 'no_threat_near']);
    for (const item of table.filter((candidate) => /^(inspect|pickup):|^(lever|sluice|archive_|ledger|rite|check_)/.test(candidate.id))) expect(item.needs, item.id).toEqual([]);
  });
});

describe('what each says and does', () => {
  it('words the prompt from the state', () => {
    const def = Object.values(NPCS)[0]!;
    expect(entry(`npc:${def.id}`).prompt(fresh())).toContain(def.name);
    const untaught = entry('rite').prompt(fresh());
    const taught = entry('rite').prompt(withState((s) => { s.facts.rite_taught = true; }));
    expect(taught).not.toBe(untaught);
    for (const item of table) expect(item.prompt(fresh()).length, item.id).toBeGreaterThan(2);
    // No prompt is a missing string's key.
    for (const item of table) expect(item.prompt(fresh()), item.id).not.toMatch(/^prompt\./);
  });

  it('names the action, with whom or what it concerns', () => {
    expect(entry('mount_deer').act).toEqual({ do: 'mount', mount: MOUNT_ID });
    expect(entry('dismount').act).toEqual({ do: 'dismount' });
    expect(entry('dismount_door').act).toEqual({ do: 'dismount' });
    const pickup = PICKUP_LOCATIONS[0]!;
    expect(entry(`pickup:${pickup.id}`).act).toEqual({ do: 'pickup', pickup: pickup.id, item: pickup.item, qty: pickup.qty });
    expect(entry('inspect:dry_channel').act).toEqual({ do: 'inspect', point: 'dry_channel' });
    expect(new Set(table.map((item) => item.act.do)).size).toBe(15);
  });
});

describe('the table with the choosing rule', () => {
  const asInteractable = (item: InteractableEntry, state: WorldState): Interactable => ({
    id: item.id, r: item.reach, priority: item.priority, ignoreColliders: item.ignoreColliders,
    pos: () => fixedPlace(item.place, { heightAt: () => 0 }) ?? { x: 1e9, z: 1e9 },
    prompt: () => item.prompt(state), enabled: () => item.offered(state) && item.needs.length === 0, act: () => {},
  });

  it('offers the ledger, not the shutter beside it, once the shutter is forced', () => {
    const state = withState((s) => { s.locationChanges.archive_shutter = 'forced'; });
    const items = table.map((item) => asInteractable(item, state));
    const standing = { x: LEDGER.x, y: 0, z: LEDGER.z + 1.2, yaw: Math.PI };
    expect(chooseInteractable(items, standing, Math.PI, { groundAt: () => 0 }, new Colliders())?.id).toBe('ledger');
  });

  it('offers a pickup before an observation at the same distance, by priority', () => {
    const state = fresh();
    const pickup = table.find((item) => item.id.startsWith('pickup:'))!, inspect = table.find((item) => item.id.startsWith('inspect:'))!;
    const at = (item: InteractableEntry, x: number): Interactable => ({ ...asInteractable(item, state), pos: () => ({ x, z: 2 }) });
    expect(chooseInteractable([at(inspect, 0.2), at(pickup, -0.2)], { x: 0, y: 0, z: 0, yaw: 0 }, 0, { groundAt: () => 0 }, new Colliders())?.id).toBe(pickup.id);
  });
});
