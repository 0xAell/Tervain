import type { Species } from './flora';
import type { ForestFloorPiece } from './forestFloor';
import { FLOOR_ROWS } from './plantedForest.floor';
import { PLANTED_ROWS } from './plantedForest.trees';

export { PLANTED_DRAWS, PLANTED_FLORA, PLANTED_WITH } from './plantedFlora';

/**
 * The saved woodland layout is shared by the game and its portable export. The 451 tree identities, positions, headings
 * and ground-plane footprints survive changes to their art. The standing clearance and forest floor are measured from
 * the actual models by tests/presentation/plantedForest.test.ts.
 */
export interface PlantedTree {
  sp: Species;
  v: number;
  x: number;
  /** The seat of its flare on the ground (m). */
  y: number;
  z: number;
  s: number;
  yaw: number;
  /** Radius as an obstacle to movement (m), its footprint; 0 for a tree or shrub that does not block. */
  radius: number;
  /** The radius the walk grid keeps clear of (m): the larger of its footprint and its drawn wood through a standing person's height. */
  navigationRadius: number;
  /** The supplied model it is drawn with, when that is fixed rather than chosen by species and variant. */
  assetId?: string;
}

const fixed = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** The forest for the export: positions to a tenth of a millimetre, and a radius only for a tree that stands in the way. */
export const PLANTED_FOREST: readonly PlantedTree[] = PLANTED_ROWS.map(([sp, v, x, y, z, s, yaw, , radius, collisionId, , navigationRadius, , , , , assetId]) => {
  const blocks = !!collisionId && radius > 0;
  return {
    sp, v, x: fixed(x, 4), y: fixed(y, 4), z: fixed(z, 4), s: fixed(s, 5), yaw: fixed(yaw, 5), radius: blocks ? fixed(radius, 4) : 0,
    navigationRadius: blocks ? fixed(Math.max(radius, navigationRadius), 4) : 0, ...(assetId ? { assetId } : {}),
  };
});

/** The planted trees that stand in the way, as the stones and the shore's details are laid round them. */
export const PLANTED_TRUNKS: readonly { x: number; z: number; radius: number }[] = PLANTED_FOREST.filter((tree) => tree.radius > 0)
  .map((tree) => ({ x: tree.x, z: tree.z, radius: tree.radius }));

/**
 * The woodland floor as the game lays it among the planted forest (forestFloor.ts). Its rule asks how much shade the
 * drawn crowns cast at a place, which only the models answer, so it is kept here as the forest is; the same test lays
 * it again from the models and fails if the two part. Laid with an estimate of the shade from the trees' sizes, the
 * export had 296 pieces where the game lays 669.
 */
export const PLANTED_FLOOR: readonly ForestFloorPiece[] = FLOOR_ROWS.map(([id, kind, x, y, z, nx, nz, yaw, scale, rank, variant, colonyId, parentLogId]) => ({
  id, kind, x, y, z, nx, nz, yaw, scale, rank, variant, ...(colonyId ? { colonyId } : {}), ...(parentLogId ? { parentLogId } : {}),
}));
