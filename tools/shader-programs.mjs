#!/usr/bin/env node
/**
 * What the GPU is asked to compile, and when: every shader program three has made once the first view is ready, then
 * those made while the wanderer stands at each stop of the benchmark route and inside two rooms (the shrine hall, whose
 * painted panes take a window capture, and the inn), each held for --settle frames (the capture draws a face a frame).
 *
 *   npm run perf:programs -- [--url http://127.0.0.1:4173/] [--quality high] [--hours 11,22] [--settle 6] [--json programs.json]
 *
 * A program made inside a draw stalls that frame while it compiles and links (100 to 370 ms each on the machines A79
 * measured). One made by three's compile, which the preparation of arriving and hidden pieces calls before they are
 * first drawn (A78), does not. Each made during the tour is counted as one or the other. At the end a fresh material
 * is shown on a visible mesh: the draw that makes its program must be caught, or the count of stalls means nothing.
 * Programs are told apart by three's own cache key; each is listed by shader and by the lights it was made for.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPage } from './cdp.mjs';
import { ROUTE_STOPS } from './frame-passes.mjs';

/** The two rooms toured after the route: the shrine hall and the inn, the camera close behind the wanderer. */
export const ROOM_STOPS = [[[-28, -106, 1], [-28, -96, 1]], [[-4, 30, 1], [-4, 40, 1]]];

const PRECISIONS = new Set(['highp', 'mediump', 'lowp']);
/** Where the light counts sit after the precision in three r186's cache key (getProgramCacheKeyParameters). */
const DIR_LIGHTS = 33, POINT_LIGHTS = 34, HEMI_LIGHTS = 37;

/** A program's shader and the lights it was made for, read from three's cache key. */
export function programKind(key) {
  const parts = String(key).split(','), shader = parts[0] || 'custom', at = parts.findIndex((part) => PRECISIONS.has(part));
  if (at < 0 || parts.length <= at + HEMI_LIGHTS) return { shader, lights: 'unknown' };
  const [dir, point, hemi] = [DIR_LIGHTS, POINT_LIGHTS, HEMI_LIGHTS].map((offset) => Number(parts[at + offset]));
  return { shader, lights: dir + point + hemi > 0 ? `${dir} directional, ${point} point, ${hemi} hemisphere` : 'no lights' };
}

