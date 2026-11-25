import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bySpec, DECKS, FOREST_RUIN, PLACES, SLUICE, SPAWN, WAGON } from '../../src/core/world/layout';
import { roadWeight } from '../../src/core/world/terrain';
import { waterProfile } from '../../src/isometric/channels';
import { frontDoor, sites } from '../../src/isometric/doorways';
import { hegemonyStandards, standardSize } from '../../src/isometric/hegemony';
import { onFootpath } from '../../src/isometric/settlement';

describe('Hegemony standards', () => {
  it('places single posts at maintained sites and keeps open roads clear', () => {
    const posts = hegemonyStandards.filter((standard) => standard.key !== 'standard_wall');
    expect(posts).toHaveLength(4);
    for (const point of [PLACES.lantern_point, WAGON, SLUICE.control, DECKS[0]!]) {
      expect(posts.filter((p) => Math.hypot(p.x - point.x, p.z - point.z) < 14)).toHaveLength(1);
    }
    for (const post of posts) {
      expect(roadWeight(post.x, post.z)).toBeLessThanOrEqual(0.14);
      expect(onFootpath(post.x, post.z)).toBe(false);
      expect(waterProfile(post.x, post.z)?.bank ?? -10).toBeLessThanOrEqual(-0.62);
      for (const site of sites) {
        const door = frontDoor(site).outside;
        expect(Math.hypot(door.x - post.x, door.z - post.z), site.id).toBeGreaterThan(1.2);
      }
    }
    for (const point of [SPAWN, FOREST_RUIN, PLACES.overlook, PLACES.ford, PLACES.the_cut]) {
      expect(hegemonyStandards.some((s) => Math.hypot(s.x - point.x, s.z - point.z) < 18)).toBe(false);
    }
  });

  it('hangs one crest on each civic facade and marks the principal sites on the map', () => {
    const wall = hegemonyStandards.filter((standard) => standard.key === 'standard_wall');
    expect(wall).toHaveLength(3);
    for (const id of ['reeve_house', 'shrine_hall', 'quarry_office']) {
      const site = bySpec(id);
      expect(wall.filter((p) => Math.hypot(p.x - site.x, p.z - site.z) < site.w), id).toHaveLength(1);
    }
    expect(hegemonyStandards.filter((s) => s.chart)).toHaveLength(6);
  });

  it('keeps the sprite dimensions stable as the wind animates the cloth', () => {
    const { frames } = JSON.parse(
      readFileSync(new URL('../../public/vale/sprites.json', import.meta.url), 'utf8')
    ) as {
      frames: Record<string, [x: number, y: number, width: number, height: number][]>;
    };
    for (const [key, size] of Object.entries(standardSize)) {
      const sequence = frames[key]!;
      expect(sequence.length).toBeGreaterThan(8);
      expect(new Set(sequence.map((cell) => cell.join(','))).size).toBeGreaterThan(8);
      for (const [, , w, h] of sequence) expect([w, h]).toEqual([size.width, size.height]);
    }
    expect(frames.standard_chart).toHaveLength(1);
  });
});
