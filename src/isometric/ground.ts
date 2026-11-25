import { terrainTile } from './relief';
import { risePixels } from './projection';
import { canopyShade } from './riverHabitat';
import { roadWeight } from '../core/world/terrain';
import { toBuildingLocal } from '../core/world/interiors';
import type { FieldSpec } from '../core/world/layout';
import { riverSpark } from './riverLight';
import { bridgeShade } from './crossing';
import { wheelWear, yardAt, yardPixel } from './settlement';
import { rippleAt, type Ripple } from './water';
import { WaterGL } from './waterGL';
import { impactsForTile, visibleWaterImpacts, waterImpactAt, type WaterImpact } from './waterImpact';
import type { PropView } from './propPhysics';
import { foamCell } from './foam';
import type { Atlas } from './atlas';
import { cropHeadland, cropRowSpacing, fieldAt, landMaterial, sandCover, woodlandCover } from './landCover';
import { PROJECTION } from './projection';
import { coursesInFrame, stoneFlow, waveFrame, waterProfile, type Flow, type WetPoint } from './water';
import { bedDepth, seaClock, seaPhases, sinPhase, cosPhase } from './swell';
import {
  oceanRamp,
  bankRamp,
  streamRamp,
  poolRamp,
  foamShade,
  foamLit,
  glint,
  mix,
  rgba,
} from './waterPalette';

const SIZE = 96,
  BLOCK = 8,
  BLOCKS = SIZE / BLOCK;
const materials = [
  'grass',
  'sand',
  'shallows',
  'sea',
  'trail',
  'woodland',
  'rock',
  'floor',
  'field',
  'stone',
  'river',
  'pool',
];
const SAND = 1,
  SHOAL = 2,
  SEA = 3,
  ROCK = 6,
  POOL = 11;
type Texture = ReturnType<Atlas['read']>[number];
type Sample = {
  dry: number;
  wood: number;
  lane: number;
  rut: number;
  sand: number;
  nearWater: boolean;
  field?: FieldSpec;
};
type Chunk = ReturnType<Ground['makeChunk']>;
interface VisibleChunk {
  x: number;
  y: number;
  chunk: Chunk;
}
interface TerrainView {
  left: number;
  top: number;
  right: number;
  bottom: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  key: string;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const sat = (n: number) => Math.min(1, Math.max(0, n));
const byte = (n: number) => Math.round(sat(n) * 255);
const index = (n: number) => Math.max(0, Math.min(31, n | 0));
const wrap = (v: number, n: number) => ((v % n) + n) % n;
const tint = rgba(30, 61, 63),
  shade = rgba(58, 70, 61);
function surface() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}
function texel(tex: Texture, u: number, v: number) {
  return tex.pixels[wrap(Math.floor(v), tex.h) * tex.w + wrap(Math.floor(u), tex.w)]!;
}
function skyAt(sky: Texture, x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    f = (x - ix) * 256,
    g = (y - iy) * 256;
  return mix(
    mix(texel(sky, ix, iy), texel(sky, ix + 1, iy), f),
    mix(texel(sky, ix, iy + 1), texel(sky, ix + 1, iy + 1), f),
    g
  );
}
const transmission = Float32Array.from({ length: 256 }, (_, d) => Math.exp(-d / 36));
const bend = (p: WetPoint) => (p.kind === 'river' ? stoneFlow(p) : { deflection: 0, eddy: 0 });

/** Persistent world-space channels and seabeds, with dynamic surface buffers only for wet chunks. */
export class Ground {
  waterImpacts: readonly WaterImpact[] = [];
  private textures: Texture[][];
  private sky: Texture;
  private meadow: Texture;
  private shingle: Texture;
  private chunks = new Map<string, Chunk>();
  private samples = new Map<number, Sample>();
  private visible: VisibleChunk[] = [];
  private currents = [0, 0, 0, 0, 0];
  private lastTime = -1;
  private terrainView?: TerrainView;
  private warming = false;
  private warmView = '';
  hasWater = false;
  private gpu: WaterGL | null;
  get accelerated() {
    return this.gpu?.available ?? false;
  }
  compositeMirrors(ctx: CanvasRenderingContext2D, mirror: HTMLCanvasElement) {
    if (!this.accelerated) return false;
    this.gpu!.composite(ctx, mirror);
    return true;
  }

