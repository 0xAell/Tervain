import { NPCS } from '../content/npcs';
import { isWorldPickupItem, WORLD_PICKUP_MODELS } from '../content/pickups';
import { S } from '../content/strings';
import { ANIMAL_MODEL_IDS, hunterRank, hunterSparesArrows, hunterTradingOpen, restockParams } from '../game/hunting';
import { hasFact, phaseIndex } from '../game/state';
import type { ItemId, NpcId, WorldState } from '../game/types';
import {
  ARCHIVE_SHUTTER, bySpec, frontOf, HUNTER_SUPPLY, HUNTER_TABLE, hunterStationPoint, hunterTableSurfaceY, INSPECT_LOCATIONS, LEDGER, PICKUP_LOCATIONS,
  RESULT_CHECKS, RITE_ALTAR, SHORTCUT, SLUICE,
} from '../world/layout';

/**
 * Everything in the world the wanderer can act on: what it is, where it is, how near he must come, which of several in
 * reach is offered first, what the prompt says, when the game's state offers it, and what acting on it does.
 *
 * The scene adds only what it alone knows: where a moving thing is this frame, a fact about the moment (a foe near,
 * the rider's seat), and the carrying out of the action. Choosing among entries is `chooseInteractable`.
 */

/** Where an interactable is. A fixed place is the core's; a thing that moves is placed by the scene. */
export type InteractablePlace =
  /** A place on the ground. Reach is measured to a metre above it. */
  | { at: 'point'; x: number; z: number }
  /** On the hunter's table, `above` its top. The top stands on the terrain under its legs. */
  | { at: 'hunter_table'; x: number; z: number; above: number }
  /** A thing to pick up, at the height the scene set it down. */
  | { at: 'pickup'; pickup: string; x: number; z: number }
  /** The saddle of a mount. */
  | { at: 'mount'; mount: string }
  /** The rider himself, at chest height. */
  | { at: 'rider'; above: number }
  /** A resident, at chest height. */
  | { at: 'resident'; npc: NpcId; above: number };

/** A fact about the moment that only the scene can tell, needed besides the game's state. */
export type InteractableNeed =
  /** No hostile is close enough to interrupt. */
  | 'no_threat_near'
  /** He is on foot, alive, not swimming and not climbing on or off, and the mount is there. */
  | 'can_mount'
  /** He is in the saddle. */
  | 'riding'
  /** He is in the saddle, settled, with a doorway just ahead of the deer. */
  | 'riding_at_doorway'
  /** The resident is out in the world, not indoors or abed. */
  | 'resident_in_sight';

/** What acting on an interactable does. */
export type InteractableAct =
  | { do: 'hunting_notes' } | { do: 'restock_arrows' } | { do: 'sell_game_meat' }
  | { do: 'mount'; mount: string } | { do: 'dismount' }
  | { do: 'observe'; npc: NpcId }
  | { do: 'inspect'; point: string }
  | { do: 'pickup'; pickup: string; item: ItemId; qty: number }
  | { do: 'pull_lever' } | { do: 'open_sluice' }
  | { do: 'try_archive_door' } | { do: 'force_shutter' } | { do: 'read_ledger' }
  | { do: 'perform_rite' } | { do: 'check_result' };

export interface InteractableEntry {
  id: string;
  place: InteractablePlace;
  /** How near he must be, metres, measured from his eye to the place. */
  reach: number;
  /** Lower is offered first when several are in reach: each whole step outweighs two metres of distance. */
  priority: number;
  /** Solids that are the thing itself, and so do not hide it. */
  ignoreColliders?: readonly string[];
  /** The line shown with the interact key. */
  prompt(state: WorldState): string;
  /** Whether the game's state offers it. */
  offered(state: WorldState): boolean;
  /** Facts of the moment it needs as well. */
  needs: readonly InteractableNeed[];
  act: InteractableAct;
}

/** The saddled deer at the caravan rest. */
export const MOUNT_ID = ANIMAL_MODEL_IDS['deer-mount'];
/** Chest height of a standing person, where a resident or the rider is reached for. */
export const RESIDENT_REACH_HEIGHT = 1.1;
export const RIDER_REACH_HEIGHT = 1.4;
/** Things on the hunter's table are reached for just above its planks. */
const ON_TABLE = 0.12;

const always = () => true;
const NONE: readonly InteractableNeed[] = [];

