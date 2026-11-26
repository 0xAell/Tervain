import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heroPose } from '../../src/isometric/heroPose';
import type { Atlas } from '../../src/isometric/atlas';
import { Game } from '../../src/core/game/game';
import { reviveState } from '../../src/core/game/revive';
import { buildJournal } from '../../src/core/game/journal';
import { COOKFIRES, WAGON_TALLY } from '../../src/core/world/layout';
import { doorsById } from '../../src/isometric/doorways';
import { ARROW_RANGE, ARROW_SPEED, DRAW_TIME, RELEASE_TIME, arrowHeight, firstContact, type FieldSound } from '../../src/isometric/fieldcraft';
import { Valley } from '../../src/isometric/simulation';

function advance(v: Valley, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) v.step(1 / 60, 0, 0, false);
}
function ranger() {
  const v = new Valley(new Game());
  v.game.setPlayerTransform(-175, 0, 18, Math.PI / 2);
  Object.assign(v.game.state.inventory, { hunting_bow: 1, arrow: 5, skinning_knife: 1 });
  v.game.state.equippedWeapon = 'hunting_bow';
  return v;
}
describe('ranger fieldcraft', () => {
  it('poses all eight aim directions from editable PixelLab cels and clamps the held and released poses', () => {
    const frames = JSON.parse(
      readFileSync(new URL('../../public/vale/sprites.json', import.meta.url), 'utf8')
    ).frames as Record<string, number[][]>;
    const atlas = {
      has: (k: string) => k in frames,
      frameCount: (k: string) => frames[k]?.length ?? 0,
    } as Atlas;
    const v = ranger();
    for (const face of [
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
      'north-west',
    ]) {
      v.facing = face;
      v.bow = undefined;
      for (const state of ['ready', 'draw', 'hold', 'loose'] as const) {
        if (state !== 'ready')
          v.bow = {
            phase: state,
            elapsed: state === 'hold' ? 10 : 0.1,
            released: false,
            direction: { x: 0, z: 1 },
          };
        const pose = heroPose(v, atlas, 38);
        expect(pose.key).toBe(
          'hero-' + face.replace('west', 'east') + '--' + (state === 'hold' ? 'aim' : state)
        );
        expect(!!frames[pose.key]?.[pose.frame]).toBe(true);
        expect(pose.flip).toBe(face.includes('west'));
        if (state === 'draw' || state === 'loose')
          expect(new Set(frames[pose.key]!.map(String)).size).toBeGreaterThan(2);
      }
    }
    for (const face of ['north-east', 'south-east'])
      for (const k of ['pet', 'stir', 'sit', 'gather', 'read', 'work', 'dress']) {
        expect(new Set(frames['hero-' + face + '--' + k]!.map(String)).size, face + ' ' + k).toBeGreaterThan(
          1
        );
      }
  });
  it('holds an aimed pose indefinitely, releases once and resolves the shot in flight', () => {
    const v = ranger(),
      a = v.actors.find((a) => a.id === 'boar-a')!;
    Object.assign(a, { x: -164, z: 18, home: { x: -164, z: 18 } });
    a.home = { x: a.x, z: a.z };
    v.startAttack(a);
    advance(v, DRAW_TIME + 1);
    expect(v.bow?.phase).toBe('hold');
    expect(v.game.state.inventory.arrow).toBe(5);
    expect(v.game.state.hunting['boar-a']).toBeUndefined();
    v.aimDirection(a.x - v.player.x, a.z - v.player.z);
    v.releaseAttack();
    v.releaseAttack();
    advance(v, 0.02);
    expect(v.bow?.phase).toBe('loose');
    expect(v.arrows).toHaveLength(1);
    expect(v.game.state.inventory.arrow).toBe(4);
    expect(v.game.state.hunting['boar-a']).toBeUndefined();
    advance(v, 0.65);
    expect(v.game.state.hunting['boar-a']?.status).toBe('injured');
    expect(v.arrows).toHaveLength(0);
    expect(v.bow).toBeUndefined();
  });
  it.each([30, 60, 120])('carries the remainder of a quick draw into flight at %i Hz', (hz) => {
    const v = ranger();
    v.actors.length = 0;
    v.attack({ x: -160, z: 18 });
    const seconds = 0.5;
    for (let frame = 0; frame < seconds * hz; frame++) v.step(1 / hz, 0, 0, false);
    expect(v.arrows[0]!.travelled).toBeCloseTo((seconds - DRAW_TIME) * ARROW_SPEED, 8);
    expect(v.bow?.elapsed).toBeCloseTo(seconds - DRAW_TIME, 8);
    expect(v.bowGuide()).toBeUndefined();
  });

  it('ends the guide at the first actor on the ray and resolves the hit at the same bow height', () => {
    const v = ranger();
    const target = v.actors.find((actor) => actor.key === 'bandit')!;
    const position = { x: -165, z: 18 };
    Object.assign(target, position, { home: position, attack: 2, timer: 10 });
    v.startAttack({ x: -154, z: 18 });
    advance(v, DRAW_TIME + 0.05);
    const guide = v.bowGuide()!;
    expect(guide.distance).toBeCloseTo(10 - Math.max(0.55, target.width / 35));
    v.releaseAttack();
    advance(v, 0.28);
    const hit = v.contacts.find((contact) => contact.actorId === target.id)!;
    expect(hit.x).toBeCloseTo(guide.arrow.x + guide.distance, 7);
    expect(hit.height).toBeCloseTo(arrowHeight(guide.arrow, guide.distance), 7);
  });

  it('traces the same wall point for the draw guide, the arrowhead and the impact cue', () => {
    const v = ranger();
    v.actors.length = 0;
    const site = doorsById.get('house_a/front')!.site;
    const cues: FieldSound[] = [];
    v.onFieldSound = (cue) => cues.push(cue);
    v.game.setPlayerTransform(site.x - 7, 0, site.z, Math.PI / 2);
    v.startAttack({ x: site.x + 15, z: site.z });
    advance(v, DRAW_TIME + 0.1);
    const guide = v.bowGuide()!;
    expect(guide.distance).toBeGreaterThan(0);
    expect(guide.distance).toBeLessThan(7);
    expect(cues).toEqual(['bow_draw']);
    v.releaseAttack();
    for (let i = 0; i < 90 && !v.contacts.length; i++) v.step(1 / 90, 0, 0, false);
    const hit = v.contacts[0]!;
    expect(hit.kind).toBe('earth');
    expect(Math.abs(hit.x - (guide.arrow.x + guide.distance))).toBeLessThan(0.01);
    expect(hit.z).toBeCloseTo(guide.arrow.z);
    expect(Math.abs(hit.height - arrowHeight(guide.arrow, guide.distance))).toBeLessThan(0.01);
    expect(cues).toEqual(['bow_draw', 'bow_release', 'arrow_ground']);
  });

  it('lets a shot disappear at its range limit without a false impact on open air', () => {
    const v = ranger();
    const cues: FieldSound[] = [];
    v.onFieldSound = (cue) => cues.push(cue);
    v.arrows.push({ x: -480, z: 0, travelled: 0, launchHeight: 4, grade: 0, direction: { x: 0, z: 1 } });
    advance(v, ARROW_RANGE / ARROW_SPEED + 0.05);
    expect(v.arrows).toHaveLength(0);
    expect(v.contacts).toHaveLength(0);
    expect(cues).toEqual([]);
  });

  it('quick shots follow the aimed line, and cancelling a draw or starting with an empty quiver spends nothing', () => {
    const v = ranger(),
      a = v.actors.find((a) => a.id === 'stag')!;
    Object.assign(a, { x: -186, z: 18, home: { x: -186, z: 18 } });
    v.startAttack(a);
    advance(v, 0.11);
    v.cancelPose();
    advance(v, 1);
    expect(v.game.state.inventory.arrow).toBe(5);
    v.attack({ x: -130, z: 18 });
    advance(v, DRAW_TIME + RELEASE_TIME + 1.3);
    expect(v.game.state.inventory.arrow).toBe(4);
    expect(v.game.state.hunting.stag).toBeUndefined();
    v.game.state.inventory.arrow = 0;
    v.attack(a);
    advance(v, 0.65);
    expect(v.bow).toBeUndefined();
    expect(v.arrows).toHaveLength(0);
    expect(firstContact({ x: 0, z: 0 }, { x: 1, z: 0 }, 4, { x: 2, z: 1.1 }, 1)).toBe(Infinity);
  });
  it('stops shots at house walls and leaves companions unharmed', () => {
    const v = ranger(),
      dog = v.actors.find((a) => a.id === 'dog-a')!;
    Object.assign(dog, { x: -168, z: 18, home: { x: -168, z: 18 } });
    v.attack(dog);
    advance(v, 2);
    expect(v.game.state.hunting['dog-a']).toBeUndefined();
    const site = doorsById.get('house_a/front')!.site;
    v.game.setPlayerTransform(site.x - 7, 0, site.z, Math.PI / 2);
    const stag = v.actors.find((a) => a.id === 'stag')!;
    Object.assign(stag, { x: site.x + 15, z: site.z, home: { x: site.x + 15, z: site.z } });
    v.startAttack(stag, stag.id);
    v.releaseAttack();
    advance(v, 2);
    expect(v.game.state.hunting.stag).toBeUndefined();
    expect(v.arrows).toHaveLength(0);
  });
  it('pets all village cats and dogs and releases their reaction when the player moves', () => {
    const v = new Valley(new Game()),
      pets = v.targets().filter((t) => t.field === 'pet');
    expect(pets.map((p) => p.animal?.id).sort()).toEqual(['cat-a', 'cat-b', 'cat-c', 'dog-a', 'dog-b']);
    for (const t of pets) {
      v.game.setPlayerTransform(t.approach.x, 0, t.approach.z, 0);
      v.interactField(t);
      expect(v.activity?.kind).toBe('pet');
      const a = t.animal!,
        before = [a.x, a.z];
      advance(v, 0.33);
      expect([a.x, a.z]).toEqual(before);
      v.step(0.04, 1, 0, false);
      expect(v.activity).toBeUndefined();
    }
  });
  it('sits on actual furniture outdoors and indoors, stands on walkable ground, and starts a load standing', () => {
    const v = new Valley(new Game()),
      bench = v.targets().find((t) => t.id === 'bench/square')!;
    v.game.setPlayerTransform(bench.approach.x, 0, bench.approach.z, 0);
    v.interactField(bench);
    advance(v, 2);
    expect(v.activity?.kind).toBe('sit');
    expect(Math.hypot(v.displayPosition.x - bench.at.x, v.displayPosition.z - bench.at.z)).toBeLessThan(0.5);
    v.step(0.02, 1, 0, false);
    expect(v.activity).toBeUndefined();
    v.enterDoor(doorsById.get('house_a/front')!);
    const chair = v.targets().find((t) => t.fixture?.key === 'furniture_chair')!;
    Object.assign(v.position, chair.approach);
    v.interactField(chair);
    advance(v, 0.4);
    expect(v.activity?.kind).toBe('sit');
    const loaded = new Valley(new Game(reviveState(JSON.parse(JSON.stringify(v.game.state)))!));
    expect(loaded.roomKey).toBe(v.roomKey);
    expect(loaded.activity).toBeUndefined();
    expect(loaded.position.x).toBeCloseTo(chair.approach.x);
  });
  it('only removes a gathered mushroom and credits inventory on completion, once per save', () => {
    const v = new Valley(new Game()),
      t = v.targets().find((t) => t.id === 'gather/deepwood_mushroom_a')!;
    v.game.setPlayerTransform(t.approach.x, 0, t.approach.z, 0);
    v.interactField(t);
    advance(v, 0.42);
    expect(v.game.state.inventory.field_mushroom).toBeFalsy();
    v.step(0.02, 1, 0, false);
    advance(v, 1);
    expect(v.targets().some((p) => p.id === t.id)).toBe(true);
    v.interactField(t);
    v.interactField(t);
    advance(v, 1.15);
    expect(v.game.state.inventory.field_mushroom).toBe(1);
    expect(new Valley(new Game(v.game.state)).targets().some((p) => p.id === t.id)).toBe(false);
  });
  it('prepares a portion at either campfire at full health and uses the same recipe at an indoor hearth', () => {
    const v = new Valley(new Game());
    v.game.state.inventory.field_mushroom = 3;
    const pack = { t: 'roomCraft', recipe: 'pack_stew' } as const;
    expect(v.game.dispatch(pack).ok).toBe(false);
    for (const fire of COOKFIRES) {
      v.game.setPlayerTransform(fire.x - 1, 0, fire.z, 0);
      const t = v.targets().find((t) => t.id === 'fire/' + fire.id)!;
      v.perform('stir', t, 2.1, () => v.action(pack));
      advance(v, 0.95);
      expect(v.activity?.kind).toBe('stir');
      advance(v, 1.3);
    }
    expect(v.game.state.inventory.trail_stew).toBe(2);
    v.enterDoor(doorsById.get('house_a/front')!);
    expect(v.game.dispatch(pack).ok).toBe(true);
    expect(v.game.dispatch(pack).ok).toBe(false);
    v.action({ t: 'damagePlayer', amount: 38 });
    const hp = v.player.health;
    v.action({ t: 'useItem', item: 'trail_stew' });
    expect(v.player.health).toBe(hp + 30);
    expect(v.game.state.inventory.trail_stew).toBe(2);
  });
  it('finishes a harvest only beside the downed animal, with the knife and uninterrupted work', () => {
    const v = ranger(),
      a = v.actors.find((a) => a.id === 'boar-a')!,
      position = { x: v.player.x + 1, y: 0, z: v.player.z };
    v.action({ t: 'hitAnimal', hit: { id: 'boar-a', zone: 'head', position, yaw: 0 } });
    advance(v, 0.02);
    const t = v.targets().find((t) => t.animal === a && t.field === 'dress')!;
    v.interactField(t);
    advance(v, 0.8);
    v.step(0.02, 1, 0, false);
    expect(v.skinningActive).toBe(false);
    expect(v.game.state.inventory.raw_meat).toBeFalsy();
    v.interactField(t);
    advance(v, 3.5);
    expect(v.game.state.inventory.raw_meat).toBe(4);
    expect(v.game.state.hunting['boar-a']?.status).toBe('skinned');
    v.interactField(t);
    advance(v, 3.5);
    expect(v.game.state.inventory.raw_meat).toBe(4);
  });
});

