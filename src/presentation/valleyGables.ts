import type { BuildingSpec } from '../core/world/layout';
import { hash3, mulc, rgb } from './buildKit';
import type { Region } from './regions';
import type { RoofResult } from './roofs';

/** Pigments and carpentry of Rillford. Roof colours multiply the baked material in linear light. */
interface Finish {
  lime: number;
  boards: number;
  joinery: 'fan' | 'arch';
  roof?: number[];
  cowl?: 'kiln' | 'inn';
}

const innsClay = [0xd09272, 0xc28367, 0xc99a7d, 0xd29c73];
const kilnClay = [0xdbaa7d, 0xdfaa88, 0xc99471, 0xd99b7a];
const firedUmber = [0xaf8e7f, 0xad8072, 0xb09a87, 0xb78069];
const riverReed = [0xc7af79, 0xd1b783, 0xb9a47c, 0xc4ab74];

const finishes: Record<string, Finish> = {
  inn: { lime: 0xd1d5b0, boards: 0x91aaa3, joinery: 'arch', roof: innsClay, cowl: 'inn' },
  bakery: { lime: 0xe7b891, boards: 0xd5ac72, joinery: 'fan', roof: kilnClay, cowl: 'kiln' },
  reeve_house: { lime: 0xe7d6b3, boards: 0xac8473, joinery: 'arch', roof: firedUmber },
  house_a: { lime: 0xdad1aa, boards: 0x91a6ae, joinery: 'fan', roof: riverReed },
  house_b: { lime: 0xe1d0af, boards: 0xc3a381, joinery: 'arch' },
  house_c: { lime: 0xd3d8b3, boards: 0x8fa887, joinery: 'arch' },
  house_d: { lime: 0xdbbd9e, boards: 0xb28e72, joinery: 'fan' },
  house_e: { lime: 0xe1d2ad, boards: 0xc2a278, joinery: 'fan', roof: riverReed },
  house_f: { lime: 0xe1c1a1, boards: 0xad8581, joinery: 'arch' },
  fisher_house: { lime: 0xddd1af, boards: 0x8fa9a3, joinery: 'fan', roof: riverReed },
};
export const valleyFinish = (b: BuildingSpec): Finish | undefined => finishes[b.id];

/** Overlapping boards shed rain beneath the ridge. Outside the roofed-in loft, the tie beam
 * carries either splayed fan braces or shallow arched braces. All dimensions follow the actual pitch. */
export function loftJoinery(R: Region, b: BuildingSpec, roof: RoofResult, base: number, finish: Finish) {
  const half = b.d / 2;
  const slope = Math.tan(roof.pitch);
  const peak = roof.ridgeY - base - 0.11;
  const spring = Math.max(peak * 0.30, peak - (half - 0.12) * slope);
  const halfAt = (y: number) => (peak - y) / slope;
  const rows = Math.max(3, Math.round((peak - spring) / 0.27));
  const oak = mulc(rgb(0xc4b39a), 1.56);
  for (const side of [-1, 1]) {
    // The end wall's face is 12 cm proud of its centreline. The bottom lip overhangs the next board.
    R.ctx.push(side * b.w / 2, base, 0, side * Math.PI / 2);
    for (let row = 0; row < rows; row++) {
      const y = spring + (peak - spring) * row / rows, top = spring + (peak - spring) * (row + 1) / rows;
      const w = halfAt(y), v = halfAt(top);
      const pigment = mulc(rgb(finish.boards), 1.6 + hash3(row, b.x, 41 + side) * 0.18);
      if (row + 1 === rows) R.planks.tri3(-w, y, 0.172, w, y, 0.172, 0, peak, 0.132, pigment, 1, [-w, y, w, y, 0, peak]);
      else R.planks.quad([-w, y, 0.172, w, y, 0.172, v, top, 0.132, -v, top, 0.132], pigment, { uv: [-w, y, w, y, v, top, -v, top] });
      R.planks.quad([-w, y, 0.128, w, y, 0.128, w, y, 0.172, -w, y, 0.172], pigment, { k: 0.85 });
    }
    const span = halfAt(spring);
    R.timber.bx(-span, spring - 0.10, 0.12, span, spring, 0.205, oak, { grain: 'x' });
    for (const s of [-1, 1]) {
      if (finish.joinery === 'fan') {
        R.timber.rod(s * 0.06, spring - 0.02, 0.20, s * span * 0.56, peak - span * 0.56 * slope, 0.20, 0.073, 4, oak, { caps: false });
      } else {
        const knee = s * span * 0.55;
        R.timber.tube([[s * span * 0.84, 0.055, 0.195], [knee, spring * 0.82, 0.195], [s * span * 0.31, spring - 0.015, 0.195]], 0.081, 4, oak);
      }
    }
    R.ctx.pop();
  }
}

