import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/core/game/game';
import {
  ACTION_COST, ACTION_SECONDS, BLADE, DODGE, FISTS, GRAVITY, HIT_AT, JUMP_SPEED, PERFECT_BLOCK_WINDOW, resolveGuardedHit, STAMINA_MAX, SWIM_FLOAT,
} from '../../../src/core/rules/hero';
import { HERO_GUARD_SPEED, HERO_RUN_SPEED, HERO_WALK_SPEED } from '../../../src/core/rules/heroLocomotion';
import { MOUNT_SIDE, MOUNT_TIMES, RIDE } from '../../../src/core/rules/riding';
import {
  Wanderer, type WandererContext, type WandererFoe, type WandererPosture, type WandererStance, type WandererWater,
} from '../../../src/core/rules/wanderer';
import { Colliders } from '../../../src/core/world/colliders';
import type { Terrain } from '../../../src/core/world/terrain';

// What the wanderer does is decided in the core: these run him on the core alone, with a body that records what
// whoever draws him would be told. No renderer, no rig, no sound device, no keyboard.

/** The wanderer with the plainest of bodies. */
class Body extends Wanderer {
  readonly postures: WandererPosture[] = [];
  readonly told: string[] = [];
  get stance(): WandererStance { return this.postures[this.postures.length - 1]!.mode; }
  get now(): WandererPosture { return this.postures[this.postures.length - 1]!; }
  protected override armsShown(state: 'none' | 'sheathed' | 'drawn'): void { this.told.push(`arms:${state}`); }
  private bow: boolean | null = null;
  protected override bowShown(equipped: boolean): void { if (this.bow !== equipped) this.told.push(`bow:${equipped}`); this.bow = equipped; }
  protected override aimShown(direction: { x: number; y: number; z: number } | null): void { this.told.push(direction ? 'aim' : 'no aim'); }
  protected override bodyPlaced(): void { this.told.push('placed'); }
  protected override bodyStruck(): void { this.told.push('struck'); }
  protected override present(_dt: number, _ctx: WandererContext, posture: WandererPosture): void { this.postures.push(posture); }
}

interface World {
  hero: Body;
  ctx: WandererContext;
  sounds: string[];
  hurts: Array<[number, boolean]>;
  deaths: number[];
  struck: Array<{ foe: WandererFoe; killed: boolean; heavy: boolean }>;
  press(action: string): void;
  hold(action: string, down?: boolean): void;
  steer(x: number, y: number): void;
  tick(seconds?: number, hz?: number): void;
}

/** Level ground at height 0 with nothing on it, real colliders and a real game. */
function world(water?: WandererWater): World {
  let move = { x: 0, y: 0 };
  const held = new Set<string>(), presses = new Set<string>(), sounds: string[] = [];
  const hurts: Array<[number, boolean]> = [], deaths: number[] = [], struck: World['struck'] = [];
  const ground = () => 0;
  const terrain = {
    groundAt: ground, supportAt: ground, heightAt: ground, walkable: () => true, valleyRadius: () => 0,
    deckAt: () => null, carveAt: () => 0, seaDepth: () => 0, slopeAt: () => 0,
  } as unknown as Terrain;
  const say = (name: string) => () => { sounds.push(name); };
  const ctx: WandererContext = {
    terrain, water, colliders: new Colliders(), game: new Game(), enemies: [], npcs: [], viewYaw: 0, controllable: true,
    input: { move: () => move, held: (a) => held.has(a), pressed: (a) => presses.has(a), clearToggle: (a) => { held.delete(a); }, uiOpen: false },
    audio: { footstep: say('step'), jump: say('jump'), land: say('land'), dodge: say('dodge'), swing: say('swing'), hit: (kind) => { sounds.push(`hit:${kind}`); }, hurt: say('hurt') },
    onHitEnemy: (foe, killed, heavy) => { struck.push({ foe, killed, heavy }); },
    onHurt: (damage, blocked) => { hurts.push([damage, blocked]); },
    onDeath: () => { deaths.push(1); },
    onBoundary: () => {},
  };
  const hero = new Body();
  hero.setPosition(0, 0, 0, terrain);
  return {
    hero, ctx, sounds, hurts, deaths, struck,
    press: (action) => { presses.add(action); },
    hold: (action, down = true) => { if (down) held.add(action); else held.delete(action); },
    steer: (x, y) => { move = { x, y }; },
    tick: (seconds = 1 / 60, hz = 60) => {
      for (let i = 0, n = Math.max(1, Math.round(seconds * hz)); i < n; i++) { hero.update(1 / hz, ctx); presses.clear(); }
    },
  };
}

