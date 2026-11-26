import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game/game';
import { normalizeHuntTally, quiverCapacity } from '../../src/core/game/hunting';
import { reviveState } from '../../src/core/game/revive';
import { ALLOCATIONS } from '../../src/core/game/types';
import { fordPatrol, journeyLead } from '../../src/core/game/valeJourney';
import { bladeDamage, wears } from '../../src/core/rules/valeCombat';
import { WAGON_TALLY } from '../../src/core/world/layout';
import { followAxis } from '../../src/isometric/camera';
import { facadeOpening } from '../../src/isometric/architecture';
import { sites, sitesById } from '../../src/isometric/doorways';
import { houseStyle } from '../../src/isometric/houseStyles';
import { floorPlan } from '../../src/isometric/roomPlans';
import { enemyContactRemaining, meleeWarning, PARRY_WINDOW } from '../../src/isometric/fieldcraft';
import { Valley } from '../../src/isometric/simulation';

function encounter(kind: 'skirmisher' | 'deserter', distance: number) {
  const valley = new Valley(new Game());
  const enemy = valley.actors.find(a => a.enemyKind === kind)!;
  const home = { x: -175 + distance, z: 18 };
  Object.assign(enemy, home, { home, timer: 0, guardYaw: -Math.PI / 2 });
  valley.game.setPlayerTransform(-175, 0, 18, Math.PI / 2);
  Object.assign(valley.game.state.inventory, { rusted_sword: 1, hunting_bow: 1, arrow: 6 });
  valley.game.state.equippedWeapon = 'rusted_sword';
  return { valley, enemy };
}
function frames(v: Valley, count: number) {
  for (let i = 0; i < count; i++) v.step(1 / 60, 0, 0, false);
}

