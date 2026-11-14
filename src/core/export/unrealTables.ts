import { ANIMALS, ANIMAL_SPEEDS, ANIMAL_TEMPERAMENT } from '../content/animals';
import { DIALOGUE_STRINGS } from '../content/dialogue';
import { ENEMY_ARCHETYPES, ENEMY_IDLE_YAW, ENEMY_POST_YAW } from '../content/enemies';
import { ITEMS, itemAction } from '../content/items';
import { NPCS } from '../content/npcs';
import { EN } from '../content/strings';
import { Exclusions } from '../world/exclusions';
import { createFloraPopulation } from '../world/flora';
import { BUILDINGS, ENEMY_SPAWNS, PLACES } from '../world/layout';
import { PHYSICAL_PROPS } from '../world/physicalProps';
import type { Terrain } from '../world/terrain';

/**
 * The same data shaped for Unreal Engine's DataTable importer: one JSON array of rows per table, each row an object
 * with `Name` and fields named as the members of the row struct it is meant for. Positions are converted to Unreal's
 * units and axes here, once, so nothing downstream has to.
 */

/** Core metres (x east, y up, z south) to Unreal centimetres (X east, Y south, Z up): a left-handed frame, as glTF import gives. */
export const toUnreal = (x: number, y: number, z: number) => ({ X: round(x * 100), Y: round(z * 100), Z: round(y * 100) });
/** A core yaw (radians, 0 faces +z, front = (sin, cos)) as an Unreal yaw in degrees for an asset whose forward is +X. */
export const yawToUnreal = (yaw: number) => { const d = 90 - yaw * 180 / Math.PI; return round(((d + 180) % 360 + 360) % 360 - 180); };
const round = (v: number) => Math.round(v * 1000) / 1000 + 0;
const pascal = (text: string) => text.replace(/(^|[_\-\s.])(\w)/g, (_m, _s, c: string) => c.toUpperCase());

export interface UnrealTable {
  /** File name under `data/unreal/`. */
  file: string;
  /** The Unreal row struct these rows are shaped for. */
  rowStruct: string;
  rows: Record<string, unknown>[];
}

export const UNREAL_CONVENTIONS = {
  about: 'How core values become Unreal values in data/unreal. The canonical data elsewhere under data/ stays in core units.',
  core: { length: 'metres', angle: 'radians', axes: 'x east, y up, z south (right-handed, as glTF)', yaw: '0 faces +z; front = (sin yaw, cos yaw)' },
  unreal: { length: 'centimetres', angle: 'degrees', axes: 'X east, Y south, Z up (left-handed)', yaw: 'FRotator yaw, 0 faces +X, positive turns towards +Y' },
  position: 'Unreal (X, Y, Z) = core (x, z, y) × 100',
  yawForForwardX: 'UnrealYaw = 90 − coreYaw × 180/π, for assets authored with Unreal’s forward (+X)',
  yawForImportedGltf: 'UnrealYaw = −coreYaw × 180/π, for meshes imported from glTF, whose front (+z) arrives as +Y',
  scale: 'uniform scales carry over unchanged',
};