/** A foe who stands where they are put and records what is done to them. */
function foe(x: number, z: number, over: Partial<WandererFoe> = {}): WandererFoe & { blows: number[]; turned: number } {
  const f = {
    id: 'bandit_road' as WandererFoe['id'], x, y: 0, z, alive: true, engaged: false, radius: 0.4, blows: [] as number[], turned: 0,
    takeHit(damage: number) { f.blows.push(damage); return false; },
    parried() { f.turned++; },
    ...over,
  };
  return f as WandererFoe & { blows: number[]; turned: number };
}

const armed = (w: World) => {
  w.ctx.game.state.inventory.rusted_sword = 1;
  w.ctx.game.dispatch({ t: 'equipWeapon', item: 'rusted_sword' });
  w.hero.syncEquipment(w.ctx.game);
};

describe('the wanderer afoot, on the core alone', () => {
  it('walks and runs at the paces the rules give, turns the way he goes, and the body is told which', () => {
    const w = world();
    w.ctx.viewYaw = Math.PI / 2; // the camera looks along +x, so "forward" is +x
    w.steer(0, 1);
    w.tick(2);
    expect(w.hero.lastMoveSpeed).toBeCloseTo(HERO_WALK_SPEED, 2);
    expect(w.hero.yaw).toBeCloseTo(Math.PI / 2, 2);
    expect(w.hero.x).toBeGreaterThan(HERO_WALK_SPEED * 1.8);
    expect(Math.abs(w.hero.z)).toBeLessThan(1e-6);
    expect(w.hero.stance).toBe('walk');
    expect(w.hero.now.speed).toBeCloseTo(1, 2);
    expect(w.hero.stamina).toBe(STAMINA_MAX);

    w.hold('sprint');
    w.tick(2);
    expect(w.hero.lastMoveSpeed).toBeCloseTo(HERO_RUN_SPEED, 2);
    expect(w.hero.stance).toBe('run');
    expect(w.hero.stamina).toBeLessThan(STAMINA_MAX);

    w.steer(0, 0);
    w.tick(1);
    expect(w.hero.lastMoveSpeed).toBeLessThan(0.01);
    expect(w.hero.stance).toBe('idle');
    // A body that does not report its heel strikes is heard by the distance covered.
    expect(w.sounds.filter((s) => s === 'step').length).toBeGreaterThan(4);
  });

  it('is set down at rest, and the body is told to go there', () => {
    const w = world();
    w.steer(1, 0); w.press('attack'); w.tick(0.2);
    w.hero.setPosition(12, -7, 1.5, w.ctx.terrain);
    expect([w.hero.x, w.hero.y, w.hero.z, w.hero.yaw]).toEqual([12, 0, -7, 1.5]);
    expect([w.hero.state, w.hero.vx, w.hero.vz, w.hero.grounded, w.hero.blocking]).toEqual(['free', 0, 0, true, false]);
    expect(w.hero.told[w.hero.told.length - 1]).toBe('placed');
  });

  it('jumps as high as the rules give, lands audibly, and pays for it', () => {
    const w = world();
    w.press('jump');
    let peak = 0;
    for (let i = 0; i < 120 && (i < 2 || !w.hero.grounded); i++) { w.tick(); peak = Math.max(peak, w.hero.y); }
    expect(peak).toBeCloseTo(JUMP_SPEED * JUMP_SPEED / (2 * GRAVITY), 2);
    expect([w.hero.grounded, w.hero.y]).toEqual([true, 0]);
    expect(w.sounds).toEqual(['jump', 'land']);
    expect(w.hero.stamina).toBeLessThan(STAMINA_MAX);
    expect(w.hero.stamina).toBeGreaterThanOrEqual(STAMINA_MAX - ACTION_COST.jump);
  });

  it('holds still while he cannot be controlled, and nothing he was doing finishes', () => {
    const w = world();
    w.press('attack'); w.tick(0.1);
    const before = { x: w.hero.x, z: w.hero.z, told: w.hero.postures.length };
    w.ctx.controllable = false;
    w.steer(0, 1);
    w.tick(3);
    expect([w.hero.state, w.hero.x, w.hero.z]).toEqual(['light', before.x, before.z]);
    expect(w.hero.postures.length).toBeGreaterThan(before.told); // still posed, on no time
    expect(w.struck).toEqual([]);
    w.ctx.controllable = true;
    w.steer(0, 0);
    w.tick(1);
    expect(w.hero.state).toBe('free');
  });
});

