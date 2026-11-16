import { ENEMY_ARCHETYPES } from '../content/enemies';
import { NPCS } from '../content/npcs';
import { huntingHint } from '../game/hunting';
import { hasFact, itemCount } from '../game/state';
import type { PlaceId, WorldState } from '../game/types';
import type { Colliders } from '../world/colliders';
import { PLACES, SPAWN } from '../world/layout';
import type { NavGrid } from '../world/nav';
import { canPlayerStandAt, PLAYER_BODY_RADIUS, supportedPlayerHeight } from '../world/playerPlacement';
import type { Terrain } from '../world/terrain';
import { STAMINA_MAX } from './hero';
import { AUTOSAVE_SECONDS, checkpointAllowed, DEATH, HIT_STOP, UNDER_WORLD, WITNESS_REACH } from './journey';
import { MOUNT_STAMINA } from './riding';
import { RESIDENT } from './resident';

/**
 * A sitting at the game, between entering a world and leaving it: what passes while the world runs freely and is no
 * part of what is saved. The clock's remainder, the count to the next save, the pause on a blow, the fall and the
 * waking, where a loaded wanderer may be set down, getting onto and off the deer, the archive's door, timed work, and
 * what the journey points him to. The numbers are in journey.ts; here is when each is applied. The application calls
 * these in its loop and does what they say.
 */

/* ============================ Time ============================ */

/** The clock is advanced by at least this many game minutes at a time, so its rules run on halves, not on frames. */
export const CLOCK_TICK_MINUTES = 0.5;

/**
 * The game minutes due to the clock now, of those that have passed and are not yet on it: all of them once at least a
 * tick is owed, none before. The reading of the clock plus what is owed tells the time between ticks.
 */
export function clockDue(owed: number): number {
  return owed >= CLOCK_TICK_MINUTES ? owed : 0;
}

/** Whether the count to the journey saving itself has run out. It starts again from `AUTOSAVE_SECONDS`, as it does with a load and with a life. */
export function autosaveDue(remaining: number): boolean {
  return remaining <= 0;
}

/**
 * Whether a journey has anything in it worth keeping: a new one that has done nothing must not replace the last one's
 * own save. Loose provisions, a chosen weapon, a quick slot or a pin on the map count before the investigation does.
 * `notesChanged` is whether the satchel's notes were edited this sitting.
 */
export function journeyBegun(s: WorldState, notesChanged: boolean): boolean {
  return s.quest.phase !== 'unseen'
    || Object.keys(s.evidence).length > 0
    || Object.keys(s.grants).length > 0
    || Object.entries(s.locationChanges).some(([key, value]) => key.startsWith('pickup:') && value === 'taken')
    || notesChanged
    || s.quickSlots.some((item) => item !== null)
    || s.equippedWeapon !== null
    || Object.keys(s.hunting).length > 0
    || s.mapMarker !== null
    || s.playSeconds > AUTOSAVE_SECONDS;
}

/**
 * Which deer a save says he is riding: the one he sits, or the one a load promised him that has not yet arrived.
 * Part way onto or off it he is saved afoot.
 */
export function savedMount(seated: string | null | undefined, awaited: string | null | undefined): string | null {
  return seated ?? awaited ?? null;
}

/* ============================ A blow, a fall ============================ */

/** How long a blow that lands holds the world still (s). */
export function hitStopFor(heavy: boolean): number { return heavy ? HIT_STOP.heavy : HIT_STOP.light; }

/** A moment of a sitting, as far as what goes on in it: he plays; a blow holds the moment; he lies fallen; or play is paused. */
export type Moment = 'play' | 'hitStop' | 'fallen' | 'paused';

/** Which moment it is: fallen whenever he lies fallen, paused while he does not play, held while a hit-stop lasts. */
export function momentOf(facts: { playing: boolean; fallen: boolean; hitStopped: boolean }): Moment {
  return facts.fallen ? 'fallen' : !facts.playing ? 'paused' : facts.hitStopped ? 'hitStop' : 'play';
}

