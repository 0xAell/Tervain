import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANIMAL_AUDIO } from '../../src/presentation/sound/animalAudio';

const ROOT = path.resolve(__dirname, '../..');
const sha256 = (file: string) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
interface FileRecord { path: string; bytes: number; sha256: string }
const derivatives = (JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/engineering/tervain-audio.json'), 'utf8')) as {
  derivatives: Record<string, FileRecord[]>;
}).derivatives;

describe('prepared animated animal sound assets', () => {
  const files = Object.values(ANIMAL_AUDIO.species).flatMap((animal) => [...animal.files]).sort();

  it('ships two Opus calls and AAC fallbacks per species, all with provenance', () => {
    expect(Object.keys(derivatives).filter((k) => k.startsWith('animal/')).map((k) => k.slice(7)).sort()).toEqual(files);
    expect(fs.readdirSync(path.join(ROOT, 'public', ANIMAL_AUDIO.base)).sort()).toEqual(files.flatMap((file) => [`${file}.m4a`, `${file}.ogg`]).sort());
    for (const file of files) {
      const ogg = fs.readFileSync(path.join(ROOT, 'public', ANIMAL_AUDIO.base, `${file}.ogg`));
      expect(ogg.subarray(0, 4).toString('latin1'), file).toBe('OggS');
      expect(ogg.subarray(28, 36).toString('latin1'), file).toBe('OpusHead');
      // OpusHead's channel-count byte: positioned calls must retain mono spatialization.
      expect(ogg[37], file).toBe(1);
      const m4a = fs.readFileSync(path.join(ROOT, 'public', ANIMAL_AUDIO.base, `${file}.m4a`));
      expect(m4a.subarray(4, 8).toString('latin1'), file).toBe('ftyp');
    }
  });

  it('keeps each species and performance distinct and verifiable', () => {
    const primary: string[] = [];
    for (const id of files) {
      const pair = derivatives[`animal/${id}`]!;
      expect(pair).toHaveLength(2);
      for (const file of pair) expect(sha256(file.path), file.path).toBe(file.sha256);
      primary.push(pair.find((file) => file.path.endsWith('.ogg'))!.sha256);
    }
    expect(new Set(primary).size).toBe(files.length);
  });
});
