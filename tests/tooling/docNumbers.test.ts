import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLOCK_RATE } from '../../src/core/game/constants';
import { QUICK_SLOT_COUNT } from '../../src/core/game/types';
import { AUTOSAVE_SECONDS } from '../../src/core/rules/journey';
import { LIGHTHOUSE, WORLD } from '../../src/core/world/layout';
import { NATURAL_MODEL_TRIANGLE_LIMIT } from '../../src/presentation/naturalModelBudget';
import { blocks, plain, unmarked } from '../../tools/check-doc-sources.mjs';
import { PAGES_SITE_BYTE_LIMIT } from '../../tools/modelAssetDelivery';

// Every number in docs/unreal is accounted for. A number that describes this repository is listed below with the
// data or code it comes from, and the document must state the value that source gives today. A number taken from
// someone else is part of a passage or a table row in docs/unreal/sources.json. Anything else must stand in a
// sentence that says it is a plan, an assumption, an estimate or a report; a bare number fails.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = (path: string) => readFileSync(join(root, path), 'utf8');
const json = <T>(path: string) => JSON.parse(text(path)) as T;
const DOCS = ['README.md', 'conventions.md', 'system-mapping.md', 'web-target.md', 'roadmap.md'] as const;
type Doc = typeof DOCS[number];

const terrain = json<{ heightmap: { width: number; height: number; spacing: number; encoding: { seaLevelValue: number; unitsPerMetre: number }; range: { min: number; max: number } }; landscape: { sectionQuads: number; components: { x: number; z: number }; unrealLocationCm: { x: number; y: number; z: number }; unrealScale: { x: number; y: number; z: number } }; layers: unknown[] }>('data/world/terrain.json');
const tuning = json<{ camera: { follow: { fov: number } }; clock: { gameMinutesPerSecond: number } }>('data/game/tuning.json');
const rooms = json<{ rooms: { furniture: unknown[]; dressing: unknown[] }[] }>('data/world/interiors.json').rooms;
const manifest = json<{ totals: { shipped: { bytes: number } } }>('data/assets/manifest.json');
const count = (path: string, key?: string) => { const value = json<unknown>(path), held = key ? (value as Record<string, unknown>)[key] : value; return Array.isArray(held) ? held.length : Object.keys(held as object).length; };
const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const word = (n: number) => words[n]!;
const cap = (value: string) => value[0]!.toUpperCase() + value.slice(1);
const grouped = (n: number) => n.toLocaleString('en-GB');
const minus = (n: number) => (n < 0 ? `−${grouped(-n)}` : grouped(n));
const plainMinus = (n: number) => (n < 0 ? `−${-n}` : String(n));

const width = WORLD.maxX - WORLD.minX, depth = WORLD.maxZ - WORLD.minZ;
const { heightmap, landscape } = terrain;
const fov = tuning.camera.follow.fov;
const horizontalFov = 2 * Math.atan(Math.tan((fov * Math.PI / 180) / 2) * 16 / 9) * 180 / Math.PI;
const dayMinutes = 24 * 60 / tuning.clock.gameMinutesPerSecond / 60;
const gate = /Budget gate on main, 0\.0\.48 \(([0-9a-f]{7})\): draws (\d+), triangles ([\d,]+), console errors 0\./.exec(text('docs/perf/LATEST.md'));
const gateDraws = Number(gate?.[2]), gateTriangles = Number(gate?.[3]?.replace(/,/g, ''));
const HERO_TRIANGLES = Number(/const MAX_TRIANGLES = (\d+);/.exec(text('tools/hero/rework-hero.mjs'))?.[1]);
const animalTriangles = json<{ triangleLimit: number }>('data/game/animals.json').triangleLimit;
const EPIC_TRIANGLES = 500_000;

