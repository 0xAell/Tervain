import { fromBuildingLocal, toBuildingLocal } from '../core/world/interiors';
import { FIELDS, WORLD, type V2 } from '../core/world/layout';
import { fbm } from '../core/world/noise';
import { realmRadius, roadWeight } from '../core/world/terrain';
import type { Atlas } from './atlas';
import { waterProfile } from './channels';
import type { Ground } from './ground';
import { cropHeadland, cropRowSpacing, landMaterial, woodlandCover } from './landCover';
import { random } from './land';
import { project } from './projection';
import { groundProject, terrainSlope } from './relief';
import { onFootpath, yardAt } from './settlement';
import { windFrame, windPhase, type WindSprite } from './wind';

const sectorSize = 32;
const spacing = 2.53;
type Cover = 'meadow' | 'verge' | 'grain' | 'greens';
type Tuft = V2 & { cover: Cover; width: number; phase: number };
interface Plant extends Tuft {
  pixel: { x: number; y: number };
  depth: number;
}
interface Patch {
  plants: Plant[];
  left: number;
  top: number;
  right: number;
  bottom: number;
  drift: number;
  frame?: number;
  ink?: CanvasRenderingContext2D;
}
const sector = (i: number, j: number) => i + ',' + j;

export function canGrowGrass(x: number, z: number) {
  if (
    realmRadius(x, z) > 0.99 ||
    landMaterial(x, z) !== 'grass' ||
    roadWeight(x, z) > 0.1 ||
    onFootpath(x, z, 0.23) ||
    (waterProfile(x, z)?.bank ?? -10) > -0.85 ||
    terrainSlope(x, z) > 0.56
  )
    return false;
  return !yardAt(x, z)?.yards.some(({ b }) => {
    const p = toBuildingLocal(b, x, z);
    return Math.abs(p.x) < b.w / 2 + 1.05 && p.z > -b.d / 2 - 0.9 && p.z < b.d / 2 + 1.55;
  });
}

export class Meadow {
  private crops = new Map<string, Tuft[]>();
  private patches = new Map<string, Patch>();
  constructor(private atlas: Atlas, private art: Record<Cover, WindSprite>) {
    for (const field of FIELDS) {
      if (field.crop === 'fallow') continue;
      for (let z = -field.d / 2 + cropHeadland; z < field.d / 2 - 1; z += cropRowSpacing[field.crop])
        for (let x = -field.w / 2 + 1.25; x < field.w / 2 - 0.8; x += 1.5) {
          const p = fromBuildingLocal(field, x + random(x * 7, z * 2, 397) * 0.37, z);
          if (roadWeight(p.x, p.z) > 0.12 || (waterProfile(p.x, p.z)?.bank ?? -10) > -0.65) continue;
          const noise = random(p.x * 8, p.z * 3, 193),
            key = sector(Math.floor(p.x / sectorSize), Math.floor(p.z / sectorSize));
          let cell = this.crops.get(key);
          if (!cell) this.crops.set(key, (cell = []));
          cell.push({ ...p, cover: field.crop, width: 7.6 + 2.9 * noise, phase: noise * 1.2 });
        }
    }
  }

  private plant(i: number, j: number): Patch {
    const key = sector(i, j),
      cached = this.patches.get(key);
    if (cached) {
      this.patches.delete(key);
      this.patches.set(key, cached);
      return cached;
    }
    const tufts = [...(this.crops.get(key) ?? [])],
      x0 = i * sectorSize,
      z0 = j * sectorSize;
    // A global jittered grid makes adjacent sectors agree at the seam.
    for (let m = Math.floor(x0 / spacing); m < (x0 + sectorSize) / spacing; m++)
      for (let n = Math.floor(z0 / spacing); n < (z0 + sectorSize) / spacing; n++) {
        const x = (m + random(m, n, 231)) * spacing,
          z = (n + random(m, n, 409)) * spacing;
        if (x < x0 || x >= x0 + sectorSize || z < z0 || z >= z0 + sectorSize) continue;
        const r = random(m, n, 561);
        if (r > 0.66 || !canGrowGrass(x, z)) continue;
        const wood = woodlandCover(x, z),
          clumps = fbm(x / 18, z / 21, 2, 209);
        if (r > 0.39 + clumps * 0.48 - wood * 0.19) continue;
        const cover = random(m, n, 433) < 0.34 ? 'verge' : 'meadow';
        tufts.push({
          x,
          z,
          cover,
          width: (5.3 + random(m, n, 733) * 5.4) * (1 - wood * 0.18),
          phase: random(m, n, 899) * 2.6,
        });
      }
    const plants = tufts
      .map((p) => ({ ...p, pixel: groundProject(p), depth: project(p.x, p.z).y }))
      .sort((a, b) => a.depth - b.depth);
    const left = Math.floor(Math.min(...plants.map((p) => p.pixel.x))) - 13,
      top = Math.floor(Math.min(...plants.map((p) => p.pixel.y))) - 16,
      right = Math.ceil(Math.max(...plants.map((p) => p.pixel.x))) + 13,
      bottom = Math.ceil(Math.max(...plants.map((p) => p.pixel.y))) + 3;
    const patch = { plants, left, top, right, bottom, drift: random(i, j, 249) };
    if (this.patches.size >= 84) this.patches.delete(this.patches.keys().next().value!);
    this.patches.set(key, patch);
    return patch;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    ground: Ground,
    ox: number,
    oy: number,
    time: number,
    bounds: { xmin: number; xmax: number; zmin: number; zmax: number }
  ) {
    const { width: w, height: h } = ctx.canvas;
    const { xmin, xmax, zmin, zmax } = bounds;
    let draws = 0;
    const i0 = Math.floor(Math.max(WORLD.minX, xmin) / sectorSize),
      i1 = Math.floor(Math.min(WORLD.maxX, xmax) / sectorSize),
      j0 = Math.floor(Math.max(WORLD.minZ, zmin) / sectorSize),
      j1 = Math.floor(Math.min(WORLD.maxZ, zmax) / sectorSize);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const p = this.plant(i, j);
        if (!p.plants.length || p.right + ox < 0 || p.left + ox >= w || p.bottom + oy < 0 || p.top + oy >= h)
          continue;
        const frame = Math.floor(time * 10 + p.drift);
        if (p.frame !== frame) {
          if (!p.ink) {
            const image = document.createElement('canvas');
            image.width = p.right - p.left;
            image.height = p.bottom - p.top;
            p.ink = image.getContext('2d')!;
            p.ink.imageSmoothingEnabled = false;
          }
          p.ink.clearRect(0, 0, p.ink.canvas.width, p.ink.canvas.height);
          const t = (frame + 0.5 - p.drift) / 10;
          for (const tuft of p.plants) {
            if (!ground.groundVisible(tuft.pixel.x, tuft.pixel.y, tuft.depth)) continue;
            const grass = this.art[tuft.cover];
            this.atlas.draw(
              p.ink,
              grass.key,
              tuft.pixel.x - p.left,
              tuft.pixel.y - p.top,
              tuft.width * grass.widthScale,
              windFrame(windPhase(tuft.x, tuft.z, t), this.atlas.frameCount(grass.key), tuft.phase)
            );
          }
          p.frame = frame;
        }
        ctx.drawImage(p.ink!.canvas, p.left + ox, p.top + oy);
        draws++;
      }
    return draws;
  }
}
