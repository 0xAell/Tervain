import { AMBIENT_RESIDENTS } from '../content/ambientPeople';
import { ANIMALS, ANIMAL_SPEEDS, ANIMAL_TEMPERAMENT, ANIMAL_TRIANGLE_LIMIT, requiredAnimalClips } from '../content/animals';
import { NPC_OBSERVATIONS } from '../content/arrival';
import { DIALOGUE_NODES, DIALOGUE_STRINGS } from '../content/dialogue';
import { ENEMY_ARCHETYPES, ENEMY_IDLE_YAW, ENEMY_POST_YAW, ENEMY_VARIANT } from '../content/enemies';
import { INSPECT_POINTS } from '../content/inspect';
import { ITEMS, ITEM_ORDER, itemAction } from '../content/items';
import { BARKS, NPCS } from '../content/npcs';
import { WORLD_PICKUP_ITEM_IDS } from '../content/pickups';
import { EN } from '../content/strings';
import { HERO_LINES, SCENE_REACH, SCENES, SPEAKER_NAMES, TALKS, VOICE_LINES } from '../content/voice';
import { APPLY_DELAY_MIN, CLOCK_RATE, REPORT_DELAY_MIN, REWARD_COIN, RITE_CALM_MIN, TRAINING_COST } from '../game/constants';
import {
  ANIMAL_IDS, ANIMAL_MODEL_IDS, ANIMAL_SPECIES, animalLoot, ARROW_QUIVER_CAPACITY, ARROW_RESTOCK_AMOUNT, CARCASS_HOURS, HUNTABLE_ANIMAL_IDS,
  HUNTER_MEAT_PRICE, HUNTER_RANKS, HUNTER_SPARE_ARROWS, HUNTING_ARROW_RANGE, PROTECTED_ANIMAL_IDS, SKINNING_REACH, SKINNING_SECONDS,
  WILDLIFE_RETURN_DISTANCE, WILDLIFE_RETURN_HOURS, WOUND_HOURS,
} from '../game/hunting';
import { PLACE_ORDER } from '../game/journal';
import { MAP_MARKER_BOUNDS } from '../game/map';
import {
  ALLOCATIONS, CONTENT_REVISION, DECISION_MAKERS, EVIDENCE_IDS, GATE_STATES, NPC_IDS, PARTIES, PARTY_NPC, PHASE_ORDER, PRINCIPALS, QUICK_SLOT_COUNT,
  SAVE_FORMAT_VERSION, WRECK_BLADE_PICKUP,
} from '../game/types';
import { ANIMAL_BEHAVIOUR } from '../rules/animalBehaviour';
import { GROUND_TARGET_HEIGHT, INTERACT_EYE_HEIGHT } from '../rules/interaction';
import { interactableTable, RESIDENT_REACH_HEIGHT, RIDER_REACH_HEIGHT } from '../rules/interactables';
import { MUSIC } from '../content/music';
import { MUSIC_PACING, PLACE_REGION, PLAYLISTS, REGION_STING, THREAT_LOOPS } from '../rules/music';
import { BEDS, emitterRuleTable, INN, MILL_SOUND, QUARRY_SOUND } from '../rules/soundscape';
import { BOW } from '../rules/bow';
import { AIM_VIEW, CAMERA, ROOM_CAMERA } from '../rules/camera';
import { NIGHT, nightness, SUNRISE_HOUR, SUNSET_HOUR } from '../rules/dayNight';
import { DOORS } from '../rules/doors';
import {
  ACTION_COST, ACTION_SECONDS, BLADE, DODGE, ENGAGED_REACH, FIRM_FOOTING_SLOPE, FISTS, GRAVITY, GROUND_FOLLOW_DROP, GUARD, HIT_AT, JUMP_SPEED,
  MOVE_RESPONSE, PERFECT_BLOCK_WINDOW, SHEATHE_AFTER, STAMINA, STEP_HEIGHT, SWIM_DEPTH, SWIM_EXIT, SWIM_FLOAT, SWIM_SPEED, SWIM_SPRINT, VAULT,
} from '../rules/hero';
import { HERO_GUARD_SPEED, HERO_RUN_CYCLE, HERO_RUN_SPEED, HERO_RUN_THRESHOLD, HERO_WALK_CYCLE, HERO_WALK_SPEED } from '../rules/heroLocomotion';
import { HOSTILE } from '../rules/hostile';
import {
  AUTOSAVE_SECONDS, CHECKPOINT_CLEARANCE, DEATH, DROUGHT_BELL, HIT_STOP, OVERHEAR_REACH, SPEECH_SOON_REACH, THREAT_REACH, UNDER_WORLD,
  WITNESS_REACH, WITNESSES, WOUNDED_BELOW,
} from '../rules/journey';
import { RESIDENT } from '../rules/resident';
import { DEER_BODY, MOUNT_SIDE, MOUNT_STAMINA, MOUNT_TIMES, RIDE, RIDE_CAMERA } from '../rules/riding';
import { BIOME_IDS, BIOME_REGIONS } from '../world/biomes';
import { DRESSING } from '../world/dressing';
import { Exclusions } from '../world/exclusions';
import { DETAIL_KEEP } from '../world/detail';
import { createForestFloorPopulation, FOREST_FLOOR_DISTANCE } from '../world/forestFloor';
import { createShoreDetailPopulation, placeScatter, ROCK_SHAPE_COUNT } from '../world/scatter';
import { createFloraPopulation } from '../world/flora';
import { FOREST_CLEARINGS, FOREST_OPENINGS } from '../world/forest';
import { FURNITURE } from '../world/furniture';
import { LAYERS } from '../world/groundLayers';
import { RESIDENT_HOMES } from '../world/homes';
import { houseYard } from '../world/houseYards';
import { hearthOf, INTERIORS } from '../world/interiors';
import {
  ANCHORS, ARCHIVE_ROOM, ARCHIVE_SHUTTER, ARRIVAL_ROUTE, ARRIVAL_SIGN, ARRIVAL_TRAIL_WIDTH, ARRIVAL_WRECK, BELL, BELL_TOWER, BORDER_SIGN, BUILDINGS,
  COAST, COASTAL, DECKS, DEEP_WATER, ENEMY_SPAWNS, FIELDS, FORD, FOREST_REGION, FOREST_RUIN, FOREST_WAYMARKERS, HAMLET_PROPS, HUNTER_CAMP, HUNTER_SUPPLY,
  INLAND_HAMLET, INSPECT_LOCATIONS, LANTERN_ROUTE, LANTERN_TRAIL_WIDTH, LANTERNS, LEDGER, LIGHTHOUSE, MILL_WHEEL, ORCHARD, PALISADE, PICKUP_LOCATIONS,
  PLACES, RESULT_CHECKS, RITE_ALTAR, ROADS, SEA_LEVEL, SHORTCUT, SLUICE, SPAWN, SPRING_POOL, STRAND, STREAMS, VALLEY, VILLAGE_HANDCART, WAGON, WELL, WORLD,
} from '../world/layout';
import { FLOAT_LINE, PHYSICAL_PROPS, PROP_WATER_DRAG } from '../world/physicalProps';
import { PLAYER_BODY_HEIGHT, PLAYER_BODY_RADIUS } from '../world/playerPlacement';
import type { Terrain } from '../world/terrain';
import { REALM_WIND } from '../world/wind';

