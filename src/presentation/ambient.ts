import * as THREE from 'three';
import { BENCH_SEAT_HEIGHT } from '../core/world/layout';
import { AMBIENT_RESIDENTS, type AmbientResident } from '../core/content/ambientPeople';
import type { BuildContext, FrameContext, SceneModule } from './context';
import { createAmbientRig, poseRig, type AmbientStyle, type Look, type Mode, type Rig } from './characters';
import type { AwaitingFigure } from './residentArrivals';
import { goneInForTheNight } from '../core/rules/dayNight';
import { figureScale } from '../core/content/npcs';

/**
 * Silent residents of the inland hamlet. Their positions follow the relocated buildings and hearth;
 * the landing strand itself has no occupied camp. They carry no quest state.
 */

/** A hamlet resident's mark and routine (the core's) with the figure that stands there. */
type Spec = AmbientResident & { style: AmbientStyle };

/** How each of the hamlet's residents is drawn, by id: who they are, where they stand and how they look is in the core. */
const STYLES: Record<AmbientResident['id'], Omit<AmbientStyle, 'id'>> = {
  fisher: { build: 'man', cut: 'short', beard: 'full', age: 0.62, faceSeed: 12011 },
  fireside: { build: 'woman', cut: 'bun', beard: 'none', age: 0.45, faceSeed: 12107 },
  keeper: { build: 'man', cut: 'short', beard: 'full', age: 0.8, faceSeed: 12203 },
};

const SPECS: Spec[] = AMBIENT_RESIDENTS.map((resident) => ({ ...resident, style: { id: resident.id, ...STYLES[resident.id] } as AmbientStyle }));

/** Who the hamlet's people are (for the people lineup and the sheet export). */
export const AMBIENT_PEOPLE: readonly { look: Look; style: AmbientStyle }[] = SPECS.map((s) => ({ look: s.look, style: s.style }));

/** Where each of the hamlet's people stands, by their model's role: the residents near the entry point come first (stage 2). */
export const AMBIENT_PLACES: readonly { role: string; x: number; z: number }[] = SPECS.map((s) => ({ role: `ambient:${s.style.id}`, x: s.x, z: s.z }));

interface Resident { rig: Rig; spec: Spec; t: number; arrived: boolean }

function poseResident(p: Resident, dt: number, reducedMotion: boolean) {
  const total = p.spec.cycle.reduce((a, c) => a + c[1], 0);
  let u = p.t % total;
  let mode: Mode = p.spec.cycle[0]![0];
  for (const [m, d] of p.spec.cycle) {
    if (u < d) { mode = m; break; }
    u -= d;
  }
  poseRig(p.rig, {
    mode,
    seated: p.spec.seated,
    seatHeight: p.spec.seated ? BENCH_SEAT_HEIGHT : undefined,
    speed: 0,
    // A single actor clock preserves gesture phase through pauses and mode changes.
    time: p.t,
    t: u / 3,
    amp: reducedMotion ? 0.35 : 1,
    workGesture: p.spec.style.id === 'fisher' ? 'mending' : 'general',
    idle: reducedMotion ? undefined : { seed: p.spec.style.faceSeed, clock: p.t },
  }, dt);
}

export function buildAmbient(ctx: BuildContext): SceneModule & { counts: { people: number }; awaiting: AwaitingFigure[] } {
  const { terrain, colliders } = ctx;
  const group = new THREE.Group();
  group.name = 'ambient';
  const people: Resident[] = [];
  const awaiting: AwaitingFigure[] = [];
  SPECS.forEach((spec, i) => {
    const role = `ambient:${spec.style.id}`, height = figureScale(spec.look.height, spec.style.build === 'woman');
    // A model still on its way leaves a stand-in with nothing to draw and no body to bump into (stage 2).
    const arrived = !ctx.npcAssets || ctx.npcAssets.has(role);
    const rig = !ctx.npcAssets ? createAmbientRig(spec.look, spec.style) : arrived ? ctx.npcAssets.create(role, height) : ctx.npcAssets.standIn(role, height);
    const ground = terrain.groundAt(spec.x, spec.z);
    rig.root.position.set(spec.x, ground, spec.z);
    rig.root.rotation.y = spec.yaw;
    group.add(rig.root);
    // Real finite bodies leave air above their heads clear for a raised camera.
    const seatedLowering = spec.seated ? 0.48 * rig.hipY / 0.95 : 0;
    colliders.circle(`ambient:${i}`, spec.x, spec.z, spec.radius, true,
      { minY: ground - 0.04, maxY: ground + rig.height - seatedLowering + 0.1 });
    if (!arrived) colliders.setActive(`ambient:${i}`, false, false);
    const p: Resident = { rig, spec, t: i * 5.3, arrived };
    // The first rendered frame already has its authored posture, without a bind-pose flash.
    poseResident(p, 1, ctx.settings?.reducedMotion ?? false);
    people.push(p);
    if (!arrived) awaiting.push({
      role,
      position: () => p.rig.root.position,
      make: (catalog) => catalog.createSteps(role, height),
      adopt(catalog, built) {
        const next = built ?? catalog.create(role, height), old = p.rig;
        next.root.position.copy(old.root.position);
        next.root.rotation.copy(old.root.rotation);
        next.root.visible = old.root.visible;
        group.add(next.root);
        group.remove(old.root);
        p.rig = next;
        p.arrived = true;
        poseResident(p, 1, ctx.settings?.reducedMotion ?? false);
      },
    });
  });
  return {
    group,
    counts: { people: people.length },
    awaiting,
    update(dt: number, f: FrameContext) {
      if (f.wildlifeActive === false || !Number.isFinite(dt) || dt <= 0) return;
      // A resumed tab must not skip entire activities. Ordinary frame partitions
      // still consume the same elapsed time, with bounded steps through gesture transitions.
      const elapsed = Math.min(dt, 0.25);
      people.forEach((p, i) => {
        // Whether they are out is the core's (goneInForTheNight); one gone to bed, or still on the way, blocks nobody, and
        // a person going to bed is no wall for routes: no navigation rebuild at dusk and dawn (A70).
        const out = !goneInForTheNight(!!p.spec.sleeps, f.nightness);
        p.rig.root.visible = out;
        colliders.setActive(`ambient:${i}`, out && p.arrived, false);
        if (!out) { p.t += elapsed; return; }
        // The shadow camera culls actual rig bounds, never a separate distance cutoff.
        let remaining = elapsed;
        while (remaining > 1e-8) {
          const step = Math.min(remaining, 1 / 30);
          p.t += step;
          poseResident(p, step, f.reducedMotion);
          remaining -= step;
        }
      });
    },
    stats: () => ({ people: people.length }),
    dispose() {
      for (const p of people) p.rig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
}
