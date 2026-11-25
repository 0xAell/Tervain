import { BUILDINGS, type V2 } from '../core/world/layout';
import { roadWeight } from '../core/world/terrain';
import { toBuildingLocal } from '../core/world/interiors';
import { channelLength, channelPoint, waterProfile, wetPoint, type Flow } from './channels';
import { crossings, crossingLocal } from './crossing';

export interface BankPlant extends V2 {
  key: string;
  width: number;
  flip: boolean;
  phase: number;
}
export interface HabitatPatch {
  course: keyof Flow;
  s: number;
  side: number;
  seed: number;
}
export const bankPlants: BankPlant[] = [];
export const gravelRocks: (V2 & { width: number })[] = [];
export const habitats: HabitatPatch[] = [];
export const noise01 = (s: number) => {
  const n = Math.sin(s * 127.17 + 15.31) * 43758.5453;
  return n - Math.floor(n);
};
const shadeBins = new Map<number, BankPlant[]>();
const bin = (x: number, z: number) => (Math.floor(x / 8) + 512) * 1024 + Math.floor(z / 8) + 512;
function atBank(course: keyof Flow, s: number, sign: number) {
  const mid = channelPoint(course, s);
  let lo = 0,
    hi = mid.width * 1.5 + 1;
  for (let i = 0; i < 9; i++) {
    const m = (lo + hi) / 2,
      p = channelPoint(course, s, m * sign);
    if (wetPoint(p.x, p.z)) lo = m;
    else hi = m;
  }
  return lo * sign;
}
function space(p: V2, r: number, allowWet: boolean) {
  if (roadWeight(p.x, p.z) > 0.13 || (!allowWet && wetPoint(p.x, p.z))) return false;
  for (const b of crossings) {
    const q = crossingLocal(b, p.x, p.z);
    if (Math.abs(q.s) < b.halfLength + r && Math.abs(q.t) < b.halfWidth + r + 0.35) return false;
  }
  return !BUILDINGS.some((b) => {
    if (Math.abs(p.x - b.x) + Math.abs(p.z - b.z) > b.w + b.d + r * 2 + 2) return false;
    const l = toBuildingLocal(b, p.x, p.z);
    return Math.abs(l.x) < b.w / 2 + r && l.z > -b.d / 2 - r && l.z < b.d / 2 + r + 1.25;
  });
}
function plant(k: string, p: V2, width: number, seed: number, water = false) {
  const willow = k === 'rill_willow' || k === 'rill_alder';
  if (!space(p, willow ? 2.4 : 0.42, water)) return;
  if (
    willow &&
    bankPlants.some(
      (b) => (b.key === 'rill_alder' || b.key === 'rill_willow') && Math.hypot(p.x - b.x, p.z - b.z) < 13
    )
  )
    return;
  const prop = { ...p, key: k, width, flip: noise01(seed + 1) > 0.5, phase: seed };
  bankPlants.push(prop);
  if (willow)
    for (let x = Math.floor((p.x - 8) / 8) * 8; x <= p.x + 8; x += 8)
      for (let z = Math.floor((p.z - 8) / 8) * 8; z <= p.z + 8; z += 8) {
        const key = bin(x, z),
          list = shadeBins.get(key) ?? [];
        list.push(prop);
        shadeBins.set(key, list);
      }
}
function placeRock(course: keyof Flow, s: number, offset: number, w: number) {
  const p = channelPoint(course, s, offset),
    wet = waterProfile(p.x, p.z);
  if (
    !wet ||
    wet.bank < -0.9 ||
    !space(p, 0.65, true) ||
    gravelRocks.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < 1.4)
  )
    return;
  gravelRocks.push({ x: p.x, z: p.z, width: w });
}
for (const [idx, course] of (['main', 'village', 'quarry', 'spring'] as const).entries()) {
  const length = channelLength(course);
  for (let j = 0, s = 3; s < length - 2; j++, s += 2.15 + noise01(j + idx * 332) * 1.75) {
    const seed = j + idx * 381,
      sign = noise01(seed + 0.6) > 0.48 ? 1 : -1,
      bank = atBank(course, s, sign);
    const zone = 0.5 + 0.5 * Math.sin(s * 0.16 + idx * 2.7),
      chance = noise01(seed + 2.1);
    const pos = (distance: number, along = 0) => channelPoint(course, s + along, bank + sign * distance);
    if (chance < 0.61 + zone * 0.23) {
      plant('rill_sedge', pos(0.32 + noise01(seed + 0.1) * 1.3), 9 + noise01(seed + 0.7) * 11, seed);
      if (zone > 0.48)
        plant(
          noise01(seed + 2.4) > 0.58 ? 'rill_iris' : 'rill_fern',
          pos(0.25 + noise01(seed + 0.3), 1.25),
          14 + noise01(seed + 0.8) * 10,
          seed + 2
        );
      if (zone > 0.62 && j % 3 === 0)
        plant('rill_spirea', pos(1.9 + noise01(seed + 5), -0.85), 15 + noise01(seed + 8) * 11, seed + 4);
    }
    if (j % 7 === 3 && course !== 'spring')
      plant(
        noise01(seed + 3) > 0.45 ? 'rill_willow' : 'rill_alder',
        pos(2.35 + noise01(seed) * 1.3),
        56 + noise01(seed + 8) * 28,
        seed
      );
    if (j % 4 === 1 && course !== 'spring') {
      const pad = pos(-0.85 - noise01(seed + 6) * 0.65);
      if (wetPoint(pad.x, pad.z)?.course === course)
        plant('rill_lilies', pad, 14 + noise01(seed + 0.12) * 12, seed, true);
    }
    if (j % 4 === 0 || (zone < 0.28 && chance > 0.53))
      placeRock(
        course,
        s,
        bank - sign * (0.5 + noise01(seed + 6) * Math.min(2.6, Math.abs(bank) * 0.58)),
        16 + noise01(seed + 0.25) * 21
      );
    if (j % 5 === 2 && course !== 'spring') habitats.push({ course, s, side: sign, seed });
  }
}
// A broad, open pool at the footbridge is bracketed by willow, flowering banks and reading stones.
for (const bridge of crossings) {
  const wet = wetPoint(bridge.x, bridge.z);
  if (!wet || wet.course === 'ocean') continue;
  const c = wet.course,
    s = wet.along;
  for (const [along, sign] of [
    [-10, 1],
    [10, -1],
    [-5, -1],
    [5, 1],
  ] as const) {
    const d = atBank(c, s + along, sign);
    plant('rill_iris', channelPoint(c, s + along, d + sign * 0.5), 22, s + along);
    placeRock(c, s + along, d - sign * 1.05, along < 0 ? 29 : 23);
    if (along === -10 || along === 10)
      plant('rill_willow', channelPoint(c, s + along, d + sign * 2.5), 78, s + along);
  }
  habitats.push({ course: c, s: s + 5, side: -1, seed: 70.6 }, { course: c, s: s - 9, side: 1, seed: 90.9 });
}
export function canopyShade(x: number, z: number) {
  let shade = 0;
  for (const tree of shadeBins.get(bin(x, z)) ?? []) {
    const dx = (x - tree.x - 1.3) / (tree.width / 17),
      dz = (z - tree.z - 0.8) / (tree.width / 22);
    const d = dx * dx + dz * dz;
    if (d < 1.45)
      shade = Math.max(
        shade,
        Math.max(0, Math.min(1, (1.34 - d) * 1.45)) * (0.44 + 0.13 * Math.sin(x * 3 - z) * Math.cos(z * 2.3))
      );
  }
  return shade;
}
