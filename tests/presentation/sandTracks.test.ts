import { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { SandTracks } from '../../src/presentation/sandTracks';

const bank = { heightAt: (x: number, z: number) => .07 * x - .03 * z };

describe('foot impressions in the strand', () => {
  it('alternates feet, follows the ground and leaves elevated supports clean', () => {
    const tracks = new SandTracks();
    tracks.stamp(bank, 0, 2, 0, 0);
    expect(tracks.mesh.visible).toBe(false);
    tracks.stamp(bank, 0, 0, 0, 0);
    const geo = tracks.mesh.geometry, position = geo.getAttribute('position');
    const firstCount = geo.drawRange.count;
    const verts = Math.max(...Array.from(geo.index!.array.slice(0, firstCount))) + 1;
    tracks.stamp(bank, 0, -.03, 1, 0);
    expect(geo.drawRange.count).toBe(firstCount * 2);
    for (let i = 0; i < verts * 2; i++) {
      expect(Math.sign(position.getX(i))).toBe(i < verts ? 1 : -1);
      expect(position.getY(i) - bank.heightAt(position.getX(i), position.getZ(i))).toBeCloseTo(.003, 5);
    }
  });
  it('bounds the trail and stops drawing after all the marks have faded', () => {
    const tracks = new SandTracks();
    for (let i = 0; i < 400; i++) tracks.stamp(bank, 0, bank.heightAt(0,i), i, 0);
    const geometry = tracks.mesh.geometry;
    expect(geometry.drawRange.count).toBe(geometry.index!.count);
    expect(tracks.mesh.frustumCulled).toBe(true);
    expect(geometry.boundingBox!.min.z).toBeGreaterThan(359);
    expect(geometry.boundingBox!.max.z).toBeGreaterThan(399);
    const position = geometry.getAttribute('position') as BufferAttribute;
    expect(position.updateRanges).toHaveLength(1);
    tracks.update(25);
    expect(tracks.mesh.visible).toBe(false);
    expect(geometry.boundingSphere!.isEmpty()).toBe(true);
    expect(position.updateRanges).toHaveLength(0);
    tracks.stamp(bank, 0, 0, 0, Math.PI/2);
    expect(tracks.mesh.visible).toBe(true);
    expect(geometry.drawRange.count).toBeLessThan(geometry.index!.count);
    expect(geometry.boundingSphere!.radius).toBeLessThan(.25);
  });
});
