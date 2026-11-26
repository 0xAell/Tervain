/** Pixel regression for disappearing foreground art. Run against a built preview with Node and Chrome. */
import assert from 'node:assert/strict';
import { openPage } from './cdp.mjs';

const page = await openPage(process.argv[2], { flags: ['--mute-audio'] });
async function waitFor(expression) {
  for (let i = 0; i < 800; i++) {
    if (await page.eval('return ' + expression)) return;
    await page.wait(100);
  }
  throw Error('Timed out waiting for ' + expression);
}

function compare(c) {
  c.page('pause');
  const s = c.scene, v = c.valley, g = s.context, { width: w, height: h } = g.canvas;
  c.game.state.clock = 720;
  v.time = 4;
  v.clockElapsed = 0;
  s.hover();
  const props = [...s.props.values()].flat();
  const cottage = props.find(p => p.building?.id === 'house_a');
  const oak = props.filter(p => p.key === 'oak').sort((a, b) =>
    Math.hypot(a.x + 35, a.z + 46) - Math.hypot(b.x + 35, b.z + 46))[0];
  const pixels = () => g.getImageData(0, 0, w, h).data;
  function differences(a, b, skip) {
    let count = 0;
    for (let i = 0; i < w * h; i++) {
      if (skip(i % w, Math.floor(i / w))) continue;
      for (let k = i * 4; k < i * 4 + 3; k++) {
        if (Math.abs(a[k] - b[k]) <= 18) continue;
        count++;
        break;
      }
    }
    return count;
  }

  const scenery = [[cottage, 11], [oak, 8]].map(([prop, aside]) => {
    const put = offset => c.game.setPlayerTransform(prop.x - 3 + offset, 0, prop.z - 3 - offset, 0);
    put(0);
    s.resetCamera();
    s.render(v, 0);
    const center = { ...s.center };
    const sample = offset => {
      put(offset);
      for (let i = 0; i < 10; i++) s.render(v, 0.1);
      Object.assign(s.center, center);
      s.render(v, 0);
      return pixels();
    };
    const beside = sample(aside), behind = sample(0);
    const footX = w / 2, footY = h * 0.54 + 24;
    const aroundWalker = (x, y) => y >= footY - 55 && y <= footY + 20 &&
      (Math.abs(x - footX) <= 27 || Math.abs(x - footX - aside * 12) <= 27);
    const changedScenery = differences(beside, behind, aroundWalker);
    // A fully hidden character still needs a location cue. Measure the actual pixels contributed by its mask.
    const finish = s.reveal.finish;
    s.reveal.finish = () => {};
    let solid;
    try { s.render(v, 0); solid = pixels(); } finally { s.reveal.finish = finish; }
    const cuePixels = differences(behind, solid, () => false);
    const displacedCue = differences(behind, solid, aroundWalker);
    return { object: prop.building?.id ?? prop.key, changedScenery, cuePixels, displacedCue };
  });
  function markPixels(x, z, match) {
    c.game.setPlayerTransform(x, 0, z, 0);
    v.step(0, 0, 0, false);
    s.resetCamera();
    s.render(v, 0);
    const withMark = pixels();
    const targets = v.targets;
    const target = targets.call(v).find(match);
    if (!target) throw Error('Missing interaction target at ' + x + ', ' + z);
    v.targets = () => targets.call(v).filter(t => t.id !== target.id);
    try {
      s.render(v, 0);
      return differences(withMark, pixels(), () => false);
    } finally {
      v.targets = targets;
    }
  }
  const behindRoof = markPixels(-10.43, -11.81, t => t.plant?.key === 'rill_sedge');
  const besideBell = markPixels(-1, 4, t => t.field === 'bell');
  const quarry = v.actors.find(a => a.enemy === 'cut_creature');
  c.game.setPlayerTransform(quarry.home.x - 2.26, 0, quarry.home.z + 0.22, Math.PI / 2);
  Object.assign(quarry, quarry.home, { timer: 1 });
  v.step(1 / 60, 0, 0, false);
  s.resetCamera();
  s.render(v, 0);
  const duellists = pixels();
  const ridge = [s.reveal, s.opponentReveal].map(outline => {
    const finish = outline.finish;
    outline.finish = () => {};
    try {
      s.render(v, 0);
      return differences(duellists, pixels(), () => false);
    } finally { outline.finish = finish; }
  });
  return { scenery, behindRoof, besideBell, ridge };
}

try {
  await waitFor("!!document.querySelector('.title-screen button.primary')");
  const [x, y] = await page.eval("const r=document.querySelector('.title-screen button.primary').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]");
  await page.click(x, y);
  await waitFor("window.tervain?.mode === 'play' && window.tervain.scene.heroDrawn");
  const report = await page.eval('return (' + compare.toString() + ')(window.tervain)');
  for (const row of report.scenery) {
    assert(row.changedScenery < 100, JSON.stringify(row));
    assert(row.cuePixels >= 12 && row.cuePixels < 800 && row.displacedCue === 0, JSON.stringify(row));
  }
  assert.equal(report.behindRoof, 0, JSON.stringify(report));
  assert(report.besideBell >= 12 && report.besideBell <= 25, JSON.stringify(report));
  assert(report.ridge.every(n => n > 12 && n < 1500), JSON.stringify(report));
  console.log(JSON.stringify(report));
} finally {
  await page.close();
}
