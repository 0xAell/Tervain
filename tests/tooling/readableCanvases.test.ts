import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A 2D canvas the game reads back with getImageData is created as a CPU canvas (`willReadFrequently: true`). A browser
// otherwise keeps a canvas on the GPU, and reading one back waits for the graphics process to finish every frame queued
// before it. The rugs (furniture.ts) and the residents' sheets (human/overrides.ts) are made while the world is already
// drawing: on a software renderer each read stalled the page for about ten seconds, 46 s in the first minute of play,
// and on a GPU each is a hitch.

const sources = execFileSync('git', ['ls-files', '-z', 'src'], { encoding: 'utf8' }).split('\0')
  .filter((path) => path.endsWith('.ts') && !/^src\/gothic3/.test(path));

/** Each `name.getImageData(` in a file, with the 2D context `name` was created as (its getContext call), or null. */
function readBacks(text: string): { name: string; created: string | null }[] {
  const created = (name: string): string | null => {
    // `const name = canvas.getContext('2d', ...)`
    const direct = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*[^;\\n]*?getContext\\('2d'[^)]*\\)`).exec(text);
    if (direct) return direct[0];
    // `const [, name] = helper(...)`, where the helper in the same file returns the context it makes.
    const helper = new RegExp(`(?:const|let)\\s+\\[[^\\]]*\\b${name}\\]\\s*=\\s*(\\w+)\\(`).exec(text);
    if (!helper) return null;
    const body = new RegExp(`function\\s+${helper[1]}\\([^]*?\\n\\}`).exec(text)?.[0] ?? '';
    return /getContext\('2d'[^)]*\)/.exec(body)?.[0] ?? null;
  };
  return [...text.matchAll(/(\w+)\.getImageData\(/g)].map(([, name = '']) => ({ name, created: created(name) }));
}

describe('canvases the game reads back', () => {
  it('finds the reads', () => {
    const files = sources.filter((path) => readBacks(readFileSync(path, 'utf8')).length);
    expect(files).toEqual(expect.arrayContaining(['src/presentation/furniture.ts', 'src/presentation/human/overrides.ts']));
  });

  it.each(sources.filter((path) => readBacks(readFileSync(path, 'utf8')).length))('%s reads back only CPU canvases', (path) => {
    for (const { name, created } of readBacks(readFileSync(path, 'utf8'))) {
      expect(created, `${path}: where ${name} is created`).not.toBeNull();
      expect(created, `${path}: ${name}`).toMatch(/willReadFrequently:\s*true/);
    }
  });
});
