// Refresh the playable model ledger after running tools/craft-environment/build.mjs.
// Use --check to verify the entries without writing the public document.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playableModel } from '../../src/presentation/assets/playableModels.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bytesOf = (file) => readFileSync(join(root, file));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const originalLicense = {
  spdx: null, version: null, evidenceStatus: 'tervain-original-procedural', creator: 'Tervain project',
};
const tools = 'tools/craft-environment/';
const glbWriter = 'tools/tree-gen/lib/glb.mjs';
const directoryGlbs = (dir) => readdirSync(join(root, dir)).filter((name) => name.endsWith('.glb')).sort().map((name) => dir + '/' + name);
const furniture = 'public/models/craft/furniture';
const furnitureManifest = JSON.parse(bytesOf(furniture + '/manifest.json'));
const groups = [
  {
    id: 'tervain-valley-furniture', record: tools + 'furniture.mjs', files: directoryGlbs(furniture),
    credit: 'Tervain project. Valley furniture shaped from measured joinery, turned profiles and fitted components.',
    inputs: ['src/core/world/furnitureSizes.ts'],
  },
  {
    id: 'tervain-coastal-woodland', record: tools + 'woodland.mjs', files: directoryGlbs('public/models/flora/craft'),
    credit: 'Tervain project. Fir and pine whorls, segmented palm fronds and three levels of detail for each species.',
    inputs: ['tools/leaf-atlas/build.mjs', 'tools/leaf-atlas/conifer.mjs', 'tools/leaf-atlas/raster.mjs',
      ...['fir', 'conifer'].flatMap((name) => ['color', 'data'].map((plane) => 'public/textures/leaf/' + name + '-' + plane + '.webp'))],
  },
  {
    id: 'tervain-intertidal-schist', record: tools + 'woodland.mjs', files: ['public/models/scenery/intertidal-schist.glb'],
    credit: 'Tervain project. Intertidal schist formed from layered beds with offset edges and a project-made mineral surface.',
    inputs: [],
  },
];
const ledgerPath = join(root, 'public/model-licenses.json');
const previous = readFileSync(ledgerPath, 'utf8');
const ledger = JSON.parse(previous);
const sourceIds = new Set(groups.map((group) => group.id));
const previousCount = ledger.assets.length;
ledger.assets = ledger.assets.filter((asset) => !sourceIds.has(asset.sourceId));
for (const group of groups) {
  const inputs = [tools + 'build.mjs', group.record, tools + 'kit.mjs', glbWriter, ...group.inputs];
  ledger.sources[group.id] = {
    sourceRecord: group.record, sourceAssetUrl: null, recordedSupplier: 'Tervain project', creator: 'Tervain project',
    generationService: 'Tervain procedural generator',
    license: { ...originalLicense, terms: 'Original model artwork by the Tervain project. Rights are reserved. See LICENSE-SCOPE.md for the scope of the software license.' },
    credit: group.credit,
    provenance: {
      classification: originalLicense.evidenceStatus, creator: 'Tervain project', listingUrl: null,
      evidence: 'Editable construction code and direct art inputs are fingerprinted below. Run node tools/craft-environment/build.mjs with the locked dependencies to rebuild the GLBs.',
      inputs: inputs.map((file) => ({ file, sha256: digest(bytesOf(file)) })),
    },
  };
  for (const file of group.files) {
    const bytes = bytesOf(file);
    const metadata = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const info = metadata.asset;
    if (info.generator !== 'Tervain tools/craft-environment/build.mjs' || info.extras?.source !== tools)
      throw Error('Unexpected model origin: ' + file);
    if ([...(metadata.images ?? []), ...(metadata.buffers ?? [])].some((entry) => entry.uri))
      throw Error('Unexpected external image or buffer: ' + file);
    const sha256 = digest(bytes);
    if (group.id === 'tervain-valley-furniture') {
      const piece = furnitureManifest.pieces.find((entry) => furniture + '/' + entry.file === file);
      if (piece?.sha256 !== sha256 || piece.bytes !== bytes.length) throw Error('Furniture manifest mismatch: ' + file);
    }
    const shared = info.extras.tervainSharedImages;
    const dependencies = shared ? [dirname(file) + '/' + shared] : [];
    for (const dependency of dependencies) if (!group.files.includes(dependency)) throw Error('Missing shared atlas: ' + dependency);
    ledger.assets.push({
      file, bytes: bytes.length, sha256, embeddedCopyright: info.copyright ?? null, embeddedCcDeclaration: false,
      externalDependencies: dependencies, scope: 'playable-game-model', sourceId: group.id, license: originalLicense, modified: false,
    });
  }
}
// Older oak-only ledger refreshes also selected the three pine outputs from the same directory.
for (const asset of ledger.assets.filter((entry) => entry.file.startsWith('public/models/flora/hero/hero-pine-')))
  asset.sourceId = 'tervain-hero-pine';
ledger.assets.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
const publicModels = ledger.assets.filter((entry) => entry.file.startsWith('public/models/'));
const playable = publicModels.filter((entry) => playableModel(entry.file.slice('public/models/'.length)));
ledger.summary.publicModelFiles = publicModels.length;
ledger.summary.publicModelBytes = publicModels.reduce((sum, entry) => sum + entry.bytes, 0);
ledger.summary.hashesMatchedExistingSourceRecords += ledger.assets.length - previousCount;
ledger.playable = {
  sinceVersion: '0.1.1', selection: 'src/presentation/assets/playableModels.ts',
  scope: 'File-backed GLBs used in the game. Other asset entries are retained for historical provenance. Inline geometry is defined in the game source.',
  files: playable.map((entry) => entry.file),
};
const updated = JSON.stringify(ledger, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (updated !== previous) throw Error('Model ledger is stale. Run node tools/model-ledger/record-environment.mjs.');
} else if (updated !== previous) writeFileSync(ledgerPath, updated);
console.log(playable.length + ' playable models; ' + (ledger.assets.length - playable.length) + ' historical models.');
