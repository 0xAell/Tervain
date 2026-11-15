#!/usr/bin/env node
/**
 * Write the asset manifest, data/assets/manifest.json: every model, texture, image and sound in the repository's asset
 * folders with its size, hash, source, licence, the Unreal asset it would become and what a port does with it.
 *
 *   npm run assets:manifest          write the manifest
 *   npm run assets:check             write nothing; exit 1 if the manifest differs from the files on disk
 *
 * The authored half (families of files, plans, naming, what to look for on Fab) is tools/asset-manifest/groups.mjs.
 * Model licences come from the model ledger (public/model-licenses.json). See data/assets/README.md.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAB, GROUPS, NOT_ASSETS, TEXTURE_SUFFIX, UNREAL_PREFIX } from './asset-manifest/groups.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'data', 'assets', 'manifest.json');

/** The folders that hold assets. Gothic 3 study material is a separate project and is not catalogued here. */
export const ASSET_ROOTS = ['public', 'assets'];
const KIND_BY_EXTENSION = { glb: 'model', jpg: 'texture', jpeg: 'texture', png: 'image', webp: 'image', ogg: 'audio', m4a: 'audio', mp3: 'audio', json: 'data' };

export function trackedAssetFiles(directory = root) {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...ASSET_ROOTS], { cwd: directory, maxBuffer: 256 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
  return listed.filter((file) => !NOT_ASSETS.some((pattern) => pattern.test(file))).sort();
}

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** A licence status that leaves a question open. The day the owner decided what happens to such files. */
const OPEN_QUESTION = /^unresolved/;
const BEFORE_SHIP_DECIDED = '2026-11-15';

/** The pack a `replace` group names, with its companions, resolved against the candidates of the group's Fab category. */
function replacement(group) {
  if (group.plan !== 'replace') return null;
  const candidates = FAB[group.fab]?.candidates ?? [];
  const find = (title) => {
    const found = candidates.find((candidate) => candidate.title === title);
    if (!found) throw new Error(`${group.id}: "${title}" is not a candidate of the Fab category "${group.fab}".`);
    return { title: found.title, publisher: found.publisher, url: found.url, engine: found.engine, price: found.price, verified: found.verified, checked: found.checked };
  };
  if (!group.pack) throw new Error(`${group.id} is to be replaced but names no pack.`);
  if (!group.packWhy) throw new Error(`${group.id} names a pack but not why.`);
  return { ...find(group.pack), reason: group.packWhy, with: (group.with ?? []).map(find), webTarget: group.webTarget ? find(group.webTarget) : null };
}

