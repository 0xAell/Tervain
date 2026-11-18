import { expect, it } from 'vitest';
import { fullPopulation } from './fixtures/budgetPopulation';
// @ts-expect-error The browser gate executes this Node module directly.
import { comparePopulatedBudgets, completePopulation, waitForPopulation } from '../../tools/budget-population.mjs';

const partial = { wildlife: false, furniture: false, animals: [], figures: ['named:ash_recorder'] };
const row = (triangles: number, population = fullPopulation) => [10, triangles, population];
const run = (early: ReturnType<typeof row>[], full = 40) => ({ early, full: [row(full)] });

it('requires the full authored roster, including each individual animal, the caravan master, and adopted furniture', () => {
  expect(completePopulation(fullPopulation)).toBe(true);
  expect(fullPopulation.animals).toHaveLength(19);
  expect(completePopulation({ ...fullPopulation, figures: fullPopulation.figures.filter((id) => id !== 'named:caravan_master') })).toBe(false);
  expect(completePopulation({ ...fullPopulation, animals: fullPopulation.animals.map((_, i) => fullPopulation.animals[i || 1]) })).toBe(false);
  expect(completePopulation({ ...fullPopulation, furniture: false })).toBe(false);
});

it('reports a failed or incomplete late load, an empty queue missing a figure, and a still-pending timeout separately', async () => {
  const page = (population: typeof fullPopulation, settled: string, pending: number) => ({
    eval: async () => ({ population, settled, pending, net: { bad: ['404 animal.glb'] } }),
    wait: async () => {},
  });
  await expect(waitForPopulation(page(partial, 'done', 0), 'candidate', undefined, 0)).rejects.toThrow(/finished without attaching.*404 animal.glb/);
  const missingCaravan = { ...fullPopulation, figures: fullPopulation.figures.filter((id) => id !== 'named:caravan_master') };
  await expect(waitForPopulation(page(missingCaravan, 'done', 0), 'live', undefined, 0)).rejects.toThrow(/arrival queue drained.*missing named:caravan_master/);
  await expect(waitForPopulation(page(missingCaravan, 'pending', 1), 'live', undefined, 0)).rejects.toThrow(/timed out waiting.*1 figures pending/);
  await expect(waitForPopulation(page(fullPopulation, 'done', 0), 'live', undefined, 0)).resolves.toBeUndefined();
});

it('enforces the original early maximum, same-population subgroups, and the final fully populated budget', () => {
  const live = [run([row(15, partial)], 50), run([row(16, partial)], 51)];
  const other = { ...partial, figures: [] };
  const checks = comparePopulatedBudgets(live, run([row(17, partial), row(52, other)], 52), 0);
  expect(checks.map((c: { baseline: string; trisOk: boolean }) => [c.baseline, c.trisOk])).toEqual([
    ['raw early maximum', false], ['same early population', false], ['same full population', false],
  ]);
  const allowed = comparePopulatedBudgets(live, run([row(16, partial), row(15, other)], 51), 0);
  expect(allowed.every((c: { drawsOk: boolean; trisOk: boolean }) => c.drawsOk && c.trisOk)).toBe(true);
});

it('explains incomparable rosters when a complete earlier build has a different cast', () => {
  const prior = { ...fullPopulation, animals: fullPopulation.animals.slice(1) };
  expect(completePopulation(prior, { figures: prior.figures })).toBe(true);
  expect(() => comparePopulatedBudgets([{ early: [row(20, prior)], full: [row(40, prior)] }], run([row(30)]), 0)).toThrow(/different complete rosters/);
});

it('rejects an unmatched early population above the original two-live ceiling even when the fully populated budget passes', () => {
  const live = [run([row(15, partial)], 50), run([row(16, partial)], 51)];
  const checks = comparePopulatedBudgets(live, run([row(17)], 50), 0);
  expect(checks).toMatchObject([
    { baseline: 'raw early maximum', live: { triangles: 16 }, trisOk: false },
    { baseline: 'same full population', trisOk: true },
  ]);
});
