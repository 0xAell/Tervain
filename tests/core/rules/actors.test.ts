import { beforeAll, describe, expect, it } from 'vitest';
import { NPCS } from '../../../src/core/content/npcs';
import { ENEMY_ARCHETYPES } from '../../../src/core/content/enemies';
import { createInitialState } from '../../../src/core/game/state';
import { HostileActor, lerpAngle, type HostileContext, type HostileMode, type HostileState } from '../../../src/core/rules/hostileActor';
import {
  fightingFoes, finishNpcPath, NPC_ALARM_REACH, NPC_WALK_SPEED, npcGoalPosition, ResidentWalker, turnToward, type NpcPlace, type ResidentContext, type ResidentMode, type ResidentStep,
} from '../../../src/core/rules/residentWalk';
import { RESIDENT } from '../../../src/core/rules/resident';
import { resolveGoal } from '../../../src/core/rules/schedule';
import { buildStaticColliders, type Colliders } from '../../../src/core/world/colliders';
import { ENEMY_SPAWNS } from '../../../src/core/world/layout';
import { NavGrid } from '../../../src/core/world/nav';
import { Terrain } from '../../../src/core/world/terrain';

// A resident's day and a hostile's fight are decided in the core: these run them on the core alone, with a body that
// is nothing but a height. No renderer, no rig, no scene.

/** A resident with the plainest of bodies, who records what whoever draws them would be told. */
class Walker extends ResidentWalker {
  readonly steps: ResidentStep[] = [];
  shownAs: boolean | null = null;
  placements = 0;
  jumps = 0;
  protected get height(): number { return this.def.look.height * 1.8; }
  protected override bodyShown(visible: boolean): void { this.shownAs = visible; }
  protected override bodyPlaced(): void { this.placements++; }
  protected override bodyJumped(): void { this.jumps++; }
  protected override present(step: ResidentStep): void { this.steps.push(step); }
}

/** A hostile with the plainest of bodies. */
class Hostile extends HostileActor {
  readonly modes: HostileMode[] = [];
  readonly flashes: number[] = [];
  protected get height(): number { return 1.8; }
  protected override bodyStruck(strength: number): void { this.flashes.push(strength); }
  protected override present(_ctx: HostileContext, mode: HostileMode): void { this.modes.push(mode); }
}

let terrain: Terrain, colliders: Colliders, nav: NavGrid;
beforeAll(() => { terrain = new Terrain(); colliders = buildStaticColliders(terrain); nav = new NavGrid(terrain, colliders); }, 120_000);

const context = (hour: number, over: Partial<ResidentContext> = {}): ResidentContext => ({
  terrain, colliders, nav, state: createInitialState(), hour, player: { x: -500, y: 0, z: -500 }, reducedMotion: false, onBark: () => false, ...over,
});

