import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NPCS } from '../../src/core/content/npcs';
import { createInitialState } from '../../src/core/game/state';
import { npcGoalPosition, resolveGoal } from '../../src/presentation/actors';
import type { Pose } from '../../src/presentation/characters';
import { createMeshyNpcRig, type ResidentMotionSource } from '../../src/presentation/meshynpcs';
import { npcStyle } from '../../src/presentation/npcStyle';
import { residentMotionLibrary } from '../../src/presentation/npc/residentMotion';
import { workSiteFor } from '../../src/presentation/npc/workSites';
import { buildStaticColliders } from '../../src/core/world/colliders';
import { Terrain } from '../../src/core/world/terrain';
import { loadResident, loadResidentMotion, loadResidentRigData, residentManifest } from './residentFixtures';

/**
 * A resident's pose ends with every matrix of the figure up to date (residentMotion.ts): keeping the hands out of the
 * torso brings the whole figure up to date and each reach after it what it moves, so the pose no longer refreshes the
 * figure again at its end. Refreshing it after the pose must change nothing, to the bit, whatever the pose did.
 */
let terrain: Terrain;
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => context };
    const context = new Proxy<Record<string, unknown>>({ canvas, measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (target, key) => target[String(key)] ?? (() => {}) });
    return canvas;
  } });
  terrain = new Terrain();
  return () => vi.unstubAllGlobals();
}, 60000);

describe('a resident\'s pose leaves the figure\'s matrices up to date', () => {
  it('at the counter, turning, walking, on a seat higher than the clip\'s and fallen: refreshing them after changes nothing', async () => {
    const id = 'trail_hunter', def = NPCS[id], style = npcStyle(id);
    const model = residentManifest.roles[`named:${id}`]!;
    const { source, entry } = await loadResident(model);
    const motion: ResidentMotionSource = { data: await loadResidentRigData(model), library: residentMotionLibrary(await loadResidentMotion()),
      build: 'man', seed: style.faceSeed, fighter: false, work: style.work };
    const rig = createMeshyNpcRig(source, entry, def.look.height, 'none', undefined, { work: 'provisioning' }, motion);
    const goal = resolveGoal(def, createInitialState(), def.schedule.find(s => s.activity === 'work')!.from + 1);
    const place = npcGoalPosition(def, goal, { terrain, colliders: buildStaticColliders(terrain) }, def.look.height * 1.8);
    const stance = { x: place.x, y: terrain.groundAt(place.x, place.z), z: place.z, yaw: place.yaw };
    rig.root.position.set(stance.x, stance.y, stance.z);
    rig.root.rotation.y = stance.yaw;
    const site = workSiteFor(goal.anchor, stance, terrain);
    expect(site).toBeDefined();
    const objects: THREE.Object3D[] = [];
    rig.root.traverse((o) => objects.push(o));
    const step = 1 / 60;
    let time = 0, checked = 0;
    const phase = (n: number, pose: (i: number) => Partial<Pose>, move?: { ahead: number; turn: number }) => {
      for (let i = 0; i < n; i++, time += step) {
        // As the actor places the figure before posing it: the root moved and turned, its matrices not yet updated.
        if (move) {
          rig.root.rotation.y += move.turn;
          rig.root.position.x += Math.sin(rig.root.rotation.y) * move.ahead; rig.root.position.z += Math.cos(rig.root.rotation.y) * move.ahead;
        }
        rig.resident!.pose({ mode: 'idle', speed: 0, time, t: 0, amp: 1, ...pose(i) } as Pose, step);
        const posed = objects.map((o) => o.matrixWorld.clone());
        rig.root.updateMatrixWorld(true);
        for (let k = 0; k < objects.length; k++) {
          if (!objects[k]!.matrixWorld.equals(posed[k]!)) throw new Error(`${objects[k]!.name || objects[k]!.type} moved when refreshed after step ${checked}`);
        }
        checked++;
      }
    };
    phase(90, () => ({ mode: 'work', workGesture: 'provisioning', workSite: site }));
    phase(40, () => ({ turn: 0.04 }), { ahead: 0, turn: 0.04 });
    phase(60, () => ({ mode: 'walk', speed: 0.5, travel: 1.3 * step, turn: 0.01 }), { ahead: 1.3 * step, turn: 0.01 });
    phase(90, () => ({ mode: 'sit', seatHeight: 0.62 }));
    phase(30, (i) => ({ mode: 'hurt', t: i / 30, turn: -0.02 }), { ahead: 0, turn: -0.02 });
    phase(60, () => ({ mode: 'dead' }));
    expect(checked).toBe(370);
  }, 120000);
});