/**
 * The game's data as plain documents another engine can read: every table the core authors or derives, in the core's
 * own units (metres, seconds, radians; x east, z south, y up). `tools/export-data.mjs` writes them under `data/`, and
 * `tests/core/dataExport.test.ts` fails when the files there no longer match what the core produces.
 */
export interface PortableDocument {
  /** Path under `data/`, with forward slashes. */
  path: string;
  /** One line on what the document holds; written into it as `about`. */
  about: string;
  data: Record<string, unknown>;
}

/** Numbers are kept to six decimals so the files are readable and stable; what cannot be JSON becomes null. */
export function tidy(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 + 0 : null;
  if (Array.isArray(value)) return value.map(tidy);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined && typeof item !== 'function') out[key] = tidy(item);
    return out;
  }
  return value;
}

function game(): PortableDocument[] {
  return [
    {
      path: 'game/quest.json',
      about: 'The Dry Bell quest’s vocabulary and timings: phases, evidence, parties, residents’ roles, places, save identity.',
      data: {
        saveFormatVersion: SAVE_FORMAT_VERSION, contentRevision: CONTENT_REVISION,
        phases: PHASE_ORDER, evidence: EVIDENCE_IDS, allocations: ALLOCATIONS, gateStates: GATE_STATES,
        parties: PARTIES, partyResident: PARTY_NPC, principals: PRINCIPALS, decisionMakers: DECISION_MAKERS, residents: NPC_IDS,
        places: PLACE_ORDER, firstWeaponPickup: WRECK_BLADE_PICKUP, quickSlots: QUICK_SLOT_COUNT,
        minutes: { reportDelay: REPORT_DELAY_MIN, riteCalm: RITE_CALM_MIN, applyDelay: APPLY_DELAY_MIN },
        coin: { training: TRAINING_COST, reward: REWARD_COIN },
        mapMarkerBounds: MAP_MARKER_BOUNDS,
      },
    },
    {
      path: 'game/items.json',
      about: 'Every item: display string keys, kind, what using it does, and the order of the inventory panel.',
      data: { items: Object.values(ITEMS).map((item) => ({ ...item, action: itemAction(item.id) })), order: ITEM_ORDER, worldPickupItems: WORLD_PICKUP_ITEM_IDS },
    },
    {
      path: 'game/residents.json',
      about: 'The named residents (role ids, schedules, overrides, homes) and the hamlet’s three silent residents.',
      data: {
        residents: Object.values(NPCS).map((def) => ({ ...def, observation: NPC_OBSERVATIONS[def.id], berth: RESIDENT_HOMES[def.id] ?? null })),
        ambient: AMBIENT_RESIDENTS, barks: BARKS, movement: RESIDENT,
      },
    },
    {
      path: 'game/dialogue.json',
      about: 'The dialogue graph: nodes, choices, conditions and effects. Text is in strings.en.json under each node’s and choice’s key.',
      data: { nodes: Object.values(DIALOGUE_NODES) },
    },
    {
      path: 'game/inspections.json',
      about: 'What can be examined in the world: requirements, effects and the notice shown. Positions are in world/layout.json.',
      data: { points: Object.values(INSPECT_POINTS) },
    },
    {
      path: 'game/interactables.json',
      about: 'Everything the wanderer can act on: where it is, how near he must come, its place in the order of offers (lower first; each whole step outweighs two metres), the solids that are the thing itself, the facts of the moment it needs, and what acting on it does. When the state offers each, and its prompt, are rules in core/rules/interactables.ts.',
      data: {
        reachHeights: { resident: RESIDENT_REACH_HEIGHT, rider: RIDER_REACH_HEIGHT, groundPoint: GROUND_TARGET_HEIGHT, eye: INTERACT_EYE_HEIGHT },
        interactables: interactableTable().map((entry) => ({ id: entry.id, place: entry.place, reach: entry.reach, priority: entry.priority, ignoreColliders: entry.ignoreColliders ?? [], needs: entry.needs, act: entry.act })),
      },
    },
    {
      path: 'game/sound.json',
      about: 'The in-world score and the world’s sound, as the rules see them: the pieces of the score with their purpose, origin and length in seconds; which pieces answer each mood, threat and place; the score’s pacing in seconds and metres; the looping beds of the soundscape; and the single calls placed around the listener, with how often each comes at full density. Where each bed is heard, and how dense each call is by place and hour, are rules in core/rules/soundscape.ts; the mood of a place and the threat of a moment are rules in core/rules/music.ts.',
      data: {
        music: Object.entries(MUSIC).map(([id, entry]) => ({ id, title: null, ...entry })),
        playlists: PLAYLISTS, threatLoops: THREAT_LOOPS, placeRegion: PLACE_REGION, regionSting: REGION_STING, pacing: MUSIC_PACING,
        beds: BEDS, calls: emitterRuleTable(), pointSources: { millWheel: MILL_SOUND, quarryWork: QUARRY_SOUND, inn: { x: INN.x, z: INN.z } },
      },
    },
    {
      path: 'game/voice.json',
      about: 'Spoken lines by key, residents’ exchanges with the wanderer, overheard scenes and the wanderer’s own remarks.',
      data: { speakers: SPEAKER_NAMES, lines: VOICE_LINES, talks: TALKS, scenes: SCENES, sceneReach: SCENE_REACH, hero: HERO_LINES },
    },
    {
      path: 'game/strings.en.json',
      about: 'English display text by key: interface and world strings, then dialogue strings.',
      data: { strings: EN, dialogue: DIALOGUE_STRINGS },
    },
    {
      path: 'game/animals.json',
      about: 'The nineteen animals, each kind’s paces and temperament, their behaviour, and the hunting rules.',
      data: {
        animals: ANIMALS.map((animal) => {
          const hunt = ANIMAL_IDS.find((id) => ANIMAL_MODEL_IDS[id] === animal.id)!;
          return { ...animal, huntId: hunt, huntSpecies: ANIMAL_SPECIES[hunt], huntable: HUNTABLE_ANIMAL_IDS.includes(hunt), clips: requiredAnimalClips(animal), loot: animalLoot(hunt) };
        }),
        species: Object.fromEntries(Object.keys(ANIMAL_SPEEDS).map((species) => [species, { ...ANIMAL_SPEEDS[species as keyof typeof ANIMAL_SPEEDS], ...ANIMAL_TEMPERAMENT[species as keyof typeof ANIMAL_TEMPERAMENT] }])),
        behaviour: ANIMAL_BEHAVIOUR, triangleLimit: ANIMAL_TRIANGLE_LIMIT, protected: PROTECTED_ANIMAL_IDS,
        hunting: {
          arrowRange: HUNTING_ARROW_RANGE, skinningReach: SKINNING_REACH, skinningSeconds: SKINNING_SECONDS, quiverCapacity: ARROW_QUIVER_CAPACITY,
          restockArrows: ARROW_RESTOCK_AMOUNT, spareArrows: HUNTER_SPARE_ARROWS, meatPrice: HUNTER_MEAT_PRICE, ranks: HUNTER_RANKS,
          returnHours: WILDLIFE_RETURN_HOURS, carcassHours: CARCASS_HOURS, woundHours: WOUND_HOURS, returnDistance: WILDLIFE_RETURN_DISTANCE,
        },
      },
    },
    {
      path: 'game/enemies.json',
      about: 'Hostile archetypes, their posts, and the numbers of an encounter.',
      data: {
        archetypes: ENEMY_ARCHETYPES,
        posts: ENEMY_SPAWNS.map((spawn) => ({ ...spawn, idleYaw: ENEMY_POST_YAW[spawn.id] ?? ENEMY_IDLE_YAW, variant: ENEMY_VARIANT[spawn.id] ?? 0 })),
        encounter: HOSTILE,
      },
    },
    {
      path: 'game/tuning.json',
      about: 'Designer-tunable values by system: the hero, riding, the bow, the day’s clock, the journey, the camera and doors.',
      data: {
        hero: {
          body: { radius: PLAYER_BODY_RADIUS, height: PLAYER_BODY_HEIGHT },
          paces: { walk: HERO_WALK_SPEED, run: HERO_RUN_SPEED, guard: HERO_GUARD_SPEED, runThreshold: HERO_RUN_THRESHOLD, walkCycle: HERO_WALK_CYCLE, runCycle: HERO_RUN_CYCLE },
          stamina: STAMINA, actionCost: ACTION_COST, actionSeconds: ACTION_SECONDS, hitAt: HIT_AT, perfectBlockWindow: PERFECT_BLOCK_WINDOW,
          arms: { fists: FISTS, blade: BLADE }, sheatheAfter: SHEATHE_AFTER, engagedReach: ENGAGED_REACH, guard: GUARD,
          dodge: DODGE, jumpSpeed: JUMP_SPEED, gravity: GRAVITY, stepHeight: STEP_HEIGHT, groundFollowDrop: GROUND_FOLLOW_DROP,
          firmFootingSlope: FIRM_FOOTING_SLOPE, moveResponse: MOVE_RESPONSE, vault: VAULT,
          swim: { depth: SWIM_DEPTH, exit: SWIM_EXIT, float: SWIM_FLOAT, speed: SWIM_SPEED, sprint: SWIM_SPRINT },
        },
        riding: { ride: RIDE, deerBody: DEER_BODY, mountTimes: MOUNT_TIMES, mountSide: MOUNT_SIDE, camera: RIDE_CAMERA, stamina: MOUNT_STAMINA },
        bow: BOW,
        clock: {
          gameMinutesPerSecond: CLOCK_RATE, sunrise: SUNRISE_HOUR, sunset: SUNSET_HOUR, night: NIGHT,
          nightnessByHour: Array.from({ length: 49 }, (_, i) => ({ hour: i / 2, nightness: nightness(i / 2 % 24) })),
        },
        journey: {
          autosaveSeconds: AUTOSAVE_SECONDS, hitStop: HIT_STOP, death: DEATH, threatReach: THREAT_REACH, checkpointClearance: CHECKPOINT_CLEARANCE,
          underWorld: UNDER_WORLD, witnesses: WITNESSES, witnessReach: WITNESS_REACH, overhearReach: OVERHEAR_REACH, speechSoonReach: SPEECH_SOON_REACH,
          woundedBelow: WOUNDED_BELOW, droughtBell: DROUGHT_BELL,
        },
        camera: { follow: CAMERA, aim: AIM_VIEW, room: ROOM_CAMERA },
        doors: DOORS,
        wind: REALM_WIND,
      },
    },
  ];
}

