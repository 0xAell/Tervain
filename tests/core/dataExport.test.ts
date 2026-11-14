import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020';
import { beforeAll, describe, expect, it } from 'vitest';
import { tidy } from '../../src/core/export/portableData';
import { inferSchema } from '../../src/core/export/schema';
import { LANDSCAPE, terrainRaster } from '../../src/core/export/terrainRaster';
import { toUnreal, yawToUnreal } from '../../src/core/export/unrealTables';
import { LAYERS } from '../../src/core/world/groundLayers';
import { LIGHTHOUSE, SEA_LEVEL, WORLD } from '../../src/core/world/layout';
import { Terrain } from '../../src/core/world/terrain';
import { buildExport, decodePng, differences, encodePng, type ExportedFile } from '../../tools/export-data.mjs';

// data/ holds the game's portable data, written from the core by `npm run data:export`. This test fails when those
// files no longer match what the core produces, and checks each document against its committed schema.

const data = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const modules: Record<string, () => Promise<unknown>> = {
  '/src/core/export/portableData.ts': () => import('../../src/core/export/portableData'),
  '/src/core/export/schema.ts': () => import('../../src/core/export/schema'),
  '/src/core/export/terrainRaster.ts': () => import('../../src/core/export/terrainRaster'),
  '/src/core/export/unrealTables.ts': () => import('../../src/core/export/unrealTables'),
  '/src/core/world/groundLayers.ts': () => import('../../src/core/world/groundLayers'),
  '/src/core/world/terrain.ts': () => import('../../src/core/world/terrain'),
};

let files: ExportedFile[] = [];
beforeAll(async () => { files = await buildExport((id) => modules[id]!()); }, 120_000);

const committed = (path: string) => JSON.parse(readFileSync(join(data, path), 'utf8')) as unknown;

