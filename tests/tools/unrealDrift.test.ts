import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ANIMAL_SENSES } from '../../src/core/content/animals';
import { ENEMY_ARCHETYPES } from '../../src/core/content/enemies';
import { ITEMS } from '../../src/core/content/items';
import { NPCS } from '../../src/core/content/npcs';
import { cppIdentifier, unrealIdConstants, unrealIdGroups, unrealIdsHeader } from '../../src/core/export/unrealIds';
import { toUnreal } from '../../src/core/export/unrealTables';
import {
  ALLOCATIONS, CONTENT_REVISION, DECISION_MAKERS, EVIDENCE_IDS, GATE_STATES, PARTIES, PHASE_ORDER, PRINCIPALS, QUICK_SLOT_COUNT, SAVE_FORMAT_VERSION,
  WRECK_BLADE_PICKUP,
} from '../../src/core/game/types';
import { BUILDINGS, ENEMY_SPAWNS, PLACES } from '../../src/core/world/layout';
import { differences } from '../../tools/export-data.mjs';

// The drift check between the engine-agnostic core and the Unreal C++ seed. The core is the source; unreal/ holds
// C++ that mirrors its ids, its tables' shapes and the tuning values two rules read. This file fails when the two
// stop agreeing, and proves on altered copies that it would. It is run by `npm run unreal:check` and by its own CI
// job, together with the export check (data/ and the generated headers equal what the core produces), the row struct
// check (unrealSkeleton), the mirrored rules (unrealRulesParity) and the build against stand-ins (unrealSeedBuild).

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const text = (path: string) => readFileSync(join(root, path), 'utf8');
const HEADER = 'unreal/Source/Tervain/Public/Data/TervainIds.h';

/** What the core says, taken from its modules here and not through the generator. */
const CORE: Record<string, readonly string[]> = {
  Item: Object.keys(ITEMS),
  Resident: Object.keys(NPCS),
  EnemyArchetype: Object.keys(ENEMY_ARCHETYPES),
  EnemyPost: ENEMY_SPAWNS.map((spawn) => spawn.id),
  AnimalSpecies: Object.keys(ANIMAL_SENSES),
  Place: Object.keys(PLACES),
  Building: BUILDINGS.map((building) => building.id),
  QuestPhase: PHASE_ORDER,
  Evidence: EVIDENCE_IDS,
  Allocation: ALLOCATIONS,
  GateState: GATE_STATES,
  Party: PARTIES,
  Principal: PRINCIPALS,
  DecisionMaker: DECISION_MAKERS,
};
const CORE_CONSTANTS: Record<string, number | string> = { SaveFormatVersion: SAVE_FORMAT_VERSION, ContentRevision: CONTENT_REVISION, QuickSlotCount: QUICK_SLOT_COUNT, FirstWeaponPickup: WRECK_BLADE_PICKUP };
/** The DataTable each entity group names rows of. */
const TABLES: Record<string, string> = { Item: 'DT_Items', Resident: 'DT_Residents', EnemyArchetype: 'DT_EnemyArchetypes', EnemyPost: 'DT_EnemyPosts', AnimalSpecies: 'DT_AnimalSpecies', Place: 'DT_Places', Building: 'DT_Buildings' };

interface Declared { groups: Record<string, { names: Record<string, string>; all: string[] }>; constants: Record<string, number | string> }