/**
 * What goes on in each moment. `clock`: the day's clock, the time played and the autosave countdown. `people`: speech
 * and the residents. `action`: the wanderer, his foes, the animals, arrows and loose cargo, the doors, and discovery. `foePace`:
 * the share of their pace his foes keep. A blow holds the action while the day and its people go on; while he lies
 * fallen the day stops and only his foes move, at `DEATH.foePace`, until he wakes.
 */
export const WHAT_RUNS: Readonly<Record<Moment, { clock: boolean; people: boolean; action: boolean; foePace: number }>> = {
  play: { clock: true, people: true, action: true, foePace: 1 },
  hitStop: { clock: true, people: true, action: false, foePace: 0 },
  fallen: { clock: false, people: false, action: false, foePace: DEATH.foePace },
  paused: { clock: false, people: false, action: false, foePace: 0 },
};

/** The fall: what is left of the fallen view (`DEATH.fadeSeconds` at first) after `dt` more seconds. At nothing he rises. */
export function fallRemaining(remaining: number, dt: number): number {
  return Math.max(0, remaining - dt);
}

/* ============================ Where he may be set down ============================ */

/** Deep enough to be afloat in (m of water, and of surface over the ground); feet this far under the surface, never nearer it than `headroom`. */
export const AFLOAT = { depth: 0.9, over: 0.9, feetBelow: 1.1, headroom: 0.2 } as const;
/** Failing a place to stand or swim, the nearest open ground within this many cells of the walking grid; failing that, the strand. */
export const SAFE_PLACE_RINGS = 10;

export interface PlacingWorld {
  terrain: Parameters<typeof canPlayerStandAt>[0] & Pick<Terrain, 'groundAt'>;
  colliders: Pick<Colliders, 'blocked'>;
  /** The water at a point, if any stands there. */
  waterAt?: (x: number, z: number) => { depth: number; surface: number } | null | undefined;
  nav: Pick<NavGrid, 'nearestOpen' | 'cellCenter'>;
}

/**
 * Where the wanderer is set down for a place he was saved at or sent to. Where he can stand, there. Where he was
 * swimming, there, afloat: a swimmer is rebuilt where he swims, not carried ashore, and never beneath the ground.
 * Otherwise (the land changed since) the nearest open ground, and failing that the strand he first woke on.
 */
export function safePlace(world: PlacingWorld, x: number, z: number, feetY?: number): { x: number; z: number; y: number; afloat?: boolean } {
  const { terrain, colliders } = world;
  if (canPlayerStandAt(terrain, colliders, x, z, feetY)) return { x, z, y: supportedPlayerHeight(terrain, x, z, feetY) };
  const water = world.waterAt?.(x, z);
  const ground = terrain.groundAt(x, z);
  if (water && water.depth > AFLOAT.depth && water.surface > ground + AFLOAT.over && !colliders.blocked(x, z, PLAYER_BODY_RADIUS)) {
    return { x, z, y: Math.max(ground, Math.min(feetY ?? water.surface - AFLOAT.feetBelow, water.surface - AFLOAT.headroom)), afloat: true };
  }
  const cell = world.nav.nearestOpen(x, z, SAFE_PLACE_RINGS);
  const position = cell ? world.nav.cellCenter(cell.i, cell.j) : { x: SPAWN.x, z: SPAWN.z };
  return { ...position, y: terrain.groundAt(position.x, position.z) };
}

/** What entering a journey restores, new or loaded: a save keeps neither his tiredness nor the deer's, and the next timed autosave is a whole interval away. */
export const ENTRY_RESTORES = { stamina: STAMINA_MAX, exhausted: false, mountStamina: MOUNT_STAMINA.max, mountSpent: false, autosaveSeconds: AUTOSAVE_SECONDS } as const;

/** Entering a world from a save. */
export const ENTRY = {
  /** A loose thing he was standing on is trusted as footing if its top is within this (m) of his saved height. */
  propSupport: 0.12,
  /** More than this far (m) beneath the ground, not swimming and not in the archive, he is put on it. */
  buried: 0.3,
} as const;

/** The top of a loose thing he was saved standing on, if it is still where his feet were; null if it is not to be trusted. */
export function trustedPropTop(propTop: number | null, savedY: number): number | null {
  return propTop !== null && Math.abs(propTop - savedY) < ENTRY.propSupport ? propTop : null;
}

