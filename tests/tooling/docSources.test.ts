import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blocks, pageProblems, pageRows, pageText, plain, quotedPassages, registerProblems, tableRows } from '../../tools/check-doc-sources.mjs';

// docs/unreal says where each of its statements about Unreal Engine comes from. docs/unreal/sources.json is the
// register of those sources and of every passage taken from them; this test holds the register and the documents
// together. Whether a passage is still on its page is checked by hand with `npm run docs:sources`, which reads the
// pages; the parts of that check that need no network are exercised here on pages made up for the purpose.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
interface Register {
  checked: string; documents: string[];
  sources: Record<string, { publisher: string; title: string; url: string; read: string }>;
  passages: { source: string; text: string; says?: string; in: string[] }[];
  rows: { source: string; label: string; cells: string[]; in: string; as: string }[];
  cited: string[]; terms: string[];
}
const register = JSON.parse(readFileSync(join(root, 'docs', 'unreal', 'sources.json'), 'utf8')) as Register;
const document = (file: string) => readFileSync(join(root, 'docs', 'unreal', file), 'utf8');
const copy = () => JSON.parse(JSON.stringify(register)) as Register;

describe('the register of sources and the Unreal documents', () => {
  it('agree: every quotation has a source, every passage is in its document, every unread source is marked', () => {
    expect(registerProblems(register)).toEqual([]);
  });

  it('cover all five documents, and most sources were read on their own page', () => {
    expect(register.documents).toEqual(['README.md', 'conventions.md', 'system-mapping.md', 'web-target.md', 'roadmap.md']);
    const read = Object.values(register.sources).filter((source) => source.read === 'page');
    expect(read.length).toBeGreaterThanOrEqual(20);
    expect(Object.values(register.sources).filter((source) => source.read === 'search result').length).toBeLessThanOrEqual(4);
    expect(register.passages.length).toBeGreaterThanOrEqual(60);
    expect(register.rows.length).toBeGreaterThanOrEqual(20);
    expect(register.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('say in each document how its statements are sourced', () => {
    expect(document('README.md')).toContain('[`sources.json`](sources.json)');
    for (const file of ['conventions.md', 'system-mapping.md', 'web-target.md']) expect(document(file), file).toContain('(sources.json)');
    expect(document('web-target.md')).toMatch(/as reported by search results/);
    expect(document('system-mapping.md').match(/\| Unreal \(proposal\) \|/g)).toHaveLength(5);
    expect(document('roadmap.md')).toContain("Everything on this page is this project's plan");
  });

  it('are found out when they part: a quotation without a source, a changed quotation, an unmarked search result', () => {
    const without = copy();
    without.passages = without.passages.filter((passage) => !passage.text.startsWith('rendered using hardware instancing'));
    expect(registerProblems(without).join('\n')).toMatch(/system-mapping\.md: quotes "rendered using hardware instancing" with no source in the register/);

    const reworded = (file: string) => (file === 'conventions.md' ? document(file).replace('uses a Z-up axis', 'uses a Y-up axis') : document(file));
    expect(registerProblems(register, reworded).join('\n')).toMatch(/conventions\.md does not say "In the Unreal Editor the coordinate system is left-handed/);

    const unmarked = (file: string) => (file === 'web-target.md' ? document(file).replace(/as reported by search results/g, 'as stated').replace(/search results?/g, 'the pages').replace(/not (?:read|checked|re-read)/g, 'read') : document(file));
    expect(registerProblems(register, unmarked).join('\n')).toMatch(/web-target\.md relies on a source that was not read on its page without saying so/);

    const added = (file: string) => (file === 'roadmap.md' ? `${document(file)}\nEpic says "the web target ships in 5.9".\n` : document(file));
    expect(registerProblems(register, added)).toEqual(['roadmap.md: quotes "the web target ships in 5.9" with no source in the register']);

    const row = (file: string) => (file === 'web-target.md' ? document(file).replace('| Volumetric clouds | No | No |', '| Volumetric clouds | Yes | No |') : document(file));
    expect(registerProblems(register, row).join('\n')).toMatch(/row "Volumetric Clouds": web-target\.md shows \["Yes","No"\]/);

    const broken = copy();
    broken.sources.mover!.url = 'http://example.test/mover'; broken.sources.niagara!.read = 'memory'; broken.passages[0]!.source = 'nowhere';
    delete (broken as Partial<Register>).checked;
    expect(registerProblems(broken).slice(0, 4)).toEqual([
      'the register does not record the day it was last checked', 'mover: the address is not an https address', 'niagara: "read" must be "page" or "search result"',
      'passage 1 ("UE 5.9 introduces a new experimental Web"): unknown source nowhere',
    ]);
  });
});

describe('reading a document and a page', () => {
  it('takes quotations from paragraphs, list items, table cells and quote blocks, across line breaks and code marks', () => {
    const markdown = ['A row container "must', 'inherit from `FTableRowBase`", and the key "uses Name".', '', '- Item with “curly quotes” in it.', '| Cell | "Yes *" |', '> A whole quoted line.', '', '```', '"not a quotation"', '```'].join('\n');
    expect(quotedPassages(markdown)).toEqual(['must inherit from FTableRowBase', 'uses Name', 'curly quotes', 'Yes', 'A whole quoted line.']);
    expect(blocks('# Title\nText one\ncontinues.\n\n1. First\n2. Second\n| a | b |\n| c | d |')).toEqual(['# Title', 'Text one continues.', '1. First', '2. Second', '| a | b |', '| c | d |']);
    expect(tableRows('| Feature | A | B |\n| --- | --- | --- |\n| **Fog** | Yes * | `No` |')).toEqual([['Feature', 'A', 'B'], ['Fog', 'Yes', 'No']]);
  });

  it('reads a page as its reader does: no scripts, entities decoded, one kind of quote and space', () => {
    const html = '<html><head><script>var hidden = "x";</script><style>p{}</style></head><body><p>Epic&rsquo;s &ldquo;Mover&rdquo;&nbsp;is  <em>Experimental</em> &amp; new &#8212; use caution.</p><table><tr><th>Feature</th><th>Mobile</th></tr><tr><td>Sky <b>Atmosphere</b></td><td> Yes </td></tr></table></body></html>';
    expect(pageText(html)).not.toContain('hidden');
    expect(plain(pageText(html))).toContain('is experimental & new - use caution.');
    expect(pageRows(html)).toEqual([['Feature', 'Mobile'], ['Sky Atmosphere', 'Yes']]);
    expect(plain('“A”  ‘b’ –— C')).toBe('"a" \'b\' -- c');
  });

  it('finds a passage and a row on a page, and says so when either is missing or different', () => {
    const page = '<p>Learn to use this <strong>Experimental</strong> feature, but use caution when shipping with it.</p><p>total size in vertices of (A<em>63+1 , B</em>63+1).</p><table><tr><td>Volumetric Clouds</td><td>No</td><td>No</td><td>No</td></tr></table>';
    const small = { sources: {}, passages: [
      { source: 'mover', text: 'Learn to use this Experimental feature, but use caution when shipping with it.', in: ['system-mapping.md'] },
      { source: 'mover', text: 'total size in vertices of (A63+1 , B63+1).', in: ['conventions.md'] },
    ], rows: [{ source: 'mover', label: 'Volumetric Clouds', cells: ['No', 'No'], in: 'web-target.md', as: 'Volumetric clouds' }] };
    expect(pageProblems(small, 'mover', page)).toEqual([]);
    expect(pageProblems(small, 'mover', page.replace('use caution', 'take care'))).toEqual(['"Learn to use this Experimental feature, but use caution when shipping with it." is not on the page']);
    expect(pageProblems(small, 'mover', page.replace('<td>No</td><td>No</td><td>No</td>', '<td>Yes</td><td>No</td><td>No</td>'))).toEqual(['row "Volumetric Clouds": the page shows ["Yes","No"], the register ["No","No"]']);
    expect(pageProblems(small, 'mover', '<p>Nothing here.</p>')).toHaveLength(3);
  });
});

describe('the command', () => {
  it('passes offline on the committed register and documents, and names what it checked', () => {
    const run = spawnSync(process.execPath, [join(root, 'tools', 'check-doc-sources.mjs'), '--offline'], { encoding: 'utf8', cwd: root });
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(`check-doc-sources: the register and the documents agree (${register.passages.length} passages, ${register.rows.length} table rows, ${Object.keys(register.sources).length} sources).\n`);
    expect(run.status).toBe(0);
  });
});
