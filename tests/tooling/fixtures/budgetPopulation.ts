import { symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import animals from '../../../data/game/animals.json';
import residents from '../../../data/game/residents.json';
import enemies from '../../../data/game/enemies.json';

export function installPopulationProbe(dir: string) {
  // Resolve the gate's expected roster from the real checked-in exports, just as the CLI does.
  symlinkSync(resolve('tools/budget-population.mjs'), join(dir, 'budget-population.mjs'));
}

export const fullPopulation = {
  wildlife: true, furniture: true, animals: animals.animals.map((a) => a.id).sort(),
  figures: [...residents.residents.map((n) => 'named:' + n.id), ...residents.ambient.map((n) => 'ambient:' + n.id),
    ...enemies.posts.map((e) => 'enemy:' + e.id)].sort(),
};

export const installFixtureWorld = `
Object.assign(T, {
  arrivals: { count: 0 },
  npcAssets: { manifest: { roles: ${JSON.stringify(Object.fromEntries(fullPopulation.figures.filter((r) => r !== 'enemy:cut_creature').map((r) => [r, r.split(':')[1]])))} } },
  npcs: ${JSON.stringify(residents.residents.map(({ id }) => ({ id, arrived: true })))},
  enemies: ${JSON.stringify(enemies.posts.map(({ id }) => ({ id, arrived: true })))}
});
Object.assign(T.world, {
  arrived: Promise.resolve(),
  animals: { arrived: true, snapshot: () => ${JSON.stringify(animals.animals.map(({ id }) => ({ id })))} },
  modules: [
    {name:'ambient',module:{group:{children:${JSON.stringify(residents.ambient.map(({ id }) => ({ userData: { meshyNpc: { id } } })))}}}},
    {name:'furniture',module:{arrived:true}}
  ]
});
window.requestAnimationFrame = (callback) => queueMicrotask(callback);
`;
