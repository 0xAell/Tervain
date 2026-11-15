import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { buildManifest, trackedAssetFiles, type AssetManifest } from '../../tools/asset-manifest.mjs';

// data/assets/manifest.json lists every model, texture, image and sound with its size, hash, source, licence and what an
// Unreal port does with it. This test fails when a file is added, changed or removed without `npm run assets:manifest`,
// and holds the manifest to its schema and to Unreal's naming conventions.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
const committed = read('data/assets/manifest.json') as AssetManifest;
const built = buildManifest(root);

describe('the asset manifest', () => {
  it('matches the files on disk: sizes, hashes, groups and totals (run `npm run assets:manifest`)', () => {
    expect(committed).toEqual(JSON.parse(JSON.stringify(built)));
  });

  it('lists every tracked file in the asset folders exactly once, and nothing of the separate Gothic 3 study', () => {
    const paths = committed.assets.map((asset) => asset.path);
    expect(paths).toEqual(trackedAssetFiles(root));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.length).toBeGreaterThan(1500);
    expect(paths.some((path) => /gothic3/i.test(path))).toBe(false);
  });

  it('is valid against its schema', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    const validate = ajv.compile(read('data/schema/assets/manifest.schema.json') as Record<string, unknown>);
    expect(validate(committed), ajv.errorsText(validate.errors?.slice(0, 5))).toBe(true);
    // A missing licence or an unknown plan is rejected.
    const first = committed.assets[0]!;
    const { licence: _licence, ...withoutLicence } = first;
    expect(validate({ ...committed, assets: [withoutLicence] })).toBe(false);
    expect(validate({ ...committed, assets: [{ ...first, plan: 'maybe' }] })).toBe(false);
  });

  it('gives every asset a source, a licence, a size and a plan', () => {
    const groups = new Map(committed.groups.map((group) => [group.id, group]));
    for (const asset of committed.assets) {
      const group = groups.get(asset.group);
      expect(group, asset.path).toBeDefined();
      expect(group!.source.length).toBeGreaterThan(10);
      expect(asset.licence.id).toMatch(/^(CC0-1\.0|LicenseRef-)/);
      expect(asset.bytes).toBeGreaterThan(0);
      expect(asset.plan).toBe(group!.plan);
    }
  });

  it('names what to look for on Fab for every family that is to be replaced', () => {
    for (const group of committed.groups) {
      if (group.plan !== 'replace') continue;
      expect(group.fab, group.id).toBeTruthy();
      const brief = committed.fab[group.fab!];
      expect(brief, `${group.id} names the Fab category ${group.fab}`).toBeDefined();
      expect(brief!.brief.length).toBeGreaterThan(40);
      expect(brief!.constraints.length).toBeGreaterThan(20);
    }
    for (const [category, entry] of Object.entries(committed.fab)) {
      // A category answers for a family of files, or says what else in the port it is for.
      expect(committed.groups.some((group) => group.fab === category) || (entry.appliesTo ?? '').length > 20, `${category} is used by a group`).toBe(true);
      for (const candidate of entry.candidates) expect(candidate.title.length).toBeGreaterThan(3);
    }
  });

  it('names the Fab pack that replaces every family and every file that is to be replaced', () => {
    const replaced = committed.groups.filter((group) => group.plan === 'replace');
    expect(replaced.length).toBeGreaterThanOrEqual(10);
    for (const group of committed.groups) {
      if (group.plan !== 'replace') { expect(group.replaceWith, group.id).toBeNull(); continue; }
      const candidates = committed.fab[group.fab!]!.candidates;
      const packs = [group.replaceWith!, ...group.replaceWith!.with, ...(group.replaceWith!.webTarget ? [group.replaceWith!.webTarget] : [])];
      for (const pack of packs) {
        // Each named pack is one of its category's candidates, with its listing and how it was confirmed.
        const candidate = candidates.find((entry) => entry.title === pack.title);
        expect(candidate, `${group.id}: ${pack.title}`).toBeDefined();
        expect(pack.url).toBe(candidate!.url);
        expect(pack.url).toMatch(/^https:\/\/www\.fab\.com\/listings\/[0-9a-f-]{36}$/);
        expect(pack.verified).toBe(candidate!.verified);
      }
      expect(new Set(packs.map((pack) => pack.title)).size, `${group.id} names each pack once`).toBe(packs.length);
    }
    const packOf = new Map(replaced.map((group) => [group.id, group.replaceWith!.title]));
    for (const asset of committed.assets) {
      if (asset.plan === 'replace') expect(asset.replaceWith, asset.path).toBe(packOf.get(asset.group));
      else expect(asset.replaceWith, asset.path).toBeUndefined();
    }
    // Trees are the one family whose first choice needs Nanite: each names a pack for the web target as well.
    for (const group of replaced.filter((entry) => entry.fab === 'trees')) expect(group.replaceWith!.webTarget, group.id).not.toBeNull();
  });

  it('adds up', () => {
    const sum = (assets: AssetManifest['assets']) => ({ files: assets.length, bytes: assets.reduce((total, asset) => total + asset.bytes, 0) });
    expect(committed.totals.all).toEqual(sum(committed.assets));
    expect(committed.totals.shipped).toEqual(sum(committed.assets.filter((asset) => asset.shipped)));
    for (const plan of ['replace', 'keep', 'rework', 'drop']) expect(committed.totals.byPlan[plan]).toEqual(sum(committed.assets.filter((asset) => asset.plan === plan)));
    for (const group of committed.groups) expect({ files: group.files, bytes: group.bytes }).toEqual(sum(committed.assets.filter((asset) => asset.group === group.id)));
  });
});

