import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A few of the game's source files adapt Warpkeep code under Apache-2.0. Four places name them: NOTICE, the scope of
// the code licence, and the two notices the published site carries. Two files those lists named had been removed in
// 0.0.13, when the grass was rebuilt, and nothing noticed. This test holds the lists to the source files themselves.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const NOTICES = ['NOTICE', 'LICENSE-SCOPE.md', 'public/third-party-notices.txt', 'public/source-license/index.html'];
const named = (path: string) => [...new Set(read(path).match(/src\/[A-Za-z0-9_/.-]+\.ts/g) ?? [])].sort();

/** The game's source files whose header says they adapt Warpkeep code under Apache-2.0 (the separate study aside). */
const adapted = execFileSync('git', ['ls-files', '-z', 'src'], { cwd: root }).toString().split('\0')
  .filter((path) => path.endsWith('.ts') && !/^src\/gothic3/.test(path))
  .filter((path) => {
    const header = read(path).slice(0, 2000);
    return /Warpkeep/.test(header) && /Apache-2\.0/.test(header);
  })
  .sort();

describe('the notices of Warpkeep-derived source', () => {
  it('finds the adapted files by their headers', () => {
    expect(adapted.length).toBeGreaterThan(0);
  });

  it.each(NOTICES)('%s names exactly the files that adapt Warpkeep code', (notice) => {
    const paths = named(notice);
    for (const path of paths) expect(existsSync(join(root, path)), `${notice} names ${path}, which does not exist`).toBe(true);
    expect(paths).toEqual(adapted);
  });
});