  constructor(atlas: Atlas) {
    this.textures = materials.map((material) => {
      const clip = 'texture-' + material + '--ripple';
      return atlas.read(atlas.has(clip) ? clip : 'texture-' + material);
    });
    this.meadow = atlas.read('rill_meadow')[0]!;
    this.shingle = atlas.read('rill_shingle')[0]!;
    this.sky = atlas.read('water-sky')[0]!;
    this.gpu = WaterGL.create(this.textures, this.shingle);
  }
  private sample(x: number, z: number) {
    const ix = Math.round(x * 2),
      iz = Math.round(z * 2),
      key = (ix + 2000) * 4096 + iz + 2000;
    let s = this.samples.get(key);
    if (!s) {
      const wet = waterProfile(ix / 2, iz / 2);
      const soil = wet?.course === 'ocean' ? 'sand' : landMaterial(ix / 2, iz / 2);
      const lane = roadWeight(ix / 2, iz / 2);
      s = {
        dry: materials.indexOf(soil),
        wood: soil === 'grass' ? woodlandCover(ix / 2, iz / 2) : 0,
        lane,
        rut: lane > 0.4 ? wheelWear(ix / 2, iz / 2) : 0,
        sand: soil === 'sand' || soil === 'grass' ? sandCover(ix / 2, iz / 2) : 0,
        nearWater: !!wet,
        field: soil === 'field' ? fieldAt(ix / 2, iz / 2) : undefined,
      };
      this.samples.set(key, s);
    }
    return s;
  }
  makeChunk(bx: number, by: number) {
    const canvas = surface(),
      ctx = canvas.getContext('2d', { alpha: false })!;
    const image = ctx.createImageData(SIZE, SIZE),
      pixels = new Uint32Array(image.data.buffer),
      n = pixels.length;
    const mask = surface(),
      maskCtx = mask.getContext('2d')!,
      maskImage = maskCtx.createImageData(SIZE, SIZE);
    const wetBlocks = new Uint8Array(BLOCKS * BLOCKS),
      waterPixels: number[] = [];
    const worldX = bx * SIZE,
      worldY = by * SIZE;
    const relief = terrainTile(worldX, worldY, SIZE);
    const material = new Uint8Array(n),
      course = new Uint8Array(n),
      waves = new Uint32Array(n);
    const bank = new Int16Array(n),
      uv = new Uint16Array(n),
      floorUV = new Uint16Array(n);
    const along = new Int16Array(n),
      across = new Int16Array(n),
      width = new Uint8Array(n);
    const grain = new Uint8Array(n),
      pocket = new Uint8Array(n),
      sky = new Uint32Array(n),
      land = new Uint32Array(n);
    const shearX = new Int8Array(n),
      shearY = new Int8Array(n),
      mirrorAlpha = new Uint8Array(n);
    for (let y = 0, i = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++, i++) {
        const sx = bx * SIZE + x,
          sy = by * SIZE + y,
          height = relief.elevation[i]!,
          planeY = sy + height * risePixels,
          wx = (planeY + sx * 0.5) / PROJECTION,
          wz = (planeY - sx * 0.5) / PROJECTION;
        const jitter = ((Math.imul(sx, 17) ^ Math.imul(sy, 53)) & 7) / 18 - 0.2;
        const sample = this.sample(wx + jitter, wz - jitter * 0.7);
        const dry = this.textures[sample.dry]![0]!;
        pixels[i] = texel(dry, wx * 4, wz * 4);
        if (sample.wood)
          pixels[i] = mix(pixels[i]!, texel(this.textures[5]![0]!, wx * 4, wz * 4), sample.wood * 256);
        const wet = sample.nearWater ? waterProfile(wx, wz) : null;
        const inland = wet && wet.course !== 'ocean';
        const light =
          0.5 +
          0.23 * Math.sin(wx * 0.15 + wz * 0.08) +
          0.18 * Math.cos(wz * 0.29 - wx * 0.07) +
          0.09 * Math.sin(wx * 0.54 + wz * 0.36);
        if (sample.field) {
          const f = sample.field,
            p = toBuildingLocal(f, wx, wz),
            gap = cropRowSpacing[f.crop],
            position = (p.z + f.d / 2 - cropHeadland) / gap,
            ridge = sat(1 - Math.abs(position - Math.round(position)) * 2.45),
            grit = pixels[i]!,
            value = ((grit & 255) + 2 * ((grit >>> 8) & 255) + ((grit >>> 16) & 255)) / 4,
            soil = mix(rgba(78, 56, 43), rgba(163, 129, 86), value * 0.52 + light * 76 + ridge * 46),
            raised = f.crop === 'grain' ? rgba(156, 134, 76) : f.crop === 'greens' ? rgba(116, 131, 77) : soil,
            edge = sat(Math.min(f.w / 2 - Math.abs(p.x), f.d / 2 - Math.abs(p.z)) / 0.86 + jitter * 0.35);
          pixels[i] = mix(
            texel(this.meadow, wx * 2.6, wz * 2.6),
            mix(soil, raised, ridge * 89),
            edge * 256
          );
        }
        const wild = sample.dry === 0 || (sample.dry === SAND && sample.sand < 1);
        if (wild || sample.dry === 9) {
          const blades = texel(
            this.meadow,
            wx * 2.6 + 3 * Math.sin(wz * 0.26),
            wz * 2.6 + 2.7 * Math.cos(wx * 0.31)
          );
          const lush = mix(rgba(41, 110, 89), rgba(197, 224, 113), light * 240);
          const meadow = mix(blades, lush, 156 - sample.wood * 16);
          pixels[i] = mix(pixels[i]!, meadow, 216 - sample.wood * 124);
          if (sample.dry === 9) {
            const radius = Math.hypot(wx - 3, wz - 9),
              patch = sat((12.3 - radius + 0.6 * Math.sin(wz * 1.6) + jitter) / 2.65);
            const cobble = texel(this.textures[9]![0]!, wx * 5, wz * 5);
            const value = ((cobble & 255) + ((cobble >>> 8) & 255) * 2 + ((cobble >>> 16) & 255)) * 0.25;
            pixels[i] = mix(
              pixels[i]!,
              mix(rgba(88, 93, 79), rgba(166, 161, 132), value * 1.83),
              patch * 218
            );
          }
        }
        if (sample.sand > 0) {
          const sand = texel(
            this.textures[SAND]![0]!,
            wx * 3 + 8 * Math.sin(wz * 0.17),
            wz * 3 + 6 * Math.sin(wx * 0.24)
          );
          const fleck = texel(this.shingle, wx * 3.5, wz * 3.5);
          const dune = 0.5 + 0.5 * Math.sin(wx * 1.35 + wz * 0.51 + 2.8 * Math.sin(wz * 0.16));
          const tint = mix(rgba(174, 151, 116), rgba(245, 224, 174), 87 + light * 89 + dune * 67);
          const beach = mix(mix(sand, fleck, 27), tint, 128);
          pixels[i] = mix(pixels[i]!, beach, sat(sample.sand + jitter * (1 - sample.sand) * 0.36) * 256);
        }
        const trail = texel(
          this.textures[4]![0]!,
          wx * 3.6 + 4 * Math.sin(wz * 0.31),
          wz * 3.6 + 3 * Math.sin(wx * 0.24)
        );
        const path = mix(trail, rgba(222, 189, 132), 90 + light * 48);
        if (inland && wet.bank < 1.1) {
          const verge = sat(1 + wet.bank / 6.2),
            open = 0.5 + 0.5 * Math.sin(wet.along * 0.29 + wet.across * 0.25);
          const gravel = texel(this.shingle, wx * 3.3, wz * 3.3);
          if (wild) {
            const moss = mix(rgba(61, 135, 89), rgba(174, 208, 94), light * 256);
            pixels[i] = mix(pixels[i]!, moss, verge * 68);
          }
          const shelf = sat((wet.bank + 0.72 + open * 1.6 + jitter) / 1.72);
          pixels[i] = mix(pixels[i]!, mix(gravel, path, 91), shelf * (112 + open * 91));
        }
        if (sample.lane > 0 && wet?.course !== 'ocean') {
          const wheel = sat((sample.lane - 0.09 + jitter * 0.24) / 0.79);
          const worn = mix(path, rgba(120, 91, 67), sample.rut * (43 + light * 27));
          pixels[i] = mix(pixels[i]!, worn, wheel * 237);
        }
        const yard = yardAt(wx, wz);
        if (yard)
          pixels[i] = yardPixel(
            yard,
            wx,
            wz,
            pixels[i]!,
            path,
            texel(this.textures[ROCK]![0]!, wx * 7, wz * 7),
            jitter * 4
          );
        const cliff = relief.steepness[i]!;
        if (cliff) {
          // Strata use horizontal distance and vertical metres so the rock retains grain on a sheer face.
          const seam =
            height * 1.2 + 0.32 * Math.sin(wx * 0.35 + wz * 0.21) + 0.08 * Math.sin(wx * 1.13 - wz * 0.61);
          const band = seam - Math.floor(seam);
          const rock = texel(
            this.shingle,
            (wx - wz) * 2.6 + height * 0.65,
            height * 5.7 + Math.sin(wx * 0.37) * 1.55
          );
          const value = ((rock & 255) + ((rock >>> 8) & 255) * 2 + ((rock >>> 16) & 255)) / 4;
          const patina = mix(
            rgba(56, 66, 70),
            rgba(190, 172, 139),
            (value - 32) * 1.49 + (band < 0.15 ? -45 : band > 0.82 ? 25 : 0)
          );
          pixels[i] = mix(pixels[i]!, patina, cliff * (0.89 - sample.lane * 0.54));
        }
        const tone = relief.light[i]!;
        if (tone)
          pixels[i] =
            tone > 0
              ? mix(pixels[i]!, rgba(250, 225, 156), tone)
              : mix(pixels[i]!, rgba(35, 48, 70), -tone * 1.3);
        const treeShadow = inland ? canopyShade(wx, wz) : 0;
        if (treeShadow) pixels[i] = mix(pixels[i]!, rgba(30, 76, 80), treeShadow * 175);
        if (!wet || wet.bank < -1.65) continue;
        const ocean = wet.course === 'ocean',
          stone = bend(wet);
        const mat = materials.indexOf(wet.kind),
          tex = this.textures[mat]![0]!;
        const sxTex = sx * 0.72 + 8.1 * Math.sin(wz * 0.18 + wx * 0.09),
          syTex = sy * 0.93 + 5.2 * Math.cos(wx * 0.2 + wz * 0.11);
        const u = ocean ? sxTex : wet.across * 5.5,
          v = ocean ? syTex : wet.along * 3.1;
        material[i] = mat;
        course[i] = coursesInFrame.indexOf(wet.course);
        uv[i] = wrap(Math.floor(v), tex.h) * tex.w + wrap(Math.floor(u), tex.w);
        const bed = ocean ? this.textures[SAND]![0]! : this.shingle;
        bank[i] = Math.round(Math.min(80, wet.bank) * 64);
        waves[i] = seaPhases(wx, wz, wet.bank);
        const sourceDist = Math.hypot(wx + 8.8, wz + 92.5);
        along[i] = Math.round((wet.kind === 'pool' ? sourceDist : wet.along) * 64);
        across[i] = Math.round((wet.across + stone.deflection) * 64);
        width[i] = Math.min(255, Math.round(wet.halfWidth * 24));
        const noise =
          0.5 +
          0.22 * Math.sin(wx * 0.64 + wz * 0.78 + 2.1 * Math.sin(wz * 0.39)) +
          0.15 * Math.cos(wx * 1.27 - wz * 0.41) +
          0.09 * Math.sin(wx * 2.8 + wz * 1.72);
        grain[i] = byte(noise);
        // Follow the refracted view ray down to the riverbed. Surface rings and pebbles occupy different planes.
        const offset = bedDepth(wet.bank, wet.halfWidth, ocean, noise) * 0.86;
        floorUV[i] =
          wrap(Math.floor((wz - offset) * 3.8), bed.h) * bed.w + wrap(Math.floor((wx - offset) * 3.8), bed.w);
        pocket[i] = byte(stone.eddy);
        land[i] = pixels[i]!;
        const skyColor = skyAt(this.sky, sx / 25 + 0.65 * Math.sin(wz * 0.13), sy / 23);
        sky[i] =
          (skyColor & 0xffffff) |
          (Math.round(255 * (ocean ? 0 : Math.max(bridgeShade(wx, wz), treeShadow))) << 24);
        wetBlocks[((y / BLOCK) | 0) * BLOCKS + ((x / BLOCK) | 0)] = 1;
        waterPixels.push(i);
      }
    ctx.putImageData(image, 0, 0);
    return {
      canvas,
      ctx,
      image,
      pixels,
      worldX,
      worldY,
      elevations: relief.elevation,
      mask,
      maskCtx,
      maskImage,
      material,
      course,
      waves,
      bank,
      uv,
      floorUV,
      along,
      across,
      width,
      grain,
      pocket,
      sky,
      land,
      shearX,
      shearY,
      mirrorAlpha,
      wetBlocks,
      waterPixels: Uint16Array.from(waterPixels),
      lastWaterFrame: '',
    };
  }

