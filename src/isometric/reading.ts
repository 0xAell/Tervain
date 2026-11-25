import recorded from './spokenCatalogue.json';

/** Start and length are decoded samples at 24 kHz, independent of the device sample rate. */
export type Cue = readonly [bank: number, start: number, samples: number];
export const sampleRate = 24000;
export const catalogue = recorded as unknown as {
  files: string[];
  story: Record<string, Cue>;
  lines: Record<string, Cue>;
  reader: Record<string, Cue>;
  effects: Record<string, Cue[]>;
  beds: Record<string, string>;
  music: Record<string, string>;
  encounters: Record<string, { cue: Cue; text: string; speaker: string }>;
};
export type VoiceMode = 'full' | 'characters' | 'off';
export type SpokenPart = { cue: Cue; caption?: string; inWorld?: boolean };
export const readKey = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKC')
    .replaceAll('’', "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();
const longest = Math.max(...Object.keys(catalogue.reader).map((k) => k.split(' ').length));

function numberWords(digits: string): string[] {
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || digits.length > 10) return [...digits];
  for (const [scale, name] of [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1000, 'thousand'],
    [100, 'hundred'],
  ] as const) {
    if (n >= scale)
      return [
        ...numberWords(String(Math.floor(n / scale))),
        name,
        ...(n % scale ? numberWords(String(n % scale)) : []),
      ];
  }
  return [String(n)];
}

/** Match recorded sentences first. Live values, bindings and compound prompts reuse the same reader's takes. */
export function readingKeys(text: string): string[] {
  const direct = readKey(text);
  if (!direct) return [];
  if (catalogue.reader[direct]) return [direct];
  const natural = text
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1')
    .replace(
      /\b(\d{1,2}):(\d\d)\b/g,
      (_, h: string, m: string) =>
        Number(h) + ' ' + (m === '00' ? '' : Number(m) < 10 ? 'oh ' + Number(m) : Number(m))
    )
    .replace(/\b(\d+)\.(\d+)\b/g, (_, n: string, fraction: string) => n + ' point ' + [...fraction].join(' '))
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 of $2')
    .replace(/×/g, ' times ')
    .replace(/%/g, ' percent ')
    .replace(/\+/g, ' plus ')
    .replace(/−/g, ' minus ')
    .replace(/↑/g, ' upstairs ')
    .replace(/↓/g, ' downstairs ')
    .replace(/◆/g, ' outside ')
    .replace(/\b(Key|Digit)([A-Z0-9])\b/g, '$2')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  const words = readKey(natural).split(' ').filter(Boolean);
  const result: string[] = [];
  for (let i = 0; i < words.length; ) {
    let end = Math.min(words.length, i + longest);
    while (end > i && !catalogue.reader[words.slice(i, end).join(' ')]) end--;
    if (end > i) {
      result.push(words.slice(i, end).join(' '));
      i = end;
      continue;
    }
    const word = words[i++]!;
    if (/^\d+$/.test(word)) result.push(...numberWords(word));
    else for (const letter of word) if (catalogue.reader[letter]) result.push(letter);
  }
  return result;
}
export const readText = (text: string): SpokenPart[] =>
  readingKeys(text).map((k) => ({ cue: catalogue.reader[k]! }));
