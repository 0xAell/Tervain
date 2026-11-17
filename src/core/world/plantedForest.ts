import type { Species } from './flora';
import type { ForestFloorPiece } from './forestFloor';
import { FLOOR_ROWS } from './plantedForest.floor';
import { PLANTED_ROWS } from './plantedForest.trees';

/**
 * The forest as the web build plants it. The planting rule is the core's (flora.ts: where trees may stand, how far
 * apart, which kind where). The web build tells it each tree's footprint, its seat on the ground and its crown's reach
 * from the models that draw it, and those are wider than the supplied trees' footprints the rule uses on its own, so it
 * keeps fewer trees than the rule offers. This is that result, tree for tree, so that the export carries the forest
 * that is played; tests/presentation/plantedForest.test.ts plants it again from the models and fails if the two part.
 * A port that plants with its own trees' footprints goes through the same rule.
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

export const PLANTED_FOREST: readonly PlantedTree[] = PLANTED_ROWS.map(([sp, v, x, y, z, s, yaw, radius, navigationRadius, assetId]) => ({
  sp, v, x, y, z, s, yaw, radius, navigationRadius, ...(assetId ? { assetId } : {}),
}));

/** The planted trees that stand in the way, as the stones and the shore's details are laid round them. */
export const PLANTED_TRUNKS: readonly { x: number; z: number; radius: number }[] = PLANTED_FOREST.filter((tree) => tree.radius > 0)
  .map((tree) => ({ x: tree.x, z: tree.z, radius: tree.radius }));

/**
 * The woodland floor as the game lays it among the planted forest (forestFloor.ts). Its rule asks how much shade the
 * drawn crowns cast at a place, which only the models answer, so it is kept here as the forest is; the same test lays
 * it again from the models and fails if the two part. Laid with an estimate of the shade from the trees' sizes, the
 * export had 296 pieces where the game lays 720.
 */
export const PLANTED_FLOOR: readonly ForestFloorPiece[] = FLOOR_ROWS.map(([id, kind, x, y, z, nx, nz, yaw, scale, rank, variant, colonyId, parentLogId]) => ({
  id, kind, x, y, z, nx, nz, yaw, scale, rank, variant, ...(colonyId ? { colonyId } : {}), ...(parentLogId ? { parentLogId } : {}),
}));