  private paintWater(ch: Chunk, tick: number, hour: number, flow: Flow, ripples: Ripple[], frame: string) {
    const t = tick / 15,
      clock = seaClock(t),
      sun = sat(0.38 + 0.62 * Math.cos(((hour - 10) * Math.PI) / 12));
    const fc = this.currents.map((v) => Math.floor(v * 29));
    const stages = [0, flow.main, flow.village, flow.quarry, flow.spring];
    const nearby = ripples.filter((r) => {
      const sx = (r.x - r.z) * 6 - ch.worldX,
        sy = (r.x + r.z) * 3 - ch.worldY,
        rx = (r.radius + 0.7) * 9;
      return sx >= -rx && sx <= SIZE + rx && sy >= -rx * 0.5 && sy <= SIZE + rx * 0.5;
    });
    const contacts = impactsForTile(this.waterImpacts, ch.worldX, ch.worldY, SIZE);
    const archives = this.textures;
    for (const i of ch.waterPixels) {
      const mat = ch.material[i]!,
        ocean = mat === SEA || mat === SHOAL,
        basin = mat === POOL,
        course = ch.course[i]!;
      const ph = ch.waves[i]!,
        n = ch.grain[i]! / 255,
        dist = ch.bank[i]! / 64,
        along = ch.along[i]! / 64,
        side = ch.across[i]! / 64;
      const a0 = (ph - clock[0]) & 255,
        b0 = ((ph >>> 8) - clock[1]) & 255,
        c0 = ((ph >>> 16) - clock[2]) & 255;
      // Invert the isometric projection once along the viewing ray. High water displaces the sampled surface behind it.
      const altitude = 0.58 * sinPhase(a0) + 0.31 * sinPhase(b0) + 0.11 * sinPhase(c0);
      const a = (a0 + Math.round(altitude * 9)) & 255,
        b = (b0 + Math.round(altitude * 4)) & 255,
        c = (c0 + Math.round(altitude * 17)) & 255;
      const envelope = sinPhase((ph >>> 24) - clock[3]),
        local = fc[course]!;
      // Run-up moves the wet/dry boundary on the sand. Channel stage follows the actual sluice allocation.
      const reach = ocean
        ? 0.08 + 0.6 * sinPhase(a + 25) + 0.24 * sinPhase(b + 9)
        : basin
          ? 0.09 * sinPhase(t * 26 + along * 8)
          : -0.2 + 0.51 * stages[course]! + 0.095 * sinPhase(along * 5 - local);
      const cover = dist + reach;
      const beach = ch.land[i]!,
        damp = sat((dist + (ocean ? 1.28 : 0.96)) / (ocean ? 1.67 : 1.42));
      const wetEarth = mix(beach, shade, damp * (ocean ? 91 : 123)),
        mask = i * 4 + 3;
      if (cover <= 0) {
        ch.pixels[i] = wetEarth;
        ch.mirrorAlpha[i] = 0;
        ch.maskImage.data[mask] = 0;
        continue;
      }
      ch.maskImage.data[mask] = 255;
      const sky = ch.sky[i]!,
        frames = archives[mat]!,
        cycle = Math.floor(t * (ocean ? 2.7 : 1.55)) + ((ph >>> 24) & 3),
        frame = frames[waveFrame(cycle, frames.length)]!;
      const uv = ch.uv[i]!,
        u = uv % frame.w,
        v = (uv / frame.w) | 0;
      let dx: number,
        dy: number,
        deep: number,
        optical: number,
        foam = 0,
        shine = 0,
        strength: number;
      if (ocean) {
        const h = 0.55 * sinPhase(a) + 0.32 * sinPhase(b) + 0.13 * sinPhase(c);
        const slope = 0.57 * cosPhase(a) + 0.35 * cosPhase(b) + 0.22 * cosPhase(c);
        const cross = 0.18 * cosPhase(a) - 0.48 * cosPhase(b) + 0.34 * cosPhase(c);
        dx = slope * 3.3 + cross * 2.3;
        dy = h * 1.85;
        const sampleU = u + dx * 1.4,
          sampleV = v + dy * 2.5 - t * 1.3;
        const deepFrames = archives[SEA]!,
          shallowFrames = archives[SHOAL]!;
        const deepMark =
          (texel(deepFrames[waveFrame(cycle, deepFrames.length)]!, sampleU, sampleV) >>> 8) & 255;
        const shallowMark =
          (texel(shallowFrames[waveFrame(cycle, shallowFrames.length)]!, sampleU, sampleV) >>> 8) & 255;
        const k = sat((cover - 1.5) / 4),
          transition = k * k * (3 - 2 * k);
        const ink =
          sat((shallowMark - 185) / 38) * (1 - transition) + sat((deepMark - 66) / 112) * transition;
        // A steep illuminated face, a narrower lip, and a small shadow immediately behind the lip.
        const crest = (a + Math.round(14 * sinPhase(b) + 7 * sinPhase(c))) & 255;
        const otherCrest = (b + Math.round(11 * sinPhase(c) + 8 * sinPhase(a))) & 255;
        const crown = Math.abs(crest - 62),
          crossCrown = Math.abs(otherCrest - 68);
        const px = ch.worldX + (i % SIZE),
          py = ch.worldY + ((i / SIZE) | 0);
        const bubbles = foamCell(px * 0.7 + dx * 4 - t * 2.6, py * 1.12 + dy * 4 + t * 0.85);
        const fine = foamCell(px * 1.45 + dy * 5 + t * 1.2, py * 1.86 + n * 7);
        const face = sat(1 - Math.abs(crest - 93) / 38),
          back = sat(1 - Math.abs(crest - 42) / 23);
        const underlip = sat(1 - Math.abs(crest - 76) / 17) * sat((sinPhase(b) + 1) * 0.53);
        const level = index(
          13 +
            h * 3.4 -
            slope * 5.1 -
            cross * 2.7 +
            face * 3.7 -
            back * 3.4 +
            underlip * 4.3 +
            ink * 3 +
            envelope
        );
        const open = sat((cover - 1) / 8),
          bankColor = bankRamp[index(12 + level * 0.65 + cross * 2)]!;
        deep = mix(bankColor, oceanRamp[level]!, 59 + open * 197);
        deep = mix(deep, sky, 8 + Math.max(0, -slope) * 13);
        const windbreak = sat((sinPhase(b + 15) * 0.53 + envelope * 0.21 + n * 0.67 + 0.05) * 1.23);
        const rim = sat(1 - crown / (2.4 + windbreak * 4.6));
        const glancing = sat(0.28 - slope * 0.54 + cross * 0.2 + face * 0.37);
        shine = ink * (0.14 + glancing * 0.45) + rim * windbreak * (0.1 + 0.15 * sun);
        // Broken cells open in the rolling lip, stretch behind the crest, then dissolve into isolated flecks.
        const fieldA = sat(1 - Math.abs(crest - 65) / (8 + windbreak * 23)) * windbreak;
        const fieldB = sat(1 - crossCrown / 14) * sat((sinPhase(a + 17) + n - 0.48) * 1.25);
        const coverage = sat((Math.max(fieldA, fieldB * 0.74) - 0.21) * 1.43);
        const web = sat((coverage * 0.87 - bubbles) * 3.7);
        const spindrift = sat((coverage * 0.56 - fine) * 3.5);
        const cap = coverage * (0.19 + 0.72 * web + 0.17 * spindrift);
        const lace =
          sinPhase(a * 3 + Math.round(22 * sinPhase(c))) + cosPhase(c * 3 + Math.round(21 * cosPhase(b)));
        const wash =
          (dist * 22 + t * 39 + 12 * sinPhase((ph >>> 24) + 9) + 7 * sinPhase((ph >>> 8) - clock[3])) & 127;
        const front = sat(1 - Math.abs(wash - 39) / (4.5 + n * 6.8));
        const washDepth = sat(1 - cover / 5.4);
        const shoreline = sat(1 - cover / (0.11 + 0.18 * n)) * (0.46 + 0.49 * n);
        const backwash =
          wash > 42 && wash < 62 && Math.abs(lace) < 0.16 ? (0.3 - (wash - 42) * 0.012) * washDepth : 0;
        foam = Math.max(shoreline, front * washDepth * (0.31 + 0.69 * (1 - bubbles)), backwash, cap * 0.92);
        optical = Math.max(0, cover) * (0.45 + 0.06 * h);
        strength = 0.65 - 0.13 * Math.abs(slope);
      } else {
        const r = ch.width[i]! / 24,
          p = ch.pocket[i]! / 255,
          run = local * 0.029;
        // Two advected current lanes shear past one another. A stone splits a lane and sheds a small eddy.
        const slow = along - run,
          fast = along - run * 1.46;
        const sweep = sinPhase(slow * 9 + 39 * sinPhase(along * 3)) + p * sinPhase(slow * 23 + side * 14);
        const striation = (side * 60 + sweep * 35 + 21 * sinPhase(fast * 18 + side * 25)) & 127;
        const smallWave = (slow * 34 + side * 18 + 22 * sinPhase(side * 43 + fast * 5)) & 127;
        const flowline = sat(1 - Math.abs(striation - 52) / 9);
        const breaks = sat(
          (sinPhase(fast * 27 + side * 31) + 0.43 * cosPhase(slow * 32 + side * 8) + 0.1) * 1.65
        );
        const rip = sinPhase(slow * 15 + side * 28),
          rip2 = cosPhase(fast * 23 - side * 26);
        const pulse = sinPhase(along * 49 - t * 51);
        dx = basin ? pulse * 0.69 : rip * 0.86 + rip2 * 0.63 + p * sinPhase(fast * 31) * 1.8;
        dy = basin ? cosPhase(along * 42 - t * 53) * 0.55 : sinPhase(fast * 18 + side * 17) * 0.82;
        const curl = p * sinPhase(fast * 39 + side * 33 + 19 * sweep);
        if (!basin) {
          dx += curl * 1.45;
          dy += p * cosPhase(slow * 32 - side * 41) * 1.18;
        }
        const sample = texel(frame, u + dx, v - local * 0.12 + dy);
        const ink = sat((((sample >>> 8) & 255) - 85) / 107);
        const channelDepth = sat(cover / Math.max(0.42, r * 0.85));
        const grainLine = foamCell(along * 6.8 - run * 9 + 18 * sinPhase(side * 35), side * 15 + sweep * 3.5);
        const riffle =
          sat(1 - Math.abs(smallWave - 61) / 8) * sat((cosPhase(fast * 12 - side * 43) + 0.12) * 1.15);
        const level = index(
          13 +
            (1 - channelDepth) * 6 +
            rip * 3.8 +
            rip2 * 2.8 +
            ink * 3 +
            riffle * 3 +
            (basin ? 0 : cosPhase(fast * 12 + side * 31 + 17 * sweep) * 1.8 + curl * 2.1)
        );
        deep = (basin ? poolRamp : streamRamp)[level]!;
        deep = mix(deep, sky, basin ? 28 : 19);
        const rings = sat((pulse - 0.915) * 12) * sat(1 - along / 6.5) * (0.22 + 0.26 * n);
        shine = basin
          ? rings + ink * 0.23
          : flowline * breaks * (0.26 + 0.26 * (1 - grainLine)) +
            riffle * (0.2 + 0.17 * breaks) +
            ink * (0.17 + 0.16 * breaks);
        foam = basin
          ? 0
          : Math.max(
              p * (flowline + riffle * 0.65) * (0.24 + 0.54 * breaks),
              riffle * 0.29 * sat(1 - cover / 1.8) * (1 - grainLine)
            );
        if (!basin) foam = Math.max(foam, sat(1 - cover / 0.12) * 0.19 * breaks);
        if (!basin) foam = Math.max(foam, p * sat((curl - 0.12) * 1.35) * (0.28 + 0.36 * breaks));
        if (!basin) foam = Math.max(foam, p * riffle * breaks * 0.65);
        optical = basin ? cover * 0.58 : cover * 0.57 + channelDepth * 0.31;
        strength = basin ? 0.82 : 0.57 + 0.31 * channelDepth - 0.13 * p;
      }
      if (nearby.length || contacts.length) {
        const sx = ch.worldX + (i % SIZE),
          sy = ch.worldY + Math.floor(i / SIZE),
          wx = (sy + sx * 0.5) / PROJECTION,
          wz = (sy - sx * 0.5) / PROJECTION;
        for (const contact of contacts) {
          if (contact.course !== course) continue;
          const hit = waterImpactAt(contact, wx, wz, n);
          if (!hit) continue;
          dx = dx * (1 - hit.shelter * 0.46) + hit.x;
          dy = dy * (1 - hit.shelter * 0.46) + hit.y;
          foam = Math.max(foam * (1 - hit.shelter * 0.34), hit.foam);
          shine = shine * (1 - hit.shelter * 0.28) + hit.foam * 0.26;
        }
        for (const r of nearby) {
          if (r.course !== course) continue;
          const pulse = rippleAt(r, wx, wz);
          if (!pulse) continue;
          dx += pulse.dx * 2.9;
          dy += pulse.dy * 1.8;
          shine += pulse.crest * 0.68;
          foam = Math.max(foam, pulse.crest * 0.56);
        }
      }
      const bedTex = ocean ? archives[SAND]![0]! : this.shingle,
        uvBed = ch.floorUV[i]!;
      const bed = texel(
        bedTex,
        (uvBed % bedTex.w) + Math.round(dx * 1.25),
        ((uvBed / bedTex.w) | 0) + Math.round(dy * 1.65)
      );
      const pebble = ocean
        ? 0
        : foamCell((uvBed % bedTex.w) * 1.2 + dx, ((uvBed / bedTex.w) | 0) * 1.14 + dy);
      let riverBed = mix(bed, ocean ? tint : rgba(62, 142, 159), ocean ? 88 : 84);
      if (!ocean)
        riverBed = mix(
          riverBed,
          pebble < 0.12 ? rgba(88, 99, 133) : rgba(194, 203, 159),
          pebble < 0.12 ? 111 : pebble * 48
        );
      const laid = mix(wetEarth, riverBed, sat(cover / (ocean ? 1.7 : 1.05)) * 256);
      const trans = transmission[Math.min(255, Math.max(0, Math.round(optical * 49)))]!;
      let color = mix(deep, laid, trans * 256);
      const shelter = (sky >>> 24) / 255;
      if (shelter) {
        color = mix(color, rgba(22, 42, 44), shelter * 102);
        shine *= 1 - shelter * 0.76;
        foam *= 1 - shelter * 0.34;
      }
      if (shine > 0.025) color = mix(color, glint, Math.min(0.68, shine) * 219 * sat(cover / 0.25));
      if (foam > 0.022)
        color = mix(
          color,
          ocean
            ? foam > 0.35
              ? foamLit
              : foamShade
            : foam > 0.35
              ? rgba(222, 246, 218)
              : rgba(146, 211, 209),
          Math.min(1, foam) * 243
        );
      const sparkle = ocean
        ? 0
        : riverSpark(ch.worldX + (i % SIZE), ch.worldY + Math.floor(i / SIZE), t, n) *
          (1 - shelter * 0.96) *
          sat(cover / 0.3);
      if (sparkle) color = mix(color, rgba(237, 253, 208), sparkle * 250);
      strength *= 1 - sparkle * 0.85;
      ch.pixels[i] = color;
      ch.shearX[i] = Math.round(dx);
      ch.shearY[i] = Math.round(dy);
      ch.mirrorAlpha[i] = byte(strength * sat(cover / (ocean ? 1.07 : 0.6)) * (1 - foam * 0.93));
    }
    ch.ctx.putImageData(ch.image, 0, 0);
    ch.maskCtx.putImageData(ch.maskImage, 0, 0);
    ch.lastWaterFrame = frame;
  }

