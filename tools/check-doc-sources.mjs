#!/usr/bin/env node
/**
 * Checks the statements docs/unreal takes from other people's pages against those pages.
 *
 *   node tools/check-doc-sources.mjs            fetch every source that was read on its page and look for each passage
 *   node tools/check-doc-sources.mjs --offline  check the register against the documents only (what the test does)
 *
 * docs/unreal/sources.json is the register: each source (publisher, title, address, and whether it was read on the
 * page or only seen in a search result), each passage the documents quote or rely on, and the table rows they repeat.
 * Offline, every quotation in the documents must have a passage in the register, every passage must be in its
 * document, and a source that was not read on its page must be presented as such. Online, each passage and each row
 * must also be on the source's page. The pages are other people's and change, so the online check is run by hand
 * when the documents are revised, not in CI; the register records the day it last passed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTER = 'docs/unreal/sources.json';
const AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Text as a reader sees it, for comparing: one kind of quote mark, dash and space, and no case. */
export function plain(text) {
  return String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text) => text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
  if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
  return entities[name.toLowerCase()] ?? whole;
});

/** A page's readable text: scripts and styles dropped, tags replaced by spaces, entities decoded. */
export function pageText(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}

/** Every table row of a page as its cells' text. */
export function pageRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => pageText(cell[1]).trim()));
}