function world(terrain: Terrain): PortableDocument[] {
  const height = (p: { x: number; z: number }) => terrain.heightAt(p.x, p.z);
  const grounded = <T extends { x: number; z: number }>(p: T) => ({ ...p, y: height(p) });
  const exclusions = new Exclusions(terrain), trees = createFloraPopulation(terrain, exclusions);
  const floor = createForestFloorPopulation(terrain, exclusions, trees);
  // Where a stone lies does not depend on its shape; its resting height and its solid do, and are the port's own.
  const stones = placeScatter(terrain, exclusions, trees, { groundedY: (rock, heightAt) => heightAt(rock.x, rock.z), contact: (rock, id) => ({ id, bounds: { minY: 0, maxY: rock.size } }) as never });
  const count: Record<string, number> = {};
  for (const tree of trees) count[tree.sp] = (count[tree.sp] ?? 0) + 1;
  return [
    {
      path: 'world/layout.json',
      about: 'The authored geography: bounds, regions, coast, water, roads, places, buildings, anchors and everything placed by hand.',
      data: {
        bounds: WORLD, seaLevel: SEA_LEVEL, deepWater: DEEP_WATER, regions: { valley: VALLEY, coastal: COASTAL, forest: FOREST_REGION, hamlet: INLAND_HAMLET, strand: STRAND, orchard: ORCHARD },
        coast: COAST, streams: STREAMS, ford: FORD, springPool: SPRING_POOL, decks: DECKS,
        roads: ROADS, arrivalRoute: { points: ARRIVAL_ROUTE, width: ARRIVAL_TRAIL_WIDTH }, lanternRoute: { points: LANTERN_ROUTE, width: LANTERN_TRAIL_WIDTH },
        spawn: grounded(SPAWN), places: Object.fromEntries(Object.entries(PLACES).map(([id, place]) => [id, grounded(place)])),
        anchors: Object.fromEntries(Object.entries(ANCHORS).map(([id, anchor]) => [id, grounded(anchor)])),
        buildings: BUILDINGS.map((building) => ({ ...building, ground: height(building) })),
        fields: FIELDS, palisade: PALISADE, lanterns: LANTERNS.map(grounded),
        landmarks: {
          lighthouse: LIGHTHOUSE, wreck: ARRIVAL_WRECK, arrivalSign: ARRIVAL_SIGN, borderSign: BORDER_SIGN, bell: BELL, bellTower: BELL_TOWER, well: WELL,
          millWheel: MILL_WHEEL, wagon: WAGON, handcart: VILLAGE_HANDCART, forestRuin: FOREST_RUIN, waymarkers: FOREST_WAYMARKERS, hunterCamp: HUNTER_CAMP,
          hunterSupply: HUNTER_SUPPLY, hamletProps: HAMLET_PROPS,
        },
        quest: { sluice: SLUICE, riteAltar: RITE_ALTAR, ledger: LEDGER, archiveShutter: ARCHIVE_SHUTTER, archiveRoom: ARCHIVE_ROOM, shortcut: SHORTCUT, resultChecks: RESULT_CHECKS },
        inspectLocations: INSPECT_LOCATIONS.map(grounded), pickups: PICKUP_LOCATIONS.map(grounded),
        looseCargo: { props: PHYSICAL_PROPS.map(grounded), floatLine: FLOAT_LINE, waterDrag: PROP_WATER_DRAG },
        forest: { openings: FOREST_OPENINGS, clearings: FOREST_CLEARINGS }, biomes: { ids: BIOME_IDS, regions: BIOME_REGIONS },
        groundLayers: LAYERS,
      },
    },
    {
      path: 'world/interiors.json',
      about: 'Each walk-in building’s room, hearth, furniture, dressing and yard. Positions are in the building’s own frame (x along its width, z towards its front door).',
      data: {
        rooms: INTERIORS.map((room) => ({
          building: room.building.id, wall: room.wall, wallBase: room.wallBase, floorTop: room.floorTop, wallTop: room.wallTop, door: room.door,
          hearth: hearthOf(room),
          furniture: FURNITURE.filter((piece) => piece.room === room).map(({ room: _room, ...piece }) => piece),
          dressing: DRESSING.filter((piece) => piece.room === room).map(({ room: _room, ...piece }) => piece),
        })),
        yards: BUILDINGS.map((building) => ({ building: building.id, props: houseYard(building) })).filter((yard) => yard.props.length > 0),
      },
    },
    {
      path: 'world/flora.json',
      about: 'Where every tree stands, as the planting rule places it without measuring any tree model: species, variant, position, scale, facing and trunk radius.',
      data: {
        count,
        trees: trees.map((tree) => ({ species: tree.sp, variant: tree.v, x: tree.x, y: tree.y, z: tree.z, scale: tree.s, yaw: tree.yaw, radius: tree.radius, age: tree.age ?? null, stand: tree.standId ?? null })),
      },
    },
    {
      path: 'world/placement.json',
      about: 'What lies and grows on the ground besides the trees, as the placement rules author it once from fixed seeds: the woodland floor (ferns, shrubs, moss, litter, fallen logs and their fungi), the loose stone (beach pebbles, surf rocks, sea stacks, inland erratics, the lighthouse’s boulders, shelf stone) and the shore’s driftwood and scrub. `rank` is 0 to 1: a detail level keeps what ranks below its share in `detailKeep`; stones with an obstacle radius, sea stacks and stones large enough to be solid are kept at every level. A stone’s resting height is left to its own shape: `groundY` is the ground under its centre.',
      data: {
        detailKeep: DETAIL_KEEP, woodlandFloorFade: FOREST_FLOOR_DISTANCE, stoneShapes: ROCK_SHAPE_COUNT,
        woodlandFloor: floor.map((piece) => ({ id: piece.id, kind: piece.kind, x: piece.x, y: piece.y, z: piece.z, yaw: piece.yaw, scale: piece.scale, rank: piece.rank, variant: piece.variant, colony: piece.colonyId ?? null, onLog: piece.parentLogId ?? null })),
        stones: stones.map((rock) => ({ kind: rock.kind, x: rock.x, groundY: terrain.heightAt(rock.x, rock.z), z: rock.z, size: rock.size, shape: rock.shape, yaw: rock.yaw, squash: rock.squash, rank: rock.decorationRank, obstacleRadius: rock.radius, solid: rock.size >= 0.35 })),
        shore: createShoreDetailPopulation(terrain, exclusions, trees).map((detail) => ({ kind: detail.kind, x: detail.x, y: detail.y, z: detail.z, yaw: detail.yaw, scale: detail.scale, rank: detail.rank })),
      },
    },
  ];
}

/** Every document, in a fixed order. The terrain is built by the caller so tools and tests can share one. */
export function portableDocuments(terrain: Terrain): PortableDocument[] {
  return [...game(), ...world(terrain)].map((doc) => ({ ...doc, data: tidy({ about: doc.about, units: 'metres, seconds, radians; x east, z south, y up', ...doc.data }) as Record<string, unknown> }));
}
