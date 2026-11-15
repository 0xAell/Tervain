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
 * The same data shaped for Unreal Engine: one JSON array of rows per table, as Unreal's DataTable importer reads, and
 * the C++ row structs those rows fill. Both come from the table definitions below, so a row's fields and its struct's
 * members cannot drift apart. Positions are converted to Unreal's units and axes here, once.
 */

/** Core metres (x east, y up, z south) to Unreal centimetres (X east, Y south, Z up): a left-handed frame, as glTF import gives. */
export const toUnreal = (x: number, y: number, z: number) => ({ X: round(x * 100), Y: round(z * 100), Z: round(y * 100) });
/** A core yaw (radians, 0 faces +z, front = (sin, cos)) as an Unreal yaw in degrees for an asset whose forward is +X. */
export const yawToUnreal = (yaw: number) => { const d = 90 - yaw * 180 / Math.PI; return round(((d + 180) % 360 + 360) % 360 - 180); };
const round = (v: number) => Math.round(v * 1000) / 1000 + 0;
const pascal = (text: string) => text.replace(/(^|[_\-\s.])(\w)/g, (_m, _s, c: string) => c.toUpperCase());
const cm = (metres: number) => round(metres * 100);

/** A member's C++ type: a plain type, an enum by name, or an array of another struct. */
export type UnrealType = 'FName' | 'FString' | 'float' | 'int32' | 'bool' | 'FVector' | { enum: string } | { array: string };
export interface UnrealField { type: UnrealType; note: string }
export interface UnrealStruct { name: string; note: string; fields: Record<string, UnrealField> }
export interface UnrealTable extends UnrealStruct {
  /** File name under `data/unreal/`. */
  file: string;
  rows: Record<string, unknown>[];
}

const f = (type: UnrealType, note: string): UnrealField => ({ type, note });

/** Enumerations the rows use, with every value the core's types allow. */
export const UNREAL_ENUMS: Record<string, { note: string; values: readonly string[] }> = {
  ETervainItemKind: { note: 'What an item is.', values: ['Currency', 'Tool', 'Quest', 'Consumable', 'Clothing', 'Weapon', 'Material'] },
  ETervainItemAction: { note: 'What using an item from the hotbar does.', values: ['None', 'Equip', 'Consume'] },
  ETervainAnimalHabitat: { note: 'The ground an animal keeps to.', values: ['Settlement', 'CaravanRest', 'Woodland', 'Deepwood', 'RockyWoodland', 'WarmWoodland'] },
  ETervainBuildingKind: { note: 'What a building is used for.', values: ['House', 'Mill', 'Shrine', 'Archive', 'Office', 'Hut', 'Inn', 'Bakery', 'Reeve', 'Bunks', 'Lodge', 'Fisher', 'Store', 'Keeper'] },
  ETervainWall: { note: 'A building’s wall construction.', values: ['Plaster', 'Stone', 'Timber'] },
  ETervainRoof: { note: 'A building’s roof form.', values: ['Gable', 'Hip', 'Lean'] },
  ETervainFaction: { note: 'A resident’s allegiance.', values: ['League', 'Templar', 'Marcher', 'Rimeward', 'Ash', 'Traveler'] },
  ETervainActivity: { note: 'What a resident does at a place.', values: ['Work', 'Stand', 'Sit', 'Talk', 'Rest'] },
  ETervainCargoKind: { note: 'A kind of loose cargo.', values: ['Barrel', 'Crate'] },
};

