/** Check the presented controls, sprite sampling and live dialogue in a running Vale build. */
import assert from 'node:assert/strict';
import { openPage } from './cdp.mjs';

const page = await openPage(process.argv[2], { w: 1280, h: 720, flags: ['--mute-audio'] });
const run = fn => page.eval('return (' + fn.toString() + ')(window.tervain)');
const tap = async (code, key) => {
  await page.key('keyDown', code, key);
  await page.key('keyUp', code, key);
};
async function until(condition) {
  for (let i = 0; i < 600; i++) {
    if (await run(condition)) return;
    await page.wait(80);
  }
  throw Error('Timed out waiting for ' + condition);
}

try {
  await until(() => !!document.querySelector('.title-screen .primary'));
  const start = await run(() => {
    const r = document.querySelector('.title-screen .primary').getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  await page.click(...start);
  await until(c => c?.mode === 'play' && c.scene.heroDrawn);
  await run(c => {
    Object.assign(c.game.state.inventory, { rusted_sword: 1, hunting_bow: 1, arrow: 4, bread: 2, league_sash: 1 });
    c.game.state.equippedWeapon = 'hunting_bow';
    c.game.setPlayerTransform(-175, 0, 18, Math.PI / 2);
    c.scene.resetCamera();
    c.sound.endLine();
  });
  const sprite = await run(c => {
    const atlas = c.scene.atlas, key = 'hero-south-east--walk';
    const dst = document.createElement('canvas');
    dst.width = dst.height = 80;
    const g = dst.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    const sample = (x, walking) => {
      g.clearRect(0, 0, 80, 80);
      atlas.draw(g, key, x, 57, 38, 2, false, 1, 0, false, walking);
      return g.getImageData(0, 0, 80, 80).data;
    };
    const still = sample(40, false), walking = sample(40.33, true);
    const palette = new Set(), extras = new Set();
    const word = (buf, i) => ((buf[i] * 256 + buf[i + 1]) * 256 + buf[i + 2]) * 256 + buf[i + 3];
    for (let i = 0; i < still.length; i += 4) palette.add(word(still, i));
    let changed = 0;
    for (let i = 0; i < walking.length; i += 4) {
      const color = word(walking, i);
      if (!palette.has(color)) extras.add(color);
      if (color !== word(still, i)) changed++;
    }
    return { additionalColors: extras.size, changedPixels: changed };
  });
  assert.deepEqual(sprite, { additionalColors: 0, changedPixels: 0 });

  const native = await run(c => {
    const atlas = c.scene.atlas, draw = atlas.draw, proto = CanvasRenderingContext2D.prototype;
    const blit = proto.drawImage, differences = [], frames = new Map();
    const watched = [], sources = new Map(), poses = new Set(), widths = new Map();
    const actors = new Set(c.valley.actors.map(a => a.key));
    const pickups = new Set(['sluice_brace', 'gate_wrench', 'field_caps', 'iron_scrap', 'rusted_sword', 'hunting_bow', 'shore_apple', 'field_herbs', 'arrow']);
    const catalog = (key, width, height) => {
      const source = atlas.surface(key);
      if (source.width !== width || (height !== undefined && source.height !== height))
        differences.push({ key, source: [source.width, source.height], expected: [width, height] });
      widths.set(key, source.width);
    };
    let bodyPixels = 0;
    const pixels = cel => cel.getContext('2d').getImageData(0, 0, cel.width, cel.height).data;
    for (const face of ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']) {
      const prefix = 'hero-' + face + '--';
      for (const name of ['walk', 'attack', 'dash']) catalog(prefix + name, 38, 38);
      for (const name of ['attack', 'return', 'counter', 'thrust', 'guard']) catalog(prefix + 'sword-' + name, 57, 43);
      const bare = pixels(atlas.surface(prefix + 'attack')), armed = pixels(atlas.surface(prefix + 'sword-attack'));
      for (let y = 0; y < 38; y++) for (let x = 0; x < 38; x++) {
        const i = (y * 38 + x) * 4, j = ((y + 5) * 57 + x + 9) * 4;
        if (!bare[i+3]) continue;
        bodyPixels++;
        if (bare[i] !== armed[j] || bare[i+1] !== armed[j+1] || bare[i+2] !== armed[j+2] || bare[i+3] !== armed[j+3])
          throw Error('Drawing the sword resampled the body in ' + face);
      }
      if (!face.includes('west')) for (const name of ['ready', 'bowstep', 'draw', 'aim', 'loose']) catalog(prefix + name, 57, 49);
      if (face === 'north-east' || face === 'south-east') {
        for (const name of ['work', 'stir', 'sit', 'gather', 'pet', 'dress', 'read']) catalog(prefix + name, 57, 49);
      }
    }
    atlas.draw = function(ctx, key, ...rest) {
      const name = key.split('--')[0], width = rest[2];
      if (ctx === c.scene.context && (name.startsWith('hero-') || actors.has(name) || pickups.has(name))) {
        if (!widths.has(key)) widths.set(key, atlas.surface(key).width);
        const source = widths.get(key);
        sources.set(key, source);
        if (source !== width) differences.push({ key, authored: source, requested: width });
        if (name.startsWith('hero-')) poses.add(key.split('--')[1]);
      }
      watched.push({ ctx, key });
      try { return draw.call(this,ctx,key,...rest); } finally { watched.pop(); }
    };
    proto.drawImage = function(...args) {
      const stamp = watched.at(-1);
      // Canvas preparation has its own context. Measure the blit to the actual target surface.
      if (stamp?.ctx === this && args.length === 9) {
        const [, , , sw, sh, x, y, dw, dh] = args;
        frames.set(stamp.key,(frames.get(stamp.key) ?? 0)+1);
        if (sw !== dw || sh !== dh || !Number.isInteger(x) || !Number.isInteger(y))
          differences.push({ key:stamp.key, sw, sh, x, y, dw, dh });
      }
      return blit.apply(this,args);
    };
    try {
      for (const [x,z] of [[-175,18],[2,10],[90,-12],[100,56]]) {
        c.game.setPlayerTransform(x,0,z,0);
        c.valley.step(0,0,0,false);
        c.scene.resetCamera(); c.scene.render(c.valley,0);
      }
      const door = c.valley.targets().find(t => t.door?.id === 'house_a/front').door;
      c.valley.enterDoor(door); c.scene.resetCamera(); c.scene.render(c.valley,0);
      const v = c.valley;
      const workbench = v.targets().find(t => t.fixture);
      Object.assign(v.player.interior, workbench.approach);
      if (!v.perform('work', workbench, 0.7)) throw Error('Could not start work in the house');
      c.scene.render(v, 0);
      v.leaveRoom();
      c.game.setPlayerTransform(-175,0,18,Math.PI/2);
      c.scene.resetCamera();
      const advance = (n, dx = 0, dz = 0) => {
        for (let i = 0; i < n; i++) v.step(1/60, dx, dz, false);
        c.scene.render(v, 1/60);
      };
      c.game.state.equippedWeapon = 'rusted_sword';
      v.startAttack(); advance(14); advance(25);
      v.guard = true; advance(3); v.guard = false;
      if (!v.requestDash(0,1)) throw Error('Dodge did not start');
      advance(4); advance(22);
      c.game.state.equippedWeapon = 'hunting_bow';
      v.startAttack(); advance(5); advance(26,1); advance(60);
      v.releaseAttack(); advance(2); advance(25);
      c.game.setPlayerTransform(-175,0,18,Math.PI/2); c.scene.resetCamera();
    } finally { atlas.draw = draw; proto.drawImage = blit; }
    return { differences, poses: [...poses], sourceKeys: sources.size, catalog: widths.size, bodyPixels, keys: [...frames.keys()], blits: [...frames.values()].reduce((a,b) => a+b,0) };
  });
  assert.deepEqual(native.differences, []);
  for (const pose of ['work','sword-attack','sword-guard','dash','draw','aim','loose'])
    assert(native.poses.includes(pose), 'Missing live actor pose ' + pose + ' in ' + native.poses);
  assert(native.bodyPixels > 500 && native.sourceKeys > 8);
  assert(native.blits > 50 && native.keys.some(k => k.startsWith('hero-')));
  assert(native.keys.includes('sluice_brace') && native.keys.includes('gate_wrench'), 'quarry pickups must actually render during sampling');

  await tap('KeyI', 'i');
  await run(() => {
    window.originalItems = document.querySelector('.items');
    const press = (selector,label) => [...document.querySelectorAll(selector)].find(b => b.textContent === label).click();
    press('.pack-tabs button','Gear');
    document.querySelector('.item[data-item="league_sash"]').click();
    press('.item-detail button','Wear charm');
    document.querySelector('.item[data-item="rusted_sword"]').click();
    press('.item-detail button','Equip');
    press('.pack-tabs button','Supplies');
    window.tervain.game.dispatch({t:'damagePlayer',amount:15});
    document.querySelector('.item[data-item="bread"]').click();
    press('.item-detail button','Consume');
    press('.pack-tabs button','All');
    document.querySelector('.item[data-item="rusted_sword"]').focus();
  });
  assert(await run(c => c.game.state.inventory.bread === 1 && c.game.state.facts.worn_charm === 'league_sash' &&
    c.game.state.equippedWeapon === 'rusted_sword' && window.originalItems === document.querySelector('.items')));
  await tap('Digit3', '3');
  assert(await run(c => c.game.state.quickSlots[2] === 'rusted_sword' &&
    window.originalItems === document.querySelector('.items') && document.activeElement.dataset.item === 'rusted_sword'));
  await tap('Escape', 'Escape');
  await tap('Digit3', '3');
  assert.equal(await run(c => c.game.state.equippedWeapon), 'rusted_sword');

  await run(c => {
    window.dodges = 0;
    const field = c.valley.onFieldSound;
    c.valley.onFieldSound = (event, ...args) => {
      if (event === 'sidestep') window.dodges++;
      field(event, ...args);
    };
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    pad.buttons[1].pressed = true;
    window.pad = pad;
  });
  await until(() => window.dodges === 1);
  await run(() => { window.pad.buttons[1].pressed = false; });
  await until(c => !c.valley.dash);
  await run(c => {
    const door = c.valley.targets().find(t => t.door?.id === 'house_a/front').door;
    c.game.setPlayerTransform(door.outside.x, 0, door.outside.z, 0);
    c.scene.resetCamera();
  });
  await until(c => c.valley.offers()[0]?.target?.door?.id === 'house_a/front');
  await run(c => { c.ui.caption('An outdoor voice'); });
  await tap('KeyE', 'e');
  await until(c => c.valley.roomKey === 'house_a/ground' && c.scene.indoors);
  assert(await run(() => document.querySelector('.spoken-caption').textContent !== 'An outdoor voice'),
    'the outdoor caption carried into the room after interacting with its door');
  await run(c => { c.valley.leaveRoom(); });
  await until(c => !c.scene.indoors);
  const layouts = [];
  for (const [width, height, scale, mobile] of [[1280,720,1,false], [2560,540,1,false], [393,852,3,true], [844,390,2,true]]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    await page.cdp('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: mobile ? 'reduce' : 'no-preference' }] });
    await run(c => {
      const warden = c.valley.actors.find(a => a.npc === 'shrine_warden');
      c.game.setPlayerTransform(warden.x - 1.6, 0, warden.z + 0.4, 0);
      c.scene.resetCamera();
      c.ui.dialogue('harrow_intro');
      window.dialogueFrame = c.scene.renderedFrames;
    });
    await until(c => c.scene.renderedFrames > window.dialogueFrame + 2);
    const view = await run(() => {
      const p = document.querySelector('.conversation').getBoundingClientRect();
      return { top: Math.round(p.top), bottom: Math.round(p.bottom), height: innerHeight,
        width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert(!view.overflow && view.top > height * 0.4 && view.bottom <= height);
    await tap('Digit1', '1');
    assert(await run(c => c.mode === 'dialogue' && document.querySelector('.speech').textContent === 'What do you need?'));
    await tap('Escape', 'Escape');
    const placement = await run(c => {
      c.ui.update(true);
      const rect = sel => document.querySelector(sel).getBoundingClientRect();
      const guide = rect('.journey-lead'), region = rect('.region');
      const overlaps = (a,b) => a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const controls = ['.prompt','.vitals','.tools','.belt','.dodge-touch','.guard-touch','.attack-touch'];
      return { tracked: guide.width > 0, below: guide.top >= region.bottom && guide.top <= region.bottom + 4,
        clipped: guide.left < 0 || guide.right > innerWidth || guide.bottom > innerHeight,
        overlaps: controls.filter(sel => overlaps(guide, rect(sel)) || overlaps(region, rect(sel))) };
    });
    assert(placement.tracked && placement.below && !placement.clipped && !placement.overlaps.length, JSON.stringify({ view, placement }));
    if (mobile) {
      const box = await run(() => {
        const d = document.querySelector('.dodge-touch').getBoundingClientRect();
        const g = document.querySelector('.guard-touch').getBoundingClientRect();
        return { x: d.x + d.width / 2, y: d.y + d.height / 2, w: d.width, h: d.height, clear: d.right < g.left };
      });
      assert(box.clear && box.w >= 44 && box.h >= 44);
      await until(c => c.valley.time >= c.valley.dashReady);
      await run(() => { window.expectedDodges = window.dodges + 1; });
      await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
      await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await until(c => !c.valley.dash && window.dodges === window.expectedDodges);
    }
    layouts.push(view);
  }
  const slabCoverage = await run(c => {
    const v = c.valley, samples = [], atlas = c.scene.atlas, art = c.scene.rooms.art;
    const trades = { house_a:'weave', house_b:'timber', house_c:'garden', house_d:'hunt', house_e:'grain', house_f:'cask' };
    art.plates.clear();
    for (const [house, trade] of Object.entries(trades)) {
      const door = v.targets().find(t => t.door?.id === house + '/front').door;
      v.enterDoor(door);
      for (const level of ['ground', 'loft', 'cellar']) {
        v.player.interior.level = level;
        const used = new Set(), surface = atlas.surface;
        let plate;
        try {
          atlas.surface = function(key, ...args) { used.add(key); return surface.call(this, key, ...args); };
          plate = art.plate(v.room);
        } finally { atlas.surface = surface; }
        if (level === 'ground' && (!used.has('room_floor_' + trade) || !used.has('room_wall_' + trade)))
          throw Error(house + ' did not draw its workshop floor and fittings');
        const mask = document.createElement('canvas');
        const w = mask.width = plate.image.width, h = mask.height = plate.image.height;
        const g = mask.getContext('2d');
        g.translate(-plate.left, -plate.top);
        g.fill(plate.floors, 'evenodd');
        const floor = g.getImageData(0, 0, w, h).data;
        const image = plate.image.getContext('2d').getImageData(0, 0, w, h).data;
        let interior = 0, holes = 0;
        for (let y = 2; y < h-2; y++) for (let x = 2; x < w-2; x++) {
          const i = (y*w+x)*4+3;
          if (floor[i] < 255 || floor[i-8] < 255 || floor[i+8] < 255 || floor[i-8*w] < 255 || floor[i+8*w] < 255) continue;
          interior++;
          if (image[i] < 248) holes++;
        }
        samples.push({ house, level, interior, holes });
      }
      v.leaveRoom();
    }
    return samples;
  });
  assert(slabCoverage.every(s => s.interior > 3000 && !s.holes), JSON.stringify(slabCoverage.filter(s => s.holes || s.interior <= 3000)));

  const crossing = await run(c => {
    const v = c.valley, scene = c.scene, g = scene.context;
    c.game.setPlayerTransform(51, 0, -34.3, 0);
    v.locomotion.reset();
    for (let i = 0; i < 12; i++) v.step(1/60, 0, 1, true);
    const launch = { z:v.player.z, ...v.contactSurface(v.player) };
    v.requestJump();
    for (let i = 0; i < 15; i++) v.step(1/60, 0, 1, true);
    scene.resetCamera();
    const overWater = v.contactSurface(v.player).wet && v.hop > 1;
    const shadows = [];
    const paint = scene.paintBody, rect = g.fillRect, originalClock = c.game.state.clock;
    try {
      let ink = [], hero;
      g.fillRect = function(x, y, w, h) {
        if (this.fillStyle === 'rgba(43, 39, 42, 0.4)') ink.push({ x, y, w, h });
        return rect.call(this, x, y, w, h);
      };
      scene.paintBody = function(ctx, stamp, x, y, ...rest) {
        if (ctx === g && stamp.hero) hero = { x, y, base: y + stamp.lift };
        return paint.call(this,ctx,stamp,x,y,...rest);
      };
      for (const clock of [720, 0]) {
        c.game.state.clock = clock;
        ink = []; hero = undefined;
        scene.render(v, 0);
        const at = ink.find(part => part.y === Math.round(hero.base) && part.x <= Math.round(hero.x) && part.x + part.w > Math.round(hero.x));
        shadows.push({ clock, ink: at?.w ?? 0, lift: Math.round(hero.base - hero.y) });
      }
    } finally {
      scene.paintBody = paint; g.fillRect = rect; c.game.state.clock = originalClock;
    }
    while (v.jump > 0) v.step(1/60, 0, 1, true);
    return { launch, overWater, shadows, landing: { z:v.player.z, ...v.contactSurface(v.player) } };
  });
  assert(!crossing.launch.wet && crossing.overWater && !crossing.landing.wet &&
    crossing.landing.z > crossing.launch.z + 4 && crossing.shadows.every(s => s.ink > 3 && s.lift > 8), JSON.stringify(crossing));
  const timings = await run(c => {
    const v = c.valley;
    c.game.setPlayerTransform(-175,0,18,Math.PI/2);
    const post = (kind, distance) => {
      const foe = v.actors.find(a => a.enemyKind === kind);
      const home = { x: -175 + distance, z: 18 };
      Object.assign(foe, home, { home, timer: 0, attack: 0 });
      return foe;
    };
    const step = () => { v.step(1/60,0,0,false); c.ui.update(true); };
    const label = () => c.ui.foeState.textContent;
    const melee = post('bandit', 1.7);
    c.game.state.equippedWeapon = 'rusted_sword';
    step();
    const cues = [];
    for (let i = 0; i < 50 && !v.contacts.some(hit => hit.kind === 'parry'); i++) {
      if (label() === 'Parry now') {
        cues.push(melee.attack);
        if (cues.length === 1) v.guard = true;
      }
      step();
    }
    const parried = v.contacts.some(hit => hit.kind === 'parry');
    v.guard = false;
    // Move this opponent clear before testing the archer, so its counter indicator has expired.
    Object.assign(melee, { x:-204, z:42, home:{ x:-204, z:42 } });
    for (let i = 0; i < 135; i++) step();
    const archer = post('skirmisher', 9);
    c.game.state.equippedWeapon = 'hunting_bow';
    c.game.state.inventory.arrow = 5;
    archer.timer = 0.95;
    v.startAttack(archer);
    const fills = [];
    for (let i = 0; i < 120; i++) {
      step();
      if (archer.aimed && label().startsWith('Aiming')) {
        fills.push(Number(c.ui.foeTiming.style.transform.slice(7,-1)));
        if (v.bowFocus === 1 && fills.at(-1) >= 0.96) break;
      }
    }
    for (let i = 0; i < 8 && archer.aimed; i++) step();
    const fired = v.arrows.some(a => a.owner === archer.enemy);
    for (let i = 0; i < 240 && !archer.aimed; i++) {
      if (!v.bow) v.startAttack(archer);
      step();
    }
    const committed = !!archer.aimed && v.bowFocus === 1;
    const previous = archer.health;
    v.releaseAttack();
    for (let i = 0; i < 35 && archer.health === previous; i++) step();
    return { parried, cueFrames: cues.length, firstCue: cues[0], aimFrames: fills.length,
      maxAim: Math.max(...fills), continuousAim: fills.every((n,i) => !i || n > fills[i-1]),
      fired, committed, shotDamage: previous - archer.health, interrupted: !archer.aimed && !v.arrows.some(a => a.owner) };
  });
  assert(timings.parried && timings.cueFrames >= 7 && timings.firstCue > 0.53 && timings.firstCue <= 0.42 + 8/60 + 1e-8, JSON.stringify(timings));
  assert(timings.aimFrames >= 35 && timings.maxAim >= 0.96 && timings.continuousAim && timings.fired && timings.committed && timings.shotDamage === 43 && timings.interrupted, JSON.stringify(timings));
  assert.equal(page.console().filter(e => e.level === 'error' || e.type === 'error').length, 0);
  console.log(JSON.stringify({ sprite, nativeBlits:native.blits, distinctSprites:native.keys.length, sourceKeys:native.sourceKeys, catalog:native.catalog, bodyPixels:native.bodyPixels, testedPoses:native.poses, roomFloors:slabCoverage.length, testedFloorPixels:slabCoverage.reduce((n, s) => n+s.interior, 0), timings, crossing, beltSlot: 3, dodges: await run(() => window.dodges), layouts }));
} finally {
  await page.close();
}