/** The baker passes bread through the unglazed lower hatch. The shelf has wall brackets below,
 * a faded canvas shade on two short arms above, and room beside the cooled loaves for serving. */
export function bakersShelf(R: Region, w: number, h: number) {
  const spread = w / 2 + 0.39, shelf = -0.07;
  const oak = mulc(rgb(0xbda98b), 1.5);
  R.planks.bx(-spread, shelf - 0.085, 0.09, spread, shelf, 0.53, oak, { grain: 'x' });
  for (const side of [-1, 1]) {
    const x = side * (spread - 0.22);
    R.timber.bx(x - 0.055, shelf - 0.47, -0.015, x + 0.055, shelf - 0.07, 0.13, oak, { grain: 'y' });
    R.timber.rod(x, shelf - 0.39, 0.10, x, shelf - 0.095, 0.45, 0.055, 4, oak, { caps: false });
  }
  for (const [x, z, r] of [[-0.68, 0.32, 0.16], [-0.27, 0.35, 0.14], [0.12, 0.29, 0.17]] as const) {
    R.vc.lathe([r * 0.75, 0, r, 0.035, r * 0.92, 0.095, r * 0.48, 0.15, 0, 0.153], 9,
      x, shelf, z, (ring) => rgb(ring > 2 ? 0xd5aa6d : 0xa86939));
  }

  const half = spread + 0.23, y = h + 0.32, reach = 0.83, drop = 0.32;
  // Four stitched panels. Each sags between its supports and wraps over the front rail.
  const frontY = (x: number) => y - drop - 0.065 * (1 - (x / half) ** 2);
  for (const end of [-1, 1]) {
    const x = end * (half - 0.055);
    R.timber.rod(x, y, 0.005, x, frontY(x) - 0.027, reach, 0.043, 5, oak);
    R.timber.rod(x, y - 0.47, 0.005, x, frontY(x) + 0.02, reach * 0.76, 0.035, 4, oak, { caps: false });
  }
  R.timber.rod(-half, y, 0.01, half, y, 0.01, 0.042, 5, oak);
  for (let i = 0; i < 4; i++) {
    const a = half * (i / 2 - 1), b = a + half / 2;
    const ay = frontY(a), by = frontY(b);
    const panel = i % 2 ? 0xc3a477 : 0xdbbd8c;
    const sheet = [a, y + 0.044, 0.01, a, ay + 0.018, reach, b, by + 0.018, reach, b, y + 0.044, 0.01];
    R.vc.quad(sheet, panel);
    R.vc.quad(sheet, panel, { flip: true, k: 0.77 });
    R.timber.rod(a, ay - 0.019, reach - 0.004, b, by - 0.019, reach - 0.004, 0.035, 5, oak, { caps: false });
    R.vc.quad([a, ay - 0.075, reach + 0.01, b, by - 0.075, reach + 0.01, b, by + 0.018, reach, a, ay + 0.018, reach], 0xa06f51);
  }
}
