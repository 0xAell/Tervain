import { AMBIENT_RESIDENTS, type AmbientResident } from '../core/content/ambientPeople';
import { smoothstep } from '../core/world/noise';
import { bySpec, type V2 } from '../core/world/layout';
import type { Atlas } from './atlas';
import { frontDoor } from './doorways';
import { project } from './projection';

function route(home: string, stops: V2[]) {
  const door = frontDoor(bySpec(home));
  const inside = { x: door.sill.x + (door.sill.x - door.outside.x) * 0.55,
    z: door.sill.z + (door.sill.z - door.outside.z) * 0.55 };
  const points = [...stops, door.outside, door.sill, inside];
  const legs = points.slice(1).map((to, i) => {
    const from = points[i]!, dx = to.x - from.x, dz = to.z - from.z;
    return { from, dx, dz, length: Math.hypot(dx, dz) };
  });
  return { legs, length: legs.reduce((sum, l) => sum + l.length, 0) };
}

const walks = {
  fisher: route('net_store', [AMBIENT_RESIDENTS.find((r) => r.id === 'fisher')!]),
  fireside: route('fisher_house', [AMBIENT_RESIDENTS.find((r) => r.id === 'fireside')!,
    { x: -100.5, z: 23 }, { x: -94, z: 32.5 }, { x: -89, z: 42 }, { x: -89, z: 49.7 }]),
};

/** One game minute per real second. Both ends of the day follow the same path through the actual doorway. */
export function strandResident(resident: AmbientResident, hour: number) {
  const seated = { x: resident.x, z: resident.z, stand: 0, visible: 1, flip: false, distance: 0 };
  if (resident.id === 'keeper' || !resident.sleeps) return seated;
  const path = walks[resident.id], morning = hour < 12, speed = 1.55, rise = 0.5;
  const minutes = morning ? (6 - hour) * 60 : (hour - 21) * 60 + path.length / speed + rise;
  if (minutes <= 0) return seated;
  const distance = Math.max(0, (minutes - rise) * speed);
  let along = distance;
  for (const leg of path.legs) {
    if (along <= leg.length) {
      const t = along / leg.length, left = project(leg.dx, leg.dz).x < 0;
      return { x: leg.from.x + leg.dx * t, z: leg.from.z + leg.dz * t,
        stand: smoothstep(0, rise, minutes), visible: smoothstep(0, 0.85, path.length - distance),
        flip: morning ? !left : left, distance };
    }
    along -= leg.length;
  }
  return { ...seated, stand: 1, visible: 0 };
}

/** The seated portraits supply each traveller's face and coat. Boot rows alternate about their hips. */
export function buildResidentWalks(atlas: Atlas) {
  const boots = atlas.surface('keeper'), count = 8;
  for (const key of ['fireside', 'fisher'] as const) {
    const source = atlas.surface(key);
    const strip = document.createElement('canvas');
    strip.width = 30 * count;
    strip.height = 34;
    const g = strip.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let i = 0; i < count; i++) {
      const left = i * 30, phase = i * Math.PI / 4;
      for (let leg = 0; leg < 2; leg++) {
        const stride = Math.sin(phase + leg * Math.PI), lift = Math.max(0, stride);
        for (let row = 0; row < 14; row++) {
          const t = row / 13, x = 7 + leg * 8;
          g.drawImage(boots, x + 1, 20 + row, 8, 1,
            left + x + Math.round(t * stride * 2), 20 + row - Math.round(t * lift * 2), 8, 1);
        }
      }
      g.drawImage(source, 5, 0, 20, 18, left + 5, 2 + (i % 4 === 0 ? 1 : 0), 20, 20);
    }
    atlas.addAnimation(key + '--journey', strip, 30, 34);
  }
}
