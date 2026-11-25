import RAPIER from '@dimforge/rapier3d-compat';
import { SURFACE_FRICTION } from '../core/rules/cargo';
import { buildingEntry, buildingTreads } from '../core/world/buildingEntries';
import { fromBuildingLocal } from '../core/world/interiors';
import type { BuildingSpec, V2 } from '../core/world/layout';
import { crossings, crossingPoint, deckHeight } from './crossing';
import { wetPoint } from './channels';
import { scenery, type Scenery } from './land';
import { sites } from './doorways';
import { terrainHeight } from './relief';
import { bedDepth } from './swell';
import {
  chamberLift,
  roomLift,
  roomRisePixels,
  landingSteps,
  landingRun,
  landingHalfWidth,
  type FloorPlan,
} from './roomPlans';
import { staticRoom, surfaceHeight, isTree, trunkRadius } from './propCatalogue';

export const tileSize = 32;
export const yawRotation = (angle: number) => ({
  x: 0,
  y: Math.sin(angle / 2),
  z: 0,
  w: Math.cos(angle / 2),
});
export const floorAt = (room: FloorPlan | undefined, p: V2) =>
  room ? roomLift(room, p) / roomRisePixels : terrainHeight(p.x, p.z);
const solid =
  /^(well|fire|sign|board|bell|sluice|wreck|beacon|ruin|rill_slab|rill_boulder|tide_rocks|rockpile|cart)$/;
