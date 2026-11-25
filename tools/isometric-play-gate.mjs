/** Measure actual main-canvas sprite blits and completed scene frames in the isometric client. */
export function observeIsometricFrames(recordStills, textureUploadBytes) {
  const { scene, valley } = window.tervain;
  const ctx = scene.context, canvas = ctx.canvas, gl = scene.ground.gpu?.gl;
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  const device = debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  if (!device || /swiftshader|llvmpipe|software rasterizer/i.test(device)) throw new Error('The clip gate requires a hardware WebGL device');
  const gate = window.__gate = { phase: 'setup', samples: [], longTasks: [], shots: [], device };
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) gate.longTasks.push([entry.startTime, entry.duration, gate.phase]);
  });
  observer.observe({ type: 'longtask' });
  let phaseStart = performance.now(), uploads = 0, lastTime = 0, afterStill = false;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(t => { phaseStart = performance.now(); callback(t); });
  // These are the actual GL uploads of the water renderer, including the reflection image.
  for (const name of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'bufferData', 'bufferSubData']) {
    const native = gl[name].bind(gl);
    gl[name] = (...args) => {
      if (name.startsWith('tex')) uploads += textureUploadBytes(name, args);
      else {
        const data = args[name === 'bufferData' ? 1 : 2];
        const element = data?.BYTES_PER_ELEMENT ?? 1;
        if (data?.byteLength) uploads += args[4] ? args[4] * element : Math.max(0, data.byteLength - (args[3] ?? 0) * element);
      }
      return native(...args);
    };
  }
  const still = document.createElement('canvas');
  still.width = 480;
  still.height = 270;
  const stillCtx = still.getContext('2d');
  let referenceHeight = 0, hero;
  const sprite = scene.atlas.draw.bind(scene.atlas);
  scene.atlas.draw = function (target, key, x, y, width, frame, ...rest) {
    // Mirrored and off-screen canvases also draw the hero. Only his own layer in the final image counts.
    if (target !== ctx || !key.startsWith('hero-')) return sprite(target, key, x, y, width, frame, ...rest);
    referenceHeight = scene.atlas.height(key, width, frame);
    try { return sprite(target, key, x, y, width, frame, ...rest); }
    finally { referenceHeight = 0; }
  };
  const blit = ctx.drawImage.bind(ctx);
  ctx.drawImage = function (...args) {
    const result = blit(...args);
    if (referenceHeight && args.length === 9) {
      const [x, y, w, h] = args.slice(5), m = ctx.getTransform();
      const center = m.transformPoint({ x: x + w / 2, y: y + h / 2 });
      hero = {
        visible: ctx.globalAlpha > 0 && w > 0 && h > 0 && center.x >= 0 && center.x < canvas.width && center.y >= 0 && center.y < canvas.height,
        upright: m.d / Math.max(0.001, Math.hypot(m.c, m.d)), height: h / referenceHeight,
        nx: center.x * 2 / canvas.width - 1, ny: 1 - center.y * 2 / canvas.height,
      };
    }
    return result;
  };
  const render = scene.render.bind(scene);
  scene.render = function (...args) {
    hero = null;
    const before = scene.renderedFrames;
    render(...args);
    if (scene.renderedFrames !== before + 1) throw new Error('The isometric frame did not finish');
    const t = document.timeline.currentTime ?? performance.now();
    const wet = scene.water.tracks.get('player')?.wet;
    gate.samples.push([t, gate.phase, Number(!!hero?.visible && scene.heroDrawn), null, hero?.upright ?? 0,
      hero?.height ?? 0, hero?.nx ?? 0, hero?.ny ?? 0, scene.renderedFrames, Number(!!wet || valley.swimming),
      canvas.width / canvas.clientWidth, 1, performance.now() - phaseStart, uploads, Number(afterStill), 0]);
    uploads = 0;
    const interval = t - lastTime, paid = afterStill;
    lastTime = t;
    afterStill = false;
    if (recordStills && interval > 25 && !paid && gate.shots.length < 8 && !['setup', 'pause', 'end'].includes(gate.phase)) {
      stillCtx.drawImage(canvas, 0, 0, still.width, still.height);
      gate.shots.push({ t, phase: gate.phase, ms: +interval.toFixed(1), hero: [valley.player.x, valley.player.z],
        camera: [scene.center.x, scene.center.y], image: still.toDataURL('image/jpeg', 0.72) });
      afterStill = true;
    }
  };
}