describe('the wagoner’s iron order', () => {
  it('pays once for delivered salvage, including after a save and reload', () => {
    const game = new Game();
    game.dispatch({ t: 'setFact', key: 'read_wagon_tally', value: true });
    const iron = { t: 'deliverWagonIron' } as const;
    expect(game.dispatch(iron).ok).toBe(false);
    game.setPlayerTransform(WAGON_TALLY.x, 0, WAGON_TALLY.z, 0);
    expect(game.dispatch(iron).ok).toBe(false);
    expect(buildJournal(game.state).reported.some((e) => e.key === 'journal.wagon.open')).toBe(true);
    game.dispatch({ t: 'pickup', item: 'iron_scrap', pickupId: 'wreck_iron_a', qty: 1 });
    const wages = game.state.inventory.coin ?? 0;
    const trust = game.state.npcs.caravan_master.trust;
    expect(game.dispatch(iron).ok).toBe(true);
    expect(game.state.inventory).toMatchObject({ coin: wages + 4, iron_scrap: 0 });
    expect(game.state.npcs.caravan_master.trust).toBe(trust + 1);
    const loaded = new Game(reviveState(JSON.parse(JSON.stringify(game.state)))!);
    loaded.dispatch({ t: 'pickup', item: 'iron_scrap', pickupId: 'wreck_iron_b', qty: 1 });
    expect(loaded.dispatch(iron).ok).toBe(false);
    expect(loaded.state.inventory).toMatchObject({ coin: wages + 4, iron_scrap: 1 });
    const journal = buildJournal(loaded.state);
    expect(journal.reported.some((e) => e.key === 'journal.wagon.open')).toBe(false);
    expect(journal.concluded.some((e) => e.key === 'journal.wagon.paid')).toBe(true);
  });
});
