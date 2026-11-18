import { mulberry32, smoothstep, valueNoise } from '../core/world/noise';
import type { ScatterRock } from '../core/world/scatter';
import { mulc, rgb } from './buildKit';
import type { Region } from './regions';

type Point = [number, number, number];

const SHINGLE_COLOURS = [0x817662, 0xa4a098, 0x75716a, 0x695d50, 0xb1a38b, 0x787c73];

/** The lighter's fractured mast still carries its tanbark-dressed lug sail.
 * The rig lists to starboard, leaving the broken port frames open. */
export function wreckRig(region: Region, length: number) {
  const wood = region.timber;
  const saltOak = mulc(rgb(0xcbbbab), 1.85);
  const darkOak = mulc(rgb(0x988171), 1.6);
  const mast: Point[] = [[0.26, -0.35, -1], [0.46, 1.06, -1.1], [0.79, 3.22, -1.36], [1.04, 4.92, -1.64]];
  wood.tube(mast, t => 0.19 - 0.09 * t, 7, saltOak);
  wood.rod(1.01, 4.78, -1.60, 1.08, 5.35, -1.66, 0.07, 4, 0xc9a77b, { rEnd: 0.011 });
  wood.rod(.98, 4.78, -1.59, .95, 5.05, -1.64, 0.055, 4, saltOak, { rEnd: 0.009 });
  // The yard crosses the mast under the halyard. Its ends overhang the sewn panels.
  const yard = (u: number): Point => [0.83 + .14 * u, 3.12 + 1.58 * u, length * (-.43 + .76 * u)];
  wood.rod(...yard(-.035), ...yard(1.055), .084, 6, darkOak, { rEnd: .06 });
  wood.tube([[1.02, 4.82, -1.62], [.88, 4.14, -1.57], yard(.34)], .018, 4, saltOak);
  wood.tube([[1.02, 4.82, -1.62], [.78, 2.70, .81], [0, 1.72, length * .51]], .022, 4, darkOak);
  wood.tube([[1.02, 4.82, -1.62], [1.17, 2.50, -2.70], [.66, .7, -length * .40]], .022, 4, darkOak);

  // Uneven surviving lengths of cloth form the torn foot. The unsupported fabric
  // sags away from the yard, with broad folds and a pale replacement panel.
  const drops = [.22, .88, 1.48, 1.35, .48, 1.72, 2.08, 1.75, 2.16, 2.48, 2.34, 2.70, 2.79];
  const panelColour = [0xc87b61, 0xde9474, 0xffe3b8, 0xcf886b, 0xba6f55, 0xe5a98a];
  const cloth = region.cloth;
  const surface = (i: number, v: number, rightEdge = false): Point => {
    const u = i / (drops.length - 1);
    const [x, y, z] = yard(u);
    const fold = Math.sin(u * Math.PI * 5.4) * .16 + Math.sin(u * Math.PI * 2.3) * .23;
    // Where the stitching failed, one lip twists forward and the other curls back.
    // The top third is still sewn shut and carries both panels on the same yard.
    const rip = (i === 3 || i === 9) ? Math.max(0, v - 1 / 3) * (rightEdge ? -.40 : .44) : 0;
    return [x + .035 + v * (fold + .28) + .26 * Math.sin(v * Math.PI) + rip * .7,
      y - .075 - drops[i]! * v + Math.abs(rip) * .4,
      z + (.31 - u * .45) * v + rip];
  };
  for (let i = 0; i < drops.length - 1; i++) {
    const colour = mulc(rgb(panelColour[Math.floor(i / 2)]!), 2.25);
    for (let j = 0; j < 3; j++) {
      const v0 = j / 3, v1 = (j + 1) / 3;
      const a = surface(i, v0), b = surface(i, v1), c = surface(i + 1, v1, true), d = surface(i + 1, v0, true);
      cloth.quad([...a, ...b, ...c, ...d], colour, { uv: [a[2], a[1], b[2], b[1], c[2], c[1], d[2], d[1]], amp: .045 });
    }
  }
  const clew = surface(drops.length - 1, 1);
  wood.tube([clew, [.86, 1.17, length * .39], [0, 1.51, length * .50]], .019, 4, saltOak);
}

/** Surf-worn shale flakes, ironstone and pale rounded quartz, resting partly in the sand.
 * These little pieces have no standing surface. The larger rock meshes keep their exact contacts. */