  /** Nearest projected terrain depth in camera pixels, shared by foreground occlusion and the ground pass. */
  private landDepth(x: number, y: number) {
    const bx = Math.floor(x / SIZE),
      by = Math.floor(y / SIZE);
    const ch = this.chunks.get(bx + ',' + by);
    if (!ch) return -Infinity;
    return y + ch.elevations[(Math.floor(y) - by * SIZE) * SIZE + Math.floor(x) - bx * SIZE]! * risePixels;
  }
  groundVisible(x: number, y: number, depth: number) {
    return this.landDepth(x, y) <= depth + 3;
  }
  clipUpright(
    ctx: CanvasRenderingContext2D,
    x: number,
    foot: number,
    width: number,
    height: number,
    depth: number,
    ox: number,
    oy: number
  ) {
    const left = Math.floor(x - width * 0.5) - 1,
      right = Math.ceil(x + width * 0.5) + 1;
    const top = Math.floor(foot - height) - 1,
      bottom = Math.ceil(foot) + 1;
    let stops: number[] | undefined;
    for (let col = left; col < right + 3; col += 3) {
      const at = Math.min(right, col),
        sx = at - ox;
      let lo = top,
        hi = bottom;
      if (this.landDepth(sx, hi - oy) <= depth) lo = hi;
      else {
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (this.landDepth(sx, mid - oy) > depth) hi = mid;
          else lo = mid;
        }
        if (!stops) stops = [];
      }
      if (stops) stops.push(at, lo);
    }
    if (!stops) return false;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    for (let i = stops.length - 2; i >= 0; i -= 2) ctx.lineTo(stops[i]!, stops[i + 1]!);
    ctx.lineTo(Math.max(left, stops[0]! - 3), bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.clip();
    return true;
  }