/** Place only at a stage boundary. Every measured movement and combat action goes through browser input. */
export async function playIsometricStages(page, { phase, hold, tap }) {
  const position = () => page.eval('const v=window.tervain.valley; const {x,z} = v.position ?? v.player; return [x,z]');
  const place = async (x, z) => {
    await phase('setup');
    await page.eval(`const t = window.tervain; t.game.setPlayerTransform(${x}, 0, ${z}, 0); t.scene.resetCamera();`);
    await page.wait(1200);
  };
  const move = async (name, keys, ms) => {
    const before = await position();
    await phase(name);
    await hold(keys, ms);
    const after = await position();
    if (Math.hypot(after[0] - before[0], after[1] - before[1]) < 0.4) throw new Error('No player movement during ' + name);
  };
  const at = await position();
  await move('walk-strand', ['KeyD'], 1700);
  await move('run-strand', ['KeyW', 'ShiftLeft'], 1700);
  const start = { x: 28, z: 4.1 }, bridge = { x: 36.7345, z: -0.3219 };
  await place(start.x, start.z);
  const target = await page.eval(`const s = window.tervain.scene, canvas = s.context.canvas, r = canvas.getBoundingClientRect();
    const x = ${bridge.x}, z = ${bridge.z}, px = (x-z)*6-s.center.x+canvas.width/2,
      py = (x+z)*3-1.87*8-s.center.y+canvas.height*.54+24;
    return [r.left+r.width*px/canvas.width,r.top+r.height*py/canvas.height];`);
  await phase('footbridge');
  await page.click(...target);
  await page.wait(3300);
  const crossed = await position();
  if (Math.hypot(crossed[0] - bridge.x, crossed[1] - bridge.z) > 0.85) throw new Error('Click-to-walk missed the bridge deck');
  await place(41, 5);
  await move('river-bank', ['KeyD'], 1700);
  const hasRooms = await page.eval("return typeof window.tervain.valley.targets === 'function'");
  if (hasRooms) {
    const doorstep = await page.eval("const d=window.tervain.valley.targets().find(t=>t.id==='house_a/front').door; return [d.outside.x,d.outside.z]");
    await place(...doorstep);
    await tap('KeyE');
    await page.wait(300);
    if (!await page.eval("return window.tervain.valley.roomKey==='house_a/ground'")) throw new Error('The marked house entrance did not open');
    await move('inside-house', ['KeyW'], 650);
    await page.wait(750);
    const stair=await page.eval("const s=window.tervain.scene,p=s.regions.find(r=>r.id==='pass/up'),r=s.context.canvas.getBoundingClientRect();return [r.left+r.width*p.x/s.context.canvas.width,r.top+r.height*p.y/s.context.canvas.height]");
    await phase('setup');
    await page.click(...stair);
    let climbed=false;
    for(let i=0;i<45&&!climbed;i++) {
      await page.wait(150);
      climbed=await page.eval("return window.tervain.valley.roomKey==='house_a/loft'");
    }
    if(!climbed) throw new Error('Clicking the lit stairs did not reach the loft');
    await move('inside-loft',['KeyA'],660);
    await page.wait(700);
  } else {
    const house = await page.eval("const s=window.tervain.scene; const b=[...s.props.values()].flat().find(p=>p.building?.id==='house_a').building; return [b.x,b.z];");
    await place(...house);
    await move('inside-house', ['KeyA'], 600);
    await page.wait(1200);
  }
  await place(...at);
  await page.eval("const s = window.tervain.game.state; s.inventory.hunting_bow = 1; s.inventory.arrow = 6; s.equippedWeapon = 'hunting_bow';");
  await phase('bow');
  for (let i = 0; i < 2; i++) { await tap('Space'); await page.wait(1250); }
  const remaining = await page.eval('return window.tervain.game.state.inventory.arrow');
  if (remaining !== 4) throw new Error('The two bow inputs did not consume two arrows');
  const complete = await page.eval('return Object.fromEntries([...new Set(window.__gate.samples.map(s => s[1]))].map(p => [p,window.__gate.samples.filter(s => s[1] === p).length]))');
  for (const name of ['resume', 'walk-strand', 'run-strand', 'footbridge', 'river-bank', 'inside-house', 'bow'])
    if (!(complete[name] >= 3)) throw new Error('Missing presented frames during ' + name);
}