export function shoreShingle(region: Region, rock: Pick<ScatterRock, 'x' | 'z' | 'size' | 'shape' | 'decorationRank' | 'yaw' | 'zScale'>,
  shoreDistance: number, ground: (x: number, z: number) => number) {
  const { x, z, size, shape, decorationRank: rank, yaw } = rock;
  // Swash sorts the pebbles into pockets. Fine, nearly buried grit fills the gaps.
  const pocket = smoothstep(.31, .69, valueNoise(x * .19, z * .16, 37));
  const length = size * (.32 + pocket * (.30 + rank * .51));
  const width = length * (.38 + .4 * rock.zScale * rank);
  const height = length * (.20 + (shape % 3) * .09);
  const wet = 1 - smoothstep(.2, 6.6, shoreDistance);
  const colour = mulc(rgb(SHINGLE_COLOURS[shape]!), (.85 + rank * .25) * (1 - .42 * wet));
  const skew = Math.sin(x * 7.07 + z * 3.91) * 2, count = 7;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const point = (lx: number, lz: number, h: number): Point => {
    const px = x + cos * lx - sin * lz, pz = z + sin * lx + cos * lz;
    return [px, ground(px, pz) + h, pz];
  };
  const top = point(length * .11, -width * .16, height);
  const rim: Point[] = [], foot: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count, r = .80 + .20 * Math.sin(shape * 1.8 + i * 5.3 + skew);
    const lx = Math.cos(a) * length * r, lz = Math.sin(a) * width * r;
    rim.push(point(lx, lz, height * (.42 + .18 * Math.sin(a + skew))));
    foot.push(point(lx * 1.07, lz * 1.07, -.012));
  }
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    region.vc.tri3(...top, ...rim[j]!, ...rim[i]!, colour, .99 + .025 * (i % 3));
    region.vc.quad([...rim[i]!, ...rim[j]!, ...foot[j]!, ...foot[i]!], colour, { k: .94, amp: 0 });
  }
}

/** A heavy frond folds about its midrib; its split tip twists into two tapered lobes. */
export function wrackFrond(region: Region, ground: (x: number, z: number) => number, x: number, z: number,
  angle: number, length: number, width: number, bend: number, fold: number, tone: number) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const sample = (t: number, across: number, lobe: number): Point => {
    const curve = Math.sin(t * Math.PI);
    const tip = Math.max(0, t - .5) * 2;
    const twist = Math.sin(t * Math.PI * 1.5 + bend * 3);
    const side = bend * length * (1 - Math.cos(t * Math.PI)) * .5
      + across * width * (.035 + .965 * curve) + lobe * tip * tip * width * 1.3;
    const along = length * t * (1 - (lobe < 0 ? .12 * tip : 0));
    const px = x + dx * along - dz * side, pz = z + dz * along + dx * side;
    const crest = fold * curve * (.54 + .45 * twist * across + .34 * (1 - Math.abs(across)));
    return [px, ground(px, pz) + .011 + crest, pz];
  };
  for (let s = 0; s < 4; s++) for (const edge of [-1, 0]) {
    const lobe = edge === -1 ? -1 : 1;
    const a = sample(s / 4, edge, lobe), b = sample(s / 4, edge + 1, lobe);
    const c = sample((s + 1) / 4, edge + 1, lobe), d = sample((s + 1) / 4, edge, lobe);
    region.vc.quad([...a, ...b, ...c, ...d], tone, { k: edge === -1 ? 1 : .83, amp: 0 });
  }
}

/** Short storm windrows left on the upper strand. Both the folded kelp and the
 * fluted cockle valves use the coast's vertex-colour batch and follow the sand
 * at each vertex. They sit below the player's step and have no collision. */
export function strandWrack(region: Region, heightAt: (x: number, z: number) => number) {
  const batch = region.vc;
  const rng = mulberry32(18649);
  // Unequal pockets either side of the footpath, including pieces nearer the wreck.
  const banks = [[-265, 20, 3.8], [-264, 35, 3], [-268, 14, 2.4], [-270, 2, 3], [-271, -14, 2.5]] as const;
  for (const [cx, cz, span] of banks) {
    for (let clump = 0; clump < 4; clump++) {
      const x = cx + (rng() - .5) * 1.0, z = cz + (rng() - .5) * span;
      for (let blade = 0; blade < 3; blade++) {
        const angle = rng() * Math.PI * 2, length = .24 + rng() * .57;
        wrackFrond(region, heightAt, x, z, angle, length, length * (.075 + rng() * .035),
          (rng() - .5) * .88, .033 + rng() * .048, blade % 2 ? 0x726955 : 0x8a8066);
      }
      for (let shell = 0; shell < 3; shell++) {
        const sx = x + (rng() - .5) * 1.8, sz = z + (rng() - .5) * 1.8;
        const size = .044 + rng() * .06, yaw = rng() * Math.PI * 2;
        const hinge: Point = [sx, heightAt(sx, sz) + .022, sz];
        const rim = (ray: number): Point => {
          const a = yaw + (ray / 8 - .5) * 2.45;
          const r = size * (.67 + .33 * Math.sin(ray / 8 * Math.PI));
          const px = sx + Math.cos(a) * r, pz = sz + Math.sin(a) * r;
          return [px, heightAt(px, pz) + .009 + (ray % 2) * .012, pz];
        };
        for (let i = 0; i < 8; i++) batch.tri3(...hinge, ...rim(i + 1), ...rim(i), shell === 1 ? 0xa99f90 : 0xc9bfa3, i % 2 ? .83 : 1);
      }
    }
  }
}