describe('the Bell Road', () => {
  it('follows a moving subject along the same path across uneven monitor frames', () => {
    const trace = (intervals: number[]) => {
      let t = 0, position = 0;
      for (const dt of intervals) {
        position = followAxis(position,t*60,(t+dt)*60,dt,18);
        t += dt;
      }
      return position;
    };
    const sixty = trace(Array(60).fill(1/60));
    expect(trace(Array(120).fill(1/120))).toBeCloseTo(sixty,9);
    expect(trace(Array.from({length:60},(_,i) => i%2 ? 1/40 : 1/120))).toBeCloseTo(sixty,9);
    expect(followAxis(sixty,60,60,0,18)).toBe(sixty);
  });
  it('sizes doors against one traveller and gives all six village workshops distinct geometry', () => {
    for (const site of sites) {
      const door = facadeOpening(site);
      expect(door.height / 34).toBeGreaterThan(1);
      expect(door.height / 34).toBeLessThan(1.25);
      expect(door.half).toBe(site.kind === 'shrine' ? 11 : 8);
    }
    const houses = 'abcdef'.split('').map(letter => sitesById.get('house_' + letter)!);
    expect(new Set(houses.map(b => houseStyle(b.id).motif)).size).toBe(6);
    for (const level of ['ground', 'loft', 'cellar'] as const) {
      const geometry = houses.map(b => floorPlan(b, level).rooms.map(r => [r.x0,r.z0,r.x1,r.z1]));
      expect(new Set(geometry.map(p => JSON.stringify(p))).size).toBe(6);
    }
  });

  it('tracks an empty-handed arrival, a player who went inland early, and three distinct outcomes', () => {
    const s = new Game().state;
    expect(journeyLead(s).action).toContain('broken hull');
    s.facts.saw_arrival_wreckage = true;
    expect(journeyLead(s).action).toContain('blade');
    const beachX = s.player.x;
    s.player.x = 106;
    expect(journeyLead(s).action).toContain('dry channel');
    s.player.x = beachX;
    s.discovered.ford = true;
    expect(journeyLead(s).action).toContain('dry channel');
    s.quest.gate = 'stabilized';
    expect(journeyLead(s).action).toContain('allocation');
    s.quest.phase = 'committed';
    expect(journeyLead(s).reason).toContain('minutes');
    s.quest.phase = 'settled';
    const endings = ALLOCATIONS.map(a => {
      s.quest.allocation = a;
      expect(journeyLead(s).at).toBeUndefined();
      return journeyLead(s).reason;
    });
    expect(new Set(endings).size).toBe(3);
  });

  it('requires materials and the wagon, refuses repeat work, and restores real equipment effects', () => {
    const g = new Game(), dispatch = g.dispatch.bind(g);
    Object.assign(g.state.inventory, { rusted_sword: 1, hunting_bow: 1, arrow: 40, animal_hide: 2, iron_scrap: 1, contract_band: 1 });
    expect(dispatch({ t: 'lineQuiver' }).ok).toBe(false);
    g.setPlayerTransform(WAGON_TALLY.x,0,WAGON_TALLY.z,0);
    expect(dispatch({ t: 'lineQuiver' }).ok).toBe(true);
    expect(dispatch({ t: 'lineQuiver' }).ok).toBe(false);
    expect(g.state.inventory.animal_hide).toBe(1);
    expect(quiverCapacity(g.state)).toBe(56);
    const base = bladeDamage(g.state, 'thrust');
    expect(dispatch({ t: 'sharpenBlade' }).ok).toBe(true);
    expect(dispatch({ t: 'sharpenBlade' }).ok).toBe(false);
    expect(bladeDamage(g.state, 'thrust')).toBe(base + 4);
    expect(dispatch({ t: 'wearCharm', item: 'league_sash' }).ok).toBe(false);
    expect(dispatch({ t: 'wearCharm', item: 'contract_band' }).ok).toBe(true);
    expect(bladeDamage(g.state, 'thrust')).toBe(Math.round((base+4)*1.15));
    expect(bladeDamage(g.state, 'attack', false)).toBe(8);
    g.state.inventory.arrow = 53;
    const restored = reviveState(g.state)!;
    expect(restored.inventory.arrow).toBe(53);
    expect(wears(restored, 'contract_band')).toBe(true);
    delete restored.inventory.contract_band;
    expect(wears(reviveState(restored)!, 'contract_band')).toBe(false);
    delete restored.facts.quiver_lined;
    expect(reviveState(restored)!.inventory.arrow).toBe(40);
    expect(normalizeHuntTally({ species: { tiger: 2, highland_wolf: 1, lion: 1 } })).toEqual({ taken: 4, species: { highland_wolf: 3, hill_boar: 1 } });
  });

  it('pays the optional ford contract once after all three posts are clear', () => {
    const g = new Game();
    g.setPlayerTransform(WAGON_TALLY.x,0,WAGON_TALLY.z,0);
    for (const id of ['ford_bandit_a','ford_bandit_b'] as const) g.dispatch({ t: 'defeat', id });
    expect(g.dispatch({ t: 'collectFordWage' }).ok).toBe(false);
    g.dispatch({ t: 'defeat', id: 'ford_lookout' });
    expect(fordPatrol(g.state)).toMatchObject({ complete: true, paid: false });
    const coins = g.state.inventory.coin ?? 0, bread = g.state.inventory.bread ?? 0;
    expect(g.dispatch({ t: 'collectFordWage' }).ok).toBe(true);
    expect(g.dispatch({ t: 'collectFordWage' }).ok).toBe(false);
    expect(g.state.inventory).toMatchObject({ coin: coins + 6, bread: bread + 1 });
    expect(fordPatrol(reviveState(g.state)!).paid).toBe(true);
  });

  it.each([30, 60, 120])('opens the visible parry cue on the same frame as a successful guard at %i Hz', hz => {
    for (const cord of [false, true]) for (const heavy of [false, true]) {
      const threshold = PARRY_WINDOW + (cord ? 0.04 : 0);
      for (const [untilImpact, ready] of [[threshold, true], [threshold + 0.002, false]] as const) {
        const valley = new Valley(new Game());
        const enemy = valley.actors.find(a => a.key === (heavy ? 'thornback' : 'bandit') && a.enemy)!;
        if (cord) {
          valley.game.state.inventory.witness_cord = 1;
          valley.game.dispatch({ t: 'wearCharm', item: 'witness_cord' });
        }
        valley.game.state.equippedWeapon = 'rusted_sword';
        valley.game.setPlayerTransform(-175, 0, 18, Math.PI / 2);
        const home = { x: -173.4, z: 18 };
        const contact = enemyContactRemaining(heavy);
        Object.assign(enemy, home, { home, timer: 10, attack: contact + untilImpact });
        expect(meleeWarning(enemy.attack, heavy, valley.parryWindow)).toMatchObject({ visible: true, ready });
        expect(meleeWarning(contact, heavy, valley.parryWindow)).toMatchObject({ visible: false, ready: false });
        valley.guard = true;
        for (let i = 0; i < Math.ceil(untilImpact * hz) + 1; i++) valley.step(1/hz, 0, 0, false);
        expect(valley.contacts.at(-1)?.kind).toBe(ready ? 'parry' : 'guard');
      }
    }
  });

  it('interrupts a committed archer with a focused countershot and bypasses a shield from behind', () => {
    const { valley, enemy } = encounter('skirmisher', 9);
    enemy.timer = 1.4;
    valley.game.state.equippedWeapon = 'hunting_bow';
    valley.startAttack(enemy);
    frames(valley, 86);
    expect(valley.bowFocus).toBe(1);
    expect(enemy.aimed?.owner).toBe(enemy.enemy);
    const hp = enemy.health;
    valley.releaseAttack();
    frames(valley, 24);
    expect(enemy.health).toBe(hp - 43);
    expect(enemy.aimed).toBeUndefined();
    expect(valley.arrows.some(a => a.owner)).toBe(false);

    const flank = encounter('deserter', 1.7);
    flank.enemy.guardYaw = Math.PI / 2;
    flank.enemy.timer = 6;
    flank.valley.startAttack(flank.enemy);
    frames(flank.valley, 26);
    expect(flank.valley.contacts.at(-1)).toMatchObject({ kind: 'blade', damage: 29 });
  });

  it('keeps a nearby duellist outlined when a second opponent draws at range', () => {
    const v = new Valley(new Game());
    const beast = v.actors.find(a => a.enemy === 'cut_creature')!;
    v.game.setPlayerTransform(beast.home.x-2.26,0,beast.home.z+0.22,Math.PI/2);
    beast.timer=1; frames(v,1);
    expect(v.combatTarget?.enemy).toBe('cut_creature');
  });

  it('locks a real arrow trajectory and lets a sideways dodge evade it', () => {
    for (const evade of [false,true]) {
      const { valley, enemy } = encounter('skirmisher',9);
      frames(valley,1);
      expect(enemy.aimed?.owner).toBe(enemy.enemy);
      const heading = { ...enemy.aimed!.direction };
      frames(valley,32);
      if (evade) expect(valley.requestDash(0,1)).toBe(true);
      expect(enemy.aimed!.direction).toEqual(heading);
      frames(valley,45);
      expect(valley.player.health).toBe(evade ? 100 : 87);
    }
  });

  it('catches a frontal cut and opens the shield to a fully drawn shot', () => {
    const { valley, enemy } = encounter('deserter',1.7);
    const hp = enemy.health;
    enemy.timer = 6;
    valley.startAttack(enemy); frames(valley,28);
    expect(valley.contacts.some(c => c.kind === 'guard')).toBe(true);
    expect(enemy.health).toBe(hp);
    frames(valley,22);
    valley.game.state.equippedWeapon = 'hunting_bow';
    valley.startAttack(enemy); frames(valley,85);
    expect(valley.bowFocus).toBe(1);
    valley.releaseAttack(); frames(valley,5);
    expect(enemy.health).toBe(hp-43);
    expect(enemy.openedUntil).toBeGreaterThan(valley.time);
  });

  it('changes stamina recovery with the sash and bow focus time with the cord', () => {
    const run = (item?: 'league_sash' | 'witness_cord') => {
      const { valley, enemy } = encounter('deserter',23);
      if (item) {
        valley.game.state.inventory[item] = 1;
        expect(valley.game.dispatch({t:'wearCharm',item}).ok).toBe(true);
      }
      valley.stamina = 20;
      frames(valley,35);
      const stamina = valley.stamina;
      valley.game.state.equippedWeapon = 'hunting_bow';
      valley.startAttack(enemy);
      let n = 0;
      while (valley.bowFocus < 1 && n++ < 120) frames(valley,1);
      return { stamina, frames:n };
    };
    const normal = run();
    expect(run('league_sash').stamina).toBeGreaterThan(normal.stamina);
    expect(run('witness_cord').frames).toBeLessThan(normal.frames);
  });
});
