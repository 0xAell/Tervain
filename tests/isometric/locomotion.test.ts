import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../../src/core/game/game';
import { coastX } from '../../src/core/world/coast';
import type { Atlas } from '../../src/isometric/atlas';
import { heroPose } from '../../src/isometric/heroPose';
import { JUMP_TIME, Locomotion } from '../../src/isometric/locomotion';
import { Valley } from '../../src/isometric/simulation';

describe('isometric locomotion', () => {
  it('starts immediately and covers the same distance at different frame rates', () => {
    const travel = (fps: number) => {
      const motion = new Locomotion();
      let distance = 0;
      for (let frame = 0; frame < fps / 2; frame++) {
        const move = motion.advance(1, 1, 1 / fps, 5, true, false)!;
        expect(move.stride).toBeGreaterThan(0);
        expect(Math.hypot(move.x, move.z)).toBeCloseTo(1, 10);
        distance += move.stride;
      }
      return distance;
    };
    expect(travel(60)).toBeCloseTo(5 * (0.5 - 0.09 / 2), 9);
    expect(travel(30)).toBeCloseTo(travel(120), 9);
  });

  it('turns on the next step and comes to a finite stop after a short brake', () => {
    const motion = new Locomotion();
    const dt = 1 / 60;
    for (let frame = 0; frame < 10; frame++) motion.advance(1, 0, dt, 9, true, false);
    const reverse = motion.advance(-1, 0, dt, 9, true, false)!;
    expect(reverse.x).toBe(-1);
    expect(reverse.stride).toBeLessThan(9 * dt);
    for (let frame = 0; frame < 10; frame++) motion.advance(-1, 0, dt, 9, true, false);
    let brakingDistance = 0;
    for (let frame = 0; frame < 7; frame++)
      brakingDistance += motion.advance(0, 0, dt, 5, true, false)?.stride ?? 0;
    expect(brakingDistance).toBeGreaterThan(0.4);
    expect(brakingDistance).toBeLessThan(0.55);
    expect(motion.advance(0, 0, dt, 5, true, false)).toBeUndefined();
  });

  it('does not coast past a click destination when manual input is idle', () => {
    const valley = new Valley(new Game());
    valley.game.setPlayerTransform(-175, 0, 18, 0);
    const destination = valley.player.x + 0.12;
    for (let frame = 0; frame < 15 && valley.player.x < destination; frame++) {
      valley.step(1 / 60, destination - valley.player.x, 0, false, false);
      expect(valley.player.x).toBeLessThanOrEqual(destination);
    }
    expect(valley.player.x).toBeCloseTo(destination, 9);
    valley.step(1 / 60, 0, 0, false);
    expect(valley.player.x).toBeCloseTo(destination, 9);
    expect(valley.walk).toBe(false);
  });

  it.each([30, 60, 120])('carries a running stride through touchdown at %i Hz', (fps) => {
    const run = new Valley(new Game());
    const hop = new Valley(new Game());
    for (const v of [run, hop]) v.game.setPlayerTransform(-175, 0, 18, 0);
    const dt = 1 / fps;
    for (let frame = 0; frame < fps; frame++) {
      if (frame === Math.floor(fps / 5)) hop.requestJump();
      run.step(dt, 1, 0, true);
      hop.step(dt, 1, 0, true);
      expect(hop.player.x).toBeCloseTo(run.player.x, 9);
      expect(hop.player.z).toBeCloseTo(run.player.z, 9);
    }
    expect(hop.jump).toBe(0);
    expect(run.player.x).toBeGreaterThan(-169);
  });

  it('plays every authored jump cel in order regardless of the session clock', () => {
    const frames = JSON.parse(
      readFileSync(new URL('../../public/vale/sprites.json', import.meta.url), 'utf8')
    ).frames as Record<string, number[][]>;
    const atlas = {
      has: (key: string) => key in frames,
      frameCount: (key: string) => frames[key]?.length ?? 0,
    } as Atlas;
    const v = new Valley(new Game());
    for (const start of [0, 17.47, 317.91]) {
      v.time = start;
      v.requestJump();
      const cels = new Set<number>();
      while (v.jump > 0) {
        const pose = heroPose(v, atlas, 38);
        expect(pose.key.endsWith('--jump')).toBe(true);
        cels.add(pose.frame);
        v.step(1 / 60, 0, 0, false);
      }
      expect([...cels]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it('stamps both boots at the instant of a standing landing on sand', () => {
    const v = new Valley(new Game());
    v.game.setPlayerTransform(coastX(32) + 6, 0, 32, 0);
    v.requestJump();
    for (let i = 0; i < 31; i++) v.step(1 / 60, 0, 0, false);
    expect(v.gait.prints).toEqual([]);
    for (let i = 0; i < 5; i++) v.step(1 / 60, 0, 0, false);
    expect(v.gait.prints.map((p) => p.side)).toEqual([-1, 1]);
    expect(v.gait.serial).toBe(0);
    for (const p of v.gait.prints) {
      expect(p.landing && p.sand).toBe(true);
      expect(p.born).toBeCloseTo(JUMP_TIME, 10);
    }
  });

  it.each([30, 60, 120])('buffers one late press across a full grounded frame at %i Hz', (fps) => {
    const v = new Valley(new Game());
    v.requestJump();
    const edges = [true];
    let pressed = false;
    for (let i = 0; i < fps * 1.3; i++) {
      if (!pressed && v.jump > 0 && v.jump < 0.07) {
        v.requestJump();
        v.requestJump();
        pressed = true;
      }
      v.step(1 / fps, 0, 0, false);
      if (!!v.jump !== edges.at(-1)) edges.push(!!v.jump);
    }
    expect(edges).toEqual([true, false, true, false]);
  });

  it('drops an early press and lets a newly raised guard interrupt a buffered jump', () => {
    const v = new Valley(new Game());
    v.requestJump();
    v.requestJump();
    v.step(JUMP_TIME, 0, 0, false);
    v.step(1 / 60, 0, 0, false);
    expect(v.jump).toBe(0);
    v.requestJump();
    v.step(JUMP_TIME - 0.07, 0, 0, false);
    v.requestJump();
    v.guard = true;
    for (let i = 0; i < 10; i++) v.step(1 / 60, 0, 0, false);
    v.guard = false;
    v.step(1 / 60, 0, 0, false);
    expect(v.jump).toBe(0);
  });
  it('uses partial stick travel for a quiet walk at the same pace across refresh rates', () => {
    const travel = (pace: number, fps: number) => {
      const v = new Valley(new Game());
      v.game.setPlayerTransform(-175, 0, 18, 0);
      // Both distances stay on the same terrain facet, so they share its grade.
      for (let i = 0; i < fps / 5; i++) v.step(1 / fps, 1, 0, false, true, pace);
      return v.player.x + 175;
    };
    const full = travel(1, 60), quarter = travel(0.25, 60);
    expect(quarter / full).toBeCloseTo(0.25, 2);
    expect(travel(0.25, 30)).toBeCloseTo(quarter, 3);
    expect(travel(0.25, 120)).toBeCloseTo(quarter, 3);
  });

});
