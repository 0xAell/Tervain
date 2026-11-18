// The fir's swept whorls and the three coastal palms are modelled by their branching habit.
import { Form, TAU } from './kit.mjs';
const v = (a, r, y, offset = 0) => [r * Math.cos(a) - offset * Math.sin(a), y, r * Math.sin(a) + offset * Math.cos(a)];
const add = (a, b) => a.map((x, i) => x + b[i]);
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const leafTint = ['#d5e1b6', '#c6d7af', '#e3e6c2', '#b8ceae'];
// A lightly folded and tapering blade. The ridge and margins have different normals.
function blade(leaf, start, mid, end, width, angle, tint, cell, grid) {
  const side = (point, w, dip) => add(point, v(angle + Math.PI / 2, w, -dip));
  const points = [
    side(start, -width * 0.11, 0),
    start,
    side(start, width * 0.11, 0),
    side(mid, -width, width * 0.19),
    mid,
    side(mid, width, width * 0.18),
    side(end, -width * 0.03, 0),
    end,
    side(end, width * 0.03, 0),
  ];
  const uv = [];
  for (const u of [0.015, 0.49, 0.985])
    for (const w of [0.015, 0.5, 0.985]) uv.push([((cell % grid) + u) / grid, (Math.floor(cell / grid) + w) / grid]);
  leaf.surface(points, [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4, 3, 4, 6, 4, 7, 6, 4, 5, 7, 5, 8, 7], tint, uv);
}
export function makeConifer(shore, level) {
  const wood = new Form(),
    leaf = new Form(),
    name = shore ? 'shore-pine' : 'silver-fir';
  const sides = [9, 7, 5][level],
    tiers = [10, 7, 5][level],
    boughs = [8, 6, 5][level],
    height = shore ? 13 : 17;
  const trunk = (t) => [shore ? 1.04 * t * t : 0.19 * Math.sin(5 * t) * t, height * t, shore ? -0.34 * t * t : 0.12 * t * t];
  const bark = shore ? '#936947' : '#81705b',
    grid = shore ? 2 : 8;
  for (let j = 0; j < 7; j++)
    wood.beam(trunk(j / 7), trunk((j + 1) / 7), 0.34 * (1 - j / 7) + 0.022, 0.34 * (1 - (j + 1) / 7) + 0.022, bark, sides);
  const crownStart = shore ? 0.27 : 0.18;
  for (let j = 0; j < tiers; j++) {
    const t = j / tiers,
      h = crownStart + (1 - crownStart) * t,
      base = trunk(h),
      radius = (shore ? 3.7 : 3.1) * Math.pow(1 - t, shore ? 0.49 : 0.72);
    for (let k = 0; k < boughs; k++) {
      const a = (TAU * k) / boughs + j * 2.39996 + 0.15 * Math.sin(7 * j + 2 * k),
        r = radius * (0.87 + 0.13 * Math.cos(k * 4 + j));
      const root = base,
        mid = add(base, v(a, r * 0.55, -0.17 * r)),
        tip = add(base, v(a, r, shore ? 0.18 * r : -0.05 * r));
      wood.beam(root, mid, 0.075 * (1 - t) + 0.02, 0.031 * (1 - t) + 0.012, bark, level === 0 ? 5 : 4);
      wood.beam(mid, tip, 0.032 * (1 - t) + 0.012, 0.009, bark, 4);
      const steps = [4, 3, 2][level];
      for (let m = 0; m < steps; m++) {
        const f = (m + 0.15) / steps,
          at = f < 0.55 ? mix(root, mid, f / 0.55) : mix(mid, tip, (f - 0.55) / 0.45);
        for (const s of [-1, 1]) {
          const ang = a + s * (0.93 - 0.23 * f),
            len = r * (0.63 - 0.28 * f) * (1 + 0.06 * Math.sin(m + j + k)),
            lift = shore ? 0.2 : -0.12;
          const bend = add(at, v(ang, len * 0.55, len * lift)),
            end = add(at, v(ang + s * 0.12, len, 0.12 * len));
          blade(
            leaf,
            at,
            bend,
            end,
            len * (level === 2 ? 0.55 : 0.34),
            ang,
            leafTint[(j + k + m) % 4],
            (j * 7 + k * 5 + m) % grid ** 2,
            grid,
          );
        }
      }
    }
  }
  blade(leaf, trunk(0.91), add(trunk(0.96), [0.03, 0, 0]), add(trunk(1), [0, 0.25, 0]), 0.23, 0.2, leafTint[0], 0, grid);
  return { name, wood, leaf };
}
export function makePalm(name, level) {
  const wood = new Form(),
    leaf = new Form(),
    fan = name === 'fan-palm',
    lean = name === 'wind-palm';
  const baseColor = '#9d7f59',
    trunk = (t) => [lean ? 2.4 * t * t : 0.32 * t * t, 8 * t, (lean ? 0.61 : 0.15) * t * t - 0.24 * Math.sin(t * 4)];
  const count = [13, 10, 8][level],
    seg = [13, 9, 6][level];
  for (let j = 0; j < seg; j++) {
    const t = j / seg,
      r = 0.28 - 0.12 * t + 0.055 * (1 - t) ** 8;
    wood.beam(trunk(t), trunk((j + 1) / seg), r + 0.022, r - 0.012, j % 3 === 1 ? '#80684f' : baseColor, [9, 7, 6][level]);
  }
  const crown = trunk(1),
    greens = ['#748958', '#808d54', '#5b7952', '#97a261', '#67845d'];
  for (let k = 0; k < count; k++) {
    const a = k * 2.39996,
      layer = k % 3,
      len = fan ? 2.85 : 3.3 + 0.32 * Math.sin(k * 4),
      high = 1.45 + 0.37 * layer,
      droop = layer === 0 ? 1.1 : 0.48;
    const arc = (t) => add(crown, v(a, len * t, Math.sin(t * Math.PI) * high - droop * t));
    const steps = [11, 7, 5][level];
    for (let j = 0; j < steps; j++) {
      const endOfRib = fan ? 0.61 : 1;
      const t = (j / steps) * endOfRib,
        n = ((j + 1) / steps) * endOfRib,
        at = arc(t),
        end = arc(n);
      wood.beam(at, end, 0.041 * (1 - t) + 0.008, 0.041 * (1 - n) + 0.007, '#a19963', 4);
      if (!fan)
        for (const s of [-1, 1]) {
          const angle = a + s * (1.15 - 0.75 * t),
            span = (1.02 * Math.sin(Math.PI * (0.06 + t) * 0.88) + 0.14) * (1 - 0.35 * t);
          const bend = add(at, v(angle, span * 0.54, -0.08)),
            point = add(at, v(angle, span, -0.22 - 0.17 * t));
          blade(leaf, at, bend, point, span * (level === 0 ? 0.17 : 0.26), angle, greens[(j + k) % 5], 0, 1);
        }
    }
    if (fan) {
      const base = arc(0.61),
        ribs = [15, 11, 7][level];
      for (let j = 0; j < ribs; j++) {
        const s = (2 * j) / (ribs - 1) - 1,
          direction = a + s * 1.1,
          length = 1.22 * (1 - 0.2 * Math.abs(s)),
          mid = add(base, v(direction, length * 0.57, 0.42)),
          end = add(base, v(direction, length, 0.22 - 0.18 * Math.abs(s)));
        blade(leaf, base, mid, end, length * Math.sin(1.25 / ribs) * 1.45, direction, greens[(k + j) % 5], 0, 1);
      }
    }
    if (!fan && k % 3 === 0)
      for (let j = 0; j < 3; j++)
        wood.oval(add(crown, v(a + 0.3 * j, 0.24, -0.32 - 0.07 * j)), [0.095, 0.14, 0.095], '#977145', undefined, 6);
  }
  return { name, wood, leaf };
}
// Schist in bedding planes: tilted caps, staggered shoulders and low chips around a central block.
export function schist() {
  const stone = new Form(),
    colours = ['#7d7f79', '#777f81', '#93958f', '#777873', '#8a8a80', '#687175'];
  const rocks = [
    [0, 0, 0.65, 0.58, 0.78, 0.23],
    [-0.55, -0.12, 0.43, 0.36, 0.4, 1.3],
    [0.49, 0.05, 0.4, 0.39, 0.53, 0.7],
    [-0.07, 0.45, 0.48, 0.33, 0.36, 2.3],
    [0.14, -0.49, 0.44, 0.35, 0.38, 0.0],
    [-0.57, 0.32, 0.24, 0.22, 0.2, 0.4],
    [0.55, -0.39, 0.3, 0.22, 0.21, 1.1],
    [0.51, 0.38, 0.21, 0.17, 0.15, 2],
  ];
  rocks.forEach(([x, z, rx, rz, h, twist], b) => {
    const n = 7 + (b % 3),
      rings = [],
      point = (j, y, r) => {
        const a = (TAU * j) / n + twist,
          irregular = 1 + 0.11 * Math.sin(j * 5.37 + b * 1.9),
          sx = r * rx * Math.cos(a) * irregular,
          sz = r * rz * Math.sin(a) * irregular;
        return [x + sx + 0.12 * y, y + 0.1 * sx - 0.075 * sz, z + sz - 0.08 * y];
      };
    for (const [y, r] of [
      [0, 0.78],
      [h * 0.2, 1],
      [h * 0.57, 0.96],
      [h * 0.69, 0.83],
      [h * 0.93, 0.63],
      [h, 0.4],
    ])
      rings.push(Array.from({ length: n }, (_, j) => point(j, y, r)));
    for (let i = 0; i < rings.length - 1; i++)
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        stone.surface(
          [rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]],
          [0, 1, 2, 0, 2, 3],
          i === 2 ? '#999789' : colours[(b + j + (i % 2)) % colours.length],
        );
      }
    const cap = [...rings.at(-1), [x + 0.085, h * 1.02, z - 0.06]];
    stone.surface(cap, Array.from({ length: n }, (_, j) => [n, (j + 1) % n, j]).flat(), colours[(b + 2) % 6]);
    const bottom = rings[0];
    stone.surface(bottom, Array.from({ length: n - 2 }, (_, j) => [0, j + 1, j + 2]).flat(), colours[b % 6]);
  });
  let reach = 0;
  for (let i = 0; i < stone.pos.length; i += 3) reach = Math.max(reach, Math.hypot(stone.pos[i], stone.pos[i + 2]));
  for (let i = 0; i < stone.pos.length; i++) stone.pos[i] *= 1.0186 / reach;
  return stone;
}
