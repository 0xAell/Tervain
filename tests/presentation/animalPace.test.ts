import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANIMALS } from '../../src/core/content/animals';

// The core gives each animal its pace, and the scene plays the drawn stride faster or slower to match it. Each supplied
// model records the ground speed its walk and run were drawn at; the core's paces are those measurements, so the web
// build plays every stride at its own speed and the feet do not slide. A model replaced by one with another stride
// fails here until its pace in the core is measured again.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
type Strides = { Walk?: number; Run?: number };

/** The stride speeds a model file records (glTF binary: the JSON chunk follows the 20-byte header). */
function recordedStrides(file: string): Strides {
  const data = readFileSync(join(root, 'public', 'models', 'animals', file));
  const json: unknown = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
  let found: Strides | undefined;
  const search = (value: unknown): void => {
    if (found || !value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.motionSpeeds && typeof record.motionSpeeds === 'object') { found = record.motionSpeeds as Strides; return; }
    Object.values(record).forEach(search);
  };
  search(json);
  return found ?? {};
}

describe('the pace of each animal', () => {
  it('is the stride its model was drawn at, to the millimetre a second', () => {
    for (const animal of ANIMALS) {
      const strides = recordedStrides(animal.file);
      if (animal.seated) { expect(strides.Walk ?? 0, animal.id).toBe(0); continue; }
      expect(Math.abs(animal.walk - strides.Walk!), `${animal.id} walk`).toBeLessThanOrEqual(0.0005);
      expect(Math.abs(animal.run - strides.Run!), `${animal.id} run`).toBeLessThanOrEqual(0.0005);
    }
  });
});
