#!/usr/bin/env node
/**
 * Where a frame's work goes: the draw calls and triangles of one frame of the world at each stop of the benchmark
 * route, the wanderer standing there and the camera following him as in play, by pass (the render target drawn into: the screen, the sun's shadow map, the water's reflection, a capture)
 * and by the part of the world drawn (its module), as three counts them.
 *
 *   npm run perf:frame -- [--url http://127.0.0.1:4173/] [--quality high] [--size 1440x900] [--dpr 2] [--hour 11]
 *                         [--views 0,4,9] [--settle 3] [--json frame.json] [--records draws.json]
 *
 * Without a GPU (headless browsers here draw in software) a frame's time says little about a GPU's, but what it asks
 * of one does not change: docs/perf/AIR-CUTS.md found the leaves, trunks and settlement bound by their triangles, not
 * their pixels, and draw calls cost the CPU and driver on every machine. Each view is held for --settle frames before
 * one is counted, so its captures and levels of detail have caught up with the camera. The defaults are the play gate's
 * Mac profile: 1440×900 at a device pixel ratio of 2, High. --records writes every draw of every view counted, with its
 * material, for a closer look at one part of the world.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPage } from './cdp.mjs';

/** Totals of the records by a key: { key: { calls, triangles } }, largest triangle count first. */
export function totals(records, key) {
  const out = new Map();
  for (const r of records) {
    const k = key(r), t = out.get(k) ?? { calls: 0, triangles: 0 };
    t.calls += r.calls; t.triangles += r.triangles; out.set(k, t);
  }
  return Object.fromEntries([...out].sort((a, b) => b[1].triangles - a[1].triangles || b[1].calls - a[1].calls));
}

