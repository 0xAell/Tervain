import { groundSplat, LAYERS } from '../world/groundLayers';
import { LIGHTHOUSE, PLACES, SEA_LEVEL, SPAWN, WORLD } from '../world/layout';
import type { Terrain } from '../world/terrain';

/**
 * The terrain as rasters an Unreal Landscape imports: one 16-bit height image and one 8-bit weight image per ground
 * material. The grid is a valid Landscape size (components of 63 quads, one section each) at one metre a quad, laid
 * over the world with a margin of sea and heath on every side.
 */
export const LANDSCAPE = {
  /** Quads per section, sections per component and components across (x, east) and down (z, south). */
  sectionQuads: 63,
  sectionsPerComponent: 1,
  componentsX: 10,
  componentsZ: 6,
  /** Metres between samples. */
  spacing: 1,
  /** Unreal's height range at Z scale 100: ±256 m in steps of 1/128 m, with 32768 at the Landscape's own height. */
  unitsPerMetre: 128,
  zero: 32768,
} as const;

export interface TerrainRaster {
  /** Samples across (x, west to east) and down (z, north to south); row 0 is the northern edge. */
  width: number;
  height: number;
  /** World position of sample (0, 0), the north-west corner (metres). */
  originX: number;
  originZ: number;
  spacing: number;
  /** Heights, row by row: 32768 is sea level, 128 units a metre. */
  heights: Uint16Array;
  minHeight: number;
  maxHeight: number;
  /** One weight image per ground material, 0 to 255, in LAYERS order; a sample's weights sum to 255 ± rounding. */
  layers: Uint8Array[];
}

export function terrainRaster(terrain: Terrain, withLayers = true): TerrainRaster {
  const width = LANDSCAPE.sectionQuads * LANDSCAPE.sectionsPerComponent * LANDSCAPE.componentsX + 1;
  const height = LANDSCAPE.sectionQuads * LANDSCAPE.sectionsPerComponent * LANDSCAPE.componentsZ + 1;
  const spanX = (width - 1) * LANDSCAPE.spacing, spanZ = (height - 1) * LANDSCAPE.spacing;
  const originX = (WORLD.minX + WORLD.maxX) / 2 - spanX / 2, originZ = (WORLD.minZ + WORLD.maxZ) / 2 - spanZ / 2;
  const heights = new Uint16Array(width * height);
  const layers = withLayers ? LAYERS.map(() => new Uint8Array(width * height)) : [];
  const weights = new Float32Array(LAYERS.length);
  let minHeight = Infinity, maxHeight = -Infinity;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = originX + i * LANDSCAPE.spacing, z = originZ + j * LANDSCAPE.spacing, y = terrain.heightAt(x, z);
      minHeight = Math.min(minHeight, y); maxHeight = Math.max(maxHeight, y);
      heights[j * width + i] = Math.max(0, Math.min(65535, Math.round(LANDSCAPE.zero + (y - SEA_LEVEL) * LANDSCAPE.unitsPerMetre)));
      if (!withLayers) continue;
      weights.fill(0);
      groundSplat(terrain, x, z, weights);
      for (let layer = 0; layer < LAYERS.length; layer++) layers[layer]![j * width + i] = Math.max(0, Math.min(255, Math.round(weights[layer]! * 255)));
    }
  }
  return { width, height, originX, originZ, spacing: LANDSCAPE.spacing, heights, minHeight, maxHeight, layers };
}

/** What an importer needs to place the Landscape, and points to check the import against. */
export function terrainDocument(terrain: Terrain, raster: TerrainRaster): Record<string, unknown> {
  const check = (name: string, p: { x: number; z: number }) => ({ name, x: p.x, z: p.z, y: terrain.heightAt(p.x, p.z) });
  return {
    about: 'How the terrain rasters map onto the world, and landmarks to check an import against.',
    units: 'metres, seconds, radians; x east, z south, y up',
    heightmap: {
      file: 'world/terrain-height.png', format: '16-bit greyscale PNG', width: raster.width, height: raster.height,
      origin: { x: raster.originX, z: raster.originZ }, spacing: raster.spacing,
      encoding: { seaLevelValue: LANDSCAPE.zero, unitsPerMetre: LANDSCAPE.unitsPerMetre },
      range: { min: raster.minHeight, max: raster.maxHeight },
      rows: 'row 0 is the northern edge (least z); column 0 is the western edge (least x)',
    },
    layers: LAYERS.map((name) => ({ name, file: `world/terrain-layer-${name}.png`, format: '8-bit greyscale PNG' })),
    landscape: {
      sectionQuads: LANDSCAPE.sectionQuads, sectionsPerComponent: LANDSCAPE.sectionsPerComponent, components: { x: LANDSCAPE.componentsX, z: LANDSCAPE.componentsZ },
      unrealLocationCm: { x: raster.originX * 100, y: raster.originZ * 100, z: 0 }, unrealScale: { x: 100 * raster.spacing, y: 100 * raster.spacing, z: 100 },
    },
    source: { bounds: WORLD, note: 'The game samples a 2 m grid split into triangles; the raster samples that surface every metre. Outside the bounds the edge heights continue flat.' },
    checkPoints: [check('spawn', SPAWN), check('lighthouse', LIGHTHOUSE), ...Object.entries(PLACES).map(([name, place]) => check(name, place))],
  };
}
