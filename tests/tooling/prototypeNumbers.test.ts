import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUICK_SLOT_COUNT } from '../../src/core/game/types';
import { WORLD } from '../../src/core/world/layout';
import { readGlb } from '../presentation/glbFixture';

// The README's account of the prototype is the first page a visitor reads, and the prototype guide
// (docs/engineering/prototype.md) the first a contributor reads. Their numbers are the data's: the docs under
// docs/unreal have tests/tooling/docNumbers.test.ts, and this holds the README's list and the guide's to the exported
// data and the shipped files the same way, so a resident, an animal, a hostile or a new model added or taken away
// cannot leave them behind. The guide had kept eleven residents and the hero's 49,500-triangle model of 0.0.5.

const text = (path: string) => readFileSync(path, 'utf8');
const data = <T>(path: string) => JSON.parse(text(path)) as T;
const readme = text('README.md').replace(/\s+/g, ' ');
const guide = text('docs/engineering/prototype.md').replace(/\s+/g, ' ');
const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const word = (n: number) => words[n] ?? String(n);
const cap = (value: string) => value[0]!.toUpperCase() + value.slice(1);
const grouped = (n: number) => n.toLocaleString('en-GB');
// A page that has lost a phrase fails with the phrase, not with the whole page printed beside it.
const says = (page: string, name: string) => (phrase: string) => expect(page.includes(phrase), `${name} does not say “${phrase}”`).toBe(true);
const readmeSays = says(readme, 'The README'), guideSays = says(guide, 'The prototype guide');

const residents = data<{ residents: unknown[] }>('data/game/residents.json').residents;
const animals = data<{ animals: { species: string; huntable: boolean }[] }>('data/game/animals.json').animals;
const voice = Object.values(data<{ lines: Record<string, { speaker: string }> }>('data/game/voice.json').lines);
const cargo = data<{ Kind: string }[]>('data/unreal/DT_LooseCargo.json');
const cast = data<{ maxTriangles: number; assets: { rig?: { file: string } }[] }>('public/models/npcs/manifest.json');
const archetypes = data<{ archetypes: Record<string, unknown> }>('data/game/enemies.json').archetypes, hostiles = Object.keys(archetypes);

describe('the README’s account of the prototype', () => {
  it('gives the region’s size from the layout', () => {
    readmeSays(`one small region, ${WORLD.maxX - WORLD.minX} m by ${WORLD.maxZ - WORLD.minZ} m`);
  });

  it('counts the residents, the animals and their kinds, and the hostiles as the data does', () => {
    const kinds = new Set(animals.map((animal) => animal.species)).size, hunted = animals.filter((animal) => animal.huntable).length;
    readmeSays(`${cap(word(residents.length))} named residents`);
    readmeSays(`${cap(word(animals.length))} animals of ${word(kinds)} kinds. ${cap(word(hunted))} can be hunted`);
    readmeSays(`against ${word(hostiles.length)} kinds of hostile`);
  });

  it('names the animals that are left alone', () => {
    // "The cats, the dogs and the saddled deer are left alone": every animal that cannot be hunted is one of those.
    const spared = new Set(animals.filter((animal) => !animal.huntable).map((animal) => animal.species));
    expect([...spared].sort()).toEqual(['cat', 'deer', 'dog']);
    readmeSays('The cats, the dogs and the saddled deer are left alone');
  });

  it('gives the hotbar its slots', () => {
    readmeSays(`a ${word(QUICK_SLOT_COUNT)}-slot hotbar`);
  });
});

describe('the prototype guide’s account of what is real', () => {
  it('counts the residents, and every one of them speaks', () => {
    const ids = residents.map((resident) => (resident as { id: string }).id), speakers = new Set(voice.map((line) => line.speaker));
    expect(ids.every((id) => speakers.has(id)), 'a resident without a spoken line').toBe(true);
    guideSays(`${cap(word(ids.length))} named residents with schedules`);
    guideSays(`The hero and ${word(ids.length)} residents speak`);
  });

  it('draws the other people from the supplied models, each on a rig of its own', () => {
    const joints = new Set(cast.assets.map((asset) => asset.rig ? data<{ bones: unknown[] }>(`public/models/npcs/${asset.rig.file}`).bones.length : 0));
    expect([...joints], 'every supplied model has a rig, all of one size').toHaveLength(1);
    guideSays(`are the ${word(cast.assets.length)} supplied models, slightly remixed under A49 (at most ${grouped(cast.maxTriangles)} triangles each)`);
    guideSays(`each has a ${[...joints][0]}-joint rig of its own`);
  });

  it('gives the hero’s body its triangles as the shipped file has them', () => {
    const { json } = readGlb('hero/weathered-wanderer-hero-sealed.glb');
    let triangles = 0;
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    guideSays(`a body of ${grouped(triangles)} triangles`);
  });

  it('counts the supplies that move and the quick slots', () => {
    const barrels = cargo.filter((row) => row.Kind === 'Barrel').length, crates = cargo.filter((row) => row.Kind === 'Crate').length;
    expect(barrels + crates).toBe(cargo.length);
    guideSays(`${cap(word(cargo.length))} movable supplies: ${word(barrels)} barrels and ${word(crates)} crates`);
    guideSays(`${word(QUICK_SLOT_COUNT)} empty fresh 1–0 slots`);
  });
});