/** Structs used inside rows. */
export const UNREAL_STRUCTS: UnrealStruct[] = [
  {
    name: 'FTervainScheduleEntry', note: 'One span of a resident’s day. A span may run past midnight (FromHour greater than ToHour).',
    fields: {
      FromHour: f('float', 'Hour of the day the span starts, 0 to 24.'),
      ToHour: f('float', 'Hour of the day the span ends.'),
      Anchor: f('FName', 'The named place they go to (data/world/layout.json, anchors).'),
      Activity: f({ enum: 'ETervainActivity' }, 'What they do there.'),
      IndoorPost: f('FName', 'A furnished spot inside the anchor’s building, or none.'),
    },
  },
];

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
  const location = f('FVector', 'Where it stands, on the ground (cm).');
  return [
    {
      file: 'DT_Items.json', name: 'FTervainItemRow', note: 'An item. The row name is the item’s id.',
      fields: {
        NameKey: f('FString', 'String table key of its name.'),
        DescriptionKey: f('FString', 'String table key of its description.'),
        Kind: f({ enum: 'ETervainItemKind' }, 'What it is.'),
        HealAmount: f('int32', 'Health restored when consumed; 0 for anything else.'),
        Action: f({ enum: 'ETervainItemAction' }, 'What using it does.'),
      },
      rows: Object.values(ITEMS).map((item) => ({ Name: item.id, NameKey: item.nameKey, DescriptionKey: item.descKey, Kind: pascal(item.kind), HealAmount: item.healAmount ?? 0, Action: pascal(itemAction(item.id) ?? 'none') })),
    },
    {
      file: 'DT_AnimalSpecies.json', name: 'FTervainAnimalSpeciesRow', note: 'How a kind of animal moves and meets the hunter. The row name is the species.',
      fields: {
        WalkSpeed: f('float', 'Walking pace (cm/s).'),
        RunSpeed: f('float', 'Running pace (cm/s).'),
        NoticeDistance: f('float', 'It looks up at the hunter within this distance (cm).'),
        FleeDistance: f('float', 'It flees, or a predator stands its ground, within this distance (cm).'),
        HoldUntil: f('float', 'A predator holds its ground until the hunter is within this share of the flee distance; 1 for prey.'),
        HerdAlarmDistance: f('float', 'An alarm carries to its own kind within this distance (cm); 0 for solitary kinds.'),
      },
      rows: Object.keys(ANIMAL_SPEEDS).map((species) => {
        const pace = ANIMAL_SPEEDS[species as keyof typeof ANIMAL_SPEEDS], temper = ANIMAL_TEMPERAMENT[species as keyof typeof ANIMAL_TEMPERAMENT];
        return { Name: species, WalkSpeed: cm(pace.walk), RunSpeed: cm(pace.run), NoticeDistance: cm(pace.notice), FleeDistance: cm(pace.flee), HoldUntil: temper.holdUntil, HerdAlarmDistance: cm(temper.herd) };
      }),
    },
    {
      file: 'DT_Animals.json', name: 'FTervainAnimalRow', note: 'One animal and its home. The row name is its species and model id.',
      fields: {
        Species: f('FName', 'Row name in DT_AnimalSpecies.'),
        SourceModel: f('FString', 'The web build’s model file, for reference while it is replaced.'),
        Habitat: f({ enum: 'ETervainAnimalHabitat' }, 'The ground it keeps to.'),
        Home: f('FVector', 'The centre of its range, on the ground (cm).'),
        RoamRadius: f('float', 'How far from home it wanders (cm).'),
        bSeated: f('bool', 'It sits in one place and never walks.'),
        bTame: f('bool', 'It watches travellers and does not flee; the tame deer can be ridden.'),
        HomeYaw: f('float', 'Its facing at home (degrees), when bHasHomeYaw.'),
        bHasHomeYaw: f('bool', 'Whether HomeYaw is set; otherwise it faces at random.'),
      },
      rows: ANIMALS.map((animal) => ({
        Name: `${animal.species}-${animal.id}`, Species: animal.species, SourceModel: animal.file, Habitat: pascal(animal.habitat),
        Home: toUnreal(animal.home.x, ground(animal.home.x, animal.home.z), animal.home.z), RoamRadius: cm(animal.roam),
        bSeated: !!animal.seated, bTame: !!animal.tame, HomeYaw: animal.homeYaw === undefined ? 0 : yawToUnreal(animal.homeYaw), bHasHomeYaw: animal.homeYaw !== undefined,
      })),
    },
    {
      file: 'DT_EnemyArchetypes.json', name: 'FTervainEnemyArchetypeRow', note: 'A kind of hostile. The row name is the archetype.',
      fields: {
        DisplayName: f('FString', 'Shown above its health bar.'),
        Health: f('int32', 'Health at full.'),
        Speed: f('float', 'Chasing pace (cm/s).'),
        Reach: f('float', 'Distance at which it starts its attack (cm).'),
        WindUpSeconds: f('float', 'Seconds of wind-up before the strike.'),
        StrikeSeconds: f('float', 'Seconds the strike lasts.'),
        RecoverSeconds: f('float', 'Seconds of recovery after it.'),
        Damage: f('int32', 'Damage of a blow that lands unguarded.'),
        NoticeDistance: f('float', 'Distance within which it can notice the wanderer (cm).'),
        bHeavy: f('bool', 'A heavy blow: it lunges, costs more to block and can break a guard.'),
        Radius: f('float', 'Body radius for contact (cm).'),
      },
      rows: Object.entries(ENEMY_ARCHETYPES).map(([kind, a]) => ({
        Name: kind, DisplayName: a.name, Health: a.hp, Speed: cm(a.speed), Reach: cm(a.reach), WindUpSeconds: a.wind, StrikeSeconds: a.strike,
        RecoverSeconds: a.recover, Damage: a.damage, NoticeDistance: cm(a.notice), bHeavy: a.heavy, Radius: cm(a.radius),
      })),
    },
    {
      file: 'DT_EnemyPosts.json', name: 'FTervainEnemyPostRow', note: 'Where a hostile waits. The row name is the encounter’s id, as saved games know it.',
      fields: {
        Archetype: f('FName', 'Row name in DT_EnemyArchetypes.'),
        Location: location,
        Leash: f('float', 'How far from its post it will chase (cm).'),
        IdleYaw: f('float', 'Its facing while it waits (degrees).'),
      },
      rows: ENEMY_SPAWNS.map((spawn) => ({ Name: spawn.id, Archetype: spawn.kind, Location: toUnreal(spawn.x, ground(spawn.x, spawn.z), spawn.z), Leash: cm(spawn.leash), IdleYaw: yawToUnreal(ENEMY_POST_YAW[spawn.id] ?? ENEMY_IDLE_YAW) })),
    },
    {
      file: 'DT_Places.json', name: 'FTervainPlaceRow', note: 'A named place the journal and map know. The row name is the place’s id.',
      fields: { Location: location, Radius: f('float', 'The wanderer has found it once within this distance (cm).') },
      rows: Object.entries(PLACES).map(([id, place]) => ({ Name: id, Location: toUnreal(place.x, ground(place.x, place.z), place.z), Radius: cm(place.r) })),
    },
    {
      file: 'DT_Buildings.json', name: 'FTervainBuildingRow', note: 'A building’s footprint. The row name is the building’s id.',
      fields: {
        Kind: f({ enum: 'ETervainBuildingKind' }, 'What it is used for.'),
        Location: f('FVector', 'The centre of its footprint, on the ground (cm).'),
        Yaw: f('float', 'The way its front door faces (degrees).'),
        Width: f('float', 'Across its front (cm).'),
        Depth: f('float', 'Front to back (cm).'),
        WallHeight: f('float', 'Height of its walls (cm).'),
        Wall: f({ enum: 'ETervainWall' }, 'Wall construction.'),
        Roof: f({ enum: 'ETervainRoof' }, 'Roof form.'),
      },
      rows: BUILDINGS.map((b) => ({ Name: b.id, Kind: pascal(b.kind), Location: toUnreal(b.x, ground(b.x, b.z), b.z), Yaw: yawToUnreal(b.yaw), Width: cm(b.w), Depth: cm(b.d), WallHeight: cm(b.h), Wall: pascal(b.wall), Roof: pascal(b.roof) })),
    },
    {
      file: 'DT_Residents.json', name: 'FTervainResidentRow', note: 'A named resident. The row name is their role id, which survives changes of display name.',
      fields: {
        DisplayName: f('FString', 'Working display name.'),
        TitleKey: f('FString', 'String table key of their title.'),
        Faction: f({ enum: 'ETervainFaction' }, 'Their allegiance.'),
        HomeAnchor: f('FName', 'The anchor they rest at when no span covers the hour.'),
        InteractRadius: f('float', 'How near the wanderer must be to speak to them (cm).'),
        Schedule: f({ array: 'FTervainScheduleEntry' }, 'Their day, in order; the first span that covers the hour applies.'),
      },
      rows: Object.values(NPCS).map((def) => ({
        Name: def.id, DisplayName: def.name, TitleKey: def.titleKey, Faction: pascal(def.faction), HomeAnchor: def.home, InteractRadius: cm(def.interactRadius ?? 2.7),
        Schedule: def.schedule.map((entry) => ({ FromHour: entry.from, ToHour: entry.to, Anchor: entry.anchor, Activity: pascal(entry.activity), IndoorPost: entry.inside ?? 'None' })),
      })),
    },
    {
      file: 'DT_LooseCargo.json', name: 'FTervainLooseCargoRow', note: 'A barrel or crate that can be pushed, lifted and thrown. The row name is its id, as saved games know it.',
      fields: {
        DisplayName: f('FString', 'Shown when it can be picked up.'),
        Kind: f({ enum: 'ETervainCargoKind' }, 'Barrel or crate.'),
        Location: location,
        Yaw: f('float', 'Its facing (degrees).'),
        Size: f('FVector', 'Width, depth and height (cm).'),
        MassKg: f('float', 'Mass for carrying and throwing (kg).'),
      },
      rows: PHYSICAL_PROPS.map((prop) => ({ Name: prop.id, DisplayName: prop.name, Kind: pascal(prop.kind), Location: toUnreal(prop.x, ground(prop.x, prop.z), prop.z), Yaw: yawToUnreal(prop.yaw), Size: { X: cm(prop.width), Y: cm(prop.depth), Z: cm(prop.height) }, MassKg: prop.mass })),
    },
    {
      file: 'DT_Trees.json', name: 'FTervainTreeRow', note: 'One tree or shrub of the planting. Row names are stable only for one export.',
      fields: {
        Species: f('FName', 'oak, birch, pine, fir, shorepine, dead, orchard, shrub or palm.'),
        Variant: f('int32', 'Which of the species’ models, 0 to 2.'),
        Location: location,
        Yaw: f('float', 'Its turn about the vertical (degrees).'),
        Scale: f('float', 'Uniform scale.'),
        TrunkRadius: f('float', 'Radius of the trunk as an obstacle (cm); 0 for a shrub that does not block.'),
      },
      rows: trees.map((tree, index) => ({ Name: `tree_${String(index).padStart(5, '0')}`, Species: tree.sp, Variant: tree.v, Location: toUnreal(tree.x, tree.y, tree.z), Yaw: yawToUnreal(tree.yaw), Scale: round(tree.s), TrunkRadius: cm(tree.radius) })),
    },
  ];
}

