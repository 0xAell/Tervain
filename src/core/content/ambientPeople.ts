import { ANCHORS, bySpec, frontOf } from '../world/layout';

/** What a silent resident is doing: a pose to hold for some seconds. */
export type AmbientMode = 'work' | 'idle' | 'sit' | 'talk';

/**
 * A silent resident of the inland hamlet. They stand on a mark, cycle through a few poses and carry no quest state;
 * their positions follow the relocated buildings and hearth.
 */
export interface AmbientResident {
  id: 'fisher' | 'fireside' | 'keeper';
  x: number;
  z: number;
  yaw: number;
  /** Poses to cycle through, with how many seconds each lasts. */
  cycle: readonly (readonly [AmbientMode, number])[];
  /** Conversation changes the upper body while this resident stays on their seat. */
  seated?: boolean;
  /** Retires indoors after dark. */
  sleeps: boolean;
  /** Radius of the small collider that keeps the player from walking through them. */
  radius: number;
}

const FIRE = ANCHORS.strand_fire!;
const DOOR = frontOf(bySpec('keeper_cottage'), 2.4);
const MENDER = frontOf(bySpec('net_store'), 2.4);

export const AMBIENT_RESIDENTS: readonly AmbientResident[] = [
  // Mending with his back to the store, looking out over the yard rather than at its door (A69).
  { id: 'fisher', x: MENDER.x, z: MENDER.z, yaw: bySpec('net_store').yaw, cycle: [['work', 9], ['idle', 4], ['work', 7]], sleeps: true, radius: 0.45 },
  // The backless hearth bench is authored at yaw .4. Face across its narrow
  // axis toward the fire, with the hips above its center rather than behind it.
  { id: 'fireside', x: FIRE.x + 1.6, z: FIRE.z + 1, yaw: 0.4 + Math.PI, cycle: [['sit', 12], ['talk', 4], ['sit', 8]], seated: true, sleeps: true, radius: 0.4 },
  // Beside his door, looking out the way his cottage faces rather than at its corner (A69).
  { id: 'keeper', x: DOOR.x + 2.6, z: DOOR.z - 1.2, yaw: bySpec('keeper_cottage').yaw, cycle: [['idle', 14], ['talk', 3], ['idle', 9]], sleeps: false, radius: 0.45 },
];