/** The ids header as its text declares it. */
function declared(header: string): Declared {
  const out: Declared = { groups: {}, constants: {} };
  for (const block of header.matchAll(/\tnamespace (\w+)\n\t\{\n([\s\S]*?)\n\t\}/g)) {
    const names: Record<string, string> = {};
    for (const line of block[2]!.matchAll(/^\t\tinline constexpr const TCHAR\* (\w+) = TEXT\("([^"]*)"\);$/gm)) names[line[1]!] = line[2]!;
    const all = /inline constexpr const TCHAR\* All\[\] = \{([\s\S]*?)\};/.exec(block[2]!)?.[1]?.split(/[\s,]+/).filter(Boolean) ?? [];
    out.groups[block[1]!] = { names, all };
  }
  for (const line of header.matchAll(/^\tinline constexpr (?:int32|const TCHAR\*) (\w+) = (?:TEXT\("([^"]*)"\)|(-?\d+));$/gm)) out.constants[line[1]!] = line[2] ?? Number(line[3]);
  return out;
}

/** Every way the header disagrees with the core's ids; empty when they agree. */
function idDrift(header: string, core = CORE, constants = CORE_CONSTANTS): string[] {
  const found = declared(header), problems: string[] = [];
  for (const group of Object.keys(core)) if (!found.groups[group]) problems.push(`${group}: not in the header`);
  for (const [group, { names, all }] of Object.entries(found.groups)) {
    const ids = core[group];
    if (!ids) { problems.push(`${group}: in the header, not in the core`); continue; }
    const have = Object.values(names);
    for (const id of ids) if (!have.includes(id)) problems.push(`${group}: the core's "${id}" is missing`);
    for (const [name, id] of Object.entries(names)) {
      if (!ids.includes(id)) problems.push(`${group}: "${id}" is not an id of the core`);
      else if (name !== cppIdentifier(id)) problems.push(`${group}: "${id}" is named ${name}`);
    }
    if (all.map((name) => names[name]).join(' ') !== ids.join(' ')) problems.push(`${group}: All does not list the core's ids in order`);
  }
  for (const [name, value] of Object.entries(constants)) if (found.constants[name] !== value) problems.push(`${name}: ${JSON.stringify(found.constants[name])} in the header, ${JSON.stringify(value)} in the core`);
  for (const name of Object.keys(found.constants)) if (!(name in constants)) problems.push(`${name}: in the header, not in the core`);
  return problems;
}

const compiler = ['c++', 'g++', 'clang++'].find((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
const work = mkdtempSync(join(tmpdir(), 'tervain-unreal-drift-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the ids the Unreal seed names and the core', () => {
  const header = text(HEADER);

  it('agree: every group, every id, every name, the order and the single values', () => {
    expect(idDrift(header)).toEqual([]);
    expect(Object.keys(declared(header).groups)).toEqual(Object.keys(CORE));
    expect(Object.values(CORE).flat().length).toBeGreaterThan(100);
  });

  it('are the committed header the generator writes today', () => {
    expect(unrealIdsHeader()).toBe(header);
    expect(unrealIdGroups().map((group) => [group.name, group.ids])).toEqual(Object.entries(CORE));
    expect(Object.fromEntries(unrealIdConstants().map((constant) => [constant.name, constant.value]))).toEqual(CORE_CONSTANTS);
  });

  it('name exactly the rows of each table they point at', () => {
    for (const group of unrealIdGroups()) {
      expect(group.table?.replace(/\.json$/, ''), group.name).toBe(TABLES[group.name]);
      if (!group.table) continue;
      const rows = JSON.parse(text(`data/unreal/${group.table}`)) as { Name: string }[];
      expect(rows.map((row) => row.Name), group.table).toEqual(CORE[group.name]);
    }
    // The quest's vocabulary is the exported quest document's.
    const quest = JSON.parse(text('data/game/quest.json')) as Record<string, unknown>;
    expect([quest.phases, quest.evidence, quest.allocations, quest.gateStates, quest.parties, quest.principals, quest.decisionMakers])
      .toEqual([CORE.QuestPhase, CORE.Evidence, CORE.Allocation, CORE.GateState, CORE.Party, CORE.Principal, CORE.DecisionMaker]);
    expect([quest.saveFormatVersion, quest.contentRevision, quest.quickSlots, quest.firstWeaponPickup]).toEqual(Object.values(CORE_CONSTANTS));
  });

  it.skipIf(!compiler)('compile as C++ and hold the same values there', () => {
    const found = declared(header);
    const driver = [
      '#include "Data/TervainIds.h"', '#include <cstdio>', '',
      'template <unsigned long Count> static void Print(const char* Group, const TCHAR* const (&Ids)[Count]) { for (const TCHAR* Id : Ids) std::printf("%s %ls\\n", Group, Id); }', '',
      'int main()', '{',
      ...Object.keys(found.groups).map((group) => `\tPrint("${group}", TervainIds::${group}::All);`),
      ...Object.entries(found.constants).map(([name, value]) => `\tstd::printf("${name} ${typeof value === 'number' ? '%d' : '%ls'}\\n", TervainIds::${name});`),
      '\treturn 0;', '}', '',
    ].join('\n');
    writeFileSync(join(work, 'ids.cpp'), driver);
    const binary = join(work, 'ids');
    const built = spawnSync(compiler!, ['-std=c++20', '-Wall', '-Wextra', '-Werror', '-I', join(here, 'unreal-standin'), '-I', join(root, 'unreal', 'Source', 'Tervain', 'Public'), join(work, 'ids.cpp'), '-o', binary], { encoding: 'utf8' });
    expect(built.stderr, 'the ids header compiles without warnings').toBe('');
    const printed = spawnSync(binary, [], { encoding: 'utf8' }).stdout.trim().split('\n');
    const expected = [...Object.entries(CORE).flatMap(([group, ids]) => ids.map((id) => `${group} ${id}`)), ...Object.entries(CORE_CONSTANTS).map(([name, value]) => `${name} ${value}`)];
    expect(printed).toEqual(expected);
  });

  it('is found out when it drifts: a renamed, missing, added, reordered or stale value each fails the check', () => {
    const altered: [string, (source: string) => string, RegExp][] = [
      ['an id the core renamed', (source) => source.replace('TEXT("bread")', 'TEXT("loaf")'), /Item: the core's "bread" is missing/],
      ['an id the core added', (source) => source.replace(/\t\tinline constexpr const TCHAR\* Bread = TEXT\("bread"\);\n/, '').replace(/\bBread, /, ''), /Item: the core's "bread" is missing/],
      ['an id the core removed', (source) => source.replace('\t\tinline constexpr const TCHAR* Coin = ', '\t\tinline constexpr const TCHAR* Ghost = TEXT("ghost");\n\t\tinline constexpr const TCHAR* Coin = '), /Item: "ghost" is not an id of the core/],
      ['a constant renamed by hand', (source) => source.replace('TCHAR* RustedSword = ', 'TCHAR* OldSword = ').replace('RustedSword, ', 'OldSword, '), /Item: "rusted_sword" is named OldSword/],
      ['a changed order', (source) => source.replace('Unseen, Investigating', 'Investigating, Unseen'), /QuestPhase: All does not list the core's ids in order/],
      ['a group the core dropped', (source) => source.replace('namespace Party', 'namespace Faction'), /Party: not in the header/],
      ['a stale save format', (source) => source.replace(/SaveFormatVersion = \d+;/, 'SaveFormatVersion = 99;'), /SaveFormatVersion: 99 in the header, 1 in the core/],
      ['a stale content revision', (source) => source.replace(CONTENT_REVISION, 'older-content'), /ContentRevision: "older-content" in the header/],
    ];
    for (const [what, alter, problem] of altered) {
      const changed = alter(header);
      expect(changed, what).not.toBe(header);
      expect(idDrift(changed).join('\n'), what).toMatch(problem);
    }
    // And from the other side: the same header against a core that has moved on.
    expect(idDrift(header, { ...CORE, Item: [...CORE.Item!, 'lantern'] })).toEqual(['Item: the core\'s "lantern" is missing', 'Item: All does not list the core\'s ids in order']);
    expect(idDrift(header, CORE, { ...CORE_CONSTANTS, QuickSlotCount: 12 })).toEqual(['QuickSlotCount: 10 in the header, 12 in the core']);
  });

  it('is found out by the export check when the committed file is not what the core writes', () => {
    const files = [{ path: `../${HEADER}`, text: header }];
    expect(differences(files, join(root, 'data'))).toEqual([]);
    expect(differences([{ path: `../${HEADER}`, text: header.replace('TEXT("bread")', 'TEXT("loaf")') }], join(root, 'data'))).toEqual([`../${HEADER}`]);
    expect(differences([{ path: '../unreal/Source/Tervain/Public/Data/TervainGone.h', text: header }], join(root, 'data'))).toEqual(['../unreal/Source/Tervain/Public/Data/TervainGone.h (missing)']);
  });

  it('is plain ASCII, and no hand-written source spells an id out instead of naming it', () => {
    expect(/[^\x09\x0a\x20-\x7e]/.exec(header)).toBeNull();
    const ids = new Set(Object.values(CORE).flat());
    for (const file of ['unreal/Source/Tervain/Private/TervainDataSubsystem.cpp', 'unreal/Source/Tervain/Private/TervainSettings.cpp', 'unreal/Source/Tervain/Private/Rules/TervainHeroRules.cpp', 'unreal/Source/Tervain/Private/Tervain.cpp']) {
      for (const literal of text(file).matchAll(/TEXT\("([^"]+)"\)/g)) expect(ids.has(literal[1]!), `${file} spells out the id "${literal[1]}"`).toBe(false);
    }
  });
});

describe('the tuning values and shared constants the Unreal seed mirrors', () => {
  const rules = text('unreal/Source/Tervain/Public/Rules/TervainHeroRules.h');
  const subsystem = text('unreal/Source/Tervain/Private/TervainDataSubsystem.cpp');
  const tuning = JSON.parse(text('data/game/tuning.json')) as Record<string, unknown>;
  const at = (path: string) => path.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), tuning);
  const members = (struct: string) => {
    const start = rules.indexOf(`struct TERVAIN_API ${struct}\n`);
    expect(start, struct).toBeGreaterThan(0);
    return [...rules.slice(start, rules.indexOf('\n};', start)).matchAll(/^\tfloat (\w+) = /gm)].map((match) => match[1]!);
  };
  const filled = (getter: string) => {
    const start = subsystem.indexOf(`UTervainDataSubsystem::${getter}() const`);
    expect(start, getter).toBeGreaterThan(0);
    return [...subsystem.slice(start, subsystem.indexOf('\n}', start)).matchAll(/Out\.(\w+) = GetTuningNumber\(TEXT\("([^"]+)"\)\);/g)].map((match) => [match[1]!, match[2]!] as const);
  };

  it('fill every member of each tuning struct from a number in data/game/tuning.json, each from its own path', () => {
    for (const [struct, getter, count] of [['FTervainStaminaTuning', 'GetStaminaTuning', 9], ['FTervainGuardTuning', 'GetGuardTuning', 5]] as const) {
      const read = filled(getter);
      expect(read.map(([member]) => member), struct).toEqual(members(struct));
      expect(read).toHaveLength(count);
      expect(new Set(read.map(([, path]) => path)).size, `${struct}: no path read twice`).toBe(count);
      for (const [member, path] of read) expect(typeof at(path), `${struct}.${member} reads ${path}`).toBe('number');
    }
  });

  it('read each stamina value from the key of the same name', () => {
    const lower = (name: string) => name[0]!.toLowerCase() + name.slice(1);
    for (const [member, path] of filled('GetStaminaTuning')) expect(path).toBe(`hero.stamina.${lower(member)}`);
    // Every stamina key the mirrored rule uses is read; the two it does not use are named here so a new key is noticed.
    const mirrored = filled('GetStaminaTuning').map(([, path]) => path.split('.').pop()!);
    expect(Object.keys(at('hero.stamina') as object).filter((key) => !mirrored.includes(key))).toEqual(['pauseAfterAction', 'pauseAfterJump']);
    expect(Object.keys(at('hero.guard') as object).filter((key) => !filled('GetGuardTuning').some(([, path]) => path === `hero.guard.${key}`))).toEqual(['facing']);
  });

  it('use the unit factor the exported tables were converted with', () => {
    const units = text('unreal/Source/Tervain/Public/TervainUnits.h');
    const factor = Number(/inline constexpr double CentimetresPerMetre = ([\d.]+);/.exec(units)?.[1]);
    expect(factor).toBe(toUnreal(1, 0, 0).X);
    expect(toUnreal(1, 2, 3)).toEqual({ X: factor, Y: 3 * factor, Z: 2 * factor });
  });
});
