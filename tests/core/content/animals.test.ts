import { describe, expect, it } from 'vitest';
import { ANIMALS, ANIMAL_CALL_REACH, ANIMAL_GESTURE_SECONDS, ANIMAL_SENSES, ANIMAL_TEMPERAMENT, ANIMAL_TRIANGLE_LIMIT, GRAZERS, requiredAnimalClips, type AnimalSpecies } from '../../../src/core/content/animals';
import { CARAVAN_ANIMAL_REST } from '../../../src/core/world/caravanAnimal';
import { WORLD } from '../../../src/core/world/layout';

const SPECIES: AnimalSpecies[] = ['tiger', 'lion', 'bear', 'wolf', 'cat', 'dog', 'boar', 'deer'];

describe('the animal roster', () => {
  it('lists nineteen animals with unique ids, each with a model file named after its species and id', () => {
    expect(ANIMALS).toHaveLength(19);
    expect(new Set(ANIMALS.map((a) => a.id)).size).toBe(19);
    for (const animal of ANIMALS) {
      expect(SPECIES).toContain(animal.species);
      expect(animal.file).toBe(`${animal.species}-${animal.id}.glb`);
    }
  });

  it('gives every animal a home inside the world and a roaming range', () => {
    for (const animal of ANIMALS) {
      expect(animal.home.x).toBeGreaterThan(WORLD.minX); expect(animal.home.x).toBeLessThan(WORLD.maxX);
      expect(animal.home.z).toBeGreaterThan(WORLD.minZ); expect(animal.home.z).toBeLessThan(WORLD.maxZ);
      expect(animal.roam).toBeGreaterThanOrEqual(0);
      if (!animal.seated && !animal.tame) expect(animal.roam).toBeGreaterThan(0);
    }
  });

  it('has exactly one tame mount, the saddled deer at the caravan’s rest, and one seated cat', () => {
    const tame = ANIMALS.filter((a) => a.tame);
    expect(tame).toHaveLength(1);
    expect(tame[0]).toMatchObject({ species: 'deer', habitat: 'caravan-rest', home: { x: CARAVAN_ANIMAL_REST.x, z: CARAVAN_ANIMAL_REST.z }, homeYaw: CARAVAN_ANIMAL_REST.yaw, roam: 0 });
    const seated = ANIMALS.filter((a) => a.seated);
    expect(seated.map((a) => a.species)).toEqual(['cat']);
  });

  it('keeps the big cats in the warm woodland and the pets in the settlements', () => {
    for (const animal of ANIMALS) {
      if (animal.species === 'tiger' || animal.species === 'lion') expect(animal.habitat).toBe('warm-woodland');
      if (animal.species === 'cat' || animal.species === 'dog') expect(animal.habitat).toBe('settlement');
    }
  });
});

describe('how each kind moves and meets the hunter', () => {
  it('has senses, a temperament and a call for every species, noticing before fleeing and calling from beyond', () => {
    for (const species of SPECIES) {
      const senses = ANIMAL_SENSES[species], temper = ANIMAL_TEMPERAMENT[species];
      expect(senses.notice).toBeGreaterThan(senses.flee);
      expect(temper.holdUntil).toBeGreaterThan(0); expect(temper.holdUntil).toBeLessThanOrEqual(1);
      expect(temper.herd).toBeGreaterThanOrEqual(0);
      expect(ANIMAL_CALL_REACH[species]).toBeGreaterThan(senses.notice);
    }
  });

  it('gives every animal its own pace, running faster than walking, and none to the one that only sits', () => {
    for (const animal of ANIMALS) {
      if (animal.seated) { expect([animal.walk, animal.run], animal.id).toEqual([0, 0]); continue; }
      expect(animal.walk, animal.id).toBeGreaterThan(0.1);
      expect(animal.run, animal.id).toBeGreaterThan(animal.walk);
    }
    // One deer's stride is a trot, not a gallop: its pace is what it plays, not the others' (no average is taken).
    expect(ANIMALS.find((animal) => animal.id === '1005232351')!.run).toBeLessThan(1.2);
    expect(ANIMALS.find((animal) => animal.id === '1005232341')!.run).toBeGreaterThan(2);
  });

  it('holds a gesture for a set length: a look up, a call, a groom', () => {
    expect(ANIMAL_GESTURE_SECONDS).toEqual({ Alert: 2, Call: 4, Groom: 4 });
  });

  it('lets predators hold their ground, and carries an alarm through wolves, boar and deer', () => {
    for (const species of ['tiger', 'lion', 'bear', 'wolf'] as const) expect(ANIMAL_TEMPERAMENT[species].holdUntil).toBeLessThan(1);
    for (const species of ['wolf', 'boar', 'deer'] as const) expect(ANIMAL_TEMPERAMENT[species].herd).toBeGreaterThan(0);
    for (const species of ['tiger', 'lion', 'bear', 'cat', 'dog'] as const) expect(ANIMAL_TEMPERAMENT[species].herd).toBe(0);
  });

  it('needs grazing clips of deer and boar, and grooming and sleeping clips of a seated animal', () => {
    const of = (species: AnimalSpecies, seated = false) => requiredAnimalClips(ANIMALS.find((a) => a.species === species && !!a.seated === seated)!);
    expect(of('deer')).toEqual(['Idle', 'Walk', 'Run', 'Alert', 'Call', 'Graze']);
    expect(of('boar')).toContain('Graze');
    expect(of('wolf')).toEqual(['Idle', 'Walk', 'Run', 'Alert', 'Call']);
    expect(of('cat', true)).toEqual(['Idle', 'Alert', 'Call', 'Groom', 'Sleep']);
  });

  it('holds every animal to the 50,000-triangle budget', () => {
    expect(ANIMAL_TRIANGLE_LIMIT).toBe(50_000);
  });
});

describe('which animals graze', () => {
  it('is the kind\u2019s, not the model\u2019s: deer and boar graze, and each has the motion for it; the rest stand idle', () => {
    expect([...GRAZERS].sort()).toEqual(['boar', 'deer']);
    for (const animal of ANIMALS) {
      expect(requiredAnimalClips(animal).includes('Graze'), animal.id).toBe(!animal.seated && GRAZERS.includes(animal.species));
    }
  });
});
