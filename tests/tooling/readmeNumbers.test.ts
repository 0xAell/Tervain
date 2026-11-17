import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUICK_SLOT_COUNT } from '../../src/core/game/types';
import { WORLD } from '../../src/core/world/layout';

// The README's account of the prototype is the first page a visitor reads. Its numbers are the data's: the docs under
// docs/unreal have tests/tooling/docNumbers.test.ts, and this holds the README's own list to the exported data the same
// way, so a resident, an animal or a hostile added or taken away cannot leave it behind.

const text = (path: string) => readFileSync(path, 'utf8');
const data = <T>(path: string) => JSON.parse(text(path)) as T;
const readme = text('README.md').replace(/\s+/g, ' ');
const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const word = (n: number) => words[n] ?? String(n);
const cap = (value: string) => value[0]!.toUpperCase() + value.slice(1);

const residents = data<{ residents: unknown[] }>('data/game/residents.json').residents;
const animals = data<{ animals: { species: string; huntable: boolean }[] }>('data/game/animals.json').animals;
const archetypes = data<{ archetypes: Record<string, unknown> }>('data/game/enemies.json').archetypes, hostiles = Object.keys(archetypes);

describe('the README’s account of the prototype', () => {
  it('gives the region’s size from the layout', () => {
    expect(readme).toContain(`one small region, ${WORLD.maxX - WORLD.minX} m by ${WORLD.maxZ - WORLD.minZ} m`);
  });

  it('counts the residents, the animals and their kinds, and the hostiles as the data does', () => {
    const kinds = new Set(animals.map((animal) => animal.species)).size, hunted = animals.filter((animal) => animal.huntable).length;
    expect(readme).toContain(`${cap(word(residents.length))} named residents`);
    expect(readme).toContain(`${cap(word(animals.length))} animals of ${word(kinds)} kinds. ${cap(word(hunted))} can be hunted`);
    expect(readme).toContain(`against ${word(hostiles.length)} kinds of hostile`);
  });

  it('names the animals that are left alone', () => {
    // "The cats, the dogs and the saddled deer are left alone": every animal that cannot be hunted is one of those.
    const spared = new Set(animals.filter((animal) => !animal.huntable).map((animal) => animal.species));
    expect([...spared].sort()).toEqual(['cat', 'deer', 'dog']);
    expect(readme).toContain('The cats, the dogs and the saddled deer are left alone');
  });

  it('gives the hotbar its slots', () => {
    expect(readme).toContain(`a ${word(QUICK_SLOT_COUNT)}-slot hotbar`);
  });
});
