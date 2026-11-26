import assert from 'node:assert/strict';

// Runs inside the real browser scene. Coordinates are measured at the painted sprite,
// after the camera offset and before foreground scenery can cover the actor.
function sampleEffects(client) {
  const { scene } = client;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fresh = () => {
    const game = new client.game.constructor();
    const valley = new client.valley.constructor(game);
    game.setPlayerTransform(-175, 0, 18, Math.PI / 2);
    scene.resetCamera();
    return valley;
  };
  const stops = [];
  for (const hz of [30, 60, 120]) {
    for (const parry of [false, true]) {
      const v = fresh();
      const foe = v.actors.find(a => a.enemyKind === (parry ? 'bandit' : 'thornback'));
      const home = { x: v.player.x + 1.2, z: v.player.z - 1.2 };
      Object.assign(foe, home, { home, timer: 10, attack: (parry ? 0.42 : 0.30) + 0.004 });
      v.game.state.equippedWeapon = 'rusted_sword';
      v.guard = parry;
      const paint = scene.paintBody, frames = [];
      let coords;
      scene.paintBody = function(ctx, stamp, x, y, bottom, height, ox, oy, ...rest) {
        if (ctx === scene.context && (parry ? stamp.wakeId === foe.id : stamp.hero))
          coords = [Math.round(x - ox), Math.round(y - oy)];
        return paint.call(this, ctx, stamp, x, y, bottom, height, ox, oy, ...rest);
      };
      try {
        v.step(1 / hz, 0, 0, false);
        const contact = v.contacts.at(-1);
        if (!contact || contact.actorId !== (parry ? foe.id : 'player')) throw Error('Missing combat contact');
        // A later arrow landing during the same update must leave this body's pause intact.
        v.contacts.push({ ...contact, kind: 'earth', actorId: undefined });
        while (v.hitStopRemaining > 0 && frames.length < 16) {
          coords = undefined;
          scene.render(v, 1 / hz);
          if (!coords) throw Error('Target absent from the world canvas');
          frames.push(coords);
          v.step(1 / hz, 0, 0, false);
        }
        stops.push({ hz, target: parry ? 'opponent' : 'player', frames });
      } finally { scene.paintBody = paint; }
    }
  }

  const v = fresh();
  Object.assign(v.game.state.inventory, { hunting_bow: 1, arrow: 6 });
  v.game.state.equippedWeapon = 'hunting_bow';
  v.startAttack({ x: v.player.x + 12, z: v.player.z - 12 });
  const guides = [];
  for (const focus of [0, 0.5, 1]) {
    for (let i = 0; i < 150 && (v.bow?.phase !== 'hold' || v.bowFocus < focus); i++) v.step(1/120, 0, 0, false);
    const guide = v.bowGuide, ctx = scene.context, fill = ctx.fillRect;
    const columns = new Map();
    let drawing = false;
    v.bowGuide = function() { drawing = true; return guide.call(this); };
    ctx.fillRect = function(x, y, w, h) {
      if (drawing && (this.fillStyle === '#ffdf81' || this.fillStyle === '#ffe3a1')) {
        for (let dx = 0; dx < w; dx++) {
          const at = Math.round(x + dx);
          if (at < 0 || at >= ctx.canvas.width || y < 0 || y + h > ctx.canvas.height) continue;
          const col = columns.get(at) ?? new Set();
          for (let dy = 0; dy < h; dy++) col.add(Math.round(y + dy));
          columns.set(at, col);
        }
      }
      return fill.call(this, x, y, w, h);
    };
    try { scene.render(v, 0); }
    finally { ctx.fillRect = fill; v.bowGuide = guide; }
    // Exclude the nock and the four arms of the reticle. Count interior gaps and rail separation.
    const left = Math.min(...columns.keys()) + 4, right = Math.max(...columns.keys()) - 10;
    let missing = 0, thickness = 0;
    for (let x = left; x <= right; x++) {
      const col = columns.get(x);
      if (!col) missing++;
      else thickness = Math.max(thickness, Math.max(...col) - Math.min(...col) + 1);
    }
    guides.push({ focus: v.bowFocus, span: right - left + 1, missing, thickness });
  }
  scene.resetCamera();
  return { reduced, stops, guides };
}

export async function checkCombatEffects(page) {
  const results = [];
  try {
    for (const reduced of [false, true]) {
      await page.cdp('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' },
      ] });
      const result = await page.eval('return (' + sampleEffects.toString() + ')(window.tervain)');
      assert.equal(result.reduced, reduced);
      results.push(result);
    }
    for (const { reduced, stops, guides } of results) {
      for (const stop of stops) {
        const { frames } = stop;
        assert(frames.length >= 2, JSON.stringify(stop));
        for (let i = 1; i < frames.length; i++) {
          assert.equal(frames[i][0], frames[0][0], 'Recoil drift during hit-stop ' + JSON.stringify(stop));
          assert.equal(Math.abs(frames[i][1] - frames[i-1][1]), reduced ? 0 : 3, JSON.stringify(stop));
        }
      }
      const [wide, closing, gold] = guides;
      assert(wide.thickness > closing.thickness && closing.thickness > gold.thickness, JSON.stringify(guides));
      assert(gold.focus === 1 && gold.span > 60 && gold.missing === 0 && gold.thickness <= 2, JSON.stringify(guides));
    }
    return results;
  } finally { await page.cdp('Emulation.setEmulatedMedia', { features: [] }); }
}
