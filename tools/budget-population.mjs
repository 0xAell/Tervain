import { readFileSync } from 'node:fs';

const gameData = (name) => JSON.parse(readFileSync(new URL('../data/game/' + name + '.json', import.meta.url), 'utf8'));
const residents = gameData('residents');

// The cast of a new journey includes figures who are asleep, away or hidden by their schedule.
export const expectedPopulation = {
  animals: gameData('animals').animals.map((animal) => animal.id).sort(),
  figures: [
    ...residents.residents.map((resident) => 'named:' + resident.id),
    ...residents.ambient.map((resident) => 'ambient:' + resident.id),
    ...gameData('enemies').posts.map((enemy) => 'enemy:' + enemy.id),
  ].sort(),
};

/** A live build supplies its own cast manifest. The procedural thornback also belongs to the encounter. */
export function servedRoster(app) {
  const roles = Object.entries(app.npcAssets.manifest.roles).filter(([role]) => !role.startsWith('menu:'));
  const figures = roles.map(([role, model]) => role.startsWith('ambient:') ? 'ambient:' + model : role);
  for (const enemy of app.enemies) if (!figures.includes('enemy:' + enemy.id)) figures.push('enemy:' + enemy.id);
  return { figures: figures.sort() };
}

/** Read the actual adopted models, even if the current camera cannot see them. Runs in the page. */
export function readPopulation(app) {
  const world = app.world;
  const module = (name) => world.modules.find((entry) => entry.name === name)?.module;
  const ambient = module('ambient').group.children.map((root) => root.userData.meshyNpc?.id).filter(Boolean);
  return {
    wildlife: world.animals.arrived === true,
    furniture: module('furniture')?.arrived === true,
    animals: world.animals.snapshot().map((animal) => animal.id).sort(),
    figures: [
      ...app.npcs.filter((npc) => npc.arrived).map((npc) => 'named:' + npc.id),
      ...app.enemies.filter((enemy) => enemy.arrived).map((enemy) => 'enemy:' + enemy.id),
      ...ambient.map((id) => 'ambient:' + id),
    ].sort(),
  };
}

const sameIds = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

export function completePopulation(population, expected = expectedPopulation) {
  return population.wildlife && population.furniture
    && population.animals.length > 0 && new Set(population.animals).size === population.animals.length
    && (!expected.animals || sameIds(population.animals, expected.animals))
    && expected.figures.length > 0 && sameIds(population.figures, expected.figures);
}

export function populationLabel(p) {
  return `${p.animals.length} animals (${p.wildlife ? 'attached' : 'pending'}), ${p.figures.length} figures, furniture ${p.furniture ? 'attached' : 'pending'}`;
}

function differentIds(want, have) {
  return [...want.filter((id) => !have.includes(id)).map((id) => 'missing ' + id),
    ...have.filter((id, i) => !want.includes(id) || have.indexOf(id) !== i).map((id) => 'unexpected ' + id)];
}

export async function waitForPopulation(page, label, expected = expectedPopulation, polls = 1200) {
  const stateCode = 'const T = window.tervain; return { population: window.__readBudgetPopulation(T), pending: T.arrivals.count, settled: window.__budgetWorldSettled, net: window.__gateNet }';
  let last, reason;
  for (let i = 0; i <= polls; i++) {
    last = await page.eval(stateCode);
    if (last.settled === 'failed' || last.settled === 'done' && (!last.population.wildlife || !last.population.furniture)) {
      reason = 'deferred asset loading finished without attaching the full world';
      break;
    }
    if (last.settled === 'done' && last.pending === 0) {
      if (completePopulation(last.population, expected)) return;
      reason = 'the arrival queue drained with missing or unexpected models';
      break;
    }
    if (i < polls) await page.wait(250);
  }
  const p = last.population;
  const difference = differentIds(expected.figures, p.figures);
  if (expected.animals) difference.push(...differentIds(expected.animals, p.animals));
  const details = [...(last.net?.bad ?? []), ...(last.net?.resources ?? []), ...(last.net?.rejections ?? []),
    ...(page.console?.() ?? []).filter((line) => /warning|error|exception/i.test(line))];
  throw new Error(`Budget population (${label}): ${reason ?? 'timed out waiting for late assets'}; ${populationLabel(p)}; ${last.pending} figures pending; world ${last.settled}. ${[...difference, ...details].join(', ')}`);
}

export function maximumBudget(samples) {
  return { calls: Math.max(...samples.map((x) => x[0])), triangles: Math.max(...samples.map((x) => x[1])) };
}

/** Always enforce the raw early and full budgets. Also check any early populations seen by both builds. */
export function comparePopulatedBudgets(liveSamples, candidate, allowance) {
  const reference = JSON.stringify(candidate.full[0][2]);
  if ([...liveSamples, candidate].some((run) => run.full.some((row) => JSON.stringify(row[2]) !== reference))) {
    throw new Error('Budget gate: FAIL: The builds have different complete rosters. Their populated render budgets are not comparable.');
  }
  const mature = maximumBudget(liveSamples.flatMap((run) => run.full));
  const early = liveSamples.flatMap((run) => run.early);
  // Keep the original gate unconditionally, even when different parts of the world have loaded at 15 s.
  const comparisons = [{ stage: '15 s', head: maximumBudget(candidate.early), live: maximumBudget(early), baseline: 'raw early maximum' }];
  const seen = new Set();
  for (const [, , p] of candidate.early) {
    const key = JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = (frames) => frames.filter((row) => JSON.stringify(row[2]) === key);
    const matchingLive = matches(early);
    if (matchingLive.length) comparisons.push({ stage: '15 s', head: maximumBudget(matches(candidate.early)),
      live: maximumBudget(matchingLive), baseline: 'same early population' });
  }
  comparisons.push({ stage: 'fully streamed', population: candidate.full[0][2], head: maximumBudget(candidate.full), live: mature, baseline: 'same full population' });
  return comparisons.map((row) => ({ ...row, drawsOk: row.head.calls <= row.live.calls, trisOk: row.head.triangles <= row.live.triangles + allowance }));
}
