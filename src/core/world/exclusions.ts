import { isWorldPickupItem } from '../content/pickups';
import { ANCHORS, BUILDINGS, DECKS, FIELDS, FOREST_RUIN, FOREST_WAYMARKERS, INSPECT_LOCATIONS, LIGHTHOUSE, PALISADE, PICKUP_LOCATIONS, PLACES, ROADS, SPAWN, SPRING_POOL, STREAMS, STRAND, WAGON } from './layout';
import { distToPolyline, roadWeight, type Terrain } from './terrain';

/**
 * Ground that planting keeps clear: buildings and their yards, the places people stand and act, roads, fields, the
 * palisade, decks and carved water. Trees, rocks and ground cover all ask this before they take a spot.
 */
export class Exclusions {
  private circles: { x: number; z: number; r: number }[] = [];
  constructor(private terrain: Terrain) {
    for (const b of BUILDINGS) this.circles.push({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2 + 3.2 });
    for (const a of Object.values(ANCHORS)) this.circles.push({ x: a.x, z: a.z, r: 3.5 });
    for (const p of INSPECT_LOCATIONS) this.circles.push({ x: p.x, z: p.z, r: p.r + 1.5 });
    for (const p of PICKUP_LOCATIONS) this.circles.push({ x: p.x, z: p.z, r: isWorldPickupItem(p.item) ? 0.8 : 3.5 });
    for (const p of Object.values(PLACES)) {
      if (p.r < 20) this.circles.push({ x: p.x, z: p.z, r: 3 });
    }
    this.circles.push({ x: 3, z: 8, r: 11 }, { x: -1, z: 4, r: 4 }, { x: SPRING_POOL.x, z: SPRING_POOL.z, r: SPRING_POOL.r + 2.5 }, { x: 88, z: -20, r: 20 }, { x: -136, z: 28, r: 12 });
    this.circles.push({ x: 10, z: -58, r: 9 }, { x: -20, z: -98, r: 20 }, { x: -46, z: -100, r: 10 }, { x: 96, z: -8, r: 8 }, { x: 100, z: -19, r: 5 });
    for (const d of DECKS) this.circles.push({ x: d.x, z: d.z, r: d.hx + 3 });
    // The strand, the wagon and the foot of the lighthouse stay open ground.
    this.circles.push({ x: STRAND.x, z: STRAND.z, r: 26 }, { x: SPAWN.x, z: SPAWN.z, r: 32 }, { x: WAGON.x, z: WAGON.z, r: 7 }, { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 13 });
    for (const marker of FOREST_WAYMARKERS) this.circles.push({ x: marker.x, z: marker.z, r: 2.4 });
    this.circles.push({ x: FOREST_RUIN.x, z: FOREST_RUIN.z, r: FOREST_RUIN.r + 0.5 });
  }

  blocked(x: number, z: number, pad = 0): boolean {
    for (const c of this.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    if (roadWeight(x, z) > 0.04) return true;
    for (const road of ROADS) if (distToPolyline(x, z, road.points).d < road.width * 0.5 + pad) return true;
    if (this.terrain.carveAt(x, z) > 0.02) return true;
    if (distToPolyline(x, z, PALISADE.points).d < 3.5 + pad) return true;
    for (const f of FIELDS) {
      const dx = x - f.x;
      const dz = z - f.z;
      const lx = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);
      const lz = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
      if (Math.abs(lx) < f.w / 2 + 1.5 && Math.abs(lz) < f.d / 2 + 1.5) return true;
    }
    return false;
  }
}


export function streamDistance(x: number, z: number) {
  let d = Infinity;
  for (const s of STREAMS) d = Math.min(d, distToPolyline(x, z, s.points).d);
  return Math.min(d, Math.hypot(x - SPRING_POOL.x, z - SPRING_POOL.z) - SPRING_POOL.r);
}