/** Whether he would enter buried: under land that changed since the save, and neither afloat nor in the archive. */
export function buriedOnEntry(y: number, ground: number, facts: { afloat: boolean; inArchive: boolean }): boolean {
  return !facts.afloat && !facts.inArchive && y < ground - ENTRY.buried;
}

/* ============================ The place he returns to, and waking ============================ */

/** Where a fall brings him back to. */
export interface RespawnPoint { x: number; y?: number; z: number; yaw: number }

/**
 * When that place may move: when a journey is entered, when he discovers a place, and when the journey saves itself
 * because something happened. The timed autosave and saves made by hand leave it where it is.
 */
export type RespawnMoment = 'entry' | 'place' | 'eventAutosave';

/** Where a journey's place to return to starts: the strand, on the ground. */
export function strandRespawn(groundAt: (x: number, z: number) => number): RespawnPoint {
  return { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, y: groundAt(SPAWN.x, SPAWN.z) };
}

/**
 * The place he returns to after `moment`, with him standing at `here`. Entering a journey starts again from the
 * strand; at every moment it moves to where he stands unless a living foe or an undefeated post is within
 * CHECKPOINT_CLEARANCE (checkpointAllowed), so a save made beside a foe's post cannot make it a place to die again.
 */
export function respawnAfter(current: RespawnPoint, moment: RespawnMoment, here: RespawnPoint, strand: RespawnPoint,
  livingFoes: Iterable<{ x: number; z: number }>, undefeatedPosts: Iterable<{ x: number; z: number }>): RespawnPoint {
  const before = moment === 'entry' ? strand : current;
  return checkpointAllowed(here.x, here.z, livingFoes, undefeatedPosts) ? { x: here.x, y: here.y, z: here.z, yaw: here.yaw } : before;
}

/**
 * What waking after a fall restores, at the place he returns to: `DEATH.heal` of his health, all his stamina (he does
 * not rise exhausted), every foe back at its post with its health whole, and a whole interval before the next timed
 * autosave.
 */
export const WAKING = { heal: DEATH.heal, stamina: STAMINA_MAX, foesToPosts: true, autosaveSeconds: AUTOSAVE_SECONDS } as const;

/* ============================ Figures on their way ============================ */

/**
 * A figure whose model is still on its way holds its place and does nothing: it cannot be met, witness, fight or block.
 * It takes its model out of sight, so that nobody sees the change, but not once the wanderer is near enough for it to
 * matter: within twice the furthest any figure acts on him (a hostile's notice, a keeper's witness reach, a resident's
 * greeting) it arrives in view too, since a figure appearing is better than one missing where the game needs it. The
 * margin covers the frames a model takes to be made ready while he closes.
 */
export const ARRIVES_IN_VIEW_WITHIN = 2 * Math.max(
  WITNESS_REACH,
  ...Object.values(ENEMY_ARCHETYPES).map((kind) => kind.notice),
  ...Object.values(NPCS).map((def) => def.approachGreeting?.radius ?? 0),
);

/** Whether a figure `distance` from the wanderer takes its model even where he can see the change (ARRIVES_IN_VIEW_WITHIN). */
export function arrivesInView(distance: number): boolean {
  return distance <= ARRIVES_IN_VIEW_WITHIN;
}

/* ============================ Saving ============================ */