describe('the wanderer in a fight, on the core alone', () => {
  it('lands a light blow once, at its moment, on the foe before him and not the one behind', () => {
    const w = world(), ahead = foe(0, 1.2), behind = foe(0, -1.2);
    w.ctx.enemies = [ahead, behind];
    w.press('attack');
    w.tick();
    expect([w.hero.state, w.hero.stance]).toEqual(['light', 'attack_light']);
    expect(w.hero.stamina).toBeCloseTo(STAMINA_MAX - FISTS.cost.light, 6);
    w.tick(FISTS.dur.light * HIT_AT.light - 0.05);
    expect(ahead.blows).toEqual([]);
    w.tick(0.1);
    expect(ahead.blows).toEqual([FISTS.light]);
    w.tick(FISTS.dur.light);
    expect([w.hero.state, ahead.blows, behind.blows]).toEqual(['free', [FISTS.light], []]);
    expect(w.struck).toEqual([{ foe: ahead, killed: false, heavy: false }]);
    expect(w.sounds.filter((s) => s === 'swing' || s === 'hit:flesh')).toEqual(['swing', 'hit:flesh']);
  });

  it('strikes harder, further and wider with the blade, which comes out for the fight and goes back when it is quiet', () => {
    const w = world(), wide = foe(1.3, 1.9);
    armed(w);
    w.ctx.enemies = [wide];
    expect(w.hero.arms(w.ctx.game)).toBe(BLADE);
    w.tick();
    expect(w.hero.drawn).toBe(false);
    w.press('heavy');
    w.tick(BLADE.dur.heavy + 0.1);
    expect(wide.blows).toEqual([BLADE.heavy]);
    expect(w.struck[0]!.heavy).toBe(true);
    expect(w.hero.drawn).toBe(true);
    w.tick(7);
    expect(w.hero.drawn).toBe(false);
    expect(w.hero.told.filter((t) => t.startsWith('arms:'))).toEqual(['arms:sheathed', 'arms:drawn', 'arms:sheathed']);
  });

  it('dodges the same distance at any frame rate, away from the camera with no direction given, and cannot be hit as he goes', () => {
    for (const hz of [30, 60, 120]) {
      const w = world(), attacker = foe(0, 1);
      w.press('dodge');
      w.tick(1 / hz, hz);
      expect([w.hero.state, w.hero.invulnerable]).toEqual(['dodge', true]);
      w.hero.receiveHit(50, true, attacker, w.ctx);
      expect(w.hurts).toEqual([]);
      w.tick(ACTION_SECONDS.dodge + 0.1, hz);
      expect(w.hero.state).toBe('free');
      expect(w.hero.z).toBeCloseTo(-DODGE.speed * ACTION_SECONDS.dodge / 2, 1);
      expect(w.hero.stamina).toBeLessThanOrEqual(STAMINA_MAX - ACTION_COST.dodge + 5);
    }
  });

  it('turns a blow aside with a blade raised in time, and takes a share of it on a guard held longer', () => {
    const w = world(), attacker = foe(0, 1.5);
    armed(w);
    w.hold('block');
    w.tick(PERFECT_BLOCK_WINDOW / 2);
    expect([w.hero.blocking, w.hero.stance]).toEqual([true, 'block']);
    w.hero.receiveHit(20, false, attacker, w.ctx);
    expect([attacker.turned, w.hurts, w.ctx.game.state.player.health]).toEqual([1, [[0, true]], w.ctx.game.state.player.maxHealth]);

    w.tick(1);
    const stamina = w.hero.stamina;
    const expected = resolveGuardedHit({ damage: 20, heavy: false, arms: BLADE, blockTime: 1, stamina, steadyGuard: false });
    if (expected.parried) throw new Error('a guard held a second is no parry');
    w.hero.receiveHit(20, false, attacker, w.ctx);
    expect(attacker.turned).toBe(1);
    expect(w.hurts[1]).toEqual([expected.damage, true]);
    expect(w.hero.stamina).toBeCloseTo(stamina - expected.cost, 6);
    expect(w.ctx.game.state.player.health).toBe(w.ctx.game.state.player.maxHealth - expected.damage);
    expect(w.hero.state).toBe('free');
  });

  it('takes a blow from behind on the body: he flinches, is knocked away, and what he was doing is broken off', () => {
    const w = world(), attacker = foe(0, -1.5);
    let finished = 0;
    w.hold('block'); w.tick(0.5); w.hold('block', false); w.tick();
    expect(w.hero.beginChannel('Rite', 2, () => { finished++; })).toBe(true);
    w.tick(0.5);
    w.hero.receiveHit(15, false, attacker, w.ctx);
    expect([w.hero.state, w.hero.channel, finished]).toEqual(['hurt', null, 0]);
    expect(w.hero.z).toBeCloseTo(0.5, 6); // knocked half a metre from the blow
    expect(w.hurts).toEqual([[15, false]]);
    expect(w.hero.told).toContain('struck');
    expect(w.sounds.slice(-2)).toEqual(['hit:flesh', 'hurt']);
    w.tick();
    expect(w.hero.stance).toBe('hurt');
    w.tick(ACTION_SECONDS.hurt);
    expect(w.hero.state).toBe('free');
  });

  it('dies of the blow that takes the last of his health: once, and for good', () => {
    const w = world(), attacker = foe(0, 1.5);
    w.ctx.game.state.player.health = 10;
    w.hero.receiveHit(30, true, attacker, w.ctx);
    expect([w.hero.state, w.hero.alive, w.deaths.length]).toEqual(['dead', false, 1]);
    w.hero.receiveHit(30, true, attacker, w.ctx);
    w.steer(0, 1); w.press('attack');
    w.tick(1);
    expect([w.hero.state, w.deaths.length, w.hero.stance]).toEqual(['dead', 1, 'dead']);
    expect(Math.hypot(w.hero.x, w.hero.z)).toBeLessThan(0.6);
  });
});