describe('a resident’s day, on the core alone', () => {
  it('stands at their place for the hour when the world is loaded, and the body is told', () => {
    const baker = new Walker(NPCS.village_baker), ctx = context(12);
    baker.snapToGoal(ctx);
    const goal = resolveGoal(NPCS.village_baker, ctx.state, 12), place = npcGoalPosition(NPCS.village_baker, goal, ctx, 0.96 * 1.8);
    expect(Math.hypot(baker.x - place.x, baker.z - place.z)).toBeLessThan(0.7);
    expect(baker.hidden).toBe(false);
    expect([baker.shownAs, baker.placements, baker.jumps]).toEqual([true, 1, 1]);
  });

  it('walks from one place of their schedule to the next at a walking pace, turning as they go, and settles', () => {
    // The baker: selling at her door by day, then off to the well to talk in the evening.
    const hand = new Walker(NPCS.village_baker);
    const ctx = context(12);
    hand.snapToGoal(ctx);
    const start = { x: hand.x, z: hand.z };
    ctx.hour = 17.5;
    const goal = resolveGoal(NPCS.village_baker, ctx.state, ctx.hour), place: NpcPlace = npcGoalPosition(NPCS.village_baker, goal, ctx, NPCS.village_baker.look.height * 1.8);
    expect([goal.anchor, goal.activity]).toEqual(['village_well', 'talk']);
    let walked = 0, fastest = 0, modes = new Set<ResidentMode>();
    for (let frame = 0; frame < 12000; frame++) {
      const before = { x: hand.x, z: hand.z };
      hand.update(0.05, ctx);
      const moved = Math.hypot(hand.x - before.x, hand.z - before.z);
      walked += moved; fastest = Math.max(fastest, moved / 0.05); modes.add(hand.mode);
      if (!hand.underway && Math.hypot(hand.x - place.x, hand.z - place.z) < 0.2 && hand.mode !== 'walk') break;
    }
    expect(Math.hypot(place.x - start.x, place.z - start.z)).toBeGreaterThan(3);
    expect(Math.hypot(hand.x - place.x, hand.z - place.z)).toBeLessThan(0.2);
    expect(walked).toBeGreaterThanOrEqual(Math.hypot(place.x - start.x, place.z - start.z) - 0.3);
    // Never faster than a walk, and what a body is told each step is what was done.
    expect(fastest).toBeLessThanOrEqual(NPC_WALK_SPEED + 1e-6);
    expect(modes.has('walk')).toBe(true);
    expect(hand.steps.some((step) => step.mode === 'walk' && step.gait > 0)).toBe(true);
    expect(hand.steps.at(-1)!.mode).not.toBe('walk');
    const gait = hand.steps.reduce((sum, step) => sum + step.gait, 0);
    expect(gait).toBeGreaterThanOrEqual(walked - 1e-6);
  });

  it('is out of sight and meets nobody while their schedule has them away or their body has not come', () => {
    const state = createInitialState();
    const away = Object.values(NPCS).find((def) => !state.npcs[def.id].available);
    if (away) {
      const walker = new Walker(away);
      walker.update(0.05, context(12, { state }));
      expect([walker.hidden, walker.shownAs, walker.interactable, walker.solid]).toEqual([true, false, false, false]);
    }
    const waiting = new Walker(NPCS.village_baker, false);
    waiting.snapToGoal(context(12));
    expect([waiting.hidden, waiting.away, waiting.interactable]).toEqual([true, false, false]);
  });

  it('turns no faster than its rate and eases into the heading', () => {
    const quarter = turnToward(0, Math.PI / 2, RESIDENT.turnStanding, 0.1);
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThanOrEqual(RESIDENT.turnStanding * 0.1 + 1e-9);
    let yaw = 0;
    for (let n = 0; n < 200; n++) yaw = turnToward(yaw, Math.PI / 2, RESIDENT.turnStanding, 0.05);
    expect(yaw).toBeCloseTo(Math.PI / 2, 3);
    // The short way round.
    expect(turnToward(3, -3, 10, 0.05)).toBeGreaterThan(3);
  });

  it('finishes a route at the exact place when the last step to it is clear, and wakes sleepers only near a fight', () => {
    const ctx = context(12), goal = resolveGoal(NPCS.village_baker, ctx.state, 12), place = npcGoalPosition(NPCS.village_baker, goal, ctx, 1.7);
    const short = [{ x: place.x + 0.6, z: place.z }];
    const finished = finishNpcPath(short, place, ctx, 1.7)!;
    expect(finished.length === 1 || (finished.at(-1)!.x === place.x && finished.at(-1)!.z === place.z)).toBe(true);
    expect(finishNpcPath(null, place, ctx, 1.7)).toBeNull();
    expect(finishNpcPath([{ x: place.x + 40, z: place.z }], place, ctx, 1.7)).toHaveLength(1);
    expect(NPC_ALARM_REACH).toBe(RESIDENT.alarmReach);
  });
});