/** Unreal's string table CSV: a `Key,SourceString` header, then one quoted row per string. */
export function unrealStringTable(): string {
  const quote = (text: string) => `"${text.replace(/"/g, '""').replace(/\r?\n/g, '\\n')}"`;
  const rows = [...Object.entries(EN), ...Object.entries(DIALOGUE_STRINGS)].map(([key, text]) => `${quote(key)},${quote(text)}`);
  return ['Key,SourceString', ...rows].join('\n') + '\n';
}

const cppType = (type: UnrealType): string => (typeof type === 'string' ? type : 'enum' in type ? type.enum : `TArray<${type.array}>`);
const cppDefault = (type: UnrealType): string => {
  if (type === 'float') return ' = 0.f';
  if (type === 'int32') return ' = 0';
  if (type === 'bool') return ' = false';
  if (type === 'FVector') return ' = FVector::ZeroVector';
  if (typeof type === 'object' && 'enum' in type) return ` = ${type.enum}::${UNREAL_ENUMS[type.enum]!.values[0]}`;
  return '';
};

/**
 * The C++ header declaring the enums, the nested structs and one row struct per table. It is written to
 * `unreal/Source/Tervain/Public/Data/TervainRows.h` by the export and must not be edited by hand.
 */
export function unrealRowsHeader(tables: readonly UnrealStruct[]): string {
  const out: string[] = [
    '// Generated by `npm run data:export` from src/core/export/unrealTables.ts. Do not edit: change the table',
    '// definitions there and export again. Each row struct matches a DataTable JSON file under data/unreal/.',
    '',
    '#pragma once',
    '',
    '#include "CoreMinimal.h"',
    '#include "Containers/Array.h"',
    '#include "Containers/UnrealString.h"',
    '#include "Engine/DataTable.h"',
    '#include "Math/Vector.h"',
    '#include "UObject/NameTypes.h"',
    '#include "TervainRows.generated.h"',
    '',
  ];
  for (const [name, definition] of Object.entries(UNREAL_ENUMS)) {
    out.push(`/** ${definition.note} */`, 'UENUM(BlueprintType)', `enum class ${name} : uint8`, '{', ...definition.values.map((value) => `\t${value},`), '};', '');
  }
  const struct = (definition: UnrealStruct, row: boolean) => {
    out.push(`/** ${definition.note} */`, 'USTRUCT(BlueprintType)', `struct TERVAIN_API ${definition.name}${row ? ' : public FTableRowBase' : ''}`, '{', '\tGENERATED_BODY()');
    for (const [field, { type, note }] of Object.entries(definition.fields)) {
      out.push('', `\t/** ${note} */`, '\tUPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")', `\t${cppType(type)} ${field}${cppDefault(type)};`);
    }
    out.push('};', '');
  };
  for (const definition of UNREAL_STRUCTS) struct(definition, false);
  for (const table of tables) struct(table, true);
  return out.join('\n');
}
