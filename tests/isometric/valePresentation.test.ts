import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game/game';
import { coastX } from '../../src/core/world/coast';
import { crossings } from '../../src/isometric/crossing';
import { SWING_CONTACT } from '../../src/isometric/fieldcraft';
import { Footfalls } from '../../src/isometric/footfalls';
import { sandCover } from '../../src/isometric/landCover';
import { wheelWear } from '../../src/isometric/settlement';
import { Valley } from '../../src/isometric/simulation';
import { skyLight } from '../../src/isometric/skyLight';

describe('light and travel in the Vale', () => {
  it('carries the light through twilight and midnight without a cut', () => {
    expect(skyLight(12).night).toBe(0);
    expect(skyLight(0)).toEqual(skyLight(24));
    expect(skyLight(0).night).toBe(1);
    expect(skyLight(6.5).amber).toBeGreaterThan(0.9);
    for (let minute = 0; minute < 1440; minute++) {
      const a = skyLight(minute / 60),
        b = skyLight((minute + 1) / 60);
      for (const key of ['night', 'amber', 'daylight'] as const)
        expect(Math.abs(a[key] - b[key])).toBeLessThan(0.03);
    }
  });
  it('blends sand into the meadow and puts wheel wear either side of a cart road', () => {
    const shore = coastX(0);
    expect(sandCover(shore + 7, 0)).toBe(1);
    expect(sandCover(shore + 15, 0)).toBeGreaterThan(0);
    expect(sandCover(shore + 15, 0)).toBeLessThan(1);
    expect(sandCover(shore + 24, 0)).toBe(0);
    expect(wheelWear(8, 8)).toBe(0);
    expect(wheelWear(8, 8.9)).toBeGreaterThan(0.7);
    expect(wheelWear(8, 7.1)).toBeGreaterThan(0.7);
    expect(wheelWear(-218, 22)).toBe(0);
  });
  it('ties alternating impressions to travelled distance and material', () => {
    const simulate = (fps: number, speed: number) => {
      const gait = new Footfalls(),
        x = coastX(32) + 6;
      for (let i = 0; i < fps; i++)
        gait.advance(
          { x, z: 32 + (speed * i) / fps },
          { x, z: 32 + (speed * (i + 1)) / fps },
          1 / fps,
          (i + 1) / fps,
          true,
          '',
          false,
          false
        );
      return gait;
    };
    const walk = simulate(60, 5),
      run = simulate(60, 9);
    expect(run.serial).toBeGreaterThan(walk.serial);
    expect(simulate(30, 5).serial).toBe(walk.serial);
    expect(walk.prints.map((p) => p.side)).toEqual([1, -1]);
    expect(walk.prints.every((p) => p.sand && !p.running)).toBe(true);
    const bridge = crossings[0]!;
    const gait = new Footfalls();
    const start = { x: bridge.x - bridge.tx, z: bridge.z - bridge.tz };
    const end = { x: bridge.x + bridge.tx, z: bridge.z + bridge.tz };
    gait.advance(start, end, 0.5, 0.5, true, '', false, false);
    gait.advance(end, start, 0.5, 1, true, '', false, false);
    expect(gait.material).toBe('wood');
    expect(gait.prints).toEqual([]);
    run.advance(start, end, 0.5, 14, false, '', false, false);
    expect(run.prints).toEqual([]);
  });
  it('resolves a sword blow on its contact cel and lets a target leave the swing', () => {
    for (const escapes of [false, true]) {
      const valley = new Valley(new Game()),
        actor = valley.actors.find((a) => a.enemy)!;
      valley.game.setPlayerTransform(-175, 0, 18, Math.PI / 2);
      valley.game.state.equippedWeapon = 'rusted_sword';
      Object.assign(actor, { x: -173, z: 18 });
      const hp = actor.health;
      valley.startAttack(actor);
      expect(valley.swordSwing).toBe(true);
      for (let t = 0; t < SWING_CONTACT - 1 / 60; t += 1 / 60) valley.step(1 / 60, 0, 0, false);
      expect(actor.health).toBe(hp);
      expect(valley.contacts).toHaveLength(0);
      if (escapes) actor.x += 16;
      valley.step(1 / 30, 0, 0, false);
      expect(actor.health).toBe(hp - (escapes ? 0 : 29));
      expect(valley.contacts.map((hit) => hit.kind)).toEqual(escapes ? [] : ['blade']);
    }
  });
});