export function buildManifest(directory = root) {
  const ledger = JSON.parse(fs.readFileSync(path.join(directory, 'public', 'model-licenses.json'), 'utf8'));
  const ledgerByFile = new Map(ledger.assets.map((asset) => [asset.file, asset]));
  const assets = [], unmatched = [];
  for (const file of trackedAssetFiles(directory)) {
    const group = GROUPS.find((candidate) => candidate.match.test(file));
    if (!group) { unmatched.push(file); continue; }
    const extension = file.split('.').pop().toLowerCase(), absolute = path.join(directory, file);
    const kind = group.kind === 'data' || extension === 'json' ? 'data' : group.kind === 'texture' || group.kind === 'image' ? group.kind : KIND_BY_EXTENSION[extension];
    const recorded = ledgerByFile.get(file);
    const licence = recorded?.license
      ? { id: recorded.license.spdx ?? `LicenseRef-${recorded.license.evidenceStatus}`, status: recorded.license.evidenceStatus }
      : group.licence ?? null;
    if (!licence) throw new Error(`No licence recorded for ${file}: add it to the model ledger or to its group.`);
    // An open question about a file's source or terms: it is replaced before anything is released, never kept.
    const open = OPEN_QUESTION.test(licence.status);
    if (open && group.plan !== 'replace') throw new Error(`${file} has an open licence question (${licence.status}) but its family "${group.id}" is not replaced.`);
    if (open && !group.beforeShip) throw new Error(`${group.id} holds a file with an open licence question: say what it is in beforeShip.`);
    const unreal = group.unreal(file);
    assets.push({
      path: file, group: group.id, kind, bytes: fs.statSync(absolute).size, sha256: sha256(absolute), shipped: file.startsWith('public/'),
      ...(recorded?.sourceId ? { sourceId: recorded.sourceId } : {}), licence, plan: group.plan,
      ...(group.plan === 'replace' ? { replaceWith: replacement(group).title } : {}), ...(open ? { replaceBeforeShip: true } : {}), unreal,
    });
  }
  if (unmatched.length) throw new Error(`Files under the asset roots that no group in tools/asset-manifest/groups.mjs claims:\n  ${unmatched.join('\n  ')}`);
  const groups = GROUPS.map((group) => {
    const members = assets.filter((asset) => asset.group === group.id);
    const open = members.filter((asset) => asset.replaceBeforeShip);
    if (group.beforeShip && !open.length && members.length) throw new Error(`${group.id} states an open question but none of its files has an unresolved licence.`);
    return {
      id: group.id, title: group.title, role: group.role, plan: group.plan, why: group.why, source: group.source,
      fab: group.fab, replaceWith: replacement(group),
      replaceBeforeShip: open.length ? { question: group.beforeShip, files: open.length, bytes: open.reduce((sum, asset) => sum + asset.bytes, 0) } : null,
      files: members.length, bytes: members.reduce((sum, asset) => sum + asset.bytes, 0),
    };
  }).filter((group) => group.files > 0);
  const total = (filter) => { const members = assets.filter(filter); return { files: members.length, bytes: members.reduce((sum, asset) => sum + asset.bytes, 0) }; };
  return {
    about: 'Every model, texture, image and sound in the repository’s asset folders: size, hash, source, licence, the Unreal asset it would become, and what a port does with it.',
    generatedBy: 'tools/asset-manifest.mjs; the authored groups are in tools/asset-manifest/groups.mjs',
    plans: {
      replace: 'A coherent pack takes its place; the file stands in for scale and intent. `replaceWith` names the pack.',
      keep: 'The game’s own; carries over. Import it from the path given.',
      rework: 'The content carries over but is re-authored for Unreal.',
      drop: 'Only the web build or its tooling needs it.',
    },
    replaceBeforeShip: {
      rule: 'A file marked `replaceBeforeShip` has an open question about its source or its licence terms. It is replaced by the pack its family names before anything is released, whatever the answer turns out to be; nothing waits on the question.',
      decided: BEFORE_SHIP_DECIDED, by: 'the project owner',
    },
    unrealConventions: {
      units: 'centimetres', up: 'Z', handedness: 'left-handed', forward: '+X', import: 'glTF sources are metres, Y up, right-handed; Unreal’s glTF import converts them (positions ×100, Y and Z exchanged)',
      contentRoot: '/Game/Tervain', prefixes: UNREAL_PREFIX, textureSuffixes: TEXTURE_SUFFIX,
      prefixSource: 'SM_, SK_, T_, M_, MI_, AS_ and DT_ are from Epic’s recommended asset naming conventions; SW_ for sound waves and the texture suffixes are this project’s, as Epic’s page lists none',
      naming: 'Epic’s pattern [AssetTypePrefix]_[AssetName]_[Descriptor]_[OptionalVariantLetterOrNumber], here as [Prefix]_[Family]_[Name] in PascalCase, one asset per name',
      lod: 'The near, middle and far files of one tree or figure are LOD0, LOD1 and LOD2 of one mesh, never three assets. Imported LOD meshes are named <Asset>_LOD0, _LOD1, _LOD2.',
    },
    totals: { all: total(() => true), shipped: total((asset) => asset.shipped), replaceBeforeShip: total((asset) => asset.replaceBeforeShip === true), byPlan: Object.fromEntries(['replace', 'keep', 'rework', 'drop'].map((plan) => [plan, total((asset) => asset.plan === plan)])) },
    fab: FAB,
    groups,
    assets,
  };
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = json(buildManifest());
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) { console.error('data/assets/manifest.json is out of date (run npm run assets:manifest).'); process.exitCode = 1; }
    else console.log('data/assets/manifest.json matches the files on disk.');
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    const manifest = JSON.parse(text);
    console.log(`Wrote ${manifest.assets.length} assets in ${manifest.groups.length} groups (${(manifest.totals.all.bytes / 1048576).toFixed(1)} MiB).`);
  }
}
