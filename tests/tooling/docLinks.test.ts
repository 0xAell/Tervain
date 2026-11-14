import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The documents that describe the repository as it is now must not point at files that are gone. This test follows
// every relative link in them. Dated records elsewhere under docs/ are not held to it.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Folders and files whose links are checked. */
const CHECKED = ['README.md', 'CONTRIBUTING.md', 'docs/README.md', 'docs/unreal', 'data', 'src/core/README.md'];

function markdown(path: string): string[] {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return path.endsWith('.md') ? [path] : [];
  return readdirSync(absolute).flatMap((name) => markdown(join(path, name)));
}

/** Relative link targets of a Markdown file, without anchors; web links, anchors and code are skipped. */
export function relativeLinks(text: string): string[] {
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const targets = [...withoutCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g), ...withoutCode.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]!);
  return targets.filter((target) => !/^(https?:|mailto:|#)/.test(target)).map((target) => decodeURIComponent(target.split('#')[0]!)).filter(Boolean);
}

describe('links in the current documents', () => {
  const files = CHECKED.flatMap(markdown);

  it('covers the documents that describe the repository', () => {
    expect(files).toContain('README.md');
    for (const expected of ['docs/unreal/README.md', 'docs/unreal/system-mapping.md', 'docs/unreal/conventions.md', 'docs/unreal/web-target.md', 'docs/unreal/roadmap.md', 'data/README.md', 'data/assets/README.md', 'src/core/README.md']) expect(files).toContain(expected);
  });

  it('all point at files that exist', () => {
    const broken: string[] = [];
    for (const file of files) {
      for (const target of relativeLinks(readFileSync(join(root, file), 'utf8'))) {
        const resolved = resolve(root, dirname(file), target);
        if (!existsSync(resolved)) broken.push(`${file} -> ${target} (${relative(root, resolved)})`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('reads links the way Markdown writes them', () => {
    expect(relativeLinks('See [a](docs/a.md), [b](../b.md#part "title") and [web](https://example.com), [top](#top).')).toEqual(['docs/a.md', '../b.md']);
    expect(relativeLinks('`[not](a/link.md)` and\n```\n[nor](this.md)\n```\n<img src="docs/pic.jpg" width="49%">')).toEqual(['docs/pic.jpg']);
  });
});
