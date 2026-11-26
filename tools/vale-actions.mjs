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
    const watched = [];
    atlas.draw = function(ctx, key, ...rest) {
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
      c.valley.leaveRoom();
      c.game.setPlayerTransform(-175,0,18,Math.PI/2); c.scene.resetCamera();
    } finally { atlas.draw = draw; proto.drawImage = blit; }
    return { differences, keys: [...frames.keys()], blits: [...frames.values()].reduce((a,b) => a+b,0) };
  });
  assert.deepEqual(native.differences, []);
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
  assert.equal(page.console().filter(e => e.level === 'error' || e.type === 'error').length, 0);
  console.log(JSON.stringify({ sprite, nativeBlits:native.blits, distinctSprites:native.keys.length, beltSlot: 3, dodges: await run(() => window.dodges), layouts }));
} finally {
  await page.close();
}