/** The journey's save slots. The game writes the auto slot itself and the quick key the quick slot; the three others are written by hand. All of them can be loaded. */
export const SAVE_SLOTS = ['auto', 'quick', 'slot-1', 'slot-2', 'slot-3'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
export const HAND_SAVE_SLOTS: readonly SaveSlot[] = ['slot-1', 'slot-2', 'slot-3'];

/**
 * The journey is saved, by hand, by the quick key or by itself, only while he plays: not while he lies fallen, not
 * paused, not between worlds. A capture (a run started by a tool to take pictures or measure) never saves: its journey
 * is staged, and it would write over the player's own saves on that machine.
 */
export function savingAllowed(facts: { playing: boolean; paused: boolean; worldReady?: boolean; capture?: boolean }): boolean {
  return facts.playing && !facts.paused && facts.worldReady !== false && facts.capture !== true;
}

/**
 * The moments the journey saves itself to the auto slot, which Continue loads: the story's own (`story`, an `autosave`
 * event), every `AUTOSAVE_SECONDS` of play (`interval`), and whenever play is left, for the title (`toTitle`) or by the
 * page being hidden or closed (`pageLeft`).
 */
export const AUTOSAVE_MOMENTS = ['story', 'interval', 'toTitle', 'pageLeft'] as const;
export type AutosaveMoment = (typeof AUTOSAVE_MOMENTS)[number];

/**
 * Whether the journey saves itself at this moment, and whether that also moves where he wakes after a fall. The story's
 * moments save whenever saving is allowed and move where he wakes (`respawnAfter`); the quiet ones save only once the
 * journey has begun (`journeyBegun`), so a new run that has done nothing yet keeps an earlier save, and leave where he
 * wakes alone.
 */
export function autosaveAt(moment: AutosaveMoment, facts: { playing: boolean; paused: boolean; begun: boolean; capture?: boolean }): { save: boolean; movesWaking: boolean } {
  const allowed = savingAllowed(facts);
  return moment === 'story' ? { save: allowed, movesWaking: allowed } : { save: allowed && facts.begun, movesWaking: false };
}

/** Fallen through the ground: beneath it by `UNDER_WORLD.depth`, and neither swimming, in the archive nor in the saddle. */
export function belowTheWorld(facts: { y: number; ground: number; swimming: boolean; inArchive: boolean; riding: boolean }): boolean {
  return !facts.swimming && !facts.inArchive && !facts.riding && facts.y < facts.ground - UNDER_WORLD.depth;
}

/** How long he has now stood beneath the land: longer while he is below, from nothing once he is not. */
export function underWorldSeconds(seconds: number, dt: number, below: boolean): number {
  return below ? seconds + dt : 0;
}

/** Whether he has been below long enough to be set back on safe ground. */
export function recoversFromUnderWorld(seconds: number): boolean {
  return seconds >= UNDER_WORLD.seconds;
}

/** A resident's body is this wide and every standing body this tall, to whatever must go round it (m). */
export const STANDING_BODY = {
  residentRadius: RESIDENT.radius, height: 2.1,
  /** To a hostile finding its footing the wanderer is a body this wide and this tall (m). */
  heroRadius: 0.32, heroHeight: 1.8,
  /** A living animal's body is its box and this much more each way (m). */
  animalMargin: 0.07,
} as const;

/** A body that stands in the way of loose cargo, of the animals and of each other. */
export interface StandingBody { id: string; x: number; y: number; z: number; radius: number; height: number; active: boolean }

/**
 * The residents and hostiles as bodies in the way: a resident counts while they are solid and about (not withdrawn
 * from the world by the story), a hostile while alive.
 */
export function standingBodies(residents: Iterable<{ id: string; x: number; y: number; z: number; solid: boolean }>, about: (id: string) => boolean,
  hostiles: Iterable<{ id: string; x: number; y: number; z: number; radius: number; alive: boolean }>): StandingBody[] {
  const bodies: StandingBody[] = [];
  for (const n of residents) bodies.push({ id: `person:${n.id}`, x: n.x, y: n.y, z: n.z, radius: STANDING_BODY.residentRadius, height: STANDING_BODY.height, active: n.solid && about(n.id) });
  for (const e of hostiles) bodies.push({ id: `enemy:${e.id}`, x: e.x, y: e.y, z: e.z, radius: e.radius, height: STANDING_BODY.height, active: e.alive });
  return bodies;
}

/** The places he has just come within reach of and has not been to before. */
export function placesReached(discovered: Partial<Record<PlaceId, unknown>>, x: number, z: number): PlaceId[] {
  const reached: PlaceId[] = [];
  for (const [id, place] of Object.entries(PLACES) as [PlaceId, { x: number; z: number; r: number }][]) {
    if (!discovered[id] && Math.hypot(x - place.x, z - place.z) < place.r) reached.push(id);
  }
  return reached;
}

/* ============================ The deer ============================ */

/** He may go to the deer's side only afoot, alive, out of the water, with the world running and not already getting up or down. */
export function mayMount(facts: { playing: boolean; riding: boolean; mounting: boolean; alive: boolean; swimming: boolean }): boolean {
  return facts.playing && !facts.riding && !facts.mounting && facts.alive && !facts.swimming;
}

/** The one kind of animal that can be ridden: a tame deer that walks (the saddled one at the caravan rest). */
export function rideable(animal: { species: string; tame?: boolean; seated?: boolean }): boolean {
  return animal.species === 'deer' && !!animal.tame && !animal.seated;
}

/** Loaded in the saddle, he waits where he is for the deer to arrive; having gone further than this (m) he stays afoot. */
export const AWAITED_MOUNT_REACH = 1;

/** Whether the saddle a load promised him is given up: he found another way up, fell, swam off or walked away. */
export function awaitedMountLapsed(facts: { riding: boolean; mounting: boolean; alive: boolean; swimming: boolean; strayed: number }): boolean {
  return facts.riding || facts.mounting || !facts.alive || facts.swimming || facts.strayed > AWAITED_MOUNT_REACH;
}

/**
 * Whether a rider is put down at once: dead, in deep water, off the ground (riding off a ledge is a fall), doing
 * anything but sitting or flinching, or with no deer under him. A blow in the saddle is a flinch there, not a fall.
 */
export function mustDismount(facts: { alive: boolean; swimming: boolean; state: string; grounded: boolean; deerHere: boolean }): boolean {
  const seated = facts.state === 'free' || facts.state === 'hurt';
  return !facts.alive || facts.swimming || !seated || !facts.grounded || !facts.deerHere;
}

/* ============================ The archive's door, and timed work ============================ */

/**
 * Trying the archive's door: withdrawn once access has been lost; opened with the borrowed key if he has it, else by
 * the steward's leave; otherwise locked.
 */
export function archiveDoorAttempt(s: WorldState): { opens: 'borrowed_key' | 'permission' } | { refused: 'withdrawn' | 'locked' } {
  if (s.facts.archive_access_lost === true) return { refused: 'withdrawn' };
  if (itemCount(s, 'archive_key') > 0) return { opens: 'borrowed_key' };
  if (hasFact(s, 'edda_permission')) return { opens: 'permission' };
  return { refused: 'locked' };
}

/** Whether the archive can be seen into: its door opened or its shutter forced. */
export function archiveOpen(s: WorldState): boolean {
  return s.locationChanges.archive_door === 'open' || s.locationChanges.archive_shutter === 'forced';
}

/** Whether leaving the archive just now is when it is closed behind him: sealed or locked, and reported. */
export function archiveClosesBehind(s: WorldState): boolean {
  return (s.locationChanges.archive_shutter === 'sealed' || s.locationChanges.archive_door === 'locked') && s.facts.archive_reported === true;
}

/** Work that takes a while: the rite at the spring, bracing the sluice (s). The view shakes this much at a surge and at a jam. */
export const TIMED_WORK = { rite: 3.0, brace: 2.8 } as const;
export const SHAKE = { surge: 0.6, jam: 0.4 } as const;

/** Whether he can begin the rite: taught it, and with a reed to offer. */
export function riteReady(s: WorldState): boolean {
  return hasFact(s, 'rite_taught') && itemCount(s, 'votive_reed') >= 1;
}

/* ============================ What the journey points to ============================ */

/** The objective's line: the hunt's while it leads, the investigation's otherwise. */
export function objectiveKey(s: WorldState, questKey: string): string {
  return huntingHint(s) ?? questKey;
}

/**
 * The place the map marks for the objective: the investigation's, or while hunting leads, the hunter's camp in the
 * deepwood for his kit and arrows, and no single place for the hunt itself.
 */
export function objectivePlace(s: WorldState, quest: PlaceId | null): PlaceId | null {
  const hunting = huntingHint(s);
  if (!hunting) return quest;
  return hunting === 'hunting.objective.kit' || hunting === 'hunting.objective.spare' || hunting === 'hunting.objective.restock' ? 'deepwood' : null;
}
