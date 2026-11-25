import { DECKS, ROADS, type V2, type DeckSpec } from '../core/world/layout';
import { waterProfile } from './channels';

import { risePixels } from './projection';
export { risePixels } from './projection';
export interface Crossing extends V2 {
  tx: number;
  tz: number;
  halfLength: number;
  halfWidth: number;
  rise: number;
  /** Timber bents stand just inside the opposing banks. */
  sills: [number, number];
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function fitCrossing(deck: DeckSpec): Crossing {
  // Survey the road on both sides of its bend. Both abutments must reach dry ground at high flow.
  let closest = Infinity,
    route = ROADS[0]!.points,
    station = 0;
  for (const road of ROADS) {
    let travelled = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!,
        b = road.points[i]!,
        dx = b.x - a.x,
        dz = b.z - a.z;
      const len = Math.hypot(dx, dz),
        d = clamp(((deck.x - a.x) * dx + (deck.z - a.z) * dz) / len, 0, len);
      const dist = Math.hypot(a.x + (dx * d) / len - deck.x, a.z + (dz * d) / len - deck.z);
      if (dist < closest) {
        closest = dist;
        station = travelled + d;
        route = road.points;
      }
      travelled += len;
    }
  }
  function onRoad(offset: number) {
    let left = Math.max(0, station + offset);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!,
        b = route[i]!,
        length = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= length)
        return { x: a.x + ((b.x - a.x) * left) / length, z: a.z + ((b.z - a.z) * left) / length };
      left -= length;
    }
    return route[route.length - 1]!;
  }
  function bankStation(sign: number) {
    for (let d = 0.2; d < deck.hx * 3; d += 0.2) {
      const p = onRoad(d * sign);
      if ((waterProfile(p.x, p.z)?.bank ?? -2) < -0.35) return d;
    }
    return deck.hx;
  }
  const west = bankStation(-1),
    east = bankStation(1);
  const a = onRoad(-west - 1.8),
    b = onRoad(east + 1.8);
  const len = Math.hypot(b.x - a.x, b.z - a.z),
    hx = len / 2;
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    tx: (b.x - a.x) / len,
    tz: (b.z - a.z) / len,
    halfLength: hx,
    halfWidth: deck.hz + 0.2,
    rise: deck.y + 1.0,
    sills: [-hx + 2.75, hx - 2.75],
  };
}
export const crossings = DECKS.map(fitCrossing);
export function crossingPoint(b: Crossing, s: number, t: number): V2 {
  return { x: b.x + b.tx * s - b.tz * t, z: b.z + b.tz * s + b.tx * t };
}
export function crossingLocal(b: Crossing, x: number, z: number) {
  const dx = x - b.x,
    dz = z - b.z;
  return { s: dx * b.tx + dz * b.tz, t: -dx * b.tz + dz * b.tx };
}
export function deckHeight(b: Crossing, s: number) {
  const ramp = clamp((b.halfLength - Math.abs(s)) / 2.75, 0, 1);
  return b.rise * ramp * (2 - ramp) + 0.12 * (1 - (s / b.halfLength) ** 2);
}
export function deckAt(p: V2) {
  for (const b of crossings) {
    if (Math.abs(p.x - b.x) + Math.abs(p.z - b.z) > 2 * (b.halfLength + b.halfWidth)) continue;
    const { s, t } = crossingLocal(b, p.x, p.z);
    if (Math.abs(s) <= b.halfLength && Math.abs(t) <= b.halfWidth) return { b, s, t };
  }
}
/** Intersect an isometric picking ray with the arched deck before the river below it. */
export function pickDeck(ground: V2, projection: number): V2 {
  for (const b of crossings) {
    if (Math.abs(ground.x - b.x) + Math.abs(ground.z - b.z) > 2 * (b.halfLength + b.halfWidth + 3)) continue;
    let lo = 0,
      hi = b.rise + 0.12;
    for (let i = 0; i < 15; i++) {
      const h = (lo + hi) / 2,
        d = (h * risePixels) / projection;
      const { s } = crossingLocal(b, ground.x + d, ground.z + d);
      if (deckHeight(b, clamp(s, -b.halfLength, b.halfLength)) > h) lo = h;
      else hi = h;
    }
    const d = (lo * risePixels) / projection,
      hit = { x: ground.x + d, z: ground.z + d };
    if (deckAt(hit)) return hit;
  }
  return ground;
}
export const onBridge = (p: V2) => !!deckAt(p);
export function passesRails(from: V2, to: V2) {
  for (const b of crossings) {
    if (Math.abs(to.x - b.x) + Math.abs(to.z - b.z) > 2 * (b.halfLength + b.halfWidth)) continue;
    const a = crossingLocal(b, from.x, from.z),
      c = crossingLocal(b, to.x, to.z);
    for (const edge of [-b.halfWidth, b.halfWidth]) {
      if (Math.min(a.t, c.t) >= edge || Math.max(a.t, c.t) < edge) continue;
      const s = a.s + ((c.s - a.s) * (edge - a.t)) / (c.t - a.t);
      if (Math.abs(s) < b.halfLength - 0.62) return false;
    }
  }
  return true;
}
export function bridgeShade(x: number, z: number) {
  for (const b of crossings) {
    if (Math.abs(x - b.x) + Math.abs(z - b.z) > 2 * (b.halfLength + b.halfWidth)) continue;
    const { s, t } = crossingLocal(b, x - 0.55, z - 0.45);
    const penumbra = clamp((b.halfWidth + 1.15 - Math.abs(t)) / 0.96, 0, 1);
    const end = clamp(b.halfLength + 0.5 - Math.abs(s), 0, 1);
    return penumbra * end * (0.86 + 0.1 * Math.cos(s * 12));
  }
  return 0;
}
