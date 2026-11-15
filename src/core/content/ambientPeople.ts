import { ANCHORS, bySpec, frontOf } from '../world/layout';
import type { NpcDef } from './npcs';

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
  /** How they look, as a named resident does: their colours, their height (the figure's scale, `figureScale`) and build. */
  look: NpcDef['look'];
}

const FIRE = ANCHORS.strand_fire!;
const DOOR = frontOf(bySpec('keeper_cottage'), 2.4);
const MENDER = frontOf(bySpec('net_store'), 2.4);

export const AMBIENT_RESIDENTS: readonly AmbientResident[] = [
  // Mending with his back to the store, looking out over the yard rather than at its door (A69).
  { id: 'fisher', x: MENDER.x, z: MENDER.z, yaw: bySpec('net_store').yaw, cycle: [['work', 9], ['idle', 4], ['work', 7]], sleeps: true, radius: 0.45,
    look: { skin: 0xb98866, primary: 0x4a4a3c, secondary: 0x2e2a24, hair: 0x6a6660, height: 1.0, girth: 1.08, accessory: 'pack' } },
  // The backless hearth bench is authored at yaw .4. Face across its narrow
  // axis toward the fire, with the hips above its center rather than behind it.
  { id: 'fireside', x: FIRE.x + 1.6, z: FIRE.z + 1, yaw: 0.4 + Math.PI, cycle: [['sit', 12], ['talk', 4], ['sit', 8]], seated: true, sleeps: true, radius: 0.4,
    look: { skin: 0xc79a72, primary: 0x5a4a3a, secondary: 0x6a6a52, hair: 0x3a2a1a, height: 1.0, girth: 0.9, accessory: 'shawl' } },
  // Beside his door, looking out the way his cottage faces rather than at its corner (A69).
  { id: 'keeper', x: DOOR.x + 2.6, z: DOOR.z - 1.2, yaw: bySpec('keeper_cottage').yaw, cycle: [['idle', 14], ['talk', 3], ['idle', 9]], sleeps: false, radius: 0.45,
    look: { skin: 0xb0805c, primary: 0x3e4048, secondary: 0x28262a, hair: 0x8a8880, height: 1.03, girth: 1.0, accessory: 'coat', accent: 0x6a5a3a } },
];