describe('the wanderer at work, in water, with the bow and in the saddle, on the core alone', () => {
  it('finishes a piece of work after its time, and abandons it on a firm step', () => {
    const w = world();
    let finished = 0;
    expect(w.hero.beginChannel('Rite', 1, () => { finished++; })).toBe(true);
    w.press('attack');
    w.tick(0.5);
    expect([w.hero.state, w.hero.stance, finished]).toEqual(['channel', 'work', 0]);
    w.tick(0.6);
    expect([w.hero.state, finished]).toEqual(['free', 1]);

    expect(w.hero.beginChannel('Rite', 1, () => { finished++; })).toBe(true);
    w.steer(0, 0.3); w.tick(0.2);
    expect(w.hero.state).toBe('channel'); // a nudge is not a step
    w.steer(0, 1); w.tick(0.2);
    expect([w.hero.state, w.hero.channel, finished]).toEqual(['free', null, 1]);
  });

  it('swims where the water is over his depth, with nothing in hand, and stands again in the shallows', () => {
    let depth = 2;
    const w = world({
      sample: () => ({ surface: depth, bed: 0, depth, flowX: 0, flowZ: 0 }),
      splash: () => {}, disturb: () => {}, emit: () => {},
    });
    w.tick(2);
    expect([w.hero.swimming, w.hero.grounded, w.hero.stance]).toEqual([true, false, 'swim']);
    expect(w.hero.y).toBeCloseTo(depth - SWIM_FLOAT, 1);
    w.press('attack'); w.hold('block');
    w.tick();
    expect([w.hero.state, w.hero.blocking]).toEqual(['free', false]);
    expect(w.hero.beginChannel('Rite', 1, () => {})).toBe(false);
    depth = 0.6;
    w.tick(1);
    expect([w.hero.swimming, w.hero.grounded, w.hero.y]).toEqual([false, true, 0]);
    expect(w.hero.blocking).toBe(true);
  });

  it('with the bow in hand and an aim held he faces it and moves at a guard’s pace; fists and guard stay out of it', () => {
    const w = world();
    w.ctx.game.state.inventory.hunting_bow = 1;
    w.ctx.game.dispatch({ t: 'equipWeapon', item: 'hunting_bow' });
    w.hero.syncEquipment(w.ctx.game);
    expect(w.hero.bowAiming).toBe(false);
    w.hero.setBowAim({ x: 1, y: 0, z: 0 }, 0.5);
    expect(w.hero.bowAiming).toBe(true);
    expect(w.hero.yaw).toBeCloseTo(Math.PI / 2, 6);
    w.press('attack'); w.press('heavy'); w.hold('block'); w.hold('sprint');
    w.steer(0, 1);
    w.tick(2);
    expect([w.hero.state, w.hero.blocking, w.hero.stamina]).toEqual(['free', false, STAMINA_MAX]);
    expect(w.hero.lastMoveSpeed).toBeCloseTo(HERO_GUARD_SPEED, 2);
    expect(w.hero.yaw).toBeCloseTo(Math.PI / 2, 6); // still facing the aim, walking another way
    expect(Math.abs(w.hero.now.heading)).toBeCloseTo(Math.PI / 2, 1);
    w.hero.setBowAim({ x: 0, y: 0, z: 0 });
    expect(w.hero.bowAiming).toBe(false); // no direction is no aim
    w.hero.setBowAim({ x: 1, y: 0, z: 0 });
    w.ctx.game.dispatch({ t: 'equipWeapon', item: null });
    w.tick();
    expect(w.hero.bowAiming).toBe(false);
    expect(w.hero.told.filter((t) => t.startsWith('bow:'))).toEqual(['bow:true', 'bow:false']);
    expect(w.hero.told).toContain('aim');
  });

  it('walks to the deer’s side, swings up, rides at its pace leaning into the turn, and steps down beside it', () => {
    const w = world(), deer = { x: 3, y: 0, z: 0, yaw: 0 }, seat = 1.1;
    expect(w.hero.beginMount('deer', seat, deer, w.ctx)).toBe(true);
    expect(w.hero.mountMove!.kind).toBe('approach');
    w.steer(1, 0); // the controls wait until he is up
    for (let i = 0; i < 600 && w.hero.mountMove?.kind === 'approach'; i++) w.tick();
    expect(w.hero.mountMove!.kind).toBe('swing');
    expect(Math.hypot(w.hero.x - (deer.x - MOUNT_SIDE), w.hero.z - deer.z)).toBeLessThan(0.1); // the nearer side
    w.tick(MOUNT_TIMES.swing / 2);
    expect(w.hero.now.mountSwing).toBeGreaterThan(0.3);
    expect(w.hero.now.mountSwing).toBeLessThan(0.8);
    expect([w.hero.stance, w.hero.now.straddle]).toEqual(['sit', true]);
    w.steer(0, 0);
    w.tick(MOUNT_TIMES.swing / 2 + 0.05);
    expect(w.hero.mount).toEqual({ id: 'deer', seat });
    expect([w.hero.x, w.hero.z, w.hero.yaw]).toEqual([deer.x, deer.z, deer.yaw]);

    w.steer(0, 1);
    w.tick(3);
    expect(w.hero.rideSpeed).toBeCloseTo(RIDE.walk, 1);
    expect(w.hero.z).toBeGreaterThan(3);
    expect(w.hero.now.seat).toBeGreaterThanOrEqual(seat);
    expect(w.hero.now.seat).toBeLessThan(seat + 0.2);
    expect(w.hero.stance).toBe('sit');
    w.press('attack'); w.press('jump');
    w.tick();
    expect([w.hero.state, w.hero.grounded]).toEqual(['free', true]); // no blow and no jump from the saddle
    w.steer(1, 1);
    w.tick(0.5);
    expect(Math.abs(w.hero.now.lean)).toBeGreaterThan(0.01);
    expect(Math.abs(w.hero.now.lean)).toBeLessThanOrEqual(RIDE.leanMax + 1e-9);

    w.steer(0, 0);
    w.tick(2);
    const stood = { x: w.hero.x, z: w.hero.z };
    expect(w.hero.beginDismount(w.ctx)).toBe(true);
    w.tick(MOUNT_TIMES.descend + 0.1);
    expect([w.hero.mount, w.hero.mountMove, w.hero.grounded]).toEqual([null, null, true]);
    expect(Math.hypot(w.hero.x - stood.x, w.hero.z - stood.z)).toBeCloseTo(MOUNT_SIDE, 2);
    expect(w.hero.now.seat).toBe(0);
  });
});