describe('Unreal conventions in the manifest', () => {
  const imported = committed.assets.filter((asset) => asset.unreal);

  it('states centimetres, Z up, a left-handed frame and the standard prefixes', () => {
    expect(committed.unrealConventions).toMatchObject({ units: 'centimetres', up: 'Z', handedness: 'left-handed', forward: '+X', contentRoot: '/Game/Tervain' });
    expect(committed.unrealConventions.prefixes).toMatchObject({ StaticMesh: 'SM_', SkeletalMesh: 'SK_', Texture: 'T_', Material: 'M_', MaterialInstance: 'MI_' });
  });

  it('names every imported asset with its type’s prefix, in PascalCase, under the content root', () => {
    expect(imported.length).toBeGreaterThan(700);
    for (const asset of imported) {
      const { type, name, folder } = asset.unreal!;
      expect(name.startsWith(committed.unrealConventions.prefixes[type]!), `${asset.path} -> ${name}`).toBe(true);
      expect(name).toMatch(/^[A-Z]+_[A-Z][A-Za-z0-9]*(_[A-Z0-9][A-Za-z0-9]*)*$/);
      expect(folder.startsWith('/Game/Tervain/')).toBe(true);
    }
  });

  it('gives each asset one name: levels of detail share a mesh, and no two files claim the same level', () => {
    const seen = new Map<string, string>();
    const levels = new Map<string, number[]>();
    for (const asset of imported) {
      const { name, folder, lod } = asset.unreal!;
      const key = `${folder}/${name}#${lod ?? '-'}`;
      expect(seen.has(key), `${asset.path} and ${seen.get(key)} both become ${key}`).toBe(false);
      seen.set(key, asset.path);
      if (lod !== null) levels.set(`${folder}/${name}`, [...(levels.get(`${folder}/${name}`) ?? []), lod]);
    }
    // A mesh's levels run from 0 without gaps.
    for (const [mesh, lods] of levels) expect(lods.sort((a, b) => a - b), mesh).toEqual(lods.map((_, index) => index));
    const trees = [...levels.entries()].filter(([mesh]) => mesh.includes('/Flora/Trees/'));
    expect(trees.length).toBeGreaterThan(25);
    for (const [mesh, lods] of trees) expect(lods, mesh).toEqual([0, 1, 2]);
  });

  it('suffixes textures by what they hold', () => {
    const textures = imported.filter((asset) => asset.unreal!.type === 'Texture' && asset.group === 'building-textures');
    expect(textures).toHaveLength(24);
    for (const asset of textures) expect(asset.unreal!.name).toMatch(asset.path.endsWith('-normal.jpg') ? /_N$/ : /_D$/);
  });

  it('imports nothing from files a port drops, and something from every model or sound it keeps or replaces', () => {
    for (const asset of committed.assets) {
      if (asset.plan === 'drop') expect(asset.unreal, asset.path).toBeNull();
      else if (asset.kind === 'model' && asset.path.endsWith('.glb')) expect(asset.unreal, asset.path).not.toBeNull();
    }
  });
});
