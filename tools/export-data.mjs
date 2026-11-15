#!/usr/bin/env node
/**
 * Write the game's portable data under data/ from the engine-agnostic core (src/core/export):
 *
 *   npm run data:export            write every file
 *   npm run data:check             write nothing; exit 1 if a file under data/ differs from what the core produces
 *
 * It writes the canonical JSON documents (data/game, data/world), a JSON Schema for each (data/schema), the terrain as
 * Landscape rasters (data/world/terrain-*.png), and the same tables shaped for Unreal's importers (data/unreal).
 * See data/README.md. Runs the game's own code through Vite in Node; no browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'data');
const check = process.argv.includes('--check');

/** A greyscale PNG, 8 or 16 bits a sample, every row unfiltered. */
export function encodePng(width, height, bitDepth, samples) {
  const bytesPerSample = bitDepth / 8, stride = width * bytesPerSample;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const value = samples[y * width + x];
      if (bitDepth === 16) raw.writeUInt16BE(value, row + 1 + x * 2);
      else raw[row + 1 + x] = value;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length); tail.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = bitDepth; header[9] = 0; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The samples of a PNG written by encodePng. */
export function decodePng(file) {
  let at = 8, width = 0, height = 0, bitDepth = 0;
  const data = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at), type = file.toString('ascii', at + 4, at + 8), body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); bitDepth = body[8]; }
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data)), bytesPerSample = bitDepth / 8, stride = width * bytesPerSample;
  const samples = bitDepth === 16 ? new Uint16Array(width * height) : new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    if (raw[row] !== 0) throw new Error('Only unfiltered rows are supported.');
    for (let x = 0; x < width; x++) samples[y * width + x] = bitDepth === 16 ? raw.readUInt16BE(row + 1 + x * 2) : raw[row + 1 + x];
  }
  return { width, height, bitDepth, samples };
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Every file the export produces: path under data/ and its bytes or text. PNGs carry their samples for comparison. */
export async function buildExport(load) {
  const { portableDocuments } = await load('/src/core/export/portableData.ts');
  const { documentSchema } = await load('/src/core/export/schema.ts');
  const { terrainRaster, terrainDocument } = await load('/src/core/export/terrainRaster.ts');
  const { unrealTables, unrealStringTable, unrealRowsHeader, UNREAL_CONVENTIONS, UNREAL_ENUMS, UNREAL_STRUCTS } = await load('/src/core/export/unrealTables.ts');
  const { tidy } = await load('/src/core/export/portableData.ts');
  const { LAYERS } = await load('/src/core/world/groundLayers.ts');
  const { Terrain } = await load('/src/core/world/terrain.ts');
  const terrain = new Terrain();
  const files = [];
  const document = (file, about, data) => {
    files.push({ path: file, text: json(data) });
    files.push({ path: `schema/${file.replace(/\.json$/, '.schema.json')}`, text: json(documentSchema(file, about, data)) });
  };
  for (const doc of portableDocuments(terrain)) document(doc.path, doc.about, doc.data);
  const raster = terrainRaster(terrain);
  const terrainDoc = tidy(terrainDocument(terrain, raster));
  document('world/terrain.json', terrainDoc.about, terrainDoc);
  files.push({ path: 'world/terrain-height.png', png: { width: raster.width, height: raster.height, bitDepth: 16, samples: raster.heights } });
  LAYERS.forEach((name, i) => files.push({ path: `world/terrain-layer-${name}.png`, png: { width: raster.width, height: raster.height, bitDepth: 8, samples: raster.layers[i] } }));
  const tables = unrealTables(terrain);
  const typeName = (type) => (typeof type === 'string' ? type : type.enum ?? `TArray<${type.array}>`);
  const members = (definition) => Object.fromEntries(Object.entries(definition.fields).map(([name, field]) => [name, { type: typeName(field.type), note: field.note }]));
  for (const table of tables) files.push({ path: `unreal/${table.file}`, text: json(table.rows) });
  files.push({ path: 'unreal/ST_Tervain.csv', text: unrealStringTable() });
  files.push({ path: 'unreal/conventions.json', text: json(UNREAL_CONVENTIONS) });
  files.push({
    path: 'unreal/tables.json',
    text: json({
      about: 'The DataTable files in this folder, the C++ row struct each fills, and every member with its type. The structs are declared in unreal/Source/Tervain/Public/Data/TervainRows.h, written by the same export.',
      tables: tables.map((table) => ({ file: table.file, rowStruct: table.name, note: table.note, rows: table.rows.length, members: members(table) })),
      structs: UNREAL_STRUCTS.map((definition) => ({ name: definition.name, note: definition.note, members: members(definition) })),
      enums: UNREAL_ENUMS,
    }),
  });
  // The row structs' header and the ids' header are part of the Unreal module, outside data/.
  files.push({ path: '../unreal/Source/Tervain/Public/Data/TervainRows.h', text: unrealRowsHeader(tables) });
  const { unrealIdsHeader } = await load('/src/core/export/unrealIds.ts');
  files.push({ path: '../unreal/Source/Tervain/Public/Data/TervainIds.h', text: unrealIdsHeader() });
  return files;
}

/** Paths whose content on disk differs from the export. */
export function differences(files, directory = out) {
  const changed = [];
  for (const file of files) {
    const target = path.join(directory, file.path);
    if (!fs.existsSync(target)) { changed.push(`${file.path} (missing)`); continue; }
    if (file.text !== undefined) { if (fs.readFileSync(target, 'utf8') !== file.text) changed.push(file.path); continue; }
    const have = decodePng(fs.readFileSync(target));
    if (have.width !== file.png.width || have.height !== file.png.height || have.bitDepth !== file.png.bitDepth || Buffer.compare(Buffer.from(have.samples.buffer), Buffer.from(file.png.samples.buffer, file.png.samples.byteOffset, file.png.samples.byteLength)) !== 0) changed.push(file.path);
  }
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const files = await buildExport((id) => server.ssrLoadModule(id));
    if (check) {
      const changed = differences(files);
      if (changed.length) { console.error(`data/ is out of date (run npm run data:export):\n  ${changed.join('\n  ')}`); process.exitCode = 1; }
      else console.log(`data/ matches the core (${files.length} files).`);
    } else {
      for (const file of files) {
        const target = path.join(out, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.text ?? encodePng(file.png.width, file.png.height, file.png.bitDepth, file.png.samples));
      }
      console.log(`Wrote ${files.length} files under data/.`);
    }
  } finally { await server.close(); }
}