/** A document's text without the marks Markdown adds: code ticks and emphasis. */
export const unmarked = (markdown) => markdown.replace(/`/g, '').replace(/\*\*?/g, '');

/** A Markdown document's paragraphs, list items, headings and table rows, each on one line. Code blocks are left out. */
export function blocks(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/^(#+ .*)$/gm, '$1\n').split(/\n\s*\n|\n(?=\s*[-*] |\s*\d+\. |\||#+ |> )/).map((block) => block.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
}

/** Passages a Markdown document puts in double quotes or in a quote block: what the register must account for. */
export function quotedPassages(markdown) {
  const found = [];
  for (const block of blocks(markdown)) {
    const text = unmarked(block);
    if (text.startsWith('> ')) { found.push(text.slice(2).trim()); continue; }
    for (const match of text.matchAll(/["“]([^"“”]+)["”]/g)) found.push(match[1].trim());
  }
  return found.filter(Boolean);
}

/** The rows of a document's Markdown tables, as cells without their marks. */
export function tableRows(markdown) {
  return markdown.split('\n').filter((line) => line.startsWith('|') && !/^\|[\s|:-]+\|$/.test(line)).map((line) => unmarked(line).split('|').slice(1, -1).map((cell) => cell.trim()));
}

const UNREAD = /search results?|as reported|not read|not checked|not re-read/i;

/** Problems in the register itself and between it and the documents; none when it is sound. */
export function registerProblems(register, read = (file) => fs.readFileSync(path.join(root, 'docs', 'unreal', file), 'utf8')) {
  const problems = [];
  const used = new Set();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(register.checked ?? '')) problems.push('the register does not record the day it was last checked');
  for (const [id, source] of Object.entries(register.sources ?? {})) {
    for (const field of ['publisher', 'title', 'url']) if (typeof source[field] !== 'string' || !source[field]) problems.push(`${id}: no ${field}`);
    if (!/^https:\/\//.test(source.url ?? '')) problems.push(`${id}: the address is not an https address`);
    if (!['page', 'search result'].includes(source.read)) problems.push(`${id}: "read" must be "page" or "search result"`);
  }
  const documents = new Map();
  const document = (file) => { if (!documents.has(file)) documents.set(file, read(file)); return documents.get(file); };
  for (const [index, passage] of (register.passages ?? []).entries()) {
    const where = `passage ${index + 1} ("${String(passage.text).slice(0, 40)}")`;
    const source = register.sources?.[passage.source];
    if (!source) { problems.push(`${where}: unknown source ${passage.source}`); continue; }
    used.add(passage.source);
    if (!(passage.in ?? []).length) problems.push(`${where}: names no document`);
    // The document quotes the passage, or says what the register records it as saying.
    const wording = passage.says ?? passage.text;
    for (const file of passage.in ?? []) {
      const text = unmarked(document(file)), all = plain(text), at = all.indexOf(plain(wording));
      if (at < 0) { problems.push(`${where}: ${file} does not say "${wording.slice(0, 60)}"`); continue; }
      // What was only seen in a search result must be presented as that, in the section that relies on it.
      if (source.read === 'search result') {
        let end = 0;
        const section = text.split(/\n(?=#+ )/).find((part) => { end += plain(part).length + 1; return end > at; }) ?? text;
        if (!UNREAD.test(section)) problems.push(`${where}: ${file} relies on a source that was not read on its page without saying so`);
      }
    }
  }
  for (const row of register.rows ?? []) {
    if (!register.sources?.[row.source]) { problems.push(`row "${row.label}": unknown source ${row.source}`); continue; }
    used.add(row.source);
    // The document's table shows the same cells under its own name for the row.
    const shown = tableRows(document(row.in)).find((cells) => plain(cells[0] ?? '') === plain(row.as));
    if (!shown) problems.push(`row "${row.label}": ${row.in} has no table row "${row.as}"`);
    else if (!row.cells.every((cell, index) => { const mine = plain(shown[index + 1] ?? ''); return mine !== '' && (mine === plain(cell) || plain(cell).includes(mine.replace(/^one,/, '1 directional light'))); })) {
      problems.push(`row "${row.label}": ${row.in} shows ${JSON.stringify(shown.slice(1))}, the register ${JSON.stringify(row.cells)}`);
    }
  }
  for (const id of Object.keys(register.sources ?? {})) if (!used.has(id) && !(register.cited ?? []).includes(id)) problems.push(`${id}: no passage, row or citation uses this source`);
  // Every quotation in the documents is accounted for: it is a passage, part of one, or a listed term.
  const known = (register.passages ?? []).flatMap((passage) => [plain(passage.text), plain(passage.says ?? '')]).filter(Boolean);
  const terms = new Set((register.terms ?? []).map(plain));
  for (const file of register.documents ?? []) {
    for (const quoted of quotedPassages(document(file))) {
      const text = plain(quoted).replace(/[.,;:]$/, '');
      if (terms.has(text) || known.some((passage) => passage.includes(text) || text.includes(passage.replace(/[.,;:]$/, '')))) continue;
      problems.push(`${file}: quotes "${quoted.slice(0, 70)}" with no source in the register`);
    }
  }
  return problems;
}

/** Problems between the register and one fetched page. */
export function pageProblems(register, id, html) {
  // Compared without spaces: a page's markup puts them where a reader sees none (an italic run inside a formula).
  const tight = (value) => plain(value).replace(/ /g, '');
  const text = tight(pageText(html)), rows = pageRows(html), problems = [];
  for (const passage of (register.passages ?? []).filter((entry) => entry.source === id)) {
    if (!text.includes(tight(passage.text).replace(/\.$/, ''))) problems.push(`"${passage.text.slice(0, 80)}" is not on the page`);
  }
  for (const row of (register.rows ?? []).filter((entry) => entry.source === id)) {
    const matches = rows.filter((cells) => plain(cells[0] ?? '') === plain(row.label));
    if (!matches.length) { problems.push(`no table row "${row.label}" on the page`); continue; }
    if (!matches.some((cells) => row.cells.every((cell, index) => plain(cells[index + 1] ?? '') === plain(cell)))) {
      problems.push(`row "${row.label}": the page shows ${JSON.stringify(matches[0].slice(1, row.cells.length + 1))}, the register ${JSON.stringify(row.cells)}`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const register = JSON.parse(fs.readFileSync(path.join(root, REGISTER), 'utf8'));
  const offline = process.argv.includes('--offline');
  const problems = registerProblems(register).map((problem) => `register: ${problem}`);
  for (const problem of problems) console.error(problem);
  let fetched = 0, unread = 0, onPage = 0;
  if (!offline) {
    for (const [id, source] of Object.entries(register.sources)) {
      if (source.read !== 'page') { unread++; continue; }
      let html = '';
      try {
        const response = await fetch(source.url, { headers: { 'user-agent': AGENT }, redirect: 'follow' });
        if (!response.ok) { problems.push(`${id}: ${source.url} answered ${response.status}`); console.error(`MISSING ${id}: the page answered ${response.status}`); continue; }
        html = await response.text();
      } catch (error) { problems.push(`${id}: ${source.url} could not be fetched`); console.error(`MISSING ${id}: could not be fetched (${error?.cause?.code ?? error?.message})`); continue; }
      fetched++;
      const found = pageProblems(register, id, html);
      const count = (register.passages ?? []).filter((entry) => entry.source === id).length + (register.rows ?? []).filter((entry) => entry.source === id).length;
      onPage += count - found.length;
      console.log(`${found.length ? 'MISSING' : 'ok     '} ${id}: ${count - found.length} of ${count} on the page`);
      for (const problem of found) { problems.push(`${id}: ${problem}`); console.error(`  ${problem}`); }
    }
  }
  if (problems.length) { console.error(`check-doc-sources: ${problems.length} problem${problems.length === 1 ? '' : 's'}.`); process.exit(1); }
  console.log(offline
    ? `check-doc-sources: the register and the documents agree (${register.passages.length} passages, ${(register.rows ?? []).length} table rows, ${Object.keys(register.sources).length} sources).`
    : `check-doc-sources: ${onPage} passages and rows found on ${fetched} pages; ${unread} sources were only seen in search results and the documents say so.`);
}
