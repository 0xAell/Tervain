import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLACES } from '../../src/core/world/layout';
import { roadWeight } from '../../src/core/world/terrain';
import { waterProfile } from '../../src/isometric/channels';
import { frontDoor, sites } from '../../src/isometric/doorways';
import { hegemonyStandards, standardSize } from '../../src/isometric/hegemony';

describe('Hegemony standards', () => {
  it('marks every district with dry posts clear of roads and building approaches', () => {
    const posts = hegemonyStandards.filter((standard) => standard.key !== 'standard_wall');
    expect(posts.length).toBeGreaterThan(30);
    for (const post of posts) {
      expect(roadWeight(post.x, post.z)).toBeLessThanOrEqual(0.14);
      expect(waterProfile(post.x, post.z)?.bank ?? -10).toBeLessThanOrEqual(-0.62);
      for (const site of sites) {
        const door = frontDoor(site).outside;
        expect(Math.hypot(door.x - post.x, door.z - post.z), site.id).toBeGreaterThan(1.2);
      }
    }
    for (const name of [
      'shore',
      'lantern_point',
      'deepwood',
      'overlook',
      'rillford',
      'ford',
      'spring_shrine',
      'sluice',
      'quarry',
      'the_cut',
      'archive',
    ] as const) {
      const place = PLACES[name];
      expect(
        hegemonyStandards.some((s) => Math.hypot(s.x - place.x, s.z - place.z) < 18),
        name
      ).toBe(true);
    }
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