/** How many programs of each kind, the most first: [label, count][]. */
export function tally(keys, label) {
  const counts = new Map();
  for (const key of keys) { const k = label(programKind(key)); counts.set(k, (counts.get(k) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

/**
 * A tour's account: the programs at the first view, those made during the tour, how many of those a preparation made
 * and how many a draw made, and any made by neither (outside both, which the counting would have missed).
 */
export function tourSummary({ before, after, fromCompile, inDraw }) {
  const known = new Set(before), made = after.filter((key) => !known.has(key));
  return { firstView: before.length, duringTour: made.length, prepared: fromCompile, inDraw: inDraw.length,
    unaccounted: made.length - fromCompile - inDraw.length };
}

/** Count draws and compiles in the page: a program first seen when a draw (render) ends was made inside it. */
const INSTALL = `
  const app = window.tervain, r = app.renderer, T = app.world.terrain, V = app.cam.camera.position.constructor;
  const H = (x, z, up) => new V(x, T.heightAt(x, z) + up, z);
  const state = window.__programs = { stop: -1, inDraw: [], fromCompile: 0, ticks: 0,
    stops: ${JSON.stringify([...ROUTE_STOPS, ...ROOM_STOPS])}.map(([at, look], i) => [H(...at), H(...look), i >= ${ROUTE_STOPS.length} ? 1.2 : 6]) };
  const seen = new Set(r.info.programs.map((p) => p.cacheKey)), render = r.render.bind(r), compile = r.compile.bind(r);
  let depth = 0;
  // Frames as the page shows them (three's own frame counter counts each render, and a frame makes several).
  const tick = () => { state.ticks++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  r.render = function (scene, camera) {
    // Programs made between draws (by a preparation) are not a draw's.
    if (depth === 0) for (const p of r.info.programs) seen.add(p.cacheKey);
    depth++;
    try { return render(scene, camera); } finally {
      depth--;
      if (depth === 0) for (const p of r.info.programs) if (!seen.has(p.cacheKey)) { seen.add(p.cacheKey); state.inDraw.push({ stop: state.stop, key: p.cacheKey }); }
    }
  };
  r.compile = function (...args) {
    const had = r.info.programs.length;
    try { return compile(...args); } finally { state.fromCompile += r.info.programs.length - had; }
  };
  state.view = (i) => {
    const [at, look, distance] = state.stops[i], yaw = Math.atan2(look.x - at.x, look.z - at.z);
    state.stop = i; app.cam.manual = null;
    app.player.setPosition(at.x, at.z, yaw, T);
    app.cam.yaw = yaw; app.cam.pitch = 0.25; app.cam.wantDist = distance;
  };
  // The control: a material no program exists for yet, on a mesh the view draws.
  state.control = () => {
    let mesh = null;
    app.world.scene.traverseVisible((o) => { if (!mesh && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && o.material && !Array.isArray(o.material)) mesh = o; });
    const material = mesh.material.clone();
    material.defines = { ...material.defines, TV_PROGRAMS_CONTROL: '' };
    mesh.material = material;
    // Drawn wherever it stands, so its program is made in the next draw.
    mesh.frustumCulled = false;
    state.stop = 'control';
  };
  return state.stops.length;`;

const keys = (page) => page.eval('return window.tervain.renderer.info.programs.map((p) => p.cacheKey);');

/**
 * Wait for `count` frames to be shown. A software renderer shows one every few seconds, at the heaviest stops one every
 * half minute or more: the wait gives up only when no frame at all is shown for three minutes.
 */
async function frames(page, count, where) {
  const start = await page.eval('return window.__programs.ticks;');
  let seen = start, since = Date.now();
  for (;;) {
    const ticks = await page.eval('return window.__programs.ticks;');
    if (ticks >= start + count) return;
    if (ticks !== seen) { seen = ticks; since = Date.now(); }
    else if (Date.now() - since > 180_000) throw new Error(`no frame was shown for three minutes ${where}`);
    await page.wait(250);
  }
}

async function tour(opts, hour) {
  const base = opts.url.replace(/[?#].*$/, '');
  const page = await openPage(`${base}?shot=1&quality=${opts.quality}&hour=${hour}&hud=0&settle=30`, { w: 960, h: 540 });
  try {
    for (let i = 0; i < 2400; i++) {
      if ((await page.eval('return document.title').catch(() => '')) === 'READY') break;
      await page.wait(500);
    }
    const before = await keys(page), stops = await page.eval(INSTALL);
    for (let i = 0; i < stops; i++) {
      await page.eval(`window.__programs.view(${i}); return 1;`);
      await frames(page, opts.settle, `at stop ${i}`);
    }
    const toured = await page.eval('return { inDraw: window.__programs.inDraw, fromCompile: window.__programs.fromCompile };');
    const after = await keys(page);
    await page.eval('window.__programs.control(); return 1;');
    await frames(page, 2, 'after the control');
    const caught = (await page.eval('return window.__programs.inDraw.filter((d) => d.stop === "control").length;')) > 0;
    const build = await page.eval('return fetch(new URL("version.json", document.baseURI)).then((r) => r.json()).then((v) => v.revision ?? null).catch(() => null);');
    return { hour, build, before, after, ...toured, controlCaught: caught };
  } finally {
    await page.close();
  }
}

function options(argv) {
  const out = { url: process.env.TERVAIN_URL ?? 'http://127.0.0.1:4173/', quality: 'high', hours: [11, 22], settle: 6, json: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--url') { out.url = value; i++; }
    else if (flag === '--quality') { out.quality = value; i++; }
    else if (flag === '--hours') { out.hours = value.split(',').map(Number); i++; }
    else if (flag === '--settle') { out.settle = Number(value); i++; }
    else if (flag === '--json') { out.json = value; i++; }
    else throw new Error(`unknown option ${flag}`);
  }
  if (!['low', 'medium', 'high'].includes(out.quality)) throw new Error('--quality takes low, medium or high');
  if (!out.hours.length || !out.hours.every((h) => h >= 0 && h < 24)) throw new Error('--hours takes hours of the day, 0 to 24');
  if (!(out.settle >= 1)) throw new Error('--settle takes a number of frames');
  return out;
}

async function main() {
  const opts = options(process.argv.slice(2)), results = [];
  for (const hour of opts.hours) {
    const result = await tour(opts, hour), summary = tourSummary(result);
    results.push({ ...result, summary });
    console.log(`${hour}:00 (build ${result.build ?? 'unknown'}, ${opts.quality}): ${summary.firstView} programs at the first view; during the tour ${summary.duringTour} more, ${summary.prepared} by a preparation, ${summary.inDraw} inside a draw${summary.unaccounted ? `, ${summary.unaccounted} unaccounted for` : ''}`);
    for (const [label, count] of tally(result.before, (k) => `${k.shader}, ${k.lights}`).slice(0, 12)) console.log(`  ${String(count).padStart(4)}  ${label}`);
    for (const draw of result.inDraw) console.log(`  inside a draw at stop ${draw.stop}: ${programKind(draw.key).shader}, ${programKind(draw.key).lights}`);
    if (!result.controlCaught) throw new Error('the control material\'s program was not caught inside its draw: the count of stalls is not to be trusted');
  }
  if (opts.json) fs.writeFileSync(opts.json, `${JSON.stringify(results.map(({ before, after, ...rest }) => ({ ...rest, firstView: before, duringTour: after.filter((k) => !before.includes(k)) })), null, 1)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
