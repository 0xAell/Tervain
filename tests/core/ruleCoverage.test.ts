import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every rule, table and helper that left the renderer for the core must be exercised by a test. This check keeps that
// true as the core grows: each runtime export of the modules below has to be named in at least one test file.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The modules lifted out of the scene layer: every rules module, and the tables and placement rules moved with them. */
const modules = {
  ...import.meta.glob('../../src/core/rules/*.ts', { eager: true }),
  ...import.meta.glob('../../src/core/content/{animals,enemies,ambientPeople}.ts', { eager: true }),
  ...import.meta.glob('../../src/core/world/{wind,treeScale,groundContacts,physicalProps,flora,exclusions,groundLayers,habitat,scatter,forestFloor,detail}.ts', { eager: true }),
  ...import.meta.glob('../../src/core/util/*.ts', { eager: true }),
} as Record<string, Record<string, unknown>>;

function testFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return name.startsWith('gothic3') ? [] : testFiles(path);
    return /\.test\.ts$/.test(name) && name !== 'ruleCoverage.test.ts' ? [path] : [];
  });
}

describe('tests for the rules that left the renderer', () => {
  const named = new Set<string>();
  for (const file of testFiles(join(root, 'tests'))) for (const word of readFileSync(file, 'utf8').match(/[A-Za-z_$][\w$]*/g) ?? []) named.add(word);

  it('finds the moved modules', () => {
    const paths = Object.keys(modules);
    expect(paths.length).toBeGreaterThanOrEqual(30);
    for (const expected of ['rules/hero.ts', 'rules/hostile.ts', 'rules/schedule.ts', 'world/flora.ts', 'content/animals.ts', 'util/cooperative.ts']) {
      expect(paths.some((path) => path.endsWith(expected)), expected).toBe(true);
    }
  });

  it('name every exported function, table and class in a test', () => {
    const untested: string[] = [];
    for (const [path, exports] of Object.entries(modules)) {
      for (const name of Object.keys(exports)) if (!named.has(name)) untested.push(`${path.replace('../../', '')}: ${name}`);
    }
    expect(untested).toEqual([]);
  });
});