describe('the portable data under data/', () => {
  it('matches what the core produces (run `npm run data:export` after changing core data)', () => {
    expect(differences(files, data)).toEqual([]);
  });

  it('covers the game, the world, the terrain rasters and the Unreal tables', () => {
    const paths = files.map((file) => file.path);
    for (const path of ['game/items.json', 'game/residents.json', 'game/dialogue.json', 'game/tuning.json', 'world/layout.json', 'world/flora.json', 'world/terrain.json', 'world/terrain-height.png', 'unreal/DT_Items.json', 'unreal/ST_Tervain.csv', 'unreal/conventions.json']) expect(paths).toContain(path);
    for (const layer of LAYERS) expect(paths).toContain(`world/terrain-layer-${layer}.png`);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('validates every document against its committed schema', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    const documents = files.filter((file) => /^(game|world)\/.*\.json$/.test(file.path));
    expect(documents.length).toBeGreaterThanOrEqual(14);
    for (const file of documents) {
      const schema = committed(`schema/${file.path.replace(/\.json$/, '.schema.json')}`) as Record<string, unknown>;
      const validate = ajv.compile(schema);
      expect(validate(committed(file.path)), `${file.path}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }
  });

  it('has schemas that reject a document of the wrong shape', () => {
    const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
    const validate = ajv.compile(committed('schema/game/items.schema.json') as Record<string, unknown>);
    const items = committed('game/items.json') as { items: Record<string, unknown>[] };
    expect(validate(items)).toBe(true);
    const { kind: _kind, ...withoutKind } = items.items[0]!;
    expect(validate({ ...items, items: [withoutKind, ...items.items.slice(1)] })).toBe(false);
    expect(validate({ ...items, items: [{ ...items.items[0], healAmount: 'a lot' }] })).toBe(false);
    expect(validate({ ...items, extra: true })).toBe(false);
  });

  it('gives every Unreal table row a unique Name', () => {
    const tables = files.filter((file) => /^unreal\/DT_.*\.json$/.test(file.path));
    expect(tables.length).toBeGreaterThanOrEqual(10);
    for (const table of tables) {
      const rows = JSON.parse(table.text!) as { Name: string }[];
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((row) => row.Name)).size, table.path).toBe(rows.length);
      for (const row of rows) expect(row.Name).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('writes a string table Unreal can import: a header and one quoted row per string', () => {
    const lines = files.find((file) => file.path === 'unreal/ST_Tervain.csv')!.text!.trimEnd().split('\n');
    expect(lines[0]).toBe('Key,SourceString');
    expect(lines.length).toBeGreaterThan(600);
    for (const line of lines.slice(1)) expect(line).toMatch(/^"(?:[^"]|"")*","(?:[^"]|"")*"$/);
  });
});

describe('core values in Unreal units', () => {
  it('turns metres into centimetres with east as X, south as Y and up as Z', () => {
    expect(toUnreal(1, 2, 3)).toEqual({ X: 100, Y: 300, Z: 200 });
    expect(toUnreal(-0.5, 0, 0.25)).toEqual({ X: -50, Y: 25, Z: 0 });
  });

  it('turns a core yaw into an Unreal yaw for an asset that faces +X', () => {
    // Core yaw 0 faces +z (south), which is Unreal +Y: a yaw of 90°.
    expect(yawToUnreal(0)).toBe(90);
    // Core yaw π/2 faces +x (east), which is Unreal +X: a yaw of 0°.
    expect(yawToUnreal(Math.PI / 2)).toBe(0);
    expect(yawToUnreal(Math.PI)).toBe(-90);
    expect(yawToUnreal(-Math.PI / 2)).toBe(-180);
    for (const yaw of [-7, -1, 0.3, 2, 9]) {
      const unreal = yawToUnreal(yaw) * Math.PI / 180;
      // The facing direction is the same in both frames.
      expect(Math.cos(unreal)).toBeCloseTo(Math.sin(yaw), 4);
      expect(Math.sin(unreal)).toBeCloseTo(Math.cos(yaw), 4);
    }
  });
});

describe('tidying values for JSON', () => {
  it('keeps six decimals, drops what is undefined and writes what is not finite as null', () => {
    expect(tidy({ a: 0.1 + 0.2, b: [1.23456789, -0], c: undefined, d: Infinity, e: { f: 'text', g: null, h: true } })).toEqual({ a: 0.3, b: [1.234568, 0], d: null, e: { f: 'text', g: null, h: true } });
  });
});

describe('inferring a schema', () => {
  it('names a record’s fields and requires them all', () => {
    expect(inferSchema({ id: 'a', count: 2, ratio: 0.5, on: true })).toEqual({
      type: 'object', additionalProperties: false, required: ['id', 'count', 'ratio', 'on'],
      properties: { id: { type: 'string' }, count: { type: 'integer' }, ratio: { type: 'number' }, on: { type: 'boolean' } },
    });
  });

  it('merges the rows of an array, requiring only the fields every row has', () => {
    expect(inferSchema([{ id: 'a', n: 1 }, { id: 'b', n: 1.5, note: 'x' }])).toEqual({
      type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'n'], properties: { id: { type: 'string' }, n: { type: 'number' }, note: { type: 'string' } } },
    });
    expect(inferSchema([1, null])).toEqual({ type: 'array', items: { type: ['integer', 'null'] } });
  });

  it('describes a table keyed by id by its rows, and a long list of strings by one string', () => {
    expect(inferSchema({ a: { x: 1 }, b: { x: 2 }, c: { x: 3, y: 'opt' } })).toEqual({
      type: 'object', additionalProperties: { type: 'object', additionalProperties: false, required: ['x'], properties: { x: { type: 'integer' }, y: { type: 'string' } } },
    });
    const strings = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'text']));
    expect(inferSchema(strings)).toEqual({ type: 'object', additionalProperties: { type: 'string' } });
    // Unrelated records side by side stay named fields.
    expect(inferSchema({ a: { x: 1 }, b: { y: 1 }, c: { z: 1 } }).properties).toBeDefined();
  });
});

describe('the terrain rasters', () => {
  const terrain = new Terrain();
  const raster = terrainRaster(terrain, false);

  it('is a valid Landscape size over the whole world with a margin', () => {
    expect(raster.width).toBe(LANDSCAPE.sectionQuads * LANDSCAPE.componentsX + 1);
    expect(raster.height).toBe(LANDSCAPE.sectionQuads * LANDSCAPE.componentsZ + 1);
    expect(raster.originX).toBeLessThan(WORLD.minX);
    expect(raster.originZ).toBeLessThan(WORLD.minZ);
    expect(raster.originX + (raster.width - 1) * raster.spacing).toBeGreaterThan(WORLD.maxX);
    expect(raster.originZ + (raster.height - 1) * raster.spacing).toBeGreaterThan(WORLD.maxZ);
  });

  it('stores each height within half a step of the terrain, with sea level at 32768', () => {
    const at = (x: number, z: number) => raster.heights[Math.round((z - raster.originZ) / raster.spacing) * raster.width + Math.round((x - raster.originX) / raster.spacing)]!;
    for (const [x, z] of [[LIGHTHOUSE.x, LIGHTHOUSE.z], [0, 0], [-250, 40], [100, -60], [WORLD.minX, WORLD.minZ]] as const) {
      const metres = (at(x, z) - LANDSCAPE.zero) / LANDSCAPE.unitsPerMetre + SEA_LEVEL;
      expect(Math.abs(metres - terrain.heightAt(x, z))).toBeLessThanOrEqual(0.5 / LANDSCAPE.unitsPerMetre + 1e-9);
    }
    expect(raster.minHeight).toBeLessThan(SEA_LEVEL);
    expect(raster.maxHeight).toBeGreaterThan(20);
    expect(raster.maxHeight).toBeLessThan(256);
  });

  it('gives every sample ground-material weights that sum to one', () => {
    const committedLayers = LAYERS.map((layer) => decodePng(readFileSync(join(data, `world/terrain-layer-${layer}.png`))));
    for (const index of [0, 1234, 100_000, 200_000, raster.width * raster.height - 1]) {
      const sum = committedLayers.reduce((total, layer) => total + layer.samples[index]!, 0);
      expect(Math.abs(sum - 255)).toBeLessThanOrEqual(4);
    }
  });

  it('round-trips its PNG encoding', () => {
    const samples = new Uint16Array([0, 1, 255, 256, 32768, 65535]);
    const decoded = decodePng(encodePng(3, 2, 16, samples));
    expect(decoded).toMatchObject({ width: 3, height: 2, bitDepth: 16 });
    expect([...decoded.samples]).toEqual([...samples]);
    expect([...decodePng(encodePng(2, 2, 8, new Uint8Array([0, 7, 128, 255]))).samples]).toEqual([0, 7, 128, 255]);
  });
});
