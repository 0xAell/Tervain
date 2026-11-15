#!/usr/bin/env node
/**
 * The register of engine names the Unreal seed assumes (docs/unreal/engine-symbols.json), and its page.
 *
 *   npm run unreal:symbols              check the register against the seed's files and the page against the register
 *   npm run unreal:symbols -- --write   write the page (docs/unreal/engine-symbols.md) from the register
 *   npm run unreal:symbols -- --online  also open every page the register cites and look for each quoted passage
 *
 * The seed (unreal/) has never been built by the engine. Its tests compile it against stand-ins for the engine's
 * headers (tests/tools/unreal-standin/). The register lists every engine name the seed and the stand-ins use, the
 * page of Epic's public documentation it was checked against (for a rule of the C++ language itself, the C++20 working
 * draft), the passage that supports it, and what could not be checked. The first check here keeps that list complete: a new engine name in the seed fails it until it is entered.
 * A name Epic's pages do not settle may also carry a corroboration: a file of a public project built against Unreal
 * Engine 5 that uses the name as the seed does, with the line quoted. It does not change the name's status.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageText } from './check-doc-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTER = 'docs/unreal/engine-symbols.json';
export const PAGE = 'docs/unreal/engine-symbols.md';
export const STATUSES = ['verified', 'partly', 'unverified', 'contradicted'];
const KINDS = ['type', 'function', 'macro', 'specifier', 'header', 'module', 'build-setting', 'project-field', 'config-key', 'language'];
const EPIC = 'https://dev.epicgames.com/documentation/';
/** A rule of the C++ language is checked against the C++20 working draft: Epic's coding standard says the engine builds as C++20. */
const DRAFT = /^https:\/\/raw\.githubusercontent\.com\/cplusplus\/draft\/n4861\/source\/[a-z]+\.tex$/;

export const readRegister = (directory = root) => JSON.parse(fs.readFileSync(path.join(directory, REGISTER), 'utf8'));

/** The seed's files and the stand-ins: everything that can name the engine. */
export function seedFiles(directory = root) {
  return execFileSync('git', ['ls-files', '-z', '--', 'unreal', 'tests/tools/unreal-standin'], { cwd: directory }).toString().split('\0').filter(Boolean).sort();
}

const OWN = /^(F|U|E|A|I)Tervain|^FStandIn|^STANDIN_|^Tervain|^TERVAIN_API$|^LogTervain$/;
const CPP = /\.(h|cpp)$/;

/**
 * Every engine name the C++ of the seed and the stand-ins uses, with a file it is in: types and templates by Epic's
 * prefixes, macros, members reached through `::`, `.` or `->`, the specifiers inside reflection markup, and included
 * headers. The project's own names and the stand-ins' own helpers are left out.
 */
