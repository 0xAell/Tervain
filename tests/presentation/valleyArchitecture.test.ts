import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bySpec } from '../../src/core/world/layout';
import type { Terrain } from '../../src/core/world/terrain';
import { buildStandard } from '../../src/presentation/buildings';
import { mulberry32 } from '../../src/core/world/noise';
import { Ctx } from '../../src/presentation/buildKit';
import { wreck } from '../../src/presentation/props';
import { Region } from '../../src/presentation/regions';
import { chimney } from '../../src/presentation/structures';
import { loftJoinery, valleyFinish } from '../../src/presentation/valleyGables';

type V3 = [number, number, number];
function geometryOf(region: Region, key: 'planks' | 'vc' | 'plaster' | 'glass' | 'timber') {
  const geometry = region.get(key).toGeometry()!;
  const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geometry, material);
  return {
    hit: (from: V3, to: V3, far = Infinity) => new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...to), 0, far).intersectObject(mesh)[0],
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

describe('valley architecture', () => {
  it.each(['inn', 'bakery', 'house_c'])('%s shelters both lofts with outward-facing rain boards', (id) => {
    const b = bySpec(id), region = new Region('gable', new Ctx());
    const base = 3.4;
    const roof = { pitch: 0.7, ridgeY: 6.5, halfSpan: 3.6, rise: 3.1, slope: 4.7 };
    loftJoinery(region, b, roof, base, valleyFinish(b)!);
    const boards = geometryOf(region, 'planks');
    try {
      for (const side of [-1, 1]) {
        const at = (y: number) => boards.hit([side * (b.w / 2 + 2), y, 0.15], [-side, 0, 0]);
        for (const height of [4.48, 5.1, 5.87]) {
          const hit = at(height);
          expect(hit).toBeDefined();
          expect(side * hit!.point.x - b.w / 2).toBeGreaterThan(0.12);
          expect(side * hit!.face!.normal.x).toBeGreaterThan(0.95);
        }
        expect(at(base + 0.06)).toBeUndefined();
        expect(at(roof.ridgeY + 0.01)).toBeUndefined();
      }
    } finally { boards.dispose(); }
  });

  it.each(['kiln', 'inn'] as const)('preserves an open cross-draft beneath the %s rain cap', (style) => {
    const r = new Region('flue', new Ctx());
    const top = chimney(r, mulberry32(8), 0, 0, 3, 1.9, 0.75, style);
    const clay = geometryOf(r, 'vc');
    try {
      expect(clay.hit([0.001, top.y + 0.4, 0.001], [0, -1, 0])!.point.y).toBeCloseTo(top.y, 2);
      const gap = top.y - (style === 'kiln' ? 0.12 : 0.17) - 0.065;
      expect(clay.hit([0.55, gap, 0.08], [-1, 0, 0], 1.1)).toBeUndefined();
    } finally { clay.dispose(); }
  });

  it('opens the bakery wall below its glazed transom and supports bread under the shade', () => {
    const b = bySpec('bakery'), region = new Region('bakery', new Ctx());
    region.ctx.push(-b.x, 0, -b.z);
    buildStandard(region, { heightAt: () => 0 } as unknown as Terrain, b, { lanterns: [] });
    const positions = region.glass.p, zs: number[] = [];
    for (let i = 0; i < positions.n; i += 3) {
      if (positions.a[i]! < -b.w / 2 + 0.14) zs.push(positions.a[i + 2]!);
    }
    const centre = (Math.max(...zs) + Math.min(...zs)) / 2;
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(1.35, 3);
    const plaster = geometryOf(region, 'plaster'), glass = geometryOf(region, 'glass');
    const timber = geometryOf(region, 'timber'), planks = geometryOf(region, 'planks'), baked = geometryOf(region, 'vc');
    const wall = -b.w / 2;
    try {
      for (const opening of [plaster, glass, timber, planks]) {
        expect(opening.hit([wall - 1.3, 1.9, centre + 0.22], [1, 0, 0], 1.66)).toBeUndefined();
      }
      expect(glass.hit([wall - 1, 2.47, centre + 0.22], [1, 0, 0], 1.3)).toBeDefined();
      const shelf = planks.hit([wall - 0.34, 2, centre - 0.68], [0, -1, 0])!.point.y;
      const loaf = baked.hit([wall - 0.34, 2, centre - 0.68], [0, -1, 0])!.point.y;
      const shade = baked.hit([wall - 0.34, 3.4, centre - 0.68], [0, -1, 0])!.point.y;
      expect(loaf - shelf).toBeCloseTo(0.153, 2);
      expect(shade).toBeGreaterThan(loaf + 1);
    } finally { for (const m of [plaster, glass, timber, planks, baked]) m.dispose(); }
  });

  it('gives the wreck solid, two-sided planking while leaving the landing-side blade approach open', () => {
    const r = new Region('hull', new Ctx()); wreck(r, mulberry32(5), 0, 0, 0, 0, 9);
    const hull = geometryOf(r, 'planks');
    try {
      expect(hull.hit([-3, 0.53, 0.2], [1, 0, 0], 2.3)).toBeUndefined();
      const outer = hull.hit([3, 0.53, 0.2], [-1, 0, 0]), inner = hull.hit([0, 0.53, 0.2], [1, 0, 0]);
      expect(inner).toBeDefined();
      expect(outer).toBeDefined();
      expect(outer!.point.x - inner!.point.x).toBeCloseTo(0.055, 2);
      expect(outer!.face!.normal.x).toBeGreaterThan(0.6);
      expect(inner!.face!.normal.x).toBeLessThan(-0.6);
    } finally { hull.dispose(); }
  });
});
