import type { App } from '../app';
import { doorwayAhead, DEER_BODY } from '../core/rules/riding';
import type { Interactable } from '../core/rules/interaction';
import { fixedPlace, interactableTable, type InteractableAct, type InteractableNeed, type InteractablePlace } from '../core/rules/interactables';
import { worldPickupTargetY } from './worldPickups';

export type { Interactable };

/**
 * The core's table of interactables (`core/rules/interactables.ts`) as the things the scene offers: each entry gets
 * its place this frame, the facts of the moment it needs, and the carrying out of its action. What can be acted on,
 * from how far, in what order and when is all in the table.
 */
export function buildInteractables(app: App): Interactable[] {
  const state = () => app.game.state;

  // The terrain is asked for only by a place that stands on it (the hunter's table), once a world is there.
  const ground = { heightAt: (x: number, z: number) => app.world.terrain.heightAt(x, z) };
  const place = (at: InteractablePlace): { x: number; z: number; y?: number } => {
    const fixed = fixedPlace(at, ground);
    if (fixed) return fixed;
    if (at.at === 'pickup') return { x: at.x, z: at.z, y: worldPickupTargetY(app.world?.scenery.pickups[at.pickup]) };
    if (at.at === 'mount') { const m = app.world.animals?.mount(at.mount); return m ? { x: m.x, y: m.y + m.seat, z: m.z } : { x: 1e9, z: 1e9 }; }
    if (at.at === 'rider') return { x: app.player.x, y: app.player.y + at.above, z: app.player.z };
    if (at.at === 'resident') { const npc = app.npcs.find((actor) => actor.id === at.npc)!; return { x: npc.x, y: npc.y + at.above, z: npc.z }; }
    throw new Error('An interactable with no place.');
  };

  const holds = (need: InteractableNeed, at: InteractablePlace): boolean => {
    const p = app.player;
    switch (need) {
      case 'no_threat_near': return app.noThreatNear();
      case 'can_mount': return !p.mount && !p.mountMove && p.alive && !p.swimming && at.at === 'mount' && !!app.world.animals?.mount(at.mount);
      case 'riding': return !!p.mount;
      case 'riding_at_doorway': return !!p.mount && !p.mountMove && doorwayAhead(p.x + Math.sin(p.yaw) * DEER_BODY.front, p.z + Math.cos(p.yaw) * DEER_BODY.front) !== null;
      case 'resident_in_sight': return at.at === 'resident' && !app.npcs.find((actor) => actor.id === at.npc)!.hidden;
    }
  };

  const perform = (act: InteractableAct): void => {
    switch (act.do) {
      case 'hunting_notes': return app.openHuntingNotes();
      case 'restock_arrows': return app.restockArrows();
      case 'sell_game_meat': return app.sellGameMeat();
      case 'mount': return app.mountDeer();
      case 'dismount': return app.dismount();
      case 'observe': return app.observeNpc(app.npcs.find((actor) => actor.id === act.npc)!);
      case 'inspect': return app.inspect(act.point);
      case 'pickup': return app.pickup(act.pickup, act.item, act.qty);
      case 'pull_lever': return app.pullLever();
      case 'open_sluice': return app.openSluice();
      case 'try_archive_door': return app.tryArchiveDoor();
      case 'force_shutter': return app.forceShutter();
      case 'read_ledger': return app.readLedger();
      case 'perform_rite': return app.performRite();
      case 'check_result': return app.checkResult();
    }
  };

  return interactableTable()
    // A resident who is not in this world (a test's or a partial build's) is not offered.
    .filter((entry) => entry.place.at !== 'resident' || app.npcs.some((actor) => actor.id === (entry.place as { npc: string }).npc))
    .map((entry): Interactable => ({
      id: entry.id, r: entry.reach, priority: entry.priority, ignoreColliders: entry.ignoreColliders,
      pos: () => place(entry.place),
      prompt: () => entry.prompt(state()),
      // The state's rule first, as before: a fact of the moment is asked only for what the state offers.
      enabled: () => entry.offered(state()) && entry.needs.every((need) => holds(need, entry.place)),
      act: () => perform(entry.act),
    }));
}