export function engineNames(directory = root) {
  const files = seedFiles(directory).filter((file) => CPP.test(file));
  const text = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(directory, file), 'utf8')]));
  const code = (file) => text[file].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ').replace(/"(?:[^"\\\n]|\\.)*"/g, (literal) => (/^"[\w./]+\.h"$/.test(literal) ? literal : '""'));
  // Members the seed and the stand-ins declare themselves are not the engine's.
  const seedHeaders = files.filter((file) => file.startsWith('unreal/'));
  const own = new Set();
  for (const file of seedHeaders) for (const match of code(file).matchAll(/\b([A-Z]\w+)\s*\((?:[^;{}()]|\([^()]*\))*\)\s*(?:const\s*)?(?:override\s*)?[;{]/g)) own.add(match[1]);
  const names = new Map();
  const add = (name, file) => { if (!OWN.test(name) && !names.has(name)) names.set(name, file); };
  for (const file of files) {
    const source = code(file);
    // The seed's own headers and the reflection headers the engine generates for them are not engine headers.
    for (const match of source.matchAll(/#include "([^"]+)"/g)) if (!/\.generated\.h$/.test(match[1]) && !fs.existsSync(path.join(directory, 'unreal/Source/Tervain/Public', match[1]))) add(match[1], file);
    for (const match of source.matchAll(/\b([FUTE][A-Z][A-Za-z0-9]*)\b/g)) add(match[1], file);
    for (const match of source.matchAll(/\b(U[A-Z]+|UE_LOG|GENERATED_BODY|TEXT|[A-Z]+_[A-Z_]+)\s*\(/g)) add(match[1], file);
    for (const match of source.matchAll(/\b([FUT][A-Z][A-Za-z0-9]*)(?:<[^<>]*>)?::([A-Z]\w+)/g)) if (!OWN.test(match[1]) && match[2] !== match[1]) add(`${match[1]}::${match[2]}`, file);
    for (const match of source.matchAll(/(?:\.|->)([A-Z][A-Za-z0-9]+)\s*\(/g)) if (!own.has(match[1]) && !/^StandIn/.test(match[1])) add(`.${match[1]}`, file);
    for (const match of source.matchAll(/\bU(?:PROPERTY|CLASS|STRUCT|ENUM|FUNCTION)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g)) {
      for (const word of match[1].replace(/=\s*[^,()]+/g, ' ').match(/[A-Za-z_]\w*/g) ?? []) add(`specifier ${word}`, file);
    }
  }
  for (const name of ['FStandInLogCategory', 'StandIn']) names.delete(name);
  return [...names].map(([name, file]) => ({ name, file })).sort((a, b) => a.name.localeCompare(b.name));
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether an entry of the register answers for a name found in the code. */
function answers(entry, name) {
  if (name.startsWith('specifier ')) return /^(specifier|macro)$/.test(entry.kind) && new RegExp(`(?<![A-Za-z0-9_])${escape(name.slice(10))}(?![A-Za-z0-9_])`).test(entry.symbol);
  if (name.startsWith('.')) return new RegExp(`(::|\\.)${escape(name.slice(1))}(?![A-Za-z0-9_])`).test(entry.symbol);
  if (name.includes('/') || name.endsWith('.h')) return entry.kind === 'header' && entry.symbol === name;
  return new RegExp(`(?<![A-Za-z0-9_:])${escape(name)}(?![A-Za-z0-9_])`).test(entry.symbol);
}

/** What is wrong with the register as it stands, without opening a page. */
export function registerProblems(register, directory = root) {
  const problems = [], seen = new Set(), files = new Set(seedFiles(directory));
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const entry of register.symbols) {
    const at = `"${entry.symbol}"`;
    if (seen.has(entry.symbol)) problems.push(`${at} is entered twice`);
    seen.add(entry.symbol);
    if (!KINDS.includes(entry.kind)) problems.push(`${at}: unknown kind ${entry.kind}`);
    if (!STATUSES.includes(entry.status)) { problems.push(`${at}: unknown status ${entry.status}`); continue; }
    counts[entry.status]++;
    if (!(entry.assumes?.length > 20)) problems.push(`${at} does not say what is assumed`);
    if (!(entry.note?.length > 5)) problems.push(`${at} has no note`);
    if (!entry.usedIn?.length) problems.push(`${at} names no file that uses it`);
    for (const file of entry.usedIn ?? []) if (!files.has(file)) problems.push(`${at} is said to be used in ${file}, which is not a file of the seed or the stand-ins`);
    if (entry.corroboration !== undefined) {
      const { title, url, passage } = entry.corroboration ?? {};
      if (entry.status === 'verified') problems.push(`${at} is verified and needs no corroboration`);
      if (!(title?.length > 5) || !/^https:\/\//.test(url ?? '') || !(passage?.length >= 20 && passage.length <= 300)) problems.push(`${at} has a corroboration without a title, an address and a quoted line of 20 to 300 characters`);
    }
    if (entry.status === 'unverified') { if (entry.source || entry.passage) problems.push(`${at} is unverified but cites a source`); continue; }
    if (entry.kind === 'language' ? !DRAFT.test(entry.source?.url ?? '') : !entry.source?.url?.startsWith(EPIC)) problems.push(entry.kind === 'language' ? `${at} cites no section of the C++20 working draft` : `${at} cites no page of Epic's documentation`);
    if (!(entry.passage?.length >= 20 && entry.passage.length <= 300)) problems.push(`${at} quotes no passage of 20 to 300 characters`);
  }
  if (JSON.stringify(register.summary) !== JSON.stringify({ symbols: register.symbols.length, ...counts })) problems.push(`the summary does not match the entries: ${JSON.stringify({ symbols: register.symbols.length, ...counts })}`);
  for (const { name, file } of engineNames(directory)) if (!register.symbols.some((entry) => answers(entry, name))) problems.push(`${name.replace(/^\./, 'member ')} (in ${file}) is not in the register`);
  return problems;
}

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const KIND_TITLE = { type: 'Types', function: 'Functions', macro: 'Macros', specifier: 'Reflection specifiers', header: 'Headers', module: 'Modules', 'build-setting': 'Build settings', 'project-field': 'Project file and folders', 'config-key': 'Configuration', language: 'Rules of the C++ language' };

/** The page: what was checked, the names the public record does not settle, and every name with its source. */
export function page(register) {
  const { summary } = register, open = register.symbols.filter((entry) => entry.status !== 'verified');
  const link = (entry) => (entry.source ? `[${cell(entry.source.title.split(' | ')[0])}](${entry.source.url})` : 'none found');
  const corroborated = (entry) => (entry.corroboration ? ` Corroborated: [${cell(entry.corroboration.title)}](${entry.corroboration.url}) has \`${cell(entry.corroboration.passage)}\`.` : '');
  const backed = register.symbols.filter((entry) => entry.corroboration).length;
  const lines = [
    '# Engine names the Unreal seed assumes',
    '',
    '<!-- Generated by `npm run unreal:symbols -- --write` from engine-symbols.json. Do not edit. -->',
    '',
    register.about,
    '',
    `**How it was checked.** ${register.reference}`,
    '',
    `Checked on ${register.checked}. The register, [engine-symbols.json](engine-symbols.json), holds for each name the files that use it, what is assumed, the page and the quoted passage. \`npm run unreal:symbols\` fails when the seed or a stand-in uses an engine name that is not entered; with \`--online\` it opens every page again and looks for each passage.`,
    '',
    '| Status | Names | Meaning |',
    '| --- | ---: | --- |',
    ...STATUSES.map((status) => `| ${status} | ${summary[status]} | ${cell(register.statuses[status])} |`),
    `| all | ${summary.symbols} | |`,
    '',
    '## What the public record does not settle',
    '',
    `These are for the first build in the engine to settle. Each row says what is missing.${backed ? ` ${backed} of them are corroborated: a public project built against Unreal Engine 5 uses the name as the seed does. That is evidence, not Epic's word, and leaves each status as it is.` : ''}`,
    '',
    '| Name | Status | Page | What is assumed, and what is missing |',
    '| --- | --- | --- | --- |',
    ...open.map((entry) => `| \`${cell(entry.symbol)}\` | ${entry.status} | ${link(entry)} | ${cell(entry.assumes)} ${cell(entry.note)}${corroborated(entry)} |`),
    '',
    '## Every name',
    '',
  ];
  for (const kind of KINDS) {
    const entries = register.symbols.filter((entry) => entry.kind === kind);
    if (!entries.length) continue;
    lines.push(`### ${KIND_TITLE[kind]}`, '', '| Name | Status | Page |', '| --- | --- | --- |', ...entries.map((entry) => `| \`${cell(entry.symbol)}\` | ${entry.status} | ${link(entry)} |`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** An HTML page that never closes arrived cut short (Epic's largest reference pages are several megabytes). A plain file has no such end. */
const cutShort = (body) => /^\s*(<!doctype html|<html)/i.test(body) && !/<\/html>\s*$/i.test(body);

/** Open every cited page and look for each passage. `load(url)` gives the page's HTML, or a plain file's text. */
export async function onlineProblems(register, load, attempts = 3) {
  const problems = [], pages = new Map(), again = new Set();
  const open = async (url) => {
    try {
      let body = await load(url);
      for (let attempt = 1; attempt < attempts && cutShort(body); attempt++) body = await load(url);
      if (cutShort(body)) { pages.set(url, null); problems.push(`${url} arrived cut short ${attempts} times (${body.length} characters): its passages were not looked for`); return; }
      pages.set(url, pageText(body));
    } catch (error) { pages.set(url, null); problems.push(`${url} could not be read: ${error.message}`); }
  };
  const look = async (symbol, url, passage, what) => {
    if (!pages.has(url)) await open(url);
    // A long page can arrive cut short: before a passage is called missing, the page is opened once more.
    if (pages.get(url) !== null && !pages.get(url).includes(passage) && !again.has(url)) { again.add(url); await open(url); }
    const text = pages.get(url);
    if (text !== null && !text.includes(passage)) problems.push(`"${symbol}": the ${what} is not on ${url}`);
  };
  for (const entry of register.symbols) {
    if (entry.source) await look(entry.symbol, entry.source.url, entry.passage, 'passage');
    if (entry.corroboration) await look(entry.symbol, entry.corroboration.url, entry.corroboration.passage, 'corroborating line');
  }
  return { problems, pages: pages.size, read: [...pages.values()].filter((text) => text !== null).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const register = readRegister(), text = page(register), target = path.join(root, PAGE);
  if (process.argv.includes('--write')) { fs.writeFileSync(target, text); console.log(`Wrote ${PAGE}.`); }
  const problems = registerProblems(register);
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) problems.push(`${PAGE} is not what the register gives (run npm run unreal:symbols -- --write)`);
  if (process.argv.includes('--online')) {
    const agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
    const online = await onlineProblems(register, async (url) => {
      const response = await fetch(url, { headers: { 'user-agent': agent }, redirect: 'follow' });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return response.text();
    });
    problems.push(...online.problems);
    console.log(`Opened ${online.read} of ${online.pages} cited pages.`);
  }
  for (const problem of problems) console.error(problem);
  const { summary } = register;
  console.log(`${summary.symbols} engine names: ${STATUSES.map((status) => `${summary[status]} ${status}`).join(', ')}. ${problems.length ? `${problems.length} problem(s).` : 'The register covers every engine name the seed and the stand-ins use.'}`);
  if (problems.length) process.exitCode = 1;
}
