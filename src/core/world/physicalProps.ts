import { HAMLET_PROPS } from './layout';

/** A loose thing the wanderer can push, lift and throw, and that floats: where it starts, its size (m) and mass (kg). */
export interface PropSpec {
  id: string; name: string; kind: 'barrel' | 'crate'; x: number; z: number;
  width: number; height: number; depth: number; yaw: number; mass: number;
}
/** The barrels and crates of the waystation and the villages. They replace the same stationary work supplies, rather than adding copies over them. */
export const PHYSICAL_PROPS: readonly PropSpec[] = [
  ...HAMLET_PROPS.barrels.map((p, i) => ({ ...p, id: `camp_barrel_${i}`, name: 'Empty trade barrel', kind: 'barrel' as const, width: .76 * (i ? .9 : 1), height: i ? .9 : 1, depth: .76 * (i ? .9 : 1), yaw: .1 * i, mass: 18 })),
  ...HAMLET_PROPS.crates.map((p, i) => ({ ...p, id: `camp_crate_${i}`, name: 'Wooden supply crate', kind: 'crate' as const, width: i ? .66 : .86, height: i ? .47 : .57, depth: i ? .52 : .62, yaw: i ? -.2 : .3, mass: 12 })),
  ...[[-16.5, 2.4], [16.4, 21], [-136.5, 31.5], [88, -13], [-14.4, -3]].map(([x, z], i) => ({ id: `loose_barrel_${i}`, name: 'Empty wooden barrel', kind: 'barrel' as const, x: x!, z: z!, width: .76, height: 1, depth: .76, yaw: .17 * i, mass: 18 })),
];

/**
 * How far under a floating body rides at rest. Loose cargo is light for carrying and throwing, but a sealed barrel and a
 * plank crate both sit well down in the water, so their buoyancy is taken from this line, not from their gameplay mass.
 */
export const FLOAT_LINE: Readonly<Record<PropSpec['kind'], number>> = { barrel: 0.42, crate: 0.55 };
/** Water's drag on a floating body, per second of relative speed, as a share of its mass. */
export const PROP_WATER_DRAG = 2.4;
