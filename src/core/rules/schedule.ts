import { BARKS, type Activity, type Bark, type NpcDef } from '../content/npcs';
import { evalAll } from '../game/state';
import type { NpcId, WorldState } from '../game/types';

/** Whether hour `h` falls in the span from `from` up to `to`, which may run past midnight. */
export const hourIn = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

export interface Goal {
  anchor: string;
  activity: Activity;
  /** An indoor post within the anchor's building (A70). */
  inside?: string;
}

/** Choose where an NPC should be, and what they should be doing, at this hour. */
export function resolveGoal(def: NpcDef, state: WorldState, hour: number): Goal {
  for (const o of def.overrides ?? []) {
    if (!evalAll(state, o.when)) continue;
    if (o.from !== undefined && o.to !== undefined && !hourIn(hour, o.from, o.to)) continue;
    return { anchor: o.anchor, activity: o.activity };
  }
  for (const e of def.schedule) {
    if (hourIn(hour, e.from, e.to)) return e.inside ? { anchor: e.anchor, activity: e.activity, inside: e.inside } : { anchor: e.anchor, activity: e.activity };
  }
  return { anchor: def.home, activity: 'rest' };
}

/** The passing remarks a resident may make now: theirs, with their conditions met, within their hours. */
export function eligibleBarks(npc: NpcId, state: WorldState, hour: number): Bark[] {
  return BARKS.filter((b) => b.npc === npc && evalAll(state, b.when) && (!b.hours || hourIn(hour, b.hours[0], b.hours[1])));
}
