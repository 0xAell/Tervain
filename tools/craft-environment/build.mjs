// Rebuilds the original environment meshes from metre-scale joinery, botanical whorls and rock strata.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { surfaces, material } from './kit.mjs';
import { makeFurniture } from './furniture.mjs';
import { makeConifer, makePalm, schist } from './woodland.mjs';
import { writeGlb } from '../tree-gen/lib/glb.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  models = join(root, 'public/models'),
  generator = 'Tervain tools/craft-environment/build.mjs';
const swatches = await surfaces(),
  pieces = [];
async function model(path, parts, materials, textures, sharedImages) {
  const out = writeGlb({
    parts,
    materials,
    textures,
    generator,
    assetExtras: {
      artwork: 'Tervain original procedural model',
      source: 'tools/craft-environment/',
      ...(sharedImages ? { tervainSharedImages: sharedImages } : {}),
    },
  });
  await mkdir(dirname(join(models, path)), { recursive: true });
  await writeFile(join(models, path), out);
  return {
    bytes: out.length,
    sha256: createHash('sha256').update(out).digest('hex'),
    triangles: parts.reduce((t, p) => t + p.builder.idx.length / 3, 0),
  };
}
const dimensions = await readFile(join(root, 'src/core/world/furnitureSizes.ts'), 'utf8');
for (const match of dimensions.matchAll(/^  (\w+): \[([\d., ]+)\]/gm)) {
  const id = match[1],
    size = match[2].split(',').map(Number);
  const f = makeFurniture(id, size);
  const result = await model(
    'craft/furniture/' + id + '.glb',
    [{ name: id, builder: f, material: 0 }],
    [material('Craft surface')],
    [swatches.grain],
  );
  pieces.push({ id, file: id + '.glb', ...result, size });
}
if (pieces.length !== 29) throw Error('Expected all 29 furnished pieces');
await writeFile(
  join(models, 'craft/furniture/manifest.json'),
  JSON.stringify({ schema: 1, generator, pieces }, null, 2) + '\n',
);
await model(
  'scenery/intertidal-schist.glb',
  [{ name: 'Schist bedding', builder: schist(), material: 0 }],
  [material('Mica and slate')],
  [swatches.stone],
);
async function needleSheet(name, kind) {
  const at = join(root, 'public/textures/leaf'),
    raw = await sharp(join(at, kind + '-color.webp'))
      .removeAlpha()
      .raw()
      .toBuffer(),
    mask = await sharp(join(at, kind + '-data.webp'))
      .removeAlpha()
      .raw()
      .toBuffer();
  const rgba = Buffer.alloc((raw.length / 3) * 4);
  for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
    rgba[j] = raw[i];
    rgba[j + 1] = raw[i + 1];
    rgba[j + 2] = raw[i + 2];
    rgba[j + 3] = mask[i];
  }
  let sheet = sharp(rgba, { raw: { width: 2048, height: 2048, channels: 4 } });
  if (kind === 'conifer') {
    // Pine pads 8..11 are the bottom half's first row. Pack the four into a two-by-two texture.
    const pad = (i) =>
      sharp(rgba, { raw: { width: 2048, height: 2048, channels: 4 } })
        .extract({ left: (i % 4) * 512, top: 1024, width: 512, height: 512 })
        .resize(192, 192)
        .png()
        .toBuffer();
    const squares = await Promise.all([0, 1, 2, 3].map(pad));
    sheet = sharp({ create: { width: 384, height: 384, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(
      squares.map((input, i) => ({ input, left: (i % 2) * 192, top: Math.floor(i / 2) * 192 })),
    );
  } else sheet = sheet.resize(640, 640);
  return {
    name,
    mimeType: 'image/webp',
    data: await sheet.webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer(),
    webp: true,
  };
}
const fir = await needleSheet('Silver-fir needles', 'fir'),
  pine = await needleSheet('Coastal pine pads', 'conifer');
for (const [level, lod] of ['near', 'mid', 'far'].entries()) {
  for (const tree of [
    makeConifer(false, level),
    makeConifer(true, level),
    ...['date-palm', 'fan-palm', 'wind-palm'].map((id) => makePalm(id, level)),
  ]) {
    const { name, wood, leaf } = tree,
      needles = name === 'silver-fir' ? fir : name === 'shore-pine' ? pine : null;
    const materials = [
      material('Wood'),
      { ...material('Foliage', 1), doubleSided: true, alphaMode: 'MASK', alphaCutoff: 0.42 },
    ];
    // Every LOD stands on the same ground datum despite the slightly leaning trunk's polygonal base.
    let base = Infinity;
    for (let j = 1; j < wood.pos.length; j += 3) base = Math.min(base, wood.pos[j]);
    for (const part of [wood, leaf]) for (let j = 1; j < part.pos.length; j += 3) part.pos[j] -= base;
    const borrow = level > 0 && name !== 'shore-pine';
    if (borrow) for (const m of materials) delete m.pbrMetallicRoughness.baseColorTexture;
    await model(
      'flora/craft/' + name + '-' + lod + '.glb',
      [
        { name: 'Trunk_Wood', builder: wood, material: 0 },
        { name: 'Crown_Foliage', builder: leaf, material: 1, extras: { tervainVertexAlbedo: true } },
      ],
      materials,
      borrow ? [] : [swatches.grain, needles ?? swatches.grain],
      borrow ? name + '-near.glb' : undefined,
    );
  }
}
console.log('Built 29 furnished pieces, intertidal schist and five coastal tree families at three levels.');
