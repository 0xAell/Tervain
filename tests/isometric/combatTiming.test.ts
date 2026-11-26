import { describe, expect, it } from 'vitest';
import { drawContact, drawDamageLabels } from '../../src/isometric/fieldEffects';
import { Game } from '../../src/core/game/game';
import {
  ENEMY_SWING_TIME,
  enemyContactRemaining,
  enemySwingProgress,
  SWING_TIME,
  type FieldSound,
} from '../../src/isometric/fieldcraft';
import { Valley } from '../../src/isometric/simulation';

function encounter(kind: 'bandit' | 'thornback' = 'bandit') {
  const valley = new Valley(new Game());
  const enemy = valley.actors.find((actor) => actor.enemy && actor.key === kind)!;
  const position = { x: -173.3, z: 18 };
  const cues: { cue: FieldSound; pan?: number }[] = [];
  valley.game.setPlayerTransform(-175, 0, 18, Math.PI / 2);
  valley.game.state.equippedWeapon = 'rusted_sword';
  Object.assign(enemy, position, { home: position, timer: 10 });
  valley.onFieldSound = (cue, _range, pan) => cues.push({ cue, pan });
  return { valley, enemy, cues };
}

function advance(valley: Valley, duration: number) {
  for (let elapsed = 0; elapsed < duration; ) {
    const step = Math.min(1 / 60, duration - elapsed);
    valley.step(step, 0, 0, false);
    elapsed += step;
  }
}

