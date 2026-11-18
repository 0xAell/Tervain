import { describe, expect, it } from 'vitest';
import { Ctx } from '../../src/presentation/buildKit';
import { Region } from '../../src/presentation/regions';
import { shoreShingle, strandWrack, wreckRig } from '../../src/presentation/strandWreckage';

describe('Grey Strand wreck and wrack line', () => {
  it('carries a folded sail above the stove-in port opening with an economical rig', () => {
    const rig = new Region('rig', new Ctx());
    wreckRig(rig, 9);
    const cloth = rig.cloth.toGeometry()!, wood = rig.timber.toGeometry()!;
    try {
      const bounds = cloth.boundingBox!;
      expect([...rig.batches.keys()].sort()).toEqual(['cloth', 'timber']);
      expect(rig.tris).toBeLessThan(450);
      expect(bounds.min.x).toBeGreaterThan(.45);
      expect(bounds.max.x - bounds.min.x).toBeGreaterThan(.5);
      expect(bounds.max.z - bounds.min.z).toBeGreaterThan(6);
      expect(bounds.max.y - bounds.min.y).toBeGreaterThan(2.6);
      expect(wood.boundingBox!.max.y).toBeGreaterThan(5.2);
      expect(wood.boundingBox!.max.y).toBeGreaterThan(bounds.max.y);
    } finally { cloth.dispose(); wood.dispose(); }
  });

  it('seats the low flanks of a shale flake in damp sand while its dry counterpart is lighter', () => {
    const ground = (x: number, z: number) => .11 * x - .075 * z;
    const stone = { x: -261, z: 24, size: .22, shape: 4, yaw: -.66, zScale: 1.12, decorationRank: .77 };
    const build = (distance: number) => {
      const r = new Region('shingle', new Ctx());
      shoreShingle(r, stone, distance, ground);
      expect([...r.batches.keys()]).toEqual(['vc']);
      expect(r.tris).toBe(21);
      return r.vc.toGeometry()!;
    };
    const wet = build(1), dry = build(9);
    try {
      const pos = wet.getAttribute('position');
      const relative = Array.from({ length: pos.count }, (_, i) => pos.getY(i) - ground(pos.getX(i), pos.getZ(i)));
      expect(Math.min(...relative)).toBeLessThan(0);
      expect(Math.max(...relative)).toBeGreaterThan(.01);
      expect(Math.max(...relative)).toBeLessThan(stone.size * .4);
      expect(wet.getAttribute('color').getX(0)).toBeLessThan(dry.getAttribute('color').getX(0) * .8);
      expect(wet.getAttribute('position').array).toEqual(dry.getAttribute('position').array);
    } finally { wet.dispose(); dry.dispose(); }
  });

  it('folds the windrows over the actual ground with upward faces in one vertex-colour batch', () => {
    const ground = (x: number, z: number) => .06 * x + .027 * z + .02 * Math.sin(x * .6);
    const wrack = new Region('wrack', new Ctx());
    strandWrack(wrack, ground);
    expect([...wrack.batches.keys()]).toEqual(['vc']);
    expect(wrack.tris).toBeLessThan(1500);
    const shape = wrack.vc.toGeometry()!;
    try {
      const position = shape.getAttribute('position'), normals = shape.getAttribute('normal');
      let lowest = Infinity, highest = -Infinity, lowestNormal = Infinity;
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i) - ground(position.getX(i), position.getZ(i));
        lowest = Math.min(lowest, y);
        highest = Math.max(highest, y);
        lowestNormal = Math.min(lowestNormal, normals.getY(i));
      }
      expect(lowest).toBeGreaterThan(.005);
      expect(highest).toBeLessThan(.09);
      expect(highest - lowest).toBeGreaterThan(.03);
      expect(lowestNormal).toBeGreaterThan(0);
    } finally { shape.dispose(); }
  });
});
