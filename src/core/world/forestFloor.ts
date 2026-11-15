import { biomeAt, type BiomeSample } from './biomes';
import { DETAIL_KEEP, type Detail } from './detail';
import { streamDistance, type Exclusions } from './exclusions';
import { createFloraPopulation, type FloraTree } from './flora';
import { deepwoodCover, forestClearingCover, forestClearingDistance } from './forest';
import type { PlantedCrownField } from './groundLayers';
import { woodlandColonyAt } from './habitat';
import { WORLD } from './layout';
import { mulberry32, smoothstep } from './noise';
import { realmRadius, type Terrain } from './terrain';

/**
 * What grows and lies on the woodland floor, and where: ferns, shrubs, moss, leaf litter, fallen logs and the fungi on
 * them. Authored once from the trees, the shade of their crowns and the ground; a lower detail level thins it.
 */

export type ForestFloorKind = 'fern' | 'shrub' | 'moss' | 'litter' | 'log' | 'fungi';
export interface ForestFloorPiece { id: string; kind: ForestFloorKind; x: number; y: number; z: number; nx: number; nz: number; yaw: number; scale: number; rank: number; variant: number; colonyId?: string; parentLogId?: string }

// Keep the exact eight contact directions without repeating trigonometry per floor piece.
const FLOOR_CONTACT_DIRECTIONS = Array.from({ length: 8 }, (_, sample) => {
  const az = sample * Math.PI / 4;
  return [Math.cos(az), Math.sin(az)] as const;
});