/** What each document says about this repository, with the value its source gives. The phrase must be in the document. */
const FACTS: Record<Doc, string[]> = {
  'README.md': [],
  'system-mapping.md': [
    `a world of ${width} m × ${depth} m`, `At ${width} m × ${depth} m`,
    `${count('data/unreal/DT_Buildings.json')} buildings (${rooms.length} with a room)`,
    `${count('data/unreal/DT_Trees.json')} planted trees and shrubs`,
    `${count('data/game/residents.json', 'residents')} named residents`, `${count('data/game/residents.json', 'ambient')} silent ones`,
    `${count('data/game/enemies.json', 'posts')} hostiles`, `${count('data/game/animals.json', 'animals')} animals`, `${count('data/game/items.json', 'items')} items`,
    `${count('data/game/dialogue.json', 'nodes')} dialogue nodes`, `${count('data/game/voice.json', 'lines')} spoken lines`,
    `A height field on a ${WORLD.cell} m grid`,
    `${heightmap.width} × ${heightmap.height} vertices at ${heightmap.spacing} m (${landscape.components.x} × ${landscape.components.z} components of ${landscape.sectionQuads} quads), Z scale ${landscape.unrealScale.z}`,
    `${cap(word(terrain.layers.length))} layers weighted by height`, `The ${word(terrain.layers.length)} weight images`,
    `sea level (Z = ${landscape.unrealLocationCm.z})`,
    `${rooms.reduce((sum, room) => sum + room.furniture.length, 0)} furniture pieces and ${rooms.reduce((sum, room) => sum + room.dressing.length, 0)} smaller pieces`,
    `${cap(word(count('data/game/animals.json', 'animals')))} with homes and ranges`, `${cap(word(count('data/game/animals.json', 'animals')))} actors need no crowd system`,
    `autosave every ${AUTOSAVE_SECONDS} s`, `${word(CLOCK_RATE)} game minute a second`, `${word(QUICK_SLOT_COUNT)} quick slots`,
  ],
  'conventions.md': [
    `core \`(x, z, y) × ${landscape.unrealScale.x}\``, 'A yaw of 0 faces',
    `a **vertical** field of view of ${fov}°`, `At 16:9, ${fov}° vertical is about ${horizontalFov.toFixed(1)}° horizontal`,
    `is ${heightmap.width} × ${heightmap.height} samples, one metre apart`,
    `${cap(word(landscape.components.x))} by ${word(landscape.components.z)} components of ${landscape.sectionQuads} quads give ${heightmap.width} × ${heightmap.height}`,
    `sea level as ${heightmap.encoding.seaLevelValue} and ${heightmap.encoding.unitsPerMetre} units to the metre, so a Z scale of ${landscape.unrealScale.z} reproduces the terrain`,
    `heights run from ${minus(heightmap.range.min)} m to +${heightmap.range.max.toFixed(1)} m`,
    `location \`(${plainMinus(landscape.unrealLocationCm.x)}, ${plainMinus(landscape.unrealLocationCm.y)}, ${landscape.unrealLocationCm.z})\` cm, scale \`(${landscape.unrealScale.x}, ${landscape.unrealScale.y}, ${landscape.unrealScale.z})\``,
    `The ${word(terrain.layers.length)} \`terrain-layer-*.png\` files are 8-bit greyscale`,
    `${grouped(NATURAL_MODEL_TRIANGLE_LIMIT)} for a tree, ${grouped(animalTriangles)} for a resident or animal`, `${grouped(HERO_TRIANGLES)} for the hero`,
  ],
  'web-target.md': [
    `draws ${gateDraws} draw calls and about ${(gateTriangles / 1e6).toFixed(1)} million triangles`,
    `its triangles are roughly ${word(Math.round(gateTriangles / EPIC_TRIANGLES))} times the guidance`,
    `up to ${grouped(NATURAL_MODEL_TRIANGLE_LIMIT)} triangles each`, `the hero (${grouped(HERO_TRIANGLES)})`,
    `serves about ${Math.round(manifest.totals.shipped.bytes / 1024 / 1024 / 10) * 10} MiB of`,
    `The ground has ${word(terrain.layers.length)} layers`,
    `a limit of ${PAGES_SITE_BYTE_LIMIT / 1e9} GB for a published site`,
  ],
  'roadmap.md': [
    `Import the ${word(count('data/unreal/tables.json', 'tables'))} DataTables`, `import the ${word(terrain.layers.length)} layers`,
    `a day passes in ${dayMinutes} minutes`,
  ],
};

interface Register { passages: { text: string; says?: string; in: string[] }[]; rows: { in: string; as: string }[] }
const register = json<Register>('docs/unreal/sources.json');

/** Numbers that are names, not quantities: versions, dates, ratios, issue and phase numbers, list markers. */
const NAMES = [
  /\bunreal engine \d(?:\.\d+)?\b/gi, /\bue ?\d(?:\.\d+)?\b/gi, /\b5\.\d+(?:\.\d+)?\b/g, /\bue-\d+\b/gi, /\bios \d+\b/gi, /\bphase \d\b/gi, /\b16:9\b/g,
  /\bgothic 3\b/gi, /\b\d{1,2} (?:january|february|march|april|may|june|july|august|september|october|november|december) \d{4}\b/gi, /\b(?:june|november) \d{4}\b/gi, /\b20\d\d\b/g,
  /\b(?:lod|sm|es) ?\d(?:\.\d)?\b/gi, /\b32-bit\b/g, /\b16-bit\b/g, /\b8-bit\b/g, /\b0\.0\.\d+\b/g, /\+\d\b/g,
];
/** A sentence that owns up to not being a checked fact. */
const HEDGED = /assum|propos|\bplan|estimate|to be (?:measured|confirmed|tested)|must be measured|report|search result|third.part|not confirmed|not stated|not checked|untested|starting point|suggest|roughly|\babout\b|if (?:still )?wanted|decide|holds when|only after/i;

