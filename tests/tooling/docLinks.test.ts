import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// No document may point at a file that is gone. This test follows every relative link in the repository's Markdown,
// dated records included: a record that names a file should still lead to it, or say that it was removed.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Folders and files whose links are checked. */
const CHECKED = ['README.md', 'CONTRIBUTING.md', 'LICENSE-SCOPE.md', 'docs', 'data', 'unreal', 'src', 'tools'];

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

describe('links in the documents', () => {
  const files = CHECKED.flatMap(markdown);

  it('covers the documents that describe the repository', () => {
    expect(files).toContain('README.md');
    for (const expected of ['docs/unreal/README.md', 'docs/unreal/system-mapping.md', 'docs/unreal/conventions.md', 'docs/unreal/web-target.md', 'docs/unreal/roadmap.md', 'data/README.md', 'data/assets/README.md', 'unreal/README.md', 'src/core/README.md']) expect(files).toContain(expected);
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

/** A heading's anchor as GitHub makes it: lower case, punctuation dropped, spaces to hyphens. */
export function anchorOf(heading: string): string {
  return heading.replace(/`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
}

/** Every anchor a Markdown file offers. */
function anchors(text: string): Set<string> {
  return new Set([...text.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6} +(.+?) *$/gm)].map((match) => anchorOf(match[1]!)));
}

/** Links with an anchor: `[file or '', anchor]`. */
export function anchoredLinks(text: string): [string, string][] {
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...withoutCode.matchAll(/\]\(([^)\s#]*)#([^)\s]+)(?:\s+"[^"]*")?\)/g)].filter((match) => !/^(https?:|mailto:)/.test(match[1]!)).map((match) => [decodeURIComponent(match[1]!), decodeURIComponent(match[2]!)]);
}

describe('anchors in the documents', () => {
  it('all name a heading of the file they point into', () => {
    const broken: string[] = [];
    for (const file of CHECKED.flatMap(markdown)) {
      const own = readFileSync(join(root, file), 'utf8');
      for (const [target, anchor] of anchoredLinks(own)) {
        const resolved = target ? resolve(root, dirname(file), target) : join(root, file);
        if (!existsSync(resolved) || !resolved.endsWith('.md')) continue; // a missing file is the other test's finding
        if (!anchors(target ? readFileSync(resolved, 'utf8') : own).has(anchor)) broken.push(`${file} -> ${target}#${anchor}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('are made the way GitHub makes them', () => {
    expect(anchorOf('What is checked without the engine')).toBe('what-is-checked-without-the-engine');
    expect(anchorOf('Phase 0: the seed (this repository)')).toBe('phase-0-the-seed-this-repository');
    expect(anchorOf('`data/` and the [core](src/core)')).toBe('data-and-the-core');
    expect(anchoredLinks('See [below](#part-two), [there](other.md#top "t") and [web](https://example.com/#x); `[code](#no)`.')).toEqual([['', 'part-two'], ['other.md', 'top']]);
  });
});

// The documents of the port name files in code marks: `src/core/rules/hero.ts`, `DT_Trees`, `terrain-layer-*.png`.
// Each must still name a file or folder of the repository, so a rename or removal cannot leave them pointing at
// nothing. A name may be given from the repository's root, from the document's folder, or as the tail of a path
// (the mapping tables name `core/world/terrain.ts` and then its neighbours by file name alone).
const PORT_DOCUMENTS = ['README.md', 'docs/README.md', 'docs/unreal/README.md', 'docs/unreal/conventions.md', 'docs/unreal/system-mapping.md', 'docs/unreal/web-target.md', 'docs/unreal/roadmap.md',
  'unreal/README.md', 'unreal/Content/README.md', 'data/README.md', 'data/assets/README.md', 'src/core/README.md'];
const REFERENCE = /^[\w.@*-]+(?:\/[\w.@*-]+)+\/?$|^[\w*-]+\.(?:ts|mjs|json|md|png|csv|h|cpp|cs|ini|yml|uproject)$/;

/** Code-marked names in a document that look like a path or a file. */
export function fileReferences(text: string): string[] {
  return [...text.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map((match) => match[1]!).filter((name) => REFERENCE.test(name));
}

describe('file names in the documents of the port', () => {
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'data', 'unreal', 'tools', 'tests', 'docs', '.github', '*.md', '*.json', '*.ts'], { cwd: root, maxBuffer: 1 << 28 })
    .toString().split('\n').filter((path) => path && !/^(src|tests|tools|docs\/engineering)\/gothic3|^public\/gothic3|^assets\/gothic3/.test(path));
  const folders = new Set<string>();
  for (const path of tracked) for (let folder = dirname(path); folder !== '.'; folder = dirname(folder)) folders.add(folder);
  const files = new Set(tracked);
  // `*` stands for part of a name, `...` for folders left out; a name without an extension may be a file's stem.
  const names = (pattern: string) => new RegExp(`(?:^|/)${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\\\.\\\.\\\./g, '.*')}(?:\\.[a-z]+)?$`);
  const known = (name: string, from: string): boolean => {
    const reference = name.replace(/\/$/, '');
    for (const base of ['', dirname(from)]) { const path = join(base, reference).replace(/\\/g, '/'); if (files.has(path) || folders.has(path)) return true; }
    // The separate Gothic 3 study is left out of the list above for its size; its folders are looked up on disk.
    const parent = join(root, dirname(reference)), leaf = names(reference.split('/').pop()!);
    if (!reference.includes('...') && existsSync(parent) && readdirSync(parent).some((entry) => leaf.test(entry))) return true;
    const tail = names(reference);
    return tracked.some((path) => tail.test(path)) || [...folders].some((folder) => tail.test(folder));
  };

  it('all name a file or folder that exists', () => {
    const missing: string[] = [];
    let seen = 0;
    for (const file of PORT_DOCUMENTS) {
      expect(existsSync(join(root, file)), file).toBe(true);
      for (const name of fileReferences(readFileSync(join(root, file), 'utf8'))) { seen++; if (!known(name, file)) missing.push(`${file} names ${name}`); }
    }
    expect(missing).toEqual([]);
    expect(seen).toBeGreaterThan(200);
  });

  it('are recognised as paths, files and patterns, and nothing else', () => {
    expect(fileReferences('See `src/core/rules/hero.ts`, `layout.ts`, `terrain-layer-*.png`, `data/unreal/`, `npm run data:export`, `FTableRowBase`, `tuning.json` and `0.5`.'))
      .toEqual(['src/core/rules/hero.ts', 'layout.ts', 'terrain-layer-*.png', 'data/unreal/', 'tuning.json']);
    expect(known('core/world/terrain.ts', 'docs/unreal/system-mapping.md')).toBe(true);
    expect(known('sources.json', 'docs/unreal/web-target.md')).toBe(true);
    expect(known('terrain-layer-*.png', 'docs/unreal/conventions.md')).toBe(true);
    expect(known('core/world/no-such-file.ts', 'docs/unreal/system-mapping.md')).toBe(false);
    expect(known('no-such-folder/README.md', 'README.md')).toBe(false);
  });
});
