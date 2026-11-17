import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { arrowLaunchDirection, BOW } from '../../src/core/rules/bow';
import { ACTION_COST, FISTS, GUARD, PERFECT_BLOCK_WINDOW, resolveGuardedHit, STAMINA, staminaStep, WADE, wadeFactor } from '../../src/core/rules/hero';
import { MOUNT_STAMINA, mountStaminaStep, RIDE, steerMount } from '../../src/core/rules/riding';

// Unreal Engine is not available to this repository's tests. This builds every source file of the Unreal seed with an
// ordinary C++ compiler against stand-ins for the engine names it uses (tests/tools/unreal-standin), links it, and
// runs it against the repository's exported data: the data subsystem must read every number in data/game/tuning.json,
// the settings must find the data folder, and rows must be found in a table. It shows that the seed's C++ is
// well-formed and that its logic works on the real data. It cannot show that the project builds in the engine: the
// stand-ins follow Epic's public documentation name by name (docs/unreal/engine-symbols.json says which page each
// was checked against, and what could not be checked), not the engine's headers.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const seed = join(root, 'unreal', 'Source', 'Tervain');
const standIn = join(here, 'unreal-standin');

const compiler = ['c++', 'g++', 'clang++'].find((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
const work = compiler ? mkdtempSync(join(tmpdir(), 'tervain-unreal-seed-')) : null;
afterAll(() => { if (work) rmSync(work, { recursive: true, force: true }); });

function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? sources(path) : name.endsWith('.cpp') ? [path] : [];
  });
}
const seedSources = sources(join(seed, 'Private'));
const binary = work ? join(work, 'seed') : '';
const project = `${join(root, 'unreal')}/`;

function run(mode: string, input = '', dataDirectory?: string): string[] {
  const result = spawnSync(binary, [mode, project, ...(dataDirectory ? [dataDirectory] : [])], { input, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trimEnd().split('\n');
}

/** Every number in a JSON object that is reached through objects only, by dotted path. */
function numbers(value: unknown, path: string[] = [], found: [string, number][] = []): [string, number][] {
  if (typeof value === 'number') found.push([path.join('.'), value]);
  else if (value && typeof value === 'object' && !Array.isArray(value)) for (const [key, child] of Object.entries(value)) numbers(child, [...path, key], found);
  return found;
}
const tuning = JSON.parse(readFileSync(join(root, 'data', 'game', 'tuning.json'), 'utf8')) as Record<string, unknown>;
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(expected)));