export function unrealTables(terrain: Terrain): UnrealTable[] {
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const trees = createFloraPopulation(terrain, new Exclusions(terrain));
  return [
    {
      file: 'DT_Items.json', rowStruct: 'FTervainItemRow',
      rows: Object.values(ITEMS).map((item) => ({ Name: item.id, NameKey: item.nameKey, DescriptionKey: item.descKey, Kind: pascal(item.kind), HealAmount: item.healAmount ?? 0, Action: pascal(itemAction(item.id) ?? 'none') })),
    },
    {
      file: 'DT_AnimalSpecies.json', rowStruct: 'FTervainAnimalSpeciesRow',
      rows: Object.keys(ANIMAL_SPEEDS).map((species) => {
        const pace = ANIMAL_SPEEDS[species as keyof typeof ANIMAL_SPEEDS], temper = ANIMAL_TEMPERAMENT[species as keyof typeof ANIMAL_TEMPERAMENT];
        return { Name: species, WalkSpeed: round(pace.walk * 100), RunSpeed: round(pace.run * 100), NoticeDistance: round(pace.notice * 100), FleeDistance: round(pace.flee * 100), HoldUntil: temper.holdUntil, HerdAlarmDistance: round(temper.herd * 100) };
      }),
    },
    {
      file: 'DT_Animals.json', rowStruct: 'FTervainAnimalRow',
      rows: ANIMALS.map((animal) => ({
        Name: `${animal.species}-${animal.id}`, Species: animal.species, SourceModel: animal.file, Habitat: pascal(animal.habitat),
        Home: toUnreal(animal.home.x, ground(animal.home.x, animal.home.z), animal.home.z), RoamRadius: round(animal.roam * 100),
        bSeated: !!animal.seated, bTame: !!animal.tame, HomeYaw: animal.homeYaw === undefined ? 0 : yawToUnreal(animal.homeYaw), bHasHomeYaw: animal.homeYaw !== undefined,
      })),
    },
    {
      file: 'DT_EnemyArchetypes.json', rowStruct: 'FTervainEnemyArchetypeRow',
      rows: Object.entries(ENEMY_ARCHETYPES).map(([kind, a]) => ({
        Name: kind, DisplayName: a.name, Health: a.hp, Speed: round(a.speed * 100), Reach: round(a.reach * 100), WindUpSeconds: a.wind, StrikeSeconds: a.strike,
        RecoverSeconds: a.recover, Damage: a.damage, NoticeDistance: round(a.notice * 100), bHeavy: a.heavy, Radius: round(a.radius * 100),
      })),
    },
    {
      file: 'DT_EnemyPosts.json', rowStruct: 'FTervainEnemyPostRow',
      rows: ENEMY_SPAWNS.map((spawn) => ({ Name: spawn.id, Archetype: spawn.kind, Location: toUnreal(spawn.x, ground(spawn.x, spawn.z), spawn.z), Leash: round(spawn.leash * 100), IdleYaw: yawToUnreal(ENEMY_POST_YAW[spawn.id] ?? ENEMY_IDLE_YAW) })),
    },
    {
      file: 'DT_Places.json', rowStruct: 'FTervainPlaceRow',
      rows: Object.entries(PLACES).map(([id, place]) => ({ Name: id, Location: toUnreal(place.x, ground(place.x, place.z), place.z), Radius: round(place.r * 100) })),
    },
    {
      file: 'DT_Buildings.json', rowStruct: 'FTervainBuildingRow',
      rows: BUILDINGS.map((b) => ({ Name: b.id, Kind: pascal(b.kind), Location: toUnreal(b.x, ground(b.x, b.z), b.z), Yaw: yawToUnreal(b.yaw), Width: round(b.w * 100), Depth: round(b.d * 100), WallHeight: round(b.h * 100), Wall: pascal(b.wall), Roof: pascal(b.roof) })),
    },
    {
      file: 'DT_Residents.json', rowStruct: 'FTervainResidentRow',
      rows: Object.values(NPCS).map((def) => ({
        Name: def.id, DisplayName: def.name, TitleKey: def.titleKey, Faction: pascal(def.faction), HomeAnchor: def.home, InteractRadius: round((def.interactRadius ?? 2.7) * 100),
        Schedule: def.schedule.map((entry) => ({ FromHour: entry.from, ToHour: entry.to, Anchor: entry.anchor, Activity: pascal(entry.activity), IndoorPost: entry.inside ?? '' })),
      })),
    },
    {
      file: 'DT_LooseCargo.json', rowStruct: 'FTervainLooseCargoRow',
      rows: PHYSICAL_PROPS.map((prop) => ({ Name: prop.id, DisplayName: prop.name, Kind: pascal(prop.kind), Location: toUnreal(prop.x, ground(prop.x, prop.z), prop.z), Yaw: yawToUnreal(prop.yaw), Size: { X: round(prop.width * 100), Y: round(prop.depth * 100), Z: round(prop.height * 100) }, MassKg: prop.mass })),
    },
    {
      file: 'DT_Trees.json', rowStruct: 'FTervainTreeRow',
      rows: trees.map((tree, index) => ({ Name: `tree_${String(index).padStart(5, '0')}`, Species: tree.sp, Variant: tree.v, Location: toUnreal(tree.x, tree.y, tree.z), Yaw: yawToUnreal(tree.yaw), Scale: round(tree.s), TrunkRadius: round(tree.radius * 100) })),
    },
  ];
}

/** Unreal's string table CSV: a `Key,SourceString` header, then one quoted row per string. */
export function unrealStringTable(): string {
  const quote = (text: string) => `"${text.replace(/"/g, '""').replace(/\r?\n/g, '\\n')}"`;
  const rows = [...Object.entries(EN), ...Object.entries(DIALOGUE_STRINGS)].map(([key, text]) => `${quote(key)},${quote(text)}`);
  return ['Key,SourceString', ...rows].join('\n') + '\n';
}
