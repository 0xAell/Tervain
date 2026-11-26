import { describe, expect, it } from 'vitest';
import { drawContact, drawDamageLabels } from '../../src/isometric/fieldEffects';
import { supportHeight } from '../../src/isometric/relief';
import { Game } from '../../src/core/game/game';
import { ACTION_COST, GUARD } from '../../src/core/rules/hero';
import {
  DRAW_TIME,
  ENEMY_SWING_TIME,
  enemyContactRemaining,
  enemySwingProgress,
  SWING_TIME,
  type FieldSound,
} from '../../src/isometric/fieldcraft';
import { Valley } from '../../src/isometric/simulation';
import { FOCUS_TIME, FOCUSED_ARROW_DAMAGE, IMPACT_PAUSE, SIDESTEP, followingStroke, sidestepDistance } from '../../src/core/rules/valeCombat';

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
  it('cycles a finished chain, carries a counter into a return and plants the dodge foot', () => {
    expect((['attack', 'return', 'thrust', 'counter'] as const).map(followingStroke)).toEqual(['return', 'thrust', 'attack', 'return']);
    expect(sidestepDistance(-1)).toBe(0);
    expect(sidestepDistance(SIDESTEP.duration / 2)).toBeCloseTo(SIDESTEP.distance * 0.75);
    expect(sidestepDistance(SIDESTEP.duration + 1)).toBe(SIDESTEP.distance);
  });

  it('charges trained and untrained guards for the same heavy blow and breaks an exhausted guard', () => {
    for (const [trained, stamina, guarded] of [[false, 100, true], [true, 100, true], [true, 1, false]] as const) {
      const { valley, enemy, cues } = encounter('thornback');
      if (trained) valley.game.state.skills.push('steady_guard');
      valley.guard = true;
      advance(valley, 0.4);
      valley.stamina = stamina;
      enemy.attack = enemyContactRemaining(true) + 0.005;
      valley.step(0.01, 0, 0, false);
      const cost = ACTION_COST.blockHit * GUARD.heavyCost * (trained ? GUARD.steadyGuard : 1);
      expect(valley.stamina).toBeCloseTo(Math.max(0, Math.min(100, stamina + 0.1) - cost));
      expect(cues.at(-1)?.cue).toBe(guarded ? 'block' : 'player_hit');
      expect(valley.contacts.at(-1)?.kind).toBe(guarded ? 'guard' : 'body');
      expect(valley.tiredUntil > valley.time).toBe(!guarded);
    }
  });

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
    advance(valley, 0.32);
    expect(cues).toHaveLength(3);
    advance(valley, 0.04);
    expect(cues.map(({ cue }) => cue)).toEqual(['blade_swing', 'blade_hit', 'enemy_down', 'fall_ground']);
    advance(valley, 0.5);
    expect(cues).toHaveLength(4);
  });

  it('keeps the heavier simultaneous impact attached to its recipient until the pause ends', () => {
    const { valley, enemy } = encounter();
    const second = valley.actors.find(a => a.enemyKind === 'bandit' && a !== enemy)!;
    const home = { x: -176.5, z: 18 };
    Object.assign(second, home, { home, timer: 10 });
    enemy.health = 1;
    valley.startAttack(enemy);
    advance(valley, 0.23);
    second.attack = enemyContactRemaining(false) + 0.005;
    valley.step(0.02, 0, 0, false);
    expect(valley.contacts).toMatchObject([
      { actorId: enemy.id, defeated: true }, { actorId: 'player', kind: 'body' },
    ]);
    expect(valley.hitStopContact).toBe(valley.contacts[0]);
    expect(valley.hitStopRemaining).toBe(IMPACT_PAUSE.heavy);
    valley.step(IMPACT_PAUSE.heavy, 0, 0, false);
    expect(valley.hitStopContact).toBeUndefined();
  });

  it('keeps consecutive damage numbers readable after the impact itself is over', () => {
    const { valley, enemy } = encounter();
    enemy.health = 100;
    valley.startAttack(enemy);
    advance(valley, 0.33);
    valley.startAttack(enemy);
    advance(valley, 0.36 + IMPACT_PAUSE.regular);
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
      advance(valley, (early ? 0.23 : 0.1) + IMPACT_PAUSE.regular);
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
  it.each([30, 60, 120])('opens a counter on a late sword guard and consumes it once at %i Hz', (hz) => {
    const { valley, enemy, cues } = encounter();
    const tick = () => valley.step(1 / hz, 0, 0, false);
    enemy.timer = 0;
    const hp = valley.player.health;
    tick();
    while (enemy.attack > enemyContactRemaining(false) + 0.10) tick();
    valley.guard = true;
    while (!cues.some(c => c.cue === 'parry') && enemy.attack > 0) tick();
    expect(valley.player.health).toBe(hp);
    expect(valley.combatTarget).toBe(enemy);
    expect(valley.contacts.at(-1)?.kind).toBe('parry');
    expect(enemy.openedUntil).toBeGreaterThan(valley.time);
    valley.guard = false;
    valley.startAttack(enemy);
    expect(valley.stroke).toBe('counter');
    expect(enemy.openedUntil).toBeUndefined();
    while (valley.strike > 0.10) tick();
    valley.startAttack(enemy);
    while (valley.stroke === 'counter' && valley.strike > 0) tick();
    expect(valley.stroke).toBe('return');
    expect(valley.contacts.at(-1)).toMatchObject({ actorId: enemy.id, damage: 44, kind: 'counter' });
    expect(cues.map(c => c.cue)).toEqual(['enemy_windup', 'parry', 'counter_swing', 'counter_hit']);
  });

  it('expires the opening and leaves a held guard as an ordinary block', () => {
    const { valley, enemy } = encounter();
    enemy.timer = 0;
    advance(valley, 0.36);
    valley.guard = true;
    advance(valley, 0.15);
    expect(valley.contacts.at(-1)?.kind).toBe('parry');
    advance(valley, 0.75);
    valley.startAttack();
    expect(valley.stroke).toBe('attack');
    advance(valley, 2.3);
    expect(valley.contacts.some(c => c.kind === 'parry')).toBe(false);
    expect(valley.player.health).toBeLessThan(valley.player.maxHealth);
  });

  it('picks the parried opponent for a counter in a crowd and keeps a pointer choice explicit', () => {
    const { valley, enemy } = encounter();
    const other = valley.actors.find(a => a.enemy && a.id !== enemy.id)!;
    Object.assign(other, { x: -174.5, z: 18 });
    enemy.openedUntil = valley.time + 0.4;
    valley.startAttack();
    expect(valley.stroke).toBe('counter');
    expect(valley.combatTarget).toBe(enemy);
    advance(valley, 0.45 + IMPACT_PAUSE.heavy);
    enemy.openedUntil = valley.time + 0.4;
    valley.startAttack(other);
    expect(valley.combatTarget).toBe(other);
    expect(valley.stroke).toBe('attack');
  });

  it('keeps a sword and a hostile swing from reaching between different quarry ledges', () => {
    const { valley, enemy } = encounter('thornback');
    let ledge: { x: number; z: number } | undefined;
    for (let x = 99; x < 116 && !ledge; x += 0.5) {
      for (let z = -52; z < -36; z += 0.5) {
        if (Math.abs(supportHeight({ x, z }) - supportHeight({ x, z: z + 2.4 })) > 2.8) {
          ledge = { x, z };
          break;
        }
      }
    }
    expect(ledge).toBeDefined();
    const p = ledge!;
    valley.game.setPlayerTransform(p.x, 0, p.z, 0);
    const upper = { x: p.x, z: p.z + 2.4 };
    Object.assign(enemy, upper, { home: upper, timer: 0 });
    const hp = enemy.health;
    valley.attack(enemy);
    advance(valley, 1);
    expect(enemy.health).toBe(hp);
    expect(enemy.attack).toBe(0);
    expect(valley.player.health).toBe(valley.player.maxHealth);
  });

  it.each([30, 60, 120])('holds the contact pose, accepts a return and finishes with a thrust at %i Hz', hz => {
    const { valley, enemy, cues } = encounter();
    enemy.health = 150;
    const tick = () => valley.step(1 / hz, 0, 0, false);
    valley.startAttack(enemy);
    for (let i = 0; i < hz && !valley.contacts.length; i++) tick();
    const strike = valley.strike, time = valley.time, x = enemy.x;
    expect(valley.hitStopRemaining).toBeCloseTo(IMPACT_PAUSE.regular, 9);
    valley.step(IMPACT_PAUSE.regular, 0, 0, false);
    expect(valley.strike).toBe(strike);
    expect(enemy.x).toBe(x);
    expect(valley.time - time).toBeCloseTo(IMPACT_PAUSE.regular, 9);
    for (const stroke of ['return', 'thrust']) {
      while (valley.strike > 0.11) tick();
      valley.startAttack(enemy);
      while (valley.stroke !== stroke && valley.strike) tick();
      expect(valley.stroke).toBe(stroke);
    }
    for (let i = 0; i < hz && enemy.health > 54; i++) tick();
    expect(cues.some(c => c.cue === 'thrust')).toBe(true);
    expect(enemy.health).toBe(54);
    expect(enemy.x - valley.player.x).toBeGreaterThan(0.95);
  });

  it.each([30, 60, 120])('uses the dodge direction, stamina, cooldown and contact-time immunity at %i Hz', hz => {
    for (const [contactAt, safe] of [[0.09, true], [0.15, false]] as const) {
      const { valley, enemy, cues } = encounter();
      // Dodge sideways along the edge of the attack while the target still covers both feet.
      Object.assign(enemy, { x: -173.8, z: 19.65 });
      enemy.attack = enemyContactRemaining(false) + contactAt;
      expect(valley.requestDash(0, 1)).toBe(true);
      expect(valley.stamina).toBe(78);
      expect(valley.requestDash(1, 0)).toBe(false);
      for (let i = 0; i < Math.ceil((SIDESTEP.duration + 0.07) * hz); i++) valley.step(1 / hz, 0, 0, false);
      expect(valley.player.z - 18).toBeCloseTo(SIDESTEP.distance, 7);
      expect(valley.player.health === valley.player.maxHealth).toBe(safe);
      expect(cues.filter(c => c.cue === 'sidestep')).toHaveLength(1);
      expect(valley.requestDash()).toBe(false);
      advance(valley, 0.6);
      valley.stamina = 2;
      expect(valley.requestDash()).toBe(false);
      expect(valley.tiredUntil).toBeGreaterThan(valley.time);
    }
  });

  it.each([30, 60, 120])('strafes with the bow drawn and distinguishes focused flight from impact at %i Hz', hz => {
    const { valley, enemy, cues } = encounter();
    Object.assign(valley.game.state.inventory, { hunting_bow: 1, arrow: 2 });
    valley.game.state.equippedWeapon = 'hunting_bow';
    Object.assign(enemy, { x: -151, z: 18, home: { x: -151, z: 18 }, health: 80 });
    valley.startAttack(enemy);
    const yaw = valley.player.yaw;
    for (let i = 0; i < Math.ceil((DRAW_TIME + FOCUS_TIME) * hz) + 1; i++) valley.step(1 / hz, 0, 1, false);
    const p = valley.player;
    expect(p.z).toBeGreaterThan(19);
    expect(p.yaw).toBe(yaw);
    expect(valley.bowFocus).toBe(1);
    valley.aimDirection(enemy.x - p.x, enemy.z - p.z);
    valley.releaseAttack();
    valley.step(1 / hz, 0, 0, false);
    expect(valley.arrows[0]?.focused).toBe(true);
    expect(cues.map(c => c.cue)).toEqual(['bow_draw', 'bow_focus', 'focused_release']);
    for (let i = 0; i < hz && !valley.contacts.length; i++) valley.step(1 / hz, 0, 0, false);
    expect(cues.at(-1)?.cue).toBe('focused_hit');
    expect(enemy.health).toBe(80 - FOCUSED_ARROW_DAMAGE);
    expect(valley.game.state.inventory.arrow).toBe(1);
  });

});