/** One view's frame: its totals, each pass's, each module's, each module's within each pass, and each object's. */
export function frameSummary(records) {
  const all = totals(records, () => 'all').all ?? { calls: 0, triangles: 0 };
  const passes = totals(records, (r) => r.pass), modules = totals(records, (r) => r.module);
  const byPass = Object.fromEntries(Object.keys(passes).map((pass) => [pass, totals(records.filter((r) => r.pass === pass), (r) => r.module)]));
  const objects = Object.fromEntries(Object.entries(totals(records, (r) => `${r.module} · ${r.object} · ${r.pass}`)).slice(0, 40));
  return { calls: all.calls, triangles: all.triangles, passes, modules, byPass, objects };
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The route's medians: of the whole frame, of each pass and of each module (a view without one counts it as none). */
export function routeSummary(views) {
  const keys = (pick) => [...new Set(views.flatMap((v) => Object.keys(pick(v))))];
  const med = (pick, key) => ({ calls: median(views.map((v) => pick(v)[key]?.calls ?? 0)), triangles: median(views.map((v) => pick(v)[key]?.triangles ?? 0)) });
  const sort = (entries) => Object.fromEntries(entries.sort((a, b) => b[1].triangles - a[1].triangles || b[1].calls - a[1].calls));
  return {
    views: views.length,
    calls: median(views.map((v) => v.calls)), triangles: median(views.map((v) => v.triangles)),
    passes: sort(keys((v) => v.passes).map((k) => [k, med((v) => v.passes, k)])),
    modules: sort(keys((v) => v.modules).map((k) => [k, med((v) => v.modules, k)])),
  };
}

const million = (n) => `${(n / 1e6).toFixed(2)} M`;
/** Rows of a { key: { calls, triangles } } table, at most `limit`. */
export function table(entries, limit = 12) {
  const rows = Object.entries(entries).slice(0, limit);
  const width = Math.max(4, ...rows.map(([k]) => k.length));
  return rows.map(([k, t]) => `  ${k.padEnd(width)}  ${String(Math.round(t.calls)).padStart(5)} draws  ${million(t.triangles).padStart(9)} triangles`).join('\n');
}

/**
 * Runs in the page: names each render target and each object's module, counts every draw of the frames it is asked
 * to record through three's own counters, and moves the camera along the route.
 */
const INSTALL = `
  const app = window.tervain, renderer = app.renderer, info = renderer.info, world = app.world;
  const state = window.__framePasses = { recording: false, records: [] };
  const owners = new Map();
  for (const m of world.modules) owners.set(m.module.group, m.name);
  const own = (object, name) => { if (object) owners.set(object, name); };
  own(world.terrainMesh, 'terrain'); own(world.scenery?.group, 'scenery'); own(world.water?.inland?.group, 'inland water');
  own(world.water?.ocean?.mesh, 'sea'); own(world.sky?.group, 'sky'); own(app.player?.group, 'wanderer');
  for (const npc of app.npcs ?? []) own(npc.rig?.root, 'residents');
  for (const enemy of app.enemies ?? []) own(enemy.rig?.root, 'hostiles');
  const moduleOf = (object) => {
    let top = object;
    for (let o = object; o; o = o.parent) { const name = owners.get(o); if (name) return name; if (o.parent && !o.parent.parent) top = o; }
    return top?.name ? 'other: ' + top.name : 'other: ' + (top?.type ?? 'unknown');
  };
  // The targets the frame draws into, by what they are: the grade's picture and bloom, the water pass's composite and
  // reflection (made when first needed), each light's shadow map. Any other is named by its texture and size.
  const targets = new WeakMap();
  const nameTargets = () => {
    const grade = app.grade, water = grade?.waterPass;
    if (grade?.target) targets.set(grade.target, 'main view');
    for (const bloom of [grade?.bloomA, grade?.bloomB]) if (bloom) targets.set(bloom, 'bloom');
    if (water?.composite) targets.set(water.composite, 'water composite');
    if (water?.reflector) targets.set(water.reflector.getRenderTarget(), 'water reflection');
    world.scene.traverse((o) => { if (o.isLight && o.shadow?.map) targets.set(o.shadow.map, 'shadow map ' + o.shadow.map.width + '²'); });
  };
  const passOf = (target, material) => {
    if (!target) return 'screen';
    if (!targets.has(target)) nameTargets();
    const name = targets.get(target) ?? (target.texture?.name || target.textures?.[0]?.name || target.name || 'target') + ' ' + target.width + '×' + target.height;
    // A draw that writes no colour into a picture is a depth pass of its own (the leaves' pre-pass, A-Air).
    return material.colorWrite === false && !name.startsWith('shadow map') ? name + ', depth only' : name;
  };
  const draw = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (!state.recording) return draw.apply(this, arguments);
    const calls = info.render.calls, triangles = info.render.triangles;
    const out = draw.apply(this, arguments);
    state.records.push({ pass: passOf(renderer.getRenderTarget(), material), module: moduleOf(object), object: object.name || object.parent?.name || object.type,
      material: material.name ? material.type + ' ' + material.name : material.type, calls: info.render.calls - calls, triangles: info.render.triangles - triangles });
    return out;
  };
  const renderWorld = Object.getPrototypeOf(app).renderWorld;
  state.frame = (record) => new Promise((resolve) => {
    app.renderWorld = function () {
      state.recording = record; state.records = [];
      try { return renderWorld.apply(this, arguments); }
      finally { state.recording = false; delete app.renderWorld; resolve(state.records); }
    };
  });
  const T = world.terrain, V = app.cam.camera.position.constructor;
  const H = (x, z, up) => new V(x, T.heightAt(x, z) + up, z);
  // The benchmark route's stops (App.startBenchmark), from the landing through the woodland and Rillford to the hill.
  state.route = [
    [H(-268, 27, 3), H(-243, 22, 2)],
    [H(-224, 22, 2.6), H(-202, 12, 3)], [H(-178, 12, 2.6), H(-150, 24, 3)], [H(-128, 22, 3), H(-90, 18, 2)],
    [H(-60, 16, 2.5), H(0, 8, 2)], [H(-8, 20, 2.2), H(10, 4, 2)], [H(24, -10, 2.5), H(6, -50, 2)],
    [H(0, -52, 2.5), H(-12, -90, 4)], [H(-6, -80, 3), H(-26, -104, 5)], [H(30, 6, 3), H(80, -20, 3)],
    [H(80, -12, 3), H(96, -32, 4)], [H(70, 30, 3), H(30, 12, 2)], [H(-70, 30, 12), H(20, -30, 4)],
  ];
  // As in play (and the play gate's budget view): the wanderer stands at the stop, facing along the route, and the
  // camera follows him. The sun's shadow is centred on him, so a camera sent ahead alone would see no shadows drawn.
  state.view = (i) => {
    const [p, look] = state.route[i], yaw = Math.atan2(look.x - p.x, look.z - p.z);
    app.cam.manual = null;
    app.player.setPosition(p.x, p.z, yaw, T);
    app.cam.yaw = yaw; app.cam.pitch = 0.25; app.cam.wantDist = 6;
  };
  return state.route.length;`;

function options(argv) {
  const out = { url: process.env.TERVAIN_URL ?? 'http://127.0.0.1:4173/', quality: 'high', size: [1440, 900], dpr: 2, hour: 11, views: null, settle: 3, json: null, records: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--url') { out.url = value; i++; }
    else if (flag === '--quality') { out.quality = value; i++; }
    else if (flag === '--size') { out.size = value.split('x').map(Number); i++; }
    else if (flag === '--dpr') { out.dpr = Number(value); i++; }
    else if (flag === '--hour') { out.hour = Number(value); i++; }
    else if (flag === '--views') { out.views = value.split(',').map(Number); i++; }
    else if (flag === '--settle') { out.settle = Number(value); i++; }
    else if (flag === '--json') { out.json = value; i++; }
    else if (flag === '--records') { out.records = value; i++; }
    else throw new Error(`unknown option ${flag}`);
  }
  if (!['low', 'medium', 'high'].includes(out.quality)) throw new Error('--quality takes low, medium or high');
  if (out.size.length !== 2 || !out.size.every((n) => Number.isInteger(n) && n > 0)) throw new Error('--size takes WxH');
  if (!(out.settle >= 1)) throw new Error('--settle takes a number of frames');
  if (!(out.dpr > 0 && out.dpr <= 4)) throw new Error('--dpr takes a device pixel ratio up to 4');
  return out;
}

async function main() {
  const opts = options(process.argv.slice(2));
  const base = opts.url.replace(/[?#].*$/, '');
  const page = await openPage(`${base}?shot=1&quality=${opts.quality}&hour=${opts.hour}&hud=0&settle=30`, { w: opts.size[0], h: opts.size[1] });
  try {
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: opts.size[0], height: opts.size[1], deviceScaleFactor: opts.dpr, mobile: false });
    for (let i = 0; i < 2400; i++) {
      if ((await page.eval('return document.title').catch(() => '')) === 'READY') break;
      await page.wait(500);
    }
    const stops = await page.eval(INSTALL);
    const build = await page.eval('return fetch(new URL("version.json", document.baseURI)).then((r) => r.json()).then((v) => ({ revision: v.revision ?? null })).catch(() => ({ revision: null }));');
    const views = [], draws = [];
    for (const i of opts.views ?? Array.from({ length: stops }, (_, n) => n)) {
      await page.eval(`window.__framePasses.view(${i}); return 1;`);
      for (let f = 0; f < opts.settle; f++) await page.eval('return window.__framePasses.frame(false).then(() => 1);');
      const records = await page.eval('return window.__framePasses.frame(true);');
      if (opts.records) draws.push({ view: i, records });
      const summary = { view: i, ...frameSummary(records) };
      views.push(summary);
      console.log(`view ${i}: ${summary.calls} draws, ${million(summary.triangles)} triangles`);
      console.log(table(summary.passes, 8));
      console.log(table(summary.objects, 6));
    }
    const route = routeSummary(views);
    console.log(`\nroute (${route.views} views, medians): ${Math.round(route.calls)} draws, ${million(route.triangles)} triangles`);
    console.log('by pass:'); console.log(table(route.passes, 10));
    console.log('by part of the world:'); console.log(table(route.modules, 16));
    console.log(`build ${build.revision ?? 'unknown'} at ${base}, ${opts.quality}, ${opts.size.join('×')} at ${opts.dpr}×, ${opts.hour}:00`);
    if (opts.records) fs.writeFileSync(opts.records, `${JSON.stringify(draws)}\n`);
    if (opts.json) fs.writeFileSync(opts.json, `${JSON.stringify({ url: base, ...build, quality: opts.quality, size: opts.size, dpr: opts.dpr, hour: opts.hour, route, views }, null, 1)}\n`);
  } finally {
    await page.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
