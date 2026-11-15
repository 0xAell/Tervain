import { groundedRockY, rockContactGeometry } from './rockGeometry';
import { placeScatter, type RockShapes, type ScatterRock } from '../core/world/scatter';
import type { Exclusions } from '../core/world/exclusions';
import type { Terrain } from '../core/world/terrain';

export { SCATTER_SHAPES } from './rockGeometry';
export { createShoreDetailPopulation, registerScatterColliders, selectScatterPopulation, type ScatterRock, type ShoreDetail } from '../core/world/scatter';

/** Where the stones lie is the core's rule; how a stone of each shape rests and what it is to walk into come from the meshes drawn here. */
export const ROCK_SHAPES: RockShapes = { groundedY: groundedRockY, contact: rockContactGeometry };

/** Author rocks once. Neither graphics detail nor decorative geometry can change movement obstacles. */
export function createScatterPopulation(terrain: Pick<Terrain, 'heightAt' | 'slopeAt'>, exclusions: Pick<Exclusions, 'blocked'>, trunks: readonly { x: number; z: number; radius: number }[] = []): ScatterRock[] {
  return placeScatter(terrain, exclusions, trunks, ROCK_SHAPES);
}