/** The numbers of one block that nothing accounts for. */
function bareNumbers(file: Doc, block: string): string[] {
  let rest = ` ${plain(unmarked(block.replace(/`[^`]*`/g, (code) => (FACTS[file].some((fact) => fact.includes(code)) ? code : ' ')).replace(/\]\([^)]*\)/g, ']')))} `;
  const remove = (phrase: string) => { const at = rest.indexOf(plain(unmarked(phrase))); if (at >= 0) rest = `${rest.slice(0, at)} ${rest.slice(at + plain(unmarked(phrase)).length)}`; return at >= 0; };
  for (const fact of FACTS[file]) remove(fact);
  for (const passage of register.passages) if (passage.in.includes(file)) { remove(passage.text); if (passage.says) remove(passage.says); }
  if (register.rows.some((row) => row.in === file && plain(unmarked(block)).startsWith(`| ${plain(row.as)} |`))) return [];
  for (const name of NAMES) rest = rest.replace(name, ' ');
  rest = rest.replace(/^ \d+\. /, ' ').replace(/^ #+ .*$/, ' ');
  return HEDGED.test(block) ? [] : [...rest.matchAll(/(?<![a-z_])\d[\d,.]*\d|(?<![a-z_])\d/g)].map((match) => match[0]);
}

describe('where the documents say the lighthouse stands', () => {
  it('is where the layout puts it, so an import is checked against the right half of the map', () => {
    // The core's +z is south and its +x east; the terrain raster's row 0 is its northern edge.
    const half = LIGHTHOUSE.z > 0 ? 'south' : 'north', other = half === 'south' ? 'north' : 'south', side = LIGHTHOUSE.x < 0 ? 'west' : 'east';
    expect(plain(text('docs/unreal/roadmap.md'))).toContain(`the lighthouse must stand in the ${half}-${side} on its rock`);
    const data = plain(text('data/README.md'));
    expect(data).toContain(`the lighthouse stands in the ${half}-${side}, on its rock, so flip the image's rows if it lands in the ${other}`);
    expect(data).toContain('row 0 is the northern edge');
  });
});

describe('the numbers in the Unreal documents', () => {
  it('that describe this repository are the values its data and code give today', () => {
    expect(gate, 'docs/perf/LATEST.md records the budget gate on main').not.toBeNull();
    expect(HERO_TRIANGLES).toBeGreaterThan(0);
    for (const file of DOCS) {
      const document = plain(text(`docs/unreal/${file}`));
      for (const fact of FACTS[file]) expect(document.includes(plain(fact)), `${file} should say: ${fact}`).toBe(true);
    }
    expect(Object.values(FACTS).flat().length).toBeGreaterThan(40);
  });

  it('are each a repository fact, part of a sourced passage or row, or in a sentence that says it is a plan or a report', () => {
    const bare: string[] = [];
    for (const file of DOCS) for (const block of blocks(text(`docs/unreal/${file}`))) {
      const numbers = bareNumbers(file, block);
      if (numbers.length) bare.push(`${file}: ${numbers.join(', ')} in "${block.slice(0, 90)}"`);
    }
    expect(bare).toEqual([]);
  });

  it('finds a bare number, and accepts it once it is sourced or owned up to', () => {
    expect(bareNumbers('web-target.md', 'The target needs 3 GB of memory.')).toEqual(['3']);
    expect(bareNumbers('web-target.md', 'A third-party test reports a build of 3 GB.')).toEqual([]);
    expect(bareNumbers('web-target.md', 'Plan for 3 GB of memory.')).toEqual([]);
    expect(bareNumbers('web-target.md', 'Epic says "Draw calls of the entire scene should be <=700 for any single view."')).toEqual([]);
    expect(bareNumbers('web-target.md', 'Epic says draw calls should stay under 900.')).toEqual(['900']);
    expect(bareNumbers('roadmap.md', 'Unreal Engine 5.9 on 15 November 2026, in Phase 3, at 16:9.')).toEqual([]);
    expect(bareNumbers('system-mapping.md', `There are ${count('data/game/items.json', 'items')} items and 7 kinds.`)).toEqual(['7']);
  });
});
