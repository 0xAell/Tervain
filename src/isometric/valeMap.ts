import { MAP_MARKER_BOUNDS } from '../core/game/map';
import { fromBuildingLocal } from '../core/world/interiors';
import { WORLD, type V2 } from '../core/world/layout';
import { clamp, fbm, smoothstep } from '../core/world/noise';
import { realmRadius, roadWeight } from '../core/world/terrain';
import type { Atlas } from './atlas';
import { waterProfile } from './channels';
import { crossingPoint, crossings } from './crossing';
import { sites } from './doorways';
import { hegemonyStandards } from './hegemony';
import { scenery } from './land';
import { fieldAt, landMaterial, onQuarry, woodlandCover } from './landCover';
import { terrainHeight } from './relief';
import { onFootpath } from './settlement';
import { isTree } from './treeHabitat';
import { mix, rgba } from './waterPalette';

const spanX = WORLD.maxX - WORLD.minX,
  spanZ = WORLD.maxZ - WORLD.minZ;
export function chartPoint(p: V2, width: number, height: number) {
  return { x: ((p.x - WORLD.minX) / spanX) * width, y: ((p.z - WORLD.minZ) / spanZ) * height };
}
export function chartMarker(x: number, y: number, width: number, height: number) {
  const { minX, maxX, minZ, maxZ } = MAP_MARKER_BOUNDS;
  return {
    x: clamp(WORLD.minX + (x / width) * spanX, minX, maxX),
    z: clamp(WORLD.minZ + (y / height) * spanZ, minZ, maxZ),
  };
}

const palette = {
  grass: rgba(155, 170, 115),
  woodland: rgba(85, 120, 85),
  rock: rgba(161, 151, 125),
  stone: rgba(179, 164, 132),
  sand: rgba(222, 200, 147),
  field: rgba(181, 159, 97),
  sea: rgba(40, 77, 94),
  shoal: rgba(128, 174, 160),
  river: rgba(53, 116, 132),
  shallows: rgba(95, 156, 153),
  trail: rgba(215, 178, 119),
  verge: rgba(126, 98, 69),
  shade: rgba(71, 81, 78),
  light: rgba(239, 220, 167),
};

function terrainInk(x: number, z: number, grain: number) {
  const wet = waterProfile(x, z);
  if (wet && wet.bank > 0) {
    const ocean = wet.course === 'ocean',
      depth = smoothstep(0, ocean ? 10 : wet.halfWidth * 0.8, wet.bank);
    return mix(ocean ? palette.shoal : palette.shallows, ocean ? palette.sea : palette.river, depth * 256);
  }
  const soil = landMaterial(x, z);
  let tone = palette[soil];
  if (soil === 'grass' || (soil === 'rock' && !onQuarry(x, z))) {
    const rim = realmRadius(x, z);
    const exposed = rim < 0.89 ? 0 : smoothstep(0.9, 1.23, rim + fbm(x / 21, z / 22, 2, 167) * 0.04);
    tone = mix(palette.grass, palette.woodland, woodlandCover(x, z) * 224);
    tone = mix(tone, palette.rock, exposed * 256);
  }
  if (soil === 'field') {
    const field = fieldAt(x, z)!;
    const furrow = ((x - field.x) * Math.cos(field.yaw) - (z - field.z) * Math.sin(field.yaw)) / 3;
    tone = mix(tone, palette.verge, furrow - Math.floor(furrow) < 0.26 ? 43 : 9);
  }
  const h = terrainHeight(x, z);
  const light = terrainHeight(x - 2.4, z - 2.4) - terrainHeight(x + 2.4, z + 2.4);
  const contour = h >= 3 && Math.abs(h / 3 - Math.round(h / 3)) < 0.066 ? 0.09 : 0;
  const relief = clamp(light * 0.083 + grain - contour, -0.3, 0.25);
  tone = mix(tone, relief < 0 ? palette.shade : palette.light, Math.abs(relief) * 256);
  const lane = roadWeight(x, z);
  if (lane > 0.12) {
    tone = mix(tone, palette.verge, smoothstep(0.12, 0.44, lane) * 126);
    tone = mix(tone, palette.trail, smoothstep(0.34, 0.76, lane) * 248);
  } else if (onFootpath(x, z)) {
    tone = mix(tone, palette.trail, 158);
  }
  return tone;
}

/** Survey the same ground players cross. Tree marks use the actual accepted tree placements. */
export function paintValeMap(width: number, height: number, atlas: Atlas) {
  const map = document.createElement('canvas');
  map.width = width;
  map.height = height;
  const ctx = map.getContext('2d')!;
  const ink = ctx.createImageData(width, height),
    pixels = new Uint32Array(ink.data.buffer);
  for (let row = 0; row < height; row++) {
    const z = WORLD.minZ + ((row + 0.5) / height) * spanZ;
    for (let col = 0; col < width; col++) {
      const x = WORLD.minX + ((col + 0.5) / width) * spanX,
        grain = ((((col * 73) ^ (row * 151)) & 7) - 3.5) * 0.006;
      pixels[row * width + col] = terrainInk(x, z, grain);
    }
  }
  ctx.putImageData(ink, 0, 0);
  ctx.imageSmoothingEnabled = false;
  for (const s of scenery()) {
    if (!isTree(s.key)) continue;
    const at = chartPoint(s, width, height),
      x = Math.round(at.x),
      y = Math.round(at.y);
    ctx.fillStyle = '#526b52';
    ctx.fillRect(x - 1, y, 3, 2);
    ctx.fillStyle = s.key === 'fir' || s.key === 'pine' ? '#385948' : '#5b7950';
    ctx.fillRect(x, y - 2, 1, 3);
    ctx.fillRect(x - 1, y - 1, 3, 1);
  }
  for (const b of sites) {
    const roof = (x: number, z: number) => chartPoint(fromBuildingLocal(b, x, z), width, height);
    const points = [
      roof(-b.w / 2, -b.d / 2),
      roof(b.w / 2, -b.d / 2),
      roof(b.w / 2, b.d / 2),
      roof(-b.w / 2, b.d / 2),
    ];
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = b.wall === 'stone' ? '#777b73' : '#a17152';
    ctx.strokeStyle = '#655a4a';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    const a = roof(-b.w / 2, 0),
      end = roof(b.w / 2, 0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = b.wall === 'stone' ? '#a9a89b' : '#d7a977';
    ctx.stroke();
  }
  for (const bridge of crossings) {
    const a = chartPoint(crossingPoint(bridge, -bridge.halfLength, 0), width, height),
      b = chartPoint(crossingPoint(bridge, bridge.halfLength, 0), width, height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = '#725a47';
    ctx.lineWidth = 3.8;
    ctx.stroke();
    ctx.strokeStyle = '#e1bd83';
    ctx.lineWidth = 2.25;
    ctx.stroke();
  }
  for (const standard of hegemonyStandards) {
    if (!standard.chart) continue;
    const at = chartPoint(standard, width, height);
    atlas.draw(ctx, 'standard_chart', at.x, at.y, 9);
  }
  return map;
}
