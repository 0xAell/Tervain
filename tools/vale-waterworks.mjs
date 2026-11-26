import assert from 'node:assert/strict';

/** Exercise the outdoor instruments using the same canvas clicks and key events a player sends. */
export async function checkWaterworks(page) {
  const run = (fn, ...args) => page.eval('return (' + fn.toString() + ')(window.tervain,' + args.map(v => JSON.stringify(v)).join(',') + ')');
  const approach = field => run((c, name) => {
    c.resume();
    const v = c.valley, scene = c.scene, t = v.targets().find(t => t.field === name);
    c.game.setPlayerTransform(t.approach.x, 0, t.approach.z, 0);
    v.step(0, 0, 0, false);
    scene.resetCamera(); scene.render(v, 0); c.ui.update(true);
    if (v.contactSurface(v.player).wet) throw Error('The keeper would be standing in water at ' + name);
    const region = scene.regions.find(r => r.id === t.id);
    const rect = scene.canvas.getBoundingClientRect();
    const x = rect.left + region.x * rect.width / scene.canvas.width;
    const y = rect.top + region.y * rect.height / scene.canvas.height;
    if (scene.targetAt(x, y)?.id !== t.id) throw Error('Another object obscures ' + name);
    return [x, y];
  }, field);
  const reply = async label => {
    const at = await run((c, label) => {
      const button = [...document.querySelectorAll('[role=dialog] .reply')].find(b => b.firstChild.textContent === label);
      if (!button || button.disabled) throw Error('Unavailable control ' + label);
      const r = button.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];
    }, label);
    await page.click(...at);
  };
  const panel = () => run(() => document.querySelector('[role=dialog]')?.innerText ?? '');
  const startingReward = await run(c => {
    const s = c.game.state;
    s.clock = 720;
    Object.assign(s.quest, { phase:'investigating', gate:'damaged', allocation:null, committedAtClock:null });
    delete s.evidence.dry_channel;
    Object.assign(s.inventory, { sluice_brace:1, gate_wrench:1 });
    c.game.dispatch({t:'inspect',pointId:'sluice_crack'});
    return s.inventory.league_sash ?? 0;
  });
  await page.click(...await approach('gauge'));
  assert(await run(c => !!c.game.state.evidence.dry_channel), 'The player can read the initial float by clicking its staff');
  await page.click(...await approach('sluice'));
  assert.match(await panel(), /The sluice/);
  await reply('Force the gate');
  assert.equal(await run(c => c.game.state.quest.gate), 'jammed');
  await reply('Brace the gate');
  assert.match(await panel(), /The water hearing/);
  await reply('Send water to Rillford');
  assert.equal(await run(c => c.game.state.quest.phase), 'committed');

  const motionPreference = value => page.cdp('Emulation.setEmulatedMedia', { media:'screen', features:[{ name:'prefers-reduced-motion', value }] });
  await motionPreference('no-preference');
  const art = await run(c => {
    const scene = c.scene, v = c.valley, g = c.game, q = g.state.quest;
    const atlas = scene.atlas, draw = atlas.draw, leaves = [], wheel = [], levels = [];
    atlas.draw = function(ctx, key, x, y, width, frame = 0, ...rest) {
      if (ctx === scene.context) {
        if (key === 'sluice--set') leaves.push([width, frame]);
        if (key === 'sluice_winch--set') wheel.push([width, frame]);
        if (key === 'mill_gauge') levels.push([width, frame]);
      }
      return draw.call(this, ctx, key, x, y, width, frame, ...rest);
    };
    try {
      scene.resetCamera(); scene.render(v, 0);
      q.allocation = 'quarry';
      for (let i = 0; i < 48; i++) scene.render(v, 1/60);
      q.allocation = 'rillford';
      const staff = v.targets().find(t => t.field === 'gauge');
      g.setPlayerTransform(staff.approach.x, 0, staff.approach.z, 0);
      scene.resetCamera();
      for (const elapsed of [0, 2, 4]) {
        g.state.clock = q.committedAtClock + elapsed;
        scene.render(v, 0);
      }
      g.state.clock = q.committedAtClock + 2;
    } finally { atlas.draw = draw; }
    return { leaves, wheel, levels };
  });
  for (const [frames, width] of [[art.leaves, 73], [art.wheel, 29]]) {
    assert(frames.length > 0 && frames.every(([w]) => w === width));
    assert.deepEqual([...new Set(frames.map(([, n]) => n))], Array.from({length:13}, (_, i) => i));
  }
  await motionPreference('reduce');
  await approach('sluice');
  const reduced = await run(c => {
    const q = c.game.state.quest;
    q.allocation = 'quarry';
    c.scene.render(c.valley, 1 / 120);
    const notch = c.scene.sluiceNotch;
    q.allocation = 'rillford';
    c.scene.render(c.valley, 1 / 120);
    return [notch, c.scene.sluiceNotch];
  });
  assert.deepEqual(reduced, [12, 0]);
  assert.equal(art.levels.length, 3);
  assert(art.levels.every(([w]) => w === 15));
  const notches = art.levels.map(([, n]) => n);
  assert(notches[1] > notches[0] && notches[2] > notches[1]);
  const bank = await approach('gauge');
  await run(c => {
    c.game.state.clock = c.game.state.quest.committedAtClock + 2;
    c.valley.clockElapsed = 0;
  });
  await page.click(...bank);
  assert.match(await panel(), /brass float[\s\S]*2 game minutes/i);
  await run(c => { c.resume(); c.game.tickClock(2); });
  await approach('gauge');
  await page.key('keyDown', 'KeyE', 'e'); await page.key('keyUp', 'KeyE', 'e');
  const heading = await panel();
  if (heading.includes('Within reach')) {
    const label = await run(c => c.valley.targets().find(t => t.field === 'gauge').label);
    await reply(label);
  }
  const read = () => run(c => ({
    phase:c.game.state.quest.phase, via:c.game.state.facts.settled_via, reward:c.game.state.inventory.league_sash,
  }));
  const settled = await read();
  assert.equal(settled.reward, startingReward + 1);
  assert.equal(settled.phase, 'settled'); assert.equal(settled.via, 'check_channel');
  await page.click(...await approach('gauge'));
  assert.match(await panel(), /Mill channel/);
  assert.deepEqual(await read(), settled);
  return { gearNotches:13, floatNotches:notches, phase:settled.phase, via:settled.via, charmsEarned:settled.reward - startingReward };
}