  reflect(src: Uint8ClampedArray, destination: CanvasRenderingContext2D, bounds: Rect) {
    const { x: left, y: top, w, h } = bounds;
    const output = destination.createImageData(w, h),
      result = output.data;
    for (const { x, y, chunk } of this.visible) {
      const l = Math.max(left, x),
        r = Math.min(left + w, x + SIZE),
        t = Math.max(top, y),
        b = Math.min(top + h, y + SIZE);
      for (let sy = t; sy < b; sy++)
        for (let sx = l; sx < r; sx++) {
          const i = (sy - y) * SIZE + sx - x,
            alpha = chunk.mirrorAlpha[i]!;
          if (!alpha) continue;
          const rx = sx - left + chunk.shearX[i]!,
            ry = sy - top + chunk.shearY[i]!;
          if (rx < 0 || ry < 0 || rx >= w || ry >= h) continue;
          const from = (ry * w + rx) * 4,
            opacity = src[from + 3]!;
          if (!opacity) continue;
          const into = ((sy - top) * w + sx - left) * 4;
          result[into] = src[from]! * 0.78 + 48 * 0.22;
          result[into + 1] = src[from + 1]! * 0.78 + 82 * 0.22;
          result[into + 2] = src[from + 2]! * 0.78 + 84 * 0.22;
          result[into + 3] = (opacity * alpha) / 255;
        }
    }
    destination.putImageData(output, left, top);
  }
  /** Prepare the next strip of terrain during idle time so it can scroll into view in one blit. */
  private warmTerrain(view: TerrainView) {
    if (this.terrainView?.key !== view.key) this.warmView = '';
    this.terrainView = view;
    if (this.warming || this.warmView === view.key || typeof requestIdleCallback !== 'function') return;
    this.warming = true;
    requestIdleCallback((deadline) => {
      this.warming = false;
      if (deadline.timeRemaining() < 6) return;
      const v = this.terrainView!;
      let next: { key: string; x: number; y: number } | undefined,
        distance = Infinity;
      for (let y = v.y0 - 1; y <= v.y1 + 1; y++)
        for (let x = v.x0 - 1; x <= v.x1 + 1; x++) {
          if (x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1) continue;
          const key = x + ',' + y;
          if (this.chunks.has(key)) continue;
          const dx = Math.max(0, v.left - (x + 1) * SIZE, x * SIZE - v.right),
            dy = Math.max(0, v.top - (y + 1) * SIZE, y * SIZE - v.bottom),
            m = dx + dy;
          if (m >= distance) continue;
          next = { key, x, y };
          distance = m;
        }
      if (next) this.chunks.set(next.key, this.makeChunk(next.x, next.y));
      else this.warmView = v.key;
    });
  }
  draw(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    flow: Flow,
    hour: number,
    ripples: Ripple[] = [],
    loose: readonly PropView[] = []
  ) {
    const x0 = Math.floor(-ox / SIZE),
      y0 = Math.floor(-oy / SIZE),
      x1 = Math.floor((w - ox) / SIZE),
      y1 = Math.floor((h - oy) / SIZE);
    this.warmTerrain({
      left: -ox,
      top: -oy,
      right: w - ox,
      bottom: h - oy,
      x0,
      x1,
      y0,
      y1,
      key: x0 + ',' + x1 + ',' + y0 + ',' + y1,
    });
    const tick = Math.floor(time * 15),
      rates = [0.72, 0.35 + flow.main, 0.25 + flow.village, 0.25 + flow.quarry, 0.24 + flow.spring * 0.25];
    const surfaceTick = Math.floor(time * 30);
    this.waterImpacts = visibleWaterImpacts(
      x0 * SIZE,
      y0 * SIZE,
      (x1 - x0 + 1) * SIZE,
      (y1 - y0 + 1) * SIZE,
      (this.accelerated ? surfaceTick : tick * 2) / 30,
      flow,
      loose
    );
    const pulseKey = ripples
      .map((r) =>
        [
          r.course,
          Math.round(r.x * 24),
          Math.round(r.z * 24),
          Math.round(r.radius * 24),
          Math.round(r.amplitude * 32),
        ].join(',')
      )
      .join('/');
    const bodyKey = loose.map((p) => Math.round(p.x * 24) + ',' + Math.round(p.z * 24)).join('/');
    const frame = [tick, Math.floor(hour * 12), ...rates, pulseKey, bodyKey].join(';');
    if (this.lastTime < 0 || time < this.lastTime) this.currents = rates.map((rate) => rate * time);
    else
      for (let i = 0; i < rates.length; i++)
        this.currents[i] = this.currents[i]! + (time - this.lastTime) * rates[i]!;
    this.lastTime = time;
    this.hasWater = false;
    this.visible.length = 0;
    for (let by = y0; by <= y1; by++)
      for (let bx = x0; bx <= x1; bx++) {
        const key = bx + ',' + by;
        let ch = this.chunks.get(key);
        if (!ch) {
          ch = this.makeChunk(bx, by);
          this.chunks.set(key, ch);
        }
        const x = bx * SIZE + ox,
          y = by * SIZE + oy;
        if (ch.waterPixels.length) {
          this.hasWater = true;
          this.visible.push({ x, y, chunk: ch });
          if (!this.accelerated && ch.lastWaterFrame !== frame)
            this.paintWater(ch, tick, hour, flow, ripples, frame);
        }
        ctx.drawImage(ch.canvas, x, y);
      }
    if (this.hasWater && this.accelerated) {
      try {
        this.gpu!.draw(
          ctx,
          this.visible,
          ox,
          oy,
          surfaceTick,
          hour,
          this.currents,
          [0, flow.main, flow.village, flow.quarry, flow.spring],
          ripples,
          this.waterImpacts,
          pulseKey + ';' + bodyKey
        );
      } catch (e) {
        console.warn('Switching to the Canvas water renderer.', e);
        this.gpu = null;
        for (const { x, y, chunk } of this.visible) {
          this.paintWater(chunk, tick, hour, flow, ripples, frame);
          ctx.drawImage(chunk.canvas, x, y);
        }
      }
    }
    if (this.chunks.size > 96)
      for (const key of this.chunks.keys()) {
        const [bx, by] = key.split(',').map(Number) as [number, number];
        if (bx < x0 - 1 || bx > x1 + 1 || by < y0 - 1 || by > y1 + 1) {
          this.gpu?.release(this.chunks.get(key)!);
          this.chunks.delete(key);
        }
      }
    if (this.samples.size > 250000) this.samples.clear();
    return (x1 - x0 + 1) * (y1 - y0 + 1);
  }
  drawMask(ctx: CanvasRenderingContext2D) {
    if (this.hasWater && this.accelerated) {
      this.gpu!.composite(ctx);
      return;
    }
    for (const { x, y, chunk } of this.visible) ctx.drawImage(chunk.mask, x, y);
  }
  touchesWater(left: number, top: number, right: number, bottom: number) {
    for (const { x, y, chunk } of this.visible) {
      if (right < x || left >= x + SIZE || bottom < y || top >= y + SIZE) continue;
      const startX = Math.max(0, Math.floor((left - x) / BLOCK)),
        endX = Math.min(BLOCKS - 1, Math.floor((right - x) / BLOCK));
      const startY = Math.max(0, Math.floor((top - y) / BLOCK)),
        endY = Math.min(BLOCKS - 1, Math.floor((bottom - y) / BLOCK));
      for (let r = startY; r <= endY; r++)
        for (let c = startX; c <= endX; c++) if (chunk.wetBlocks[r * BLOCKS + c]) return true;
    }
    return false;
  }
}
