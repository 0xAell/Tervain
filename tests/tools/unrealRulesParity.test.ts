import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { toUnreal, yawToUnreal } from '../../src/core/export/unrealTables';
import { arrowLaunchDirection, BOW } from '../../src/core/rules/bow';
import { ENEMY_ARCHETYPES } from '../../src/core/content/enemies';
import { ACTION_COST, BLADE, FISTS, GUARD, PERFECT_BLOCK_WINDOW, resolveGuardedHit, STAMINA, staminaStep, SWIM_EXIT, WADE, wadeFactor, type Arms } from '../../src/core/rules/hero';

// The Unreal seed mirrors four of the core's rules and its unit conversions in C++. Unreal Engine is not available to
// this repository's tests, so this compiles that plain C++ with an ordinary compiler against small stand-ins for the
// few engine names it uses (tests/tools/unreal-standin) and checks that it returns what the TypeScript returns on the
// same cases. It proves the mirrored logic, not that the project builds in the engine.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const seed = join(root, 'unreal', 'Source', 'Tervain');

const compiler = ['c++', 'g++', 'clang++'].find((name) => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
const work = compiler ? mkdtempSync(join(tmpdir(), 'tervain-unreal-parity-')) : null;
afterAll(() => { if (work) rmSync(work, { recursive: true, force: true }); });

function build(): string {
  const binary = join(work!, 'parity');
  const result = spawnSync(compiler!, ['-std=c++20', '-Wall', '-Wextra', '-Werror', '-I', join(here, 'unreal-standin'), '-I', join(seed, 'Public'),
    join(seed, 'Private', 'Rules', 'TervainHeroRules.cpp'), join(seed, 'Private', 'Rules', 'TervainBowRules.cpp'), join(here, 'unreal-standin', 'parity.cpp'), '-o', binary], { encoding: 'utf8' });
  expect(result.stderr, 'the mirrored C++ compiles without warnings').toBe('');
  expect(result.status).toBe(0);
  return binary;
}

function run(binary: string, lines: string[]): number[][] {
  const result = spawnSync(binary, [], { input: `${lines.join('\n')}\n`, encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout.trim().split('\n').map((line) => line.split(' ').map(Number));
}

const arms: Arms[] = [FISTS, BLADE];
const tuning = [
  `stamina-tuning ${[STAMINA.max, STAMINA.sprintPerSecond, STAMINA.sprintMin, STAMINA.swimSprintPerSecond, STAMINA.regen, STAMINA.regenWinded, STAMINA.regenGuarding, STAMINA.recoverAbove, STAMINA.pauseAfterSprint].join(' ')}`,
  `guard-tuning ${[ACTION_COST.blockHit, GUARD.steadyGuard, GUARD.heavyCost, GUARD.tiredBelow, PERFECT_BLOCK_WINDOW].join(' ')}`,
  ...arms.map((a, index) => `arms ${index} ${a.guard.fresh} ${a.guard.tired} ${typeof a.guard.perfect === 'number' ? a.guard.perfect : 0} ${a.guard.perfect === 'parry' ? 1 : 0}`),
  `wade-tuning ${WADE.from} ${WADE.span} ${WADE.slowest}`,
  `bow-tuning ${BOW.arrowSpeed} ${BOW.gravity}`,
];
/** Single-precision results against double-precision ones. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-4 * Math.max(1, Math.abs(expected)));

describe('the Unreal seed\'s mirrored C++', () => {
  it('has a C++ compiler to check it with wherever CI runs', () => {
    if (process.env.CI) expect(compiler, 'a C++ compiler on the CI runner').toBeTruthy();
  });

  it.skipIf(!compiler)('steps the stamina meter exactly as the core does', () => {
    const binary = build();
    const cases: { stamina: number; pause: number; exhausted: boolean; dt: number; drain: 'run' | 'swim' | null; guarding: boolean }[] = [];
    for (const stamina of [0, 0.4, 0.5, 0.6, 10, 21.9, 22, 22.1, 60, 99.5, 100]) for (const pause of [0, 0.3]) for (const exhausted of [false, true]) {
      for (const dt of [1 / 120, 1 / 60, 0.1, 1]) for (const drain of [null, 'run', 'swim'] as const) for (const guarding of [false, true]) cases.push({ stamina, pause, exhausted, dt, drain, guarding });
    }
    const out = run(binary, [...tuning, ...cases.map((c) => `stamina ${c.stamina} ${c.pause} ${c.exhausted ? 1 : 0} ${c.dt} ${c.drain === 'run' ? 1 : c.drain === 'swim' ? 2 : 0} ${c.guarding ? 1 : 0}`)]);
    expect(out).toHaveLength(cases.length);
    cases.forEach((c, index) => {
      const state = { stamina: c.stamina, pause: c.pause, exhausted: c.exhausted };
      const winded = staminaStep(state, c.dt, c.drain, c.guarding);
      const [cppWinded, cppStamina, cppPause, cppExhausted] = out[index]!;
      // A meter that lands within rounding of a threshold may fall either side of it in single precision.
      const onThreshold = [STAMINA.sprintMin, STAMINA.recoverAbove].some((edge) => Math.abs(state.stamina - edge) < 1e-4);
      near(cppStamina!, state.stamina);
      near(cppPause!, state.pause);
      if (!onThreshold) expect([cppWinded, cppExhausted], JSON.stringify(c)).toEqual([winded ? 1 : 0, state.exhausted ? 1 : 0]);
    });
    expect(cases.length).toBeGreaterThan(1000);
  });

  it.skipIf(!compiler)('settles a blow on a raised guard exactly as the core does', () => {
    const binary = build();
    const damages = [...new Set([...Object.values(ENEMY_ARCHETYPES).map((kind) => kind.damage), 1, 7, 33, 60])];
    const cases: { index: number; damage: number; heavy: boolean; blockTime: number; stamina: number; steadyGuard: boolean }[] = [];
    for (const index of [0, 1]) for (const damage of damages) for (const heavy of [false, true]) for (const blockTime of [0, 0.1, 0.17, 0.19, 0.6]) {
      for (const stamina of [0, 3, 5.3, 8.9, 9.1, 14.3, 14.5, 18, 28.7, 28.9, 40, 100]) for (const steadyGuard of [false, true]) cases.push({ index, damage, heavy, blockTime, stamina, steadyGuard });
    }
    const out = run(binary, [...tuning, ...cases.map((c) => `guard ${c.index} ${c.damage} ${c.heavy ? 1 : 0} ${c.blockTime} ${c.stamina} ${c.steadyGuard ? 1 : 0}`)]);
    expect(out).toHaveLength(cases.length);
    let compared = 0;
    cases.forEach((c, index) => {
      const expected = resolveGuardedHit({ damage: c.damage, heavy: c.heavy, arms: arms[c.index]!, blockTime: c.blockTime, stamina: c.stamina, steadyGuard: c.steadyGuard });
      const [parried, damage, cost, stamina, broken] = out[index]!;
      expect(parried, JSON.stringify(c)).toBe(expected.parried ? 1 : 0);
      if (expected.parried) return;
      near(cost!, expected.cost);
      near(stamina!, expected.stamina);
      // Cases chosen away from rounding ties and from the tired and broken thresholds, where precision alone decides.
      const guard = arms[c.index]!.guard;
      const share = c.blockTime < PERFECT_BLOCK_WINDOW && typeof guard.perfect === 'number' ? guard.perfect : c.stamina < expected.cost * GUARD.tiredBelow ? guard.tired : guard.fresh;
      const tie = Math.abs((c.damage * share) % 1 - 0.5) < 1e-3;
      const edge = Math.abs(c.stamina - expected.cost * GUARD.tiredBelow) < 1e-3 || Math.abs(c.stamina - expected.cost) < 1e-3;
      if (tie || edge) return;
      expect([damage, broken], JSON.stringify(c)).toEqual([expected.damage, expected.guardBroken ? 1 : 0]);
      compared++;
    });
    expect(compared).toBeGreaterThan(800);
  });

  it.skipIf(!compiler)('slows a wade exactly as the core does, from dry ground to past the waist', () => {
    const binary = build();
    const depths: number[] = [];
    for (let step = -50; step <= 300; step++) depths.push(step / 100);
    const out = run(binary, [...tuning, ...depths.map((depth) => `wade ${depth}`)]).map(([factor]) => factor!);
    expect(out).toHaveLength(depths.length);
    depths.forEach((depth, index) => near(out[index]!, wadeFactor(depth)));
    // Out of the water and in the shallows the full pace, past the waist exactly the slowest share, and never faster deeper.
    depths.forEach((depth, index) => {
      if (depth <= WADE.from) expect(out[index], `${depth} m`).toBe(1);
      if (depth >= SWIM_EXIT + 0.01) expect(out[index], `${depth} m`).toBe(WADE.slowest);
      if (index > 0) expect(out[index]!, `${depth} m`).toBeLessThanOrEqual(out[index - 1]!);
    });
    expect(SWIM_EXIT).toBeCloseTo(WADE.from + WADE.span, 9);
  });

  it.skipIf(!compiler)('aims the bow as the core does: the low arc, and straight at a target above, below or out of reach', () => {
    const binary = build();
    const offsets: [number, number, number][] = [[0, 5, 0], [0, -5, 0], [0, 0, 10_000], [0, 0, 0], [0.004, 1, 0.003]];
    for (const distance of [0.5, 1, 5, 12, 30, 60, 120, 250, 400, 1000]) for (const bearing of [0, 0.7, 2.1, -1.3, Math.PI]) {
      for (const rise of [-40, -3, 0, 2.5, 15, 80]) offsets.push([distance * Math.sin(bearing), rise, distance * Math.cos(bearing)]);
    }
    const out = run(binary, [...tuning, ...offsets.map((o) => `bow ${o.join(' ')}`)]);
    expect(out).toHaveLength(offsets.length);
    const squared = BOW.arrowSpeed * BOW.arrowSpeed;
    let arcs = 0, straight = 0;
    offsets.forEach(([x, y, z], index) => {
      const horizontal = Math.hypot(x, z), discriminant = squared * squared - BOW.gravity * (BOW.gravity * horizontal * horizontal + 2 * y * squared);
      // At the edge of the bow's reach single-precision tuning may fall either side of it.
      if (Math.abs(discriminant) < 1e-6 * squared * squared) return;
      const expected = arrowLaunchDirection(x, y, z), [X, Y, Z] = out[index]!;
      for (const [actual, wanted] of [[X!, expected.x], [Y!, expected.y], [Z!, expected.z]] as [number, number][]) expect(Math.abs(actual - wanted), JSON.stringify([x, y, z])).toBeLessThan(1e-6);
      expect(Math.hypot(X!, Y!, Z!)).toBeCloseTo(Math.hypot(x, y, z) ? 1 : 0, 9);
      if (horizontal >= 0.01 && discriminant >= 0) arcs++; else straight++;
    });
    expect(arcs).toBeGreaterThan(200);
    expect(straight).toBeGreaterThan(20);
  });

  it.skipIf(!compiler)('converts positions and yaws as the exported tables do', () => {
    const binary = build();
    const positions = [[0, 0, 0], [12.5, 3.25, -40], [-322, 11, 98], [258.004, -22, 170.5]] as const;
    const yaws = [0, 0.5, Math.PI / 2, 2, 3, -1, -2.5, 4, -4];
    const out = run(binary, [...positions.map((p) => `position ${p.join(' ')}`), ...yaws.map((yaw) => `yaw ${yaw}`)]);
    positions.forEach((p, index) => {
      const expected = toUnreal(p[0], p[1], p[2]), [X, Y, Z, backX, backY, backZ] = out[index]!;
      near(X!, expected.X); near(Y!, expected.Y); near(Z!, expected.Z);
      // And back again: x east, y up, z south.
      near(backX!, p[0]); near(backY!, p[1]); near(backZ!, p[2]);
    });
    const sameAngle = (a: number, b: number) => expect(Math.abs(((a - b + 540) % 360) - 180)).toBeLessThan(0.01);
    yaws.forEach((yaw, index) => {
      const [forward, imported, back, centimetres] = out[positions.length + index]!;
      sameAngle(forward!, yawToUnreal(yaw));
      sameAngle(imported!, -yaw * 180 / Math.PI);
      // The yaw survives the round trip, as an angle.
      expect(Math.abs(Math.sin(back!) - Math.sin(yaw)) + Math.abs(Math.cos(back!) - Math.cos(yaw))).toBeLessThan(1e-4);
      expect(forward!).toBeGreaterThan(-180.001); expect(forward!).toBeLessThanOrEqual(180);
      near(centimetres!, yaw * 100);
    });
  });
});