/** Authored once, then graphics settings thin only low, nonblocking woodland detail. */
export function createForestFloorPopulation(terrain: Pick<Terrain, 'heightAt' | 'slopeAt' | 'carveAt'>, exclusions: Pick<Exclusions, 'blocked'>, trees: readonly FloraTree[] = createFloraPopulation(terrain, exclusions), crowns?: PlantedCrownField): ForestFloorPiece[] {
  const out: ForestFloorPiece[] = [];
  const trunks = trees.filter((t) => t.radius > 0);
  const hash = new Map<string, FloraTree[]>();
  for (const t of trunks) {
    const key = `${Math.floor(t.x / 16)}:${Math.floor(t.z / 16)}`;
    const bucket = hash.get(key) ?? []; bucket.push(t); hash.set(key, bucket);
  }
  const nearby = (x: number, z: number) => {
    const local: FloraTree[] = [];
    for (let i = Math.floor((x - 16) / 16); i <= Math.floor((x + 16) / 16); i++) {
      for (let j = Math.floor((z - 16) / 16); j <= Math.floor((z + 16) / 16); j++) local.push(...(hash.get(`${i}:${j}`) ?? []));
    }
    return local;
  };
  // Test the same buckets in source order without collecting every nearby tree first.
  const nearTrunk = (x: number, z: number, margin: number): boolean => {
    for (let i = Math.floor((x - 16) / 16); i <= Math.floor((x + 16) / 16); i++) {
      for (let j = Math.floor((z - 16) / 16); j <= Math.floor((z + 16) / 16); j++) {
        const bucket = hash.get(`${i}:${j}`);
        if (bucket) for (const t of bucket) if (Math.hypot(t.x - x, t.z - z) < t.radius + margin) return true;
      }
    }
    return false;
  };
  const canopyAt = (x: number, z: number) => {
    // The loaded world supplies transformed source-leaf envelopes. The fallback is only for the
    // independent authoring tools and synthetic tests that deliberately omit a source model.
    if (crowns) return crowns.coverAt(x, z);
    let cover = 0;
    for (const t of nearby(x, z)) {
      const reach = (t.sp === 'oak' ? 6.5 : t.sp === 'birch' ? 4 : 4.8) * t.s;
      cover += Math.exp(-((x - t.x) ** 2 + (z - t.z) ** 2) / (reach * reach));
    }
    return 1 - Math.exp(-cover);
  };
  const put = (kind: ForestFloorKind, x: number, z: number, scale: number, variant: number, sampledBiome?: Readonly<BiomeSample>, colonyId?: string, sampledCanopy?: number) => {
    const reach = kind === 'log' ? 2.6 : kind === 'fern' ? scale * 1.75 : kind === 'shrub' ? scale * 1.05 : 0.45;
    if (realmRadius(x, z) > 0.97) return;
    const y = terrain.heightAt(x, z);
    if (y < 0.35 || terrain.carveAt(x, z) > 0.01) return;
    const slope = terrain.slopeAt(x, z);
    if (slope > 0.62 || exclusions.blocked(x, z, reach)) return;
    if (crowns && (sampledCanopy ?? crowns.coverAt(x, z)) < 0.08) return;
    // Dry palm sand carries sparse litter; moist temperate ferns never appear beneath it.
    if ((kind === 'fern' || kind === 'moss') && (sampledBiome ?? biomeAt(x, z)).weights['sheltered-palms'] > 0.35) return;
    if (kind === 'log' && slope > 0.22) return;
    if (forestClearingDistance(x, z) < (kind === 'log' ? scale * 1.7 : kind === 'fern' || kind === 'shrub' ? reach : 0.4)) return;
    if (nearTrunk(x, z, kind === 'log' ? scale * 1.7 + 0.25 : 0.24)) return;
    const rank = mulberry32(Math.imul(Math.round(x * 100), 71303) ^ Math.imul(Math.round(z * 100), 31231))();
    const nx = (terrain.heightAt(x - 0.4, z) - terrain.heightAt(x + 0.4, z)) / 0.8;
    const nz = (terrain.heightAt(x, z - 0.4) - terrain.heightAt(x, z + 0.4)) / 0.8;
    // Carpet pieces follow a local tangent plane. Reject a folded ground edge rather than
    // leave the edges of rigid litter or moss suspended over it. Tall plants only root at their base.
    if (kind === 'moss' || kind === 'litter') {
      const footprint = scale * (kind === 'moss' ? 0.76 : 1.05);
      for (let sample = 0; sample < 8; sample++) {
        const direction = FLOOR_CONTACT_DIRECTIONS[sample]!;
        const dx = direction[0] * footprint, dz = direction[1] * footprint;
        if (Math.abs(terrain.heightAt(x + dx, z + dz) - (y - nx * dx - nz * dz)) > 0.065) return;
      }
    }
    const appearance = mulberry32(Math.imul(Math.round(x * 100), 7103) ^ Math.imul(Math.round(z * 100), 31231) ^ Math.imul(kind.length, 93131));
    const piece: ForestFloorPiece = { id: `floor:${kind}:${x.toFixed(4)}:${z.toFixed(4)}`, kind, x, y, z, nx, nz, yaw: appearance() * Math.PI * 2, scale, rank, variant, colonyId };
    out.push(piece);
    return piece;
  };
  // Clumps leave changing gaps rather than a uniform lawn; the forest and the playable trail share one habitat mask.
  const step = 4.8;
  for (let gz = WORLD.minZ + 5; gz < WORLD.maxZ - 5; gz += step) {
    for (let gx = WORLD.minX + 5; gx < WORLD.maxX - 5; gx += step) {
      // Independent cell streams keep unrelated floor positions fixed when a nearby exclusion changes.
      const cellSeed = 50419 ^ Math.imul(Math.round(gx * 10), 71303) ^ Math.imul(Math.round(gz * 10), 31231);
      const rnd = mulberry32(cellSeed);
      const x = gx + (rnd() - 0.5) * step * 0.8;
      const z = gz + (rnd() - 0.5) * step * 0.8;
      const biome = biomeAt(x, z);
      const cover = Math.max(deepwoodCover(x, z), biome.woodland) * forestClearingCover(x, z);
      if (cover < 0.1) continue;
      const canopy = canopyAt(x, z);
      if (canopy < 0.08) continue;
      const wet = Math.max(1 - smoothstep(5, 32, streamDistance(x, z)), biome.moisture);
      const colony = smoothstep(0.28, 0.75, woodlandColonyAt(x, z));
      const colonyId = `floor-colony:${gx.toFixed(1)}:${gz.toFixed(1)}`;
      // Independent kind streams keep a rejected fern from shifting its litter, moss or timber.
      // Offsets orbit each patch irregularly instead of repeating the same NE/SW grid pattern.
      const offset = (random: () => number, min: number, max: number) => {
        const az = random() * Math.PI * 2, radius = min + random() * (max - min);
        return [x + Math.cos(az) * radius, z + Math.sin(az) * radius] as const;
      };
      const fernGrowth = biome.lowGrowth * (1 - biome.exposure * 0.7);
      const fernRandom = mulberry32(cellSeed ^ 701);
      if (fernRandom() < cover * canopy * (0.38 + colony * 0.62 + wet * 0.3) * fernGrowth) {
        const fern = put('fern', x, z, 0.66 + fernRandom() * 0.57, Math.floor(fernRandom() * 3), biome, colonyId, canopy);
        if (fern) for (let child = 0; child < 2; child++) {
          const member = mulberry32(cellSeed ^ Math.imul(child + 1, 92719));
          if (member() >= colony * (0.22 + wet * 0.24)) continue;
          const [fx, fz] = offset(member, 1.25, 2.4);
          put('fern', fx, fz, 0.4 + member() * 0.5, child === 0 ? 0 : fern.variant, undefined, colonyId);
        }
      }
      const shrubRandom = mulberry32(cellSeed ^ 702);
      if (shrubRandom() < cover * canopy * (0.08 + colony * 0.2) * (0.4 + wet * 0.6) * biome.lowGrowth) {
        const [sx, sz] = offset(shrubRandom, 0.65, 2.25);
        put('shrub', sx, sz, 0.7 + shrubRandom() * 0.4, Math.floor(shrubRandom() * 2), undefined, colonyId);
      }
      const mossRandom = mulberry32(cellSeed ^ 703);
      if (mossRandom() < cover * canopy * (0.22 + wet * 0.38 + colony * 0.16) * (1 - biome.exposure * 0.72)) {
        const [mx, mz] = offset(mossRandom, 0.5, 1.75);
        put('moss', mx, mz, 0.6 + mossRandom() * 0.8, 0, undefined, colonyId);
      }
      const litterRandom = mulberry32(cellSeed ^ 704);
      if (litterRandom() < cover * canopy * (0.65 + colony * 0.25)) {
        const [lx, lz] = offset(litterRandom, 0.4, 2.25);
        // Litter selection and placement share a shade sample; keep the original lookup order.
        const broadleaf = crowns?.broadleafAt(lx, lz);
        const litterCanopy = crowns ? canopyAt(lx, lz) : undefined;
        const variant = crowns && broadleaf! < litterCanopy! * 0.3 ? 2 : Math.floor(litterRandom() * 2);
        put('litter', lx, lz, 0.95 + litterRandom() * 0.75, variant, undefined, colonyId, litterCanopy);
      }
      const logRandom = mulberry32(cellSeed ^ 705);
      if (logRandom() < cover * canopy * 0.05) {
        const [lx, lz] = offset(logRandom, 1.6, 2.4);
        const log = put('log', lx, lz, 0.65 + logRandom() * 0.65, Math.floor(logRandom() * 2), undefined, colonyId);
        if (log) {
          const fungusScale = 0.7 + logRandom() * 0.6;
          // The log lies along local X. Leave room beside its radius and the whole three-cap cluster,
          // including their slope rotations, instead of placing mushrooms inside the timber's axis.
          const offset = 0.35 * log.scale + 0.36 * fungusScale + 0.04;
          const side = log.variant ? -1 : 1;
          const fungus = put('fungi', log.x + Math.sin(log.yaw) * offset * side, log.z + Math.cos(log.yaw) * offset * side, fungusScale, 0, undefined, colonyId);
          if (fungus) { fungus.rank = log.rank; fungus.parentLogId = log.id; }
        }
      }
    }
  }
  return out;
}

export function selectForestFloorPopulation(population: readonly ForestFloorPiece[], quality: Detail): ForestFloorPiece[] {
  const keep = DETAIL_KEEP.woodlandFloor[quality];
  const selected = population.filter((p) => p.rank < keep);
  const logs = new Set(selected.filter((p) => p.kind === 'log').map((p) => p.id));
  return selected.filter((p) => !p.parentLogId || logs.has(p.parentLogId));
}

/** Keep solid forest details at their authored size; reduce distant coverage gradually over a broad band. */
export const FOREST_FLOOR_DISTANCE: Readonly<Record<Detail, { start: number; end: number }>> = {
  high: { start: 112, end: 208 },
  medium: { start: 88, end: 168 },
  low: { start: 64, end: 128 },
};