/** Every interactable, in the order ties are settled (the first of two equal candidates is offered). */
export function interactableTable(): InteractableEntry[] {
  const list: InteractableEntry[] = [];
  const sign = hunterStationPoint(HUNTER_TABLE.signX, HUNTER_TABLE.signZ), stall = hunterStationPoint(.7, .25);

  // The hunter's camp: his notes on the board, arrows for hides, coin for meat.
  list.push({
    id: 'hunter_notes', place: { at: 'hunter_table', ...sign, above: HUNTER_TABLE.signCentreAboveTop }, reach: HUNTER_SUPPLY.r, priority: 1,
    ignoreColliders: ['hunter_board', 'hunter_board_post'],
    prompt: () => S('prompt.hunter_supplies'), offered: always, needs: NONE, act: { do: 'hunting_notes' },
  });
  list.push({
    id: 'hunter_restock', place: { at: 'hunter_table', x: HUNTER_SUPPLY.x, z: HUNTER_SUPPLY.z, above: ON_TABLE }, reach: HUNTER_SUPPLY.r, priority: -.6,
    prompt: (s) => (hunterSparesArrows(s) ? S('prompt.spare_arrows') : S('prompt.restock_arrows', restockParams(s))),
    // A hide is offered only while the quiver has room for what it buys (A89 scout).
    offered: (s) => hunterTradingOpen(s) && (((s.inventory.animal_hide ?? 0) > 0 && restockParams(s).count > 0) || hunterSparesArrows(s)),
    needs: NONE, act: { do: 'restock_arrows' },
  });
  list.push({
    id: 'hunter_sell_meat', place: { at: 'hunter_table', ...stall, above: ON_TABLE }, reach: 2.2, priority: -.6,
    prompt: (s) => S('prompt.sell_game_meat', { coin: hunterRank(s.huntTally).meat }),
    offered: (s) => hunterTradingOpen(s) && (s.inventory.raw_meat ?? 0) > 0,
    // Not while a foe is near: the sale is refused then, and the prompt must not offer it (A89 scout).
    needs: ['no_threat_near'], act: { do: 'sell_game_meat' },
  });

  // The saddled deer at the caravan rest can be ridden (A70).
  list.push({
    id: 'mount_deer', place: { at: 'mount', mount: MOUNT_ID }, reach: 2.6, priority: -0.4, ignoreColliders: [`animal:${MOUNT_ID}`],
    prompt: () => S('prompt.ride'), offered: always, needs: ['can_mount', 'no_threat_near'], act: { do: 'mount', mount: MOUNT_ID },
  });
  list.push({
    id: 'dismount', place: { at: 'rider', above: RIDER_REACH_HEIGHT }, reach: 3, priority: -5,
    prompt: () => S('prompt.dismount'), offered: always, needs: ['riding'], act: { do: 'dismount' },
  });
  // A deer does not go indoors (A71): at a doorway the rider is offered to get down instead.
  list.push({
    id: 'dismount_door', place: { at: 'rider', above: RIDER_REACH_HEIGHT }, reach: 3, priority: -6,
    prompt: () => S('prompt.dismount_door'), offered: always, needs: ['riding_at_doorway'], act: { do: 'dismount' },
  });

  // People.
  for (const def of Object.values(NPCS)) {
    list.push({
      id: `npc:${def.id}`, place: { at: 'resident', npc: def.id, above: RESIDENT_REACH_HEIGHT }, reach: def.interactRadius ?? 2.7, priority: -1,
      prompt: () => S('prompt.observe', { name: def.name }),
      offered: (s) => s.npcs[def.id].available,
      needs: ['resident_in_sight', 'no_threat_near'], act: { do: 'observe', npc: def.id },
    });
  }

  // Observations.
  for (const p of INSPECT_LOCATIONS) {
    list.push({
      id: `inspect:${p.id}`, place: { at: 'point', x: p.x, z: p.z }, reach: p.r, priority: 0,
      // Only the observed object's own solid is exempt; nearby walls still obstruct it.
      ignoreColliders: p.id === 'templar_waymarker' ? ['forest-waymarker:0'] : p.id === 'saltward_kit' ? ['kit_table'] : undefined,
      prompt: () => S(`prompt.inspect.${p.id}`),
      // Once an allocation is committed the same spot is where the result is checked; inspecting it again adds nothing.
      offered: (s) => (p.id === 'dry_channel' ? phaseIndex(s.quest.phase) < phaseIndex('committed') : true),
      needs: NONE, act: { do: 'inspect', point: p.id },
    });
  }

  // Things to pick up.
  for (const pk of PICKUP_LOCATIONS) {
    list.push({
      id: `pickup:${pk.id}`, place: { at: 'pickup', pickup: pk.id, x: pk.x, z: pk.z }, reach: pk.r, priority: -0.5,
      prompt: () => (isWorldPickupItem(pk.item) ? S('prompt.pickup', { name: S(WORLD_PICKUP_MODELS[pk.item].nameKey) }) : S(`prompt.pickup.${pk.id}`)),
      offered: (s) => s.locationChanges[`pickup:${pk.id}`] !== 'taken',
      needs: NONE, act: { do: 'pickup', pickup: pk.id, item: pk.item, qty: pk.qty },
    });
  }

  // The maintenance lever and the sluice controls.
  list.push({
    id: 'lever', place: { at: 'point', x: SHORTCUT.lever.x, z: SHORTCUT.lever.z }, reach: SHORTCUT.lever.r, priority: 0,
    prompt: () => S('prompt.lever'), offered: (s) => s.locationChanges.shortcut !== 'open', needs: NONE, act: { do: 'pull_lever' },
  });
  list.push({
    id: 'sluice', place: { at: 'point', x: SLUICE.control.x, z: SLUICE.control.z }, reach: SLUICE.control.r, priority: 0,
    prompt: () => S('prompt.sluice'), offered: always, needs: NONE, act: { do: 'open_sluice' },
  });

  // Archive: door, shutter, ledger.
  const door = frontOf(bySpec('archive'), 0.3);
  list.push({
    id: 'archive_door', place: { at: 'point', x: door.x, z: door.z }, reach: 2.4, priority: 0,
    prompt: () => S('prompt.archive_door.locked'), offered: (s) => s.locationChanges.archive_door !== 'open', needs: NONE, act: { do: 'try_archive_door' },
  });
  list.push({
    id: 'archive_shutter', place: { at: 'point', x: ARCHIVE_SHUTTER.x, z: ARCHIVE_SHUTTER.z }, reach: ARCHIVE_SHUTTER.r, priority: 0,
    prompt: () => S('prompt.archive_shutter'),
    offered: (s) => s.locationChanges.archive_shutter !== 'forced' && s.locationChanges.archive_shutter !== 'sealed',
    needs: NONE, act: { do: 'force_shutter' },
  });
  list.push({
    id: 'ledger', place: { at: 'point', x: LEDGER.x, z: LEDGER.z }, reach: LEDGER.r, priority: 0,
    prompt: () => S('prompt.ledger'),
    offered: (s) => s.locationChanges.archive_door === 'open' || s.locationChanges.archive_shutter === 'forced',
    needs: NONE, act: { do: 'read_ledger' },
  });

  // The spring rite.
  list.push({
    id: 'rite', place: { at: 'point', x: RITE_ALTAR.x, z: RITE_ALTAR.z }, reach: RITE_ALTAR.r, priority: 0, ignoreColliders: ['altar'],
    prompt: (s) => (hasFact(s, 'rite_taught') ? S('prompt.rite') : S('prompt.rite.notaught')), offered: always, needs: NONE, act: { do: 'perform_rite' },
  });

  // Seeing the result reach the village.
  for (const c of RESULT_CHECKS) {
    list.push({
      id: c.id, place: { at: 'point', x: c.x, z: c.z }, reach: c.r, priority: 0,
      prompt: () => S(c.id === 'check_channel' ? 'prompt.check_channel' : 'prompt.check_mill'),
      offered: (s) => s.quest.phase === 'committed', needs: NONE, act: { do: 'check_result' },
    });
  }
  return list;
}

/** Where a fixed place is, for the choosing rule; null for a thing only the scene can place. */
export function fixedPlace(place: InteractablePlace, terrain: { heightAt(x: number, z: number): number }): { x: number; z: number; y?: number } | null {
  if (place.at === 'point') return { x: place.x, z: place.z };
  if (place.at === 'hunter_table') return { x: place.x, z: place.z, y: hunterTableSurfaceY(terrain) + place.above };
  return null;
}
