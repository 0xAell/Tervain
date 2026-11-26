import { ANCHORS, INSPECT_LOCATIONS, PICKUP_LOCATIONS, PLACES, RESULT_CHECKS, SLUICE, type V2 } from '../world/layout';
import { APPLY_DELAY_MIN } from './constants';
import type { WorldState } from './types';

export interface JourneyLead {
  chapter: string;
  action: string;
  reason: string;
  at?: V2;
}
const inland = ['rillford', 'ford', 'spring_shrine', 'sluice', 'quarry', 'the_cut', 'archive'] as const;
const landmarks = new Map([...INSPECT_LOCATIONS, ...PICKUP_LOCATIONS].map(p => [p.id, p]));
function lead(chapter: string, action: string, reason: string, at?: V2): JourneyLead {
  return { chapter, action, reason, at };
}

const fordCrew = ['ford_bandit_a', 'ford_bandit_b', 'ford_lookout'] as const;
export function fordPatrol(s: WorldState) {
  const cleared = fordCrew.filter(id => s.defeated[id]).length;
  return { cleared, total: fordCrew.length, complete: cleared === fordCrew.length, paid: !!s.grants.ford_wagon_wage };
}

/** Reconstruct the next lead from evidence so alternate paths, older saves, and missed pickups stay playable. */
export function journeyLead(s: WorldState): JourneyLead {
  const coast = 'The wreck', road = 'The bell road', town = 'The silent mill', water = 'Two claims on the spring';
  const { phase, gate, allocation } = s.quest;
  if (phase === 'settled') {
    const ending = allocation === 'rillford' ? 'The mill wheel turns. The quarry crew must wait for another shift.'
      : allocation === 'quarry' ? 'The quarry crew can work again. Rillford must bake with flour brought over the ford.'
      : 'The day mill and the night quarry share the spring. Someone must keep the bell hours.';
    return lead('The Dry Bell · Complete', 'The water has found its course', ending);
  }
  if (phase === 'committed') {
    const remaining = Math.ceil((s.quest.committedAtClock ?? s.clock) + APPLY_DELAY_MIN - s.clock);
    return lead('The first turning', 'Check the mill channel in Rillford', remaining > 0
      ? 'You set the gate. Give the new flow ' + remaining + ' more game minutes to reach the wheel. A village bench lets you wait.'
      : 'The water has reached the lower valley. Inspect the mill channel to see what your decision cost.', RESULT_CHECKS[0]);
  }
  if (gate === 'stabilized') return lead('The water hearing', 'Set the allocation at the sluice wheel',
    'Send water to the mill or the quarry. For a shared rota, gather evidence of both needs and the agreement of the village, shrine and quarry.', SLUICE.control);
  const insideVale = s.player.x >= PLACES.rillford.x - PLACES.rillford.r || inland.some(id => s.discovered[id]);
  if (phase === 'unseen' && !insideVale && !s.npcs.caravan_master.met && s.npcs.caravan_master.available) {
    if (!s.facts.saw_arrival_wreckage && !s.discovered.deepwood) return lead(coast, 'Search the broken hull on Grey Strand',
      'You came ashore with empty hands. The hull north of the landing is the only sign of anyone else.', landmarks.get('arrival_wreckage'));
    if (!s.inventory.rusted_sword && !s.locationChanges['pickup:wreck_blade'] && !s.discovered.deepwood)
      return lead(coast, 'Recover the blade inside the wreck', 'The inland track leads into the pines. Take the blade, then equip it from your pack.', landmarks.get('wreck_blade'));
    if (!s.facts.saw_templar_waymarker && !s.discovered.overlook) return lead(road, 'Read the notched stone on the forest road',
      'Follow the old road inland. Its stones mark the way to the people who ring the valley bell.', landmarks.get('templar_waymarker'));
    return lead(road, 'Find Joss by the stockade wagon', 'A carter keeps this road. Ask him why there is no flour coming out of Rillford.', ANCHORS.overlook_wagon);
  }
  if (!s.evidence.dry_channel) return lead(town, 'Inspect the dry channel beside Rillford mill',
    'Rillford has grain and a hungry village. Without water the miller cannot turn it into flour.', landmarks.get('dry_channel'));
  if (!s.evidence.reduced_spring_flow && !s.evidence.cracked_sluice) return lead(water, 'Examine the sediment at the spring',
    'Follow the millstream north to the shrine. The mark left by the water will tell you whether the spring itself is failing.', landmarks.get('spring_sediment'));
  if (!s.evidence.cracked_sluice && !s.evidence.worker_testimony) return lead(water, 'Inspect the cracked sluice gate',
    'The remaining flow splits below the shrine. Find the damage before anyone tries the wheel.', landmarks.get('sluice_crack'));
  if (!s.evidence.diversion_and_seep && !s.facts.saw_diversion) return lead(water, 'Trace the town diversion below the gate',
    'The flour mill is one claim on this water. Follow the second channel toward the eastern quarry.', landmarks.get('town_diversion'));
  if (!s.evidence.diversion_and_seep && !s.facts.saw_seep) return lead(water, 'Inspect the seep at the quarry',
    'Darin’s crew needs the water to keep working. Check the wet rock where the second channel ends.', landmarks.get('quarry_seep'));
  if (!s.inventory.sluice_brace || !s.inventory.gate_wrench) {
    const brace = !s.inventory.sluice_brace;
    return lead('A brace for the gate', brace ? 'Collect the iron brace in the quarry yard' : 'Collect the gate wrench beside the brace',
      'The quarry repair kit can hold the split timber. Ila at the Cut knows how to make the repair safely.', landmarks.get(brace ? 'quarry_brace' : 'quarry_wrench'));
  }
  return lead('A brace for the gate', 'Brace the gate at the sluice wheel',
    'You have the brace and wrench. Ila’s instructions or the spring rite can spare you the force of the surge.', SLUICE.control);
}