describe('a hostile’s fight, on the core alone', () => {
  const spawn = ENEMY_SPAWNS.find((entry) => entry.kind === 'bandit')!, archetype = ENEMY_ARCHETYPES.bandit;
  const fight = (player: { x: number; z: number }, over: Partial<HostileContext> = {}) => {
    const blows: [number, boolean][] = [], growls: string[] = [];
    const ctx: HostileContext = { terrain, colliders, nav, player: { x: player.x, z: player.z, y: terrain.groundAt(player.x, player.z), alive: true, invulnerable: false }, reducedMotion: false, time: 0,
      strikePlayer: (_hostile, damage, heavy) => { blows.push([damage, heavy]); }, onGrowl: (hostile) => { growls.push(hostile.id); }, ...over };
    return { ctx, blows, growls };
  };

  it('keeps its post while nobody is near', () => {
    const hostile = new Hostile(spawn), { ctx, growls } = fight({ x: spawn.x + 80, z: spawn.z });
    for (let frame = 0; frame < 200; frame++) hostile.update(0.05, ctx);
    expect(hostile.state).toBe<HostileState>('idle');
    expect(growls).toEqual([]);
    expect(Math.hypot(hostile.x - spawn.x, hostile.z - spawn.z)).toBeLessThan(0.01);
    expect(hostile.modes.every((mode) => mode === 'idle')).toBe(true);
  });

  it('notices, warns, closes, winds up and strikes someone who stands in reach', () => {
    const hostile = new Hostile(spawn), { ctx, blows, growls } = fight({ x: spawn.x + 3, z: spawn.z });
    hostile.yaw = Math.PI / 2;
    const states: HostileState[] = [];
    for (let frame = 0; frame < 400 && blows.length === 0; frame++) {
      hostile.update(0.02, ctx);
      if (states.at(-1) !== hostile.state) states.push(hostile.state);
    }
    expect(growls).toEqual([spawn.id]);
    expect(states.slice(0, 4)).toEqual(['alert', 'chase', 'telegraph', 'strike']);
    expect(blows).toEqual([[archetype.damage, archetype.heavy]]);
    expect(hostile.engaged).toBe(true);
    expect(hostile.telegraphing).toBe(false);
    expect(hostile.modes).toContain('telegraph');
    expect(hostile.modes).toContain('strike');
  });

  it('staggers under a heavy blow, dies when its health is gone, and fades', () => {
    const hostile = new Hostile(spawn), { ctx } = fight({ x: spawn.x + 2, z: spawn.z });
    expect(hostile.takeHit(5, true, spawn.x + 2, spawn.z)).toBe(false);
    expect(hostile.state).toBe('stagger');
    expect(hostile.flashes).toEqual([1]);
    hostile.parried(spawn.x + 2, spawn.z);
    expect(hostile.flashes).toEqual([1, 0.5]);
    expect(hostile.takeHit(archetype.hp, false, spawn.x + 2, spawn.z)).toBe(true);
    expect([hostile.state, hostile.alive]).toEqual(['dead', false]);
    for (let frame = 0; frame < 200; frame++) hostile.update(0.05, ctx);
    expect(hostile.fade).toBe(0);
    expect(hostile.modes.at(-1)).toBe('dead');
    // Dead, a blow does nothing more.
    expect(hostile.takeHit(10, false, 0, 0)).toBe(false);
  });

  it('gives up beyond its leash, walks home and is whole again', () => {
    const hostile = new Hostile(spawn), near = fight({ x: spawn.x + 3, z: spawn.z });
    hostile.yaw = Math.PI / 2;
    for (let frame = 0; frame < 60; frame++) hostile.update(0.02, near.ctx);
    hostile.takeHit(10, false, spawn.x + 3, spawn.z);
    const far = fight({ x: spawn.x + 200, z: spawn.z });
    for (let frame = 0; frame < 3000 && hostile.state !== 'idle'; frame++) hostile.update(0.05, far.ctx);
    expect(hostile.state).toBe('idle');
    expect(hostile.engaged).toBe(false);
    expect(Math.hypot(hostile.x - spawn.x, hostile.z - spawn.z)).toBeLessThan(1);
    expect(hostile.hp).toBeGreaterThan(archetype.hp - 10);
    hostile.reset({ terrain });
    expect([hostile.hp, hostile.x, hostile.z]).toEqual([archetype.hp, spawn.x, spawn.z]);
  });

  it('keeps its fight through a rebuild of the world: health, place, heading and what it is doing', () => {
    const hostile = new Hostile(spawn), { ctx } = fight({ x: spawn.x + 3, z: spawn.z });
    hostile.yaw = Math.PI / 2;
    for (let frame = 0; frame < 60; frame++) hostile.update(0.02, ctx);
    hostile.takeHit(archetype.hp - 6, false, spawn.x + 3, spawn.z);
    for (let frame = 0; frame < 20; frame++) hostile.update(0.02, ctx);
    const moment = hostile.moment();
    expect(moment.hp).toBe(6);
    expect(moment.engaged).toBe(true);
    // The rebuilt world makes the hostile again and restores it from the saved journey, whole at its post; then it resumes.
    const rebuilt = new Hostile(spawn);
    rebuilt.restore(false);
    rebuilt.resume(moment);
    expect(rebuilt.moment()).toEqual(moment);
    expect([rebuilt.hp, rebuilt.state, rebuilt.engaged]).toEqual([6, moment.state, true]);
    // A hostile the journey records as defeated stays fallen.
    const fallen = new Hostile(spawn);
    fallen.restore(true);
    fallen.resume(moment);
    expect([fallen.state, fallen.alive]).toEqual(['dead', false]);
  });

  it('turns from one heading toward another the short way round', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(3 + (2 * Math.PI - 6) / 2, 9);
    expect(lerpAngle(1, 1, 0.3)).toBe(1);
  });
});

describe('a fight that wakes sleepers', () => {
  it('is wherever a living hostile has engaged someone', () => {
    expect(fightingFoes([
      { alive: true, engaged: true, x: 1, z: 2 }, { alive: true, engaged: false, x: 3, z: 4 },
      { alive: false, engaged: true, x: 5, z: 6 }, { alive: true, engaged: true, x: 7, z: 8 },
    ])).toEqual([{ x: 1, z: 2 }, { x: 7, z: 8 }]);
    expect(fightingFoes([])).toEqual([]);
  });
});
