import { ANIMAL_CALL_REACH } from '../../core/content/animals';
import type { Vec3 } from '../../core/rules/soundscape';

/** Calls belong to the animated animal that makes them; none are ambient beds or listener-relative emitters. A call is
 * heard out to the reach the core gives it, the same reach within which an animal calls at all. */
export const ANIMAL_AUDIO = {
  base: 'audio/animals/',
  species: {
    tiger: { files: ['tiger-1', 'tiger-2'], gain: 0.58, ref: 6, maxDistance: ANIMAL_CALL_REACH.tiger },
    lion: { files: ['lion-1', 'lion-2'], gain: 0.62, ref: 7, maxDistance: ANIMAL_CALL_REACH.lion },
    bear: { files: ['bear-1', 'bear-2'], gain: 0.52, ref: 5, maxDistance: ANIMAL_CALL_REACH.bear },
    wolf: { files: ['wolf-1', 'wolf-2'], gain: 0.55, ref: 6, maxDistance: ANIMAL_CALL_REACH.wolf },
    cat: { files: ['cat-1', 'cat-2'], gain: 0.4, ref: 1.8, maxDistance: ANIMAL_CALL_REACH.cat },
    dog: { files: ['dog-1', 'dog-2'], gain: 0.46, ref: 3.8, maxDistance: ANIMAL_CALL_REACH.dog },
    boar: { files: ['boar-1', 'boar-2'], gain: 0.45, ref: 3.5, maxDistance: ANIMAL_CALL_REACH.boar },
    deer: { files: ['deer-1', 'deer-2'], gain: 0.4, ref: 3.5, maxDistance: ANIMAL_CALL_REACH.deer },
  },
} as const;

export type AnimalSpecies = keyof typeof ANIMAL_AUDIO.species;
export type AnimalCallFile = typeof ANIMAL_AUDIO.species[AnimalSpecies]['files'][number];
export interface AnimalCall {
  readonly id: string;
  readonly species: AnimalSpecies;
  readonly position: Vec3;
  readonly callVariant: 1 | 2;
}

export const ANIMAL_CALL_EVENT = 'wildlife:animal-call';
export const ANIMAL_VOICE_LIMIT = 3;
/** Defensive protection against duplicate gesture events; the actors normally rest 28–70 seconds between calls. */
export const ANIMAL_CALL_COOLDOWN = 12;

/** A malformed presentation event cannot allocate audio nodes or contaminate the listener's spatial graph. */
export function animalCallDetail(detail: unknown): AnimalCall | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Partial<AnimalCall>;
  if (typeof d.id !== 'string' || !d.id || d.id.length > 120 || typeof d.species !== 'string'
    || !Object.hasOwn(ANIMAL_AUDIO.species, d.species) || (d.callVariant !== 1 && d.callVariant !== 2)) return null;
  const p = d.position;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
  return { id: d.id, species: d.species, position: { x: p.x, y: p.y, z: p.z }, callVariant: d.callVariant };
}
