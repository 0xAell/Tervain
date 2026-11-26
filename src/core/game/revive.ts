import { quiverCapacity, normalizeHunting, normalizeHuntTally } from './hunting';
import { normalizeEquippedWeapon, normalizeInventory, normalizeQuickSlots } from './inventory';
import { TRUST_LIMIT } from './constants';
import { validMapMarker } from './map';
import { createInitialState } from './state';
import {
  ARMED_START_REVISIONS, CONTENT_REVISION, EVIDENCE_IDS, NPC_IDS, SAVE_FORMAT_VERSION, WRECK_BLADE_PICKUP, type Allocation, type GateState, type QuestPhase, type WorldState,
} from './types';

/**
 * What a saved journey is revived as: the state a save held, checked field by field and merged with the present
 * defaults, so that an old save loads into a newer game and a damaged or hand-edited one cannot carry a value the
 * game never writes. Where a save is kept, and its envelope and checksum, are the platform's (platform/storage.ts).
 */

/** The values the game writes for these fields, so a save holding anything else is caught (A72). */
const QUEST_PHASES = ['unseen', 'investigating', 'decision_ready', 'committed', 'settled'] as const satisfies readonly QuestPhase[];
const GATE_STATES = ['damaged', 'jammed', 'stabilized'] as const satisfies readonly GateState[];
const ALLOCATIONS = ['rillford', 'quarry', 'rotation'] as const satisfies readonly Allocation[];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A loose thing's saved place must lie within the realm (m), and no more of them are read than this. */
export const SAVED_PROP_BOUNDS = { minX: -380, maxX: 200, minZ: -170, maxZ: 170, minY: -50, maxY: 120, most: 8192 } as const;

/** The loose things' saved places: missing ones keep where they were set out, and a malformed one is left out. */
function physicalObjects(raw: unknown): WorldState['physicalObjects'] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: WorldState['physicalObjects'] = [];
  for (const value of raw.slice(0, SAVED_PROP_BOUNDS.most)) {
    if (!isObj(value) || typeof value.id !== 'string' || value.id.length > 80 || seen.has(value.id)
      || !isObj(value.position) || !isObj(value.rotation)) continue;
    const p = value.position, q = value.rotation;
    if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(isNum)) continue;
    const position = { x: p.x as number, y: p.y as number, z: p.z as number };
    const rotation = { x: q.x as number, y: q.y as number, z: q.z as number, w: q.w as number };
    const n = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
    const within = SAVED_PROP_BOUNDS;
    if (position.x < within.minX || position.x > within.maxX || position.z < within.minZ || position.z > within.maxZ
      || position.y < within.minY || position.y > within.maxY || n < .9 || n > 1.1) continue;
    rotation.x /= n; rotation.y /= n; rotation.z /= n; rotation.w /= n;
    const space = value.space;
    if (space !== undefined && (typeof space !== 'string' || (space !== 'vale' && !/^[a-z0-9_]{1,40}\/(ground|loft|cellar)$/.test(space)))) continue;
    seen.add(value.id); result.push({ id: value.id, position, rotation, ...(space !== undefined ? { space } : {}) });
  }
  return result;
}