const tile = (x: number, z: number) => Math.floor(x / tileSize) + ',' + Math.floor(z / tileSize);
let sceneryTiles: Map<string, Scenery[]> | undefined;
function obstacles() {
  if (sceneryTiles) return sceneryTiles;
  sceneryTiles = new Map();
  for (const s of scenery()) {
    if (s.building || (!isTree(s.key) && !solid.test(s.key)) || (s.key === 'rockpile' && s.width < 30))
      continue;
    const key = tile(s.x, s.z);
    let list = sceneryTiles.get(key);
    if (!list) sceneryTiles.set(key, (list = []));
    list.push(s);
  }
  return sceneryTiles;
}
function solidBox(
  world: RAPIER.World,
  group: RAPIER.RigidBody,
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
  yaw = 0
) {
  if (Math.min(hx, hy, hz) < 0.005) return;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setRotation(yawRotation(yaw))
      .setFriction(SURFACE_FRICTION.built),
    group
  );
}
function house(world: RAPIER.World, group: RAPIER.RigidBody, b: BuildingSpec) {
  const ground = terrainHeight(b.x, b.z),
    door = buildingEntry(b);
  const box = (lx: number, y: number, lz: number, hx: number, hy: number, hz: number) => {
    const p = fromBuildingLocal(b, lx, lz);
    solidBox(world, group, p.x, ground + y, p.z, hx, hy, hz, b.yaw);
  };
  box(0, 0.14, 0, b.w / 2, 0.16, b.d / 2);
  box(0, b.h / 2, -b.d / 2, b.w / 2, b.h / 2, 0.18);
  for (const side of [-1, 1]) box((side * b.w) / 2, b.h / 2, 0, 0.18, b.h / 2, b.d / 2);
  for (const [lo, hi] of [
    [-b.w / 2, door.x - door.w * 0.61],
    [door.x + door.w * 0.61, b.w / 2],
  ] as const)
    box((lo + hi) / 2, b.h / 2, b.d / 2, (hi - lo) / 2, b.h / 2, 0.18);
  for (const t of buildingTreads(b))
    box(t.x, t.top / 2, (t.zMin + t.zMax) / 2, t.halfX, t.top / 2, (t.zMax - t.zMin) / 2);
}
export function outdoorTile(world: RAPIER.World, i: number, j: number) {
  const group = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
    count = tileSize / 2 + 1;
  const vertices = new Float32Array(count * count * 3),
    indices = new Uint32Array((count - 1) ** 2 * 6);
  let n = 0;
  for (let row = 0; row < count; row++)
    for (let col = 0; col < count; col++) {
      const a = row * count + col,
        x = i * tileSize + col * 2,
        z = j * tileSize + row * 2,
        wet = wetPoint(x, z);
      vertices[a * 3] = x;
      vertices[a * 3 + 1] = wet
        ? -bedDepth(wet.bank, wet.halfWidth, wet.course === 'ocean', 0.5)
        : terrainHeight(x, z);
      vertices[a * 3 + 2] = z;
      if (row < count - 1 && col < count - 1) {
        const b = a + 1,
          c = a + count,
          d = c + 1;
        indices.set([a, d, b, a, c, d], n);
        n += 6;
      }
    }
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(
      SURFACE_FRICTION.ground
    ),
    group
  );
  const key = i + ',' + j;
  for (const b of sites) if (tile(b.x, b.z) === key) house(world, group, b);
  for (const b of crossings) {
    if (tile(b.x, b.z) !== key) continue;
    const verts: number[] = [],
      faces: number[] = [],
      segments = Math.ceil(b.halfLength * 2);
    const yaw = Math.atan2(-b.tz, b.tx);
    for (let k = 0; k <= segments; k++) {
      const s = b.halfLength * ((2 * k) / segments - 1),
        h = deckHeight(b, s);
      for (const t of [-b.halfWidth, b.halfWidth]) {
        const p = crossingPoint(b, s, t);
        verts.push(p.x, h, p.z);
      }
      if (k < segments) {
        const a = k * 2;
        faces.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      if (k < segments - 1 && k > 0)
        for (const side of [-1, 1]) {
          const p = crossingPoint(b, s, side * b.halfWidth);
          solidBox(world, group, p.x, h + 0.74, p.z, 0.53, 0.105, 0.095, yaw);
          if (k % 3 === 0) solidBox(world, group, p.x, h + 0.37, p.z, 0.09, 0.37, 0.09, yaw);
        }
    }
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(verts),
        new Uint32Array(faces),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES
      ).setFriction(0.78),
      group
    );
  }
  for (const s of obstacles().get(key) ?? []) {
    if (s.key === 'ruin' || s.key === 'beacon') continue; // Their enterable shells are already present.
    const trunk = isTree(s.key),
      radius = trunk ? trunkRadius(s) : Math.max(0.3, Math.min(2.3, s.width / 22));
    const hi = trunk ? 4.4 : s.key === 'fire' ? 0.36 : Math.min(2.8, s.width / 15),
      floor = floorAt(undefined, s);
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(hi / 2, radius)
        .setTranslation(s.x, floor + hi / 2, s.z)
        .setFriction(0.83),
      group
    );
  }
  return group;
}
export function buildRoom(world: RAPIER.World, plan: FloorPlan) {
  const group = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
    solidBox(world, group, x, y, z, hx, hy, hz);
  const wallHeight = 3.4;
  for (const [i, r] of plan.rooms.entries()) {
    const floor = chamberLift(plan, i) / roomRisePixels,
      hx = (r.x1 - r.x0) / 2,
      hz = (r.z1 - r.z0) / 2,
      cx = r.x0 + hx,
      cz = r.z0 + hz;
    box(cx, (floor - 0.6) / 2, cz, hx, (floor + 0.6) / 2, hz);
    for (const z of [r.z0, r.z1]) box(cx, floor + wallHeight / 2, z, hx, 0.5 * wallHeight, 0.12);
    if (i !== 1) box(i === 0 ? r.x0 : r.x1, floor + wallHeight / 2, cz, 0.12, 0.5 * wallHeight, hz);
    if (i !== 1) continue;
    for (const side of [-1, 1]) {
      const x = side < 0 ? r.x0 : r.x1,
        high = chamberLift(plan, side < 0 ? 0 : 2) / roomRisePixels;
      for (const [lo, hi] of [
        [r.z0, plan.gap - landingHalfWidth],
        [plan.gap + landingHalfWidth, r.z1],
      ] as const)
        box(x, wallHeight / 2, (lo + hi) / 2, 0.14, wallHeight / 2, (hi - lo) / 2);
      for (let k = 0; k < landingSteps; k++) {
        const h = ((k + 1) * high) / landingSteps;
        box(
          x - side * landingRun + (side * (k + 0.5) * landingRun) / landingSteps,
          h / 2,
          plan.gap,
          landingRun / landingSteps / 2,
          h / 2,
          landingHalfWidth
        );
      }
    }
  }
  for (const f of staticRoom(plan).fixtures) {
    const h = surfaceHeight(f),
      base = floorAt(plan, f);
    box(f.x, base + h / 2, f.z, f.hx, h / 2, f.hz);
  }
  return group;
}
