import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// unreal/ is a source-only Unreal Engine project that mirrors the core's data types. It cannot be compiled here, so
// these checks hold what can be held without the engine: the generated row structs match the exported tables field
// for field, the hand-written C++ reads only tuning values that exist, and nothing but source and configuration is
// committed.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');
const json = <T>(path: string) => JSON.parse(text(path)) as T;

interface Member { type: string; note: string }
interface Tables {
  tables: { file: string; rowStruct: string; note: string; rows: number; members: Record<string, Member> }[];
  structs: { name: string; note: string; members: Record<string, Member> }[];
  enums: Record<string, { note: string; values: string[] }>;
}
const tables = json<Tables>('data/unreal/tables.json');
const header = text('unreal/Source/Tervain/Public/Data/TervainRows.h');
const tracked = execFileSync('git', ['ls-files', '--', 'unreal'], { cwd: root }).toString().trim().split('\n');

function matches(value: unknown, type: string, where: string): void {
  const array = /^TArray<(\w+)>$/.exec(type);
  if (array) {
    const struct = tables.structs.find((candidate) => candidate.name === array[1]);
    expect(struct, `${where}: ${array[1]} is a declared struct`).toBeDefined();
    expect(Array.isArray(value), where).toBe(true);
    for (const [index, item] of (value as Record<string, unknown>[]).entries()) {
      expect(Object.keys(item), `${where}[${index}]`).toEqual(Object.keys(struct!.members));
      for (const [name, member] of Object.entries(struct!.members)) matches(item[name], member.type, `${where}[${index}].${name}`);
    }
  } else if (type in tables.enums) expect(tables.enums[type]!.values, `${where} = ${String(value)}`).toContain(value);
  else if (type === 'FName' || type === 'FString') expect(typeof value, where).toBe('string');
  else if (type === 'float') expect(typeof value === 'number' && Number.isFinite(value), where).toBe(true);
  else if (type === 'int32') expect(Number.isInteger(value), where).toBe(true);
  else if (type === 'bool') expect(typeof value, where).toBe('boolean');
  else if (type === 'FVector') {
    expect(Object.keys(value as object), where).toEqual(['X', 'Y', 'Z']);
    for (const axis of Object.values(value as Record<string, unknown>)) expect(typeof axis, where).toBe('number');
  } else throw new Error(`${where}: unknown member type ${type}`);
}