describe('the Unreal seed, built and run against stand-ins for the engine', () => {
  it('has a C++ compiler to build it with wherever CI runs', () => {
    if (process.env.CI) expect(compiler, 'a C++ compiler on the CI runner').toBeTruthy();
  });

  beforeAll(() => {
    if (!compiler) return;
    const result = spawnSync(compiler, ['-std=c++20', '-Wall', '-Wextra', '-Werror', '-I', standIn, '-I', join(seed, 'Public'), ...seedSources, join(standIn, 'seed.cpp'), '-o', binary], { encoding: 'utf8' });
    expect(result.stderr, 'every seed source compiles and links without warnings').toBe('');
    expect(result.status).toBe(0);
  }, 120_000);

  it('compiles every source file of the seed', () => {
    const names = seedSources.map((path) => path.slice(seed.length + 1).replace(/\\/g, '/')).sort();
    expect(names).toEqual(['Private/Rules/TervainBowRules.cpp', 'Private/Rules/TervainHeroRules.cpp', 'Private/Rules/TervainRidingRules.cpp', 'Private/Tervain.cpp', 'Private/TervainDataSubsystem.cpp', 'Private/TervainSettings.cpp']);
  });

  it.skipIf(!compiler)('reads every number of the exported tuning file to the same value', () => {
    const expected = numbers(tuning);
    expect(expected.length).toBeGreaterThan(150);
    const [loaded, ...values] = run('tuning', `${expected.map(([path]) => path).join('\n')}\n`);
    expect(loaded).toBe('1');
    expect(values).toHaveLength(expected.length);
    expected.forEach(([path, value], index) => { expect(Number.isFinite(Number(values[index])), path).toBe(true); near(Number(values[index]), value); });
  });

  it.skipIf(!compiler)('gives the default for a path that names no number', () => {
    const paths = ['no.such.path', 'hero', 'hero.stamina', 'hero.stamina.regen.more', 'hero.arms.blade.guard.perfect', 'clock.nightnessByHour', 'about'];
    const [, ...values] = run('tuning', `${paths.join('\n')}\n`);
    expect(values).toEqual(paths.map(() => '-12345'));
  });

  it.skipIf(!compiler)('fills the stamina, guard, wade, bow and riding values from the file and runs the mirrored rules on them', () => {
    const [stamina, guard, step, hit, wade, bow, ride, mount] = run('structs').map((line) => line.split(' ').map(Number));
    const expectStamina = [STAMINA.max, STAMINA.sprintPerSecond, STAMINA.sprintMin, STAMINA.swimSprintPerSecond, STAMINA.regen, STAMINA.regenWinded, STAMINA.regenGuarding, STAMINA.recoverAbove, STAMINA.pauseAfterSprint];
    stamina!.forEach((value, index) => near(value, expectStamina[index]!));
    const expectGuard = [ACTION_COST.blockHit, GUARD.steadyGuard, GUARD.heavyCost, GUARD.tiredBelow, PERFECT_BLOCK_WINDOW];
    guard!.forEach((value, index) => near(value, expectGuard[index]!));
    // A second of running from a full meter.
    const state = { stamina: STAMINA.max, pause: 0, exhausted: false };
    const winded = staminaStep(state, 1, 'run', false);
    expect(step![0]).toBe(winded ? 1 : 0); near(step![1]!, state.stamina); near(step![2]!, state.pause);
    // A heavy blow of 20 on a fresh guard of bare forearms, raised too early to be perfect.
    expect(FISTS.guard).toEqual({ fresh: 0.6, tired: 0.85, perfect: 0.35 });
    const settled = resolveGuardedHit({ damage: 20, heavy: true, arms: FISTS, blockTime: 0.5, stamina: 100, steadyGuard: false });
    if (settled.parried) throw new Error('fists do not parry');
    expect(hit![0]).toBe(0); expect(hit![1]).toBe(settled.damage); near(hit![2]!, settled.cost); near(hit![3]!, settled.stamina); expect(hit![4]).toBe(settled.guardBroken ? 1 : 0);
    // The wade's three numbers, and the pace kept at the knee.
    expect(wade).toHaveLength(4);
    [WADE.from, WADE.span, WADE.slowest, wadeFactor(0.625)].forEach((value, index) => near(wade![index]!, value));
    // The bow's two numbers, and the low arc to a target 30 m off on the level.
    expect(bow).toHaveLength(5);
    const level = arrowLaunchDirection(0, 0, 30);
    [BOW.arrowSpeed, BOW.gravity, level.x, level.y, level.z].forEach((value, index) => near(bow![index]!, value));
    // The reins' eight numbers, and a sixtieth of a second pulled east at a stand, galloping.
    expect(ride).toHaveLength(11);
    const reined = steerMount({ speed: 0, yaw: 0 }, 1, 0, 1, true, 1 / 60);
    [RIDE.walk, RIDE.run, RIDE.back, RIDE.accel, RIDE.brake, RIDE.turnStill, RIDE.turnRun, RIDE.backCone, reined.speed, reined.yaw, reined.turn].forEach((value, index) => near(ride![index]!, value));
    // The gallop's three numbers, and a second's gallop from a full meter.
    expect(mount).toHaveLength(4);
    [MOUNT_STAMINA.max, MOUNT_STAMINA.drain, MOUNT_STAMINA.recover, mountStaminaStep(MOUNT_STAMINA.max, true, 1)].forEach((value, index) => near(mount![index]!, value));
  });

  it.skipIf(!compiler)('finds the data folder beside the project and names its settings and module', () => {
    expect(run('settings')).toEqual(['Game', join(root, 'data'), 'Tervain', '1', '1']);
  });

  it.skipIf(!compiler)('says so in the log, and reads nothing, when the data folder is not where the settings point', () => {
    const lines = run('settings', '', '../nowhere');
    expect(lines.slice(0, 5)).toEqual(['Game', join(root, 'nowhere'), 'Tervain', '1', '0']);
    expect(lines[5]).toBe(`log LogTervain: Warning: Tuning values not found at ${join(root, 'nowhere', 'game', 'tuning.json')}. Set the data directory in Project Settings > Game > Tervain.`);
  });

  it.skipIf(!compiler)('finds a row by name in the table the settings name, and nothing where there is no table or another kind of row', () => {
    expect(run('rows')).toEqual(['1', '1 item.bread 12 1', '1', '1 1', '1', '1', '1', '10 1',
      'log LogTervain: Warning: The table set as Residents Table in Project Settings > Game > Tervain could not be loaded.']);
  });

  it('makes every generated row struct in the driver', () => {
    const tables = JSON.parse(readFileSync(join(root, 'data', 'unreal', 'tables.json'), 'utf8')) as { tables: { rowStruct?: string; name?: string }[] };
    const driver = readFileSync(join(standIn, 'seed.cpp'), 'utf8');
    const structs = tables.tables.map((table) => table.rowStruct ?? table.name!);
    expect(structs).toHaveLength(10);
    for (const struct of structs) expect(driver, struct).toContain(`${struct} `);
  });
});
