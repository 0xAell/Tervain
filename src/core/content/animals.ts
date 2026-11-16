import type { V2 } from '../world/layout';
import { CARAVAN_ANIMAL_REST } from '../world/caravanAnimal';

export const ANIMAL_TRIANGLE_LIMIT = 50_000;
export type AnimalSpecies = 'tiger' | 'lion' | 'bear' | 'wolf' | 'cat' | 'dog' | 'boar' | 'deer';
export type AnimalClip = 'Idle' | 'Walk' | 'Run' | 'Alert' | 'Call' | 'Graze' | 'Groom' | 'Sleep';
export type AnimalHabitat = 'settlement' | 'caravan-rest' | 'woodland' | 'deepwood' | 'rocky-woodland' | 'warm-woodland';
export interface AnimalDefinition {
  readonly id: string;
  readonly species: AnimalSpecies;
  readonly file: string;
  readonly habitat: AnimalHabitat;
  readonly home: V2;
  readonly roam: number;
  /** The paces it walks and runs at (m/s); 0 for an animal that never walks. */
  readonly walk: number;
  readonly run: number;
  readonly seated?: boolean;
  /** Domesticated animals watch nearby travellers instead of fleeing from them. */
  readonly tame?: boolean;
  readonly homeYaw?: number;
}

/**
 * The pace each animal walks and runs at (m/s), by model id. These are the speeds the game plays. They were measured
 * from the strides of the supplied models, so the drawn feet do not slide: whoever draws an animal plays its stride
 * at the pace it is given, and a port gives its own animations the same paces.
 */
const PACE: Readonly<Record<string, readonly [walk: number, run: number]>> = {
  '1005232739': [0.417, 1.650], '1005232726': [0.419, 1.691],
  '1005170943': [0.520, 1.475], '1005232657': [0.511, 1.452],
  '1005232644': [0.394, 1.199], '1005232637': [0.385, 1.182], '1005232631': [0.397, 1.205],
  '1005232619': [0.156, 0.487], '1005232608': [0, 0], '1005232556': [0.140, 0.459],
  '1005232529': [0.334, 1.018], '1005232511': [0.324, 1.000],
  '1005232450': [0.371, 1.045], '1005232442': [0.353, 0.996], '1005174818': [0.371, 1.044],
  '1005232424': [0.634, 2.097], '1005232412': [0.633, 2.092], '1005232351': [0.622, 0.995], '1005232341': [0.633, 2.092],
};

const entry = (species: AnimalSpecies, id: string, habitat: AnimalHabitat, x: number, z: number, roam: number, seated = false): AnimalDefinition => ({
  id, species, file: `${species}-${id}.glb`, habitat, home: { x, z }, roam, walk: PACE[id]![0], run: PACE[id]![1], ...(seated ? { seated: true } : {}),
});

/** All supplied animals have a persistent home, including on the lowest presentation preset.
 * Homes flank travelled routes; the eastern ochre woods are the warmer habitat for the two big cats. */
export const ANIMALS: readonly AnimalDefinition[] = [
  entry('tiger', '1005232739', 'warm-woodland', 107, 22, 19),
  entry('lion', '1005232726', 'warm-woodland', 112, 51, 19),
  entry('bear', '1005170943', 'rocky-woodland', -180, -57, 17),
  entry('bear', '1005232657', 'rocky-woodland', -149, -62, 17),
  entry('wolf', '1005232644', 'deepwood', -175, 5, 16),
  entry('wolf', '1005232637', 'deepwood', -166, 37, 16),
  entry('wolf', '1005232631', 'deepwood', -190, 25, 16),
  entry('cat', '1005232619', 'settlement', -83, 37, 7),
  entry('cat', '1005232608', 'settlement', -98, 54, 0, true),
  entry('cat', '1005232556', 'settlement', -10, 27, 7),
  entry('dog', '1005232529', 'settlement', -87, 20, 9),
  entry('dog', '1005232511', 'settlement', 0, 15, 9),
  entry('boar', '1005232450', 'woodland', -205, -7, 13),
  entry('boar', '1005232442', 'woodland', -188, -19, 13),
  entry('boar', '1005174818', 'woodland', -157, 55, 14),
  entry('deer', '1005232424', 'woodland', -218, 44, 12),
  { ...entry('deer', '1005232412', 'caravan-rest', CARAVAN_ANIMAL_REST.x, CARAVAN_ANIMAL_REST.z, 0), tame: true, homeYaw: CARAVAN_ANIMAL_REST.yaw },
  entry('deer', '1005232351', 'woodland', -146, 28, 16),
  entry('deer', '1005232341', 'woodland', -119, 28, 16),
];

/** How near each kind lets someone come (m): it looks up within `notice`, and flees, or a predator stands its ground, within `flee`. */
export const ANIMAL_SENSES: Record<AnimalSpecies, { notice: number; flee: number }> = {
  tiger: { notice: 13, flee: 6 },
  lion: { notice: 13, flee: 6 },
  bear: { notice: 14, flee: 7 },
  wolf: { notice: 14, flee: 8 },
  cat: { notice: 4.5, flee: 2 },
  dog: { notice: 5, flee: 2.8 },
  boar: { notice: 12, flee: 6 },
  deer: { notice: 16, flee: 10 },
};

/** An animal's home is sought for its drawn footprint and this much more each way (m). */
export const ANIMAL_HOME_MARGIN = 0.14;

/** How long an animal holds a gesture before it moves on (s). The supplied models' clips run exactly this long, and a port's montages keep it. */
export const ANIMAL_GESTURE_SECONDS: Readonly<Record<'Alert' | 'Call' | 'Groom', number>> = { Alert: 2, Call: 4, Groom: 4 };

/** How far each kind's call carries (m): an animal calls only when someone is within it, and the call is heard out to it. */
export const ANIMAL_CALL_REACH: Readonly<Record<AnimalSpecies, number>> = { tiger: 76, lion: 82, bear: 62, wolf: 75, cat: 24, dog: 46, boar: 44, deer: 40 };

/**
 * How each kind meets the hunter (A70). Predators hold their ground, watching, until he comes within `holdUntil` of their
 * flee distance; herd and pack animals carry an alarm to their own kind within `herd` metres, so a shot scatters a group.
 */
export const ANIMAL_TEMPERAMENT: Record<AnimalSpecies, { holdUntil: number; herd: number }> = {
  tiger: { holdUntil: 0.55, herd: 0 }, lion: { holdUntil: 0.55, herd: 0 }, bear: { holdUntil: 0.6, herd: 0 },
  wolf: { holdUntil: 0.65, herd: 35 }, cat: { holdUntil: 1, herd: 0 }, dog: { holdUntil: 1, herd: 0 },
  boar: { holdUntil: 1, herd: 18 }, deer: { holdUntil: 1, herd: 24 },
};

/** The kinds that graze when they settle; the others stand idle. */
export const GRAZERS: readonly AnimalSpecies[] = ['deer', 'boar'];

/**
 * The motions an animal has: what its mind may do, and what its model must carry (the scene refuses a model without
 * every one). A seated animal grooms and sleeps; a grazer grazes.
 */
export function requiredAnimalClips(definition: Pick<AnimalDefinition, 'species' | 'seated'>): readonly AnimalClip[] {
  if (definition.seated) return ['Idle', 'Alert', 'Call', 'Groom', 'Sleep'];
  return GRAZERS.includes(definition.species) ? ['Idle', 'Walk', 'Run', 'Alert', 'Call', 'Graze'] : ['Idle', 'Walk', 'Run', 'Alert', 'Call'];
}