describe('the Unreal row structs and the exported tables', () => {
  it('give every row exactly its struct’s members, with values of the declared types', () => {
    expect(tables.tables.length).toBeGreaterThanOrEqual(10);
    for (const table of tables.tables) {
      const rows = json<Record<string, unknown>[]>(`data/unreal/${table.file}`);
      expect(rows).toHaveLength(table.rows);
      for (const row of rows) {
        expect(Object.keys(row), `${table.file} ${String(row.Name)}`).toEqual(['Name', ...Object.keys(table.members)]);
        for (const [name, member] of Object.entries(table.members)) matches(row[name], member.type, `${table.file} ${String(row.Name)}.${name}`);
      }
    }
  });

  it('declare each table’s row struct, deriving from FTableRowBase, with each member as a property', () => {
    for (const table of tables.tables) {
      const start = header.indexOf(`struct TERVAIN_API ${table.rowStruct} : public FTableRowBase`);
      expect(start, table.rowStruct).toBeGreaterThan(0);
      const body = header.slice(start, header.indexOf('\n};', start));
      expect(body).toContain('GENERATED_BODY()');
      for (const [name, member] of Object.entries(table.members)) expect(body, `${table.rowStruct}.${name}`).toMatch(new RegExp(`UPROPERTY\\([^)]*\\)\\n\\t${member.type.replace(/[<>]/g, '\\$&')} ${name}\\b`));
      expect((body.match(/UPROPERTY\(/g) ?? []).length).toBe(Object.keys(table.members).length);
    }
  });

  it('declare every enum with all its values, and use booleans named with a b', () => {
    for (const [name, definition] of Object.entries(tables.enums)) {
      const start = header.indexOf(`enum class ${name} : uint8`);
      expect(start, name).toBeGreaterThan(0);
      const body = header.slice(start, header.indexOf('};', start));
      for (const value of definition.values) expect(body).toMatch(new RegExp(`\\t${value},`));
    }
    for (const table of tables.tables) for (const [name, member] of Object.entries(table.members)) expect(member.type === 'bool', `${table.rowStruct}.${name}`).toBe(/^b[A-Z]/.test(name));
  });

  it('include the generated header’s own reflection header last, as Unreal requires', () => {
    const includes = [...header.matchAll(/^#include "([^"]+)"/gm)].map((match) => match[1]);
    expect(includes.at(-1)).toBe('TervainRows.generated.h');
    expect(header).toContain('#pragma once');
  });
});

describe('the hand-written Unreal source', () => {
  const settings = text('unreal/Source/Tervain/Public/TervainSettings.h');
  const subsystem = text('unreal/Source/Tervain/Private/TervainDataSubsystem.cpp');

  it('has a project setting for every table', () => {
    for (const table of tables.tables) expect(settings, table.file).toContain(`FSoftObjectPath ${table.file.replace(/^DT_|\.json$/g, '')}Table;`);
  });

  it('reads only tuning values that exist in data/game/tuning.json, as numbers', () => {
    const tuning = json<Record<string, unknown>>('data/game/tuning.json');
    const paths = [...subsystem.matchAll(/GetTuningNumber\(TEXT\("([^"]+)"\)\)/g)].map((match) => match[1]!);
    expect(paths.length).toBeGreaterThanOrEqual(14);
    for (const path of paths) {
      const value = path.split('.').reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined), tuning);
      expect(typeof value, path).toBe('number');
    }
  });

  it('names one module, Tervain, in the project, its targets and its build rules', () => {
    const project = json<{ EngineAssociation: string; Modules: { Name: string; Type: string }[] }>('unreal/Tervain.uproject');
    expect(project.Modules).toEqual([{ Name: 'Tervain', Type: 'Runtime', LoadingPhase: 'Default' }]);
    expect(project.EngineAssociation).toBe('5.9');
    for (const target of ['unreal/Source/Tervain.Target.cs', 'unreal/Source/TervainEditor.Target.cs']) expect(text(target)).toContain('ExtraModuleNames.Add("Tervain")');
    const build = text('unreal/Source/Tervain/Tervain.Build.cs');
    for (const module of ['Core', 'CoreUObject', 'Engine', 'DeveloperSettings', 'Json']) expect(build).toContain(`"${module}"`);
    expect(text('unreal/Source/Tervain/Private/Tervain.cpp')).toContain('IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, Tervain, "Tervain")');
  });

  it('pairs every header that declares reflected types with its generated include', () => {
    for (const file of tracked.filter((path) => path.endsWith('.h'))) {
      const source = text(file);
      if (!/\b(UCLASS|USTRUCT|UENUM)\(/.test(source)) continue;
      const name = file.split('/').pop()!.replace(/\.h$/, '');
      const includes = [...source.matchAll(/^#include "([^"]+)"/gm)].map((match) => match[1]);
      expect(includes.at(-1), file).toBe(`${name}.generated.h`);
    }
  });
});

describe('what is committed under unreal/', () => {
  it('is source and configuration only: no binaries, no Unreal content', () => {
    expect(tracked.length).toBeGreaterThan(10);
    for (const file of tracked) expect(file, file).toMatch(/\.(uproject|cs|h|cpp|ini|md)$|\/\.gitignore$/);
    expect(tracked.filter((file) => file.startsWith('unreal/Content/'))).toEqual(['unreal/Content/README.md']);
  });

  it('stays out of the web build', () => {
    const tsconfig = json<{ include: string[] }>('tsconfig.json');
    expect(tsconfig.include.some((entry) => entry.includes('unreal'))).toBe(false);
    expect(text('vite.config.ts')).not.toMatch(/unreal/i);
    expect(text('.github/workflows/pages.yml')).not.toMatch(/unreal/i);
  });
});
