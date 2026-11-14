import type { Quality } from './context';
import { smoothDistanceFade } from './distanceVisibility';
import type { FloraTree, Species } from '../core/world/flora';

// Where trees stand is the core's rule (src/core/world/flora.ts); what follows is how many of them a quality preset
// draws and at which level of detail.
export * from '../core/world/flora';

/** Presets retain all blocking trunks and thin only decorative scrub and horizon detail. */
export function selectFloraPopulation(population: readonly FloraTree[], quality: Quality): { trees: FloraTree[]; obstacles: FloraTree[] } {
  const density = quality === 'low' ? 0.42 : quality === 'medium' ? 0.7 : 1;
  return { trees: population.filter(tree => tree.radius > 0 || tree.decorationRank < density), obstacles: population.filter(tree => tree.radius > 0) };
}

// Keep trees beyond the playable realm, then fade only into dense distance haze.
export const FLORA_FADE_START = 900;
export const FLORA_MAX_DISTANCE = 1020;
export const FLORA_LOD_BANDS: Record<Quality, { near: readonly [number, number]; middle: readonly [number, number] }> = {
  high: { near: [FLORA_MAX_DISTANCE, FLORA_MAX_DISTANCE], middle: [FLORA_MAX_DISTANCE, FLORA_MAX_DISTANCE] },
  medium: { near: [120, 180], middle: [480, 620] },
  low: { near: [0, 0], middle: [64, 96] },
};
const FULL_TREE_LOD = Object.freeze([1, 0, 0] as const);
/** High keeps the exact source mesh at every visible distance: no simplified trunk,
 * missing lower branches, or crossed crown impostor can change its silhouette while moving.
 * Other presets retain complementary pixel coverage over broad distance bands. */
let highBands: { near: readonly [number, number]; middle: readonly [number, number] } | null = null;
let highSpecies: ReadonlySet<string> = new Set(['fir', 'shorepine', 'pine']);
export function setHighLodSpecies(list: readonly string[]): void { highSpecies = new Set(list); }
/** Profiling switch (?highlod=n0,n1,m0,m1): High crossfades to the lighter models over these distances. */
export function setHighLodBands(bands: typeof highBands): void { highBands = bands; }
export function floraLodWeights(quality: Quality, distance: number): readonly [number, number, number] {
  if (quality === 'high' && highBands) {
    const near = smoothDistanceFade(distance, ...highBands.near), middle = smoothDistanceFade(distance, ...highBands.middle);
    return [near, middle - near, 1 - middle];
  }
  if (quality === 'high') return FULL_TREE_LOD;
  const bands = FLORA_LOD_BANDS[quality];
  const near = quality === 'low' ? 0 : smoothDistanceFade(distance, ...bands.near);
  const middle = smoothDistanceFade(distance, ...bands.middle);
  return [near, middle - near, 1 - middle];
}
/**
 * The low decorative shrubs (supplied trees scaled to about 1.5 m) are the exception: a whole source tree drawn for a
 * few pixels of bush. On every preset they crossfade to their own lighter source LODs within a short walk, the same
 * dithered coverage as the other presets' trees, so nothing pops. Trees keep the rules above.
 */
export const SHRUB_LOD_BANDS = { near: [22, 34], middle: [60, 90] } as const;
export function floraLodWeightsFor(species: Species, quality: Quality, distance: number): readonly [number, number, number] {
  if (species !== 'shrub') return quality === 'high' && highBands && !highSpecies.has(species) ? [1, 0, 0] : floraLodWeights(quality, distance);
  const near = quality === 'low' ? 0 : smoothDistanceFade(distance, ...SHRUB_LOD_BANDS.near);
  const middle = smoothDistanceFade(distance, ...SHRUB_LOD_BANDS.middle);
  return [near, middle - near, 1 - middle];
}
/** Dominant level for inspections and non-render consumers. Actual drawing crossfades both adjacent levels. */
export function floraLod(quality: Quality, distance: number): 0 | 1 | 2 {
  const weights = floraLodWeights(quality, distance);
  return weights[0] >= weights[1] && weights[0] >= weights[2] ? 0 : weights[1] >= weights[2] ? 1 : 2;
}