describe('Vale combat timing', () => {
  it('separates release from a confirmed hit and signals defeat after impact', () => {
    const { valley, enemy, cues } = encounter();
    enemy.health = 29;
    valley.startAttack(enemy);
    advance(valley, 0.17);
    expect(cues).toEqual([]);
    advance(valley, 0.02);
    expect(cues.map(({ cue }) => cue)).toEqual(['blade_swing']);
    expect(enemy.health).toBe(29);
    expect(valley.contacts).toHaveLength(0);
    advance(valley, 0.04);
    expect(enemy.health).toBe(29);
    advance(valley, 0.02);
    expect(enemy.dead).toBe(true);
    expect(valley.contacts).toMatchObject([{ kind: 'blade', damage: 29, defeated: true, actorId: enemy.id }]);
    expect(cues.map(({ cue }) => cue)).toEqual(['blade_swing', 'blade_hit', 'enemy_down']);
    expect(cues[1]!.pan).toBeGreaterThan(0);
    advance(valley, 0.5);
    expect(cues).toHaveLength(3);
  });

  it('keeps consecutive damage numbers readable after the impact itself is over', () => {
    const { valley, enemy } = encounter();
    enemy.health = 100;
    valley.startAttack(enemy);
    advance(valley, 0.33);
    valley.startAttack(enemy);
    advance(valley, 0.36);
    expect(valley.contacts).toHaveLength(2);
    const hits = valley.contacts;
    const calls: { value: string; x: number; y: number }[] = [];
    const ctx = {
      save() {}, restore() {}, strokeText() {},
      measureText: (value: string) => ({ width: value.length * 6 }),
      fillText: (value: string, x: number, y: number) => calls.push({ value, x, y }),
    } as unknown as CanvasRenderingContext2D;
    // The older contact no longer calls any of the particle drawing primitives.
    drawContact(ctx, hits[0]!, valley.time, 0, 0, false);
    for (const reduced of [false, true]) {
      calls.length = 0;
      drawDamageLabels(ctx, hits, valley.time, 0, 0, reduced);
      expect(calls.map((c) => c.value)).toEqual(['29', '29']);
      expect(Math.abs(calls[0]!.y - calls[1]!.y)).toBeGreaterThanOrEqual(12);
    }
    advance(valley, 0.7);
    expect(valley.contacts).toHaveLength(0);
  });

  it('identifies an arrow defeat at the surface intersection', () => {
    const { valley, enemy, cues } = encounter();
    Object.assign(valley.game.state.inventory, { hunting_bow: 1, arrow: 1 });
    valley.game.state.equippedWeapon = 'hunting_bow';
    const position = { x: -164, z: 18 };
    Object.assign(enemy, position, { home: position, health: 32 });
    valley.attack(enemy);
    advance(valley, 0.78);
    expect(enemy.dead).toBe(true);
    expect(valley.contacts).toMatchObject([{ kind: 'body', damage: 32, defeated: true, actorId: enemy.id }]);
    expect(valley.contacts[0]!.x).toBeLessThan(enemy.x);
    expect(cues.map(({ cue }) => cue)).toEqual(['bow_draw', 'bow_release', 'arrow_flesh', 'enemy_down']);
  });

  it('keeps the attack facing committed as directional movement resumes', () => {
    const { valley, enemy } = encounter();
    valley.startAttack(enemy);
    const committed = valley.facing;
    const yaw = valley.player.yaw;
    advance(valley, 0.23);
    valley.step(0.03, 0, 1, false);
    expect(valley.contacts).toMatchObject([{ actorId: enemy.id }]);
    expect(valley.player.z).toBeGreaterThan(18);
    expect(valley.facing).toBe(committed);
    expect(valley.player.yaw).toBe(yaw);
    advance(valley, 0.2);
    valley.step(1 / 60, 0, 1, false);
    expect(valley.facing).not.toBe(committed);
    expect(valley.player.yaw).toBe(0);
  });

  it.each(['early press', 'late press', 'weapon change'] as const)(
    'buffers at most one follow-up and preserves commitment with a %s',
    (testCase) => {
      const { valley, enemy, cues } = encounter();
      valley.startAttack(enemy);
      const early = testCase === 'early press';
      advance(valley, early ? 0.2 : 0.33);
      valley.startAttack(enemy);
      valley.startAttack(enemy);
      if (testCase === 'weapon change') valley.game.state.equippedWeapon = null;
      advance(valley, early ? 0.23 : 0.1);
      expect(enemy.health).toBe(26);
      if (testCase === 'late press') expect(valley.strike).toBeGreaterThan(SWING_TIME - 1 / 60);
      else expect(valley.strike).toBe(0);
      advance(valley, 0.7);
      expect(cues.filter(({ cue }) => cue === 'blade_swing')).toHaveLength(testCase === 'late press' ? 2 : 1);
      expect(cues.some(({ cue }) => cue === 'unarmed_swing')).toBe(false);
      expect(valley.strike).toBe(0);
    }
  );

  it.each([
    ['bandit', false, 0.43, 11, 'player_hit'],
    ['thornback', true, 0.55, 4, 'block'],
  ] as const)('aligns the %s contact pose, guard and sound with the warning window', (kind, guard, wind, damage, cue) => {
    const { valley, enemy, cues } = encounter(kind);
    enemy.timer = 0;
    valley.guard = guard;
    advance(valley, 1 / 60);
    expect(enemy.attack).toBe(ENEMY_SWING_TIME);
    expect(cues.map((sound) => sound.cue)).toEqual(['enemy_windup']);
    const health = valley.player.health;
    advance(valley, wind - 0.01);
    const contact = enemyContactRemaining(kind === 'thornback');
    expect(enemy.attack).toBeGreaterThan(contact);
    expect(Math.floor(enemySwingProgress(enemy.attack, kind === 'thornback') * 7)).toBe(3);
    expect(valley.player.health).toBe(health);
    advance(valley, 0.02);
    expect(enemy.attack).toBeLessThan(contact);
    expect(Math.floor(enemySwingProgress(enemy.attack, kind === 'thornback') * 7)).toBe(4);
    expect(valley.player.health).toBe(health - damage);
    expect(valley.contacts).toMatchObject([{ damage, heavy: kind === 'thornback' }]);
    expect(cues.map((sound) => sound.cue)).toEqual(['enemy_windup', cue]);
  });
});