/** Structural validation plus forward-compatible merge with current defaults. Returns null when unusable. */
export function reviveState(raw: unknown): WorldState | null {
  if (!isObj(raw)) return null;
  const base = createInitialState(typeof raw.slotId === 'string' ? raw.slotId : 'slot-1');
  const q = raw.quest;
  const p = raw.player;
  if (!isObj(q) || !isObj(p) || !isNum(raw.clock)) return null;
  if (!isNum(p.x) || !isNum(p.y) || !isNum(p.z) || !isNum(p.yaw) || !isNum(p.health)) return null;
  if (typeof q.phase !== 'string' || typeof q.gate !== 'string') return null;
  // A damaged or hand-edited save must not carry values the game never writes (A72): an unknown phase or gate state is
  // refused, an unknown allocation dropped.
  if (!(QUEST_PHASES as readonly string[]).includes(q.phase) || !(GATE_STATES as readonly string[]).includes(q.gate)) return null;
  if (!isObj(raw.npcs) || !isObj(raw.inventory) || !isObj(raw.facts)) return null;

  const merged: WorldState = {
    ...base,
    ...(raw as unknown as WorldState),
    quest: { ...base.quest, ...(q as unknown as WorldState['quest']) },
    player: { ...base.player, ...(p as unknown as WorldState['player']) },
    offenses: {
      pending: isObj(raw.offenses) && Array.isArray(raw.offenses.pending) ? (raw.offenses.pending as unknown[]).filter(isObj) as unknown as WorldState['offenses']['pending'] : [],
      known: isObj(raw.offenses) && Array.isArray(raw.offenses.known) ? (raw.offenses.known as unknown[]).filter(isObj) as unknown as WorldState['offenses']['known'] : [],
    },
    npcs: { ...base.npcs },
    facts: { ...raw.facts } as WorldState['facts'],
    inventory: normalizeInventory(raw.inventory),
    quickSlots: normalizeQuickSlots(raw.quickSlots),
    equippedWeapon: null,
    physicalObjects: physicalObjects(raw.physicalObjects),
    hunting: normalizeHunting(raw.hunting),
    huntTally: normalizeHuntTally(raw.huntTally),
    mapMarker: validMapMarker(raw.mapMarker) ? { x: raw.mapMarker.x, z: raw.mapMarker.z } : null,
    saveFormatVersion: SAVE_FORMAT_VERSION,
    contentRevision: CONTENT_REVISION,
  };
  const worn = merged.facts.worn_charm;
  if (worn && (typeof worn !== 'string' || !['league_sash','contract_band','witness_cord'].includes(worn) ||
    !merged.inventory[worn as keyof WorldState['inventory']])) delete merged.facts.worn_charm;
  const room = p.interior;
  delete merged.player.interior;
  if (
    isObj(room) &&
    typeof room.building === 'string' &&
    room.building.length <= 64 &&
    (room.level === 'ground' || room.level === 'loft' || room.level === 'cellar') &&
    isNum(room.x) &&
    isNum(room.z)
  ) {
    merged.player.interior = {
      building: room.building,
      level: room.level,
      x: room.x,
      z: room.z,
      rear: room.rear === true,
    };
  }
  for (const id of NPC_IDS) {
    const n = (raw.npcs as Record<string, unknown>)[id];
    if (!isObj(n)) continue;
    const was = base.npcs[id];
    // Each field only when it has its own type; anything else keeps the starting value (A72).
    merged.npcs[id] = {
      ...was,
      available: typeof n.available === 'boolean' ? n.available : was.available,
      cause: typeof n.cause === 'string' || n.cause === null ? n.cause : was.cause,
      // The game keeps trust within -5..5; a saved 99 passed every trust check and was written back (A102 scout).
      trust: isNum(n.trust) ? Math.max(-TRUST_LIMIT, Math.min(TRUST_LIMIT, n.trust)) : was.trust,
      met: typeof n.met === 'boolean' ? n.met : was.met,
    };
  }
  if (merged.quest.allocation !== null && !(ALLOCATIONS as readonly unknown[]).includes(merged.quest.allocation)) merged.quest.allocation = null;
  if (!isNum(merged.playSeconds) || merged.playSeconds < 0) merged.playSeconds = 0;
  // The quiver never holds more than it can (A72).
  if ((merged.inventory.arrow ?? 0) > quiverCapacity(merged)) merged.inventory = { ...merged.inventory, arrow: quiverCapacity(merged) };
  if (!isNum(merged.player.maxHealth) || merged.player.maxHealth <= 0) merged.player.maxHealth = base.player.maxHealth;
  merged.player.health = Math.max(0, Math.min(merged.player.maxHealth, merged.player.health));
  if (typeof merged.player.mount !== 'string' || !/^[0-9]{1,20}$/.test(merged.player.mount)) delete merged.player.mount;
  merged.skills = Array.isArray(raw.skills) && raw.skills.includes('steady_guard') ? ['steady_guard'] : [];
  // The quest's other fields keep their own types (A102 scout: a numeric `entry` loaded, then crashed the journal; a
  // string `committedAtClock` turned the apply-delay sum into text).
  const quest = merged.quest, numOrNull = (v: unknown) => isNum(v) ? v : null;
  quest.entry = typeof quest.entry === 'string' ? quest.entry : null;
  quest.maintainer = typeof quest.maintainer === 'string' ? quest.maintainer : null;
  quest.committedAtClock = numOrNull(quest.committedAtClock);
  quest.settledAtClock = numOrNull(quest.settledAtClock);
  quest.repairRequired = quest.repairRequired === true;
  quest.witnesses = Array.isArray(quest.witnesses) ? quest.witnesses.filter((w) => (NPC_IDS as readonly unknown[]).includes(w)) : [];
  quest.reactions = Array.isArray(quest.reactions) ? quest.reactions.filter((r): r is string => typeof r === 'string') : [];
  // A clock before the first day gave new hunting records a negative time, which the next load threw away.
  if (merged.clock < 0) merged.clock = 0;
  if (quest.phase === 'committed' && quest.committedAtClock === null) quest.committedAtClock = merged.clock;
  // Evidence counts by presence: only whole records of known evidence are kept, and only won encounters (A102 scout:
  // `{ worker_testimony: 5 }` counted as testimony; `{ cut_creature: false }` as a defeat).
  const evidence: WorldState['evidence'] = {};
  if (isObj(raw.evidence)) for (const id of EVIDENCE_IDS) {
    const rec = (raw.evidence as Record<string, unknown>)[id];
    if (isObj(rec) && typeof rec.via === 'string' && ['observed', 'testimony', 'document', 'derived'].includes(rec.via)
      && typeof rec.source === 'string' && isNum(rec.atClock)) evidence[id] = { via: rec.via as never, source: rec.source, atClock: rec.atClock };
  }
  merged.evidence = evidence;
  const defeated: WorldState['defeated'] = {};
  if (isObj(raw.defeated)) for (const [id, won] of Object.entries(raw.defeated)) if (won === true) (defeated as Record<string, true>)[id] = true;
  merged.defeated = defeated;
  if (!isObj(merged.grants)) merged.grants = {};
  if (!isObj(merged.discovered)) merged.discovered = {};
  if (!isObj(merged.locationChanges)) merged.locationChanges = {};
  // Saves from before the unarmed start were made by a player who already carried a blade: keep them armed, and
  // treat the wreck's sword as the one they carry.
  if (typeof raw.contentRevision === 'string' && ARMED_START_REVISIONS.includes(raw.contentRevision)) {
    merged.inventory = { ...merged.inventory, rusted_sword: Math.max(1, merged.inventory.rusted_sword ?? 0) };
    merged.locationChanges = { ...merged.locationChanges, [`pickup:${WRECK_BLADE_PICKUP}`]: 'taken' };
  }
  // Older builds armed the player whenever the sword was carried. Preserve that behavior only when the new
  // equipment field was absent; an explicit null records the player's deliberate choice to go unarmed.
  merged.equippedWeapon = normalizeEquippedWeapon(
    Object.hasOwn(raw, 'equippedWeapon') ? raw.equippedWeapon : 'rusted_sword', merged.inventory,
  );
  return merged;
}
