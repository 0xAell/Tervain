#!/usr/bin/env node
/**
 * Live smoke test: the published build loads, draws, takes input and logs no error.
 *
 *   node tools/live-smoke.mjs [--url https://0xaell.github.io/Tervain/] [--revision <commit>] [--quality low] [--out <dir>]
 *
 * 1. With --revision, waits until the live deployment is whole and is that commit, so the test can run straight
 *    after a deploy and never checks the build before it.
 * 2. Opens the page as a visitor does. The title menu must come up and print the version the deployment states.
 * 3. Starts a new journey with a real click. The world must load and the loading screen must go.
 * 4. Rendering: frames keep completing with draw calls and triangles, and a screenshot is not blank.
 * 5. Input: holding the move-forward key moves the hero; the pause key opens the pause menu and closes it again.
 * 6. No console error and no uncaught exception at any step.
 *
 * It runs headless on the software renderer, at the lowest quality and a small window: this is a check that the build
 * works, not a measurement. Exit code 0 only when every step passed; the summary names each step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LoadFailure, PROBE_INIT, waitUntilReady } from './budget-probe.mjs';
import { openPage } from './cdp.mjs';
import { deployState, waitForSettledDeploy } from './live-deploy.mjs';

/** Wait until the live deployment is whole and states the wanted commit; null revision accepts whichever is live. */
export async function waitForRevision(url, revision, { timeoutMs = 15 * 60_000, intervalMs = 10_000, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now(), log = () => {} } = {}) {
  const started = now();
  for (;;) {
    // Each look at the deployment is given long enough to see it whole three times, even at the end of the wait.
    const settled = await waitForSettledDeploy(url, { fetchImpl, sleep, now, log, intervalMs, timeoutMs: Math.max(3 * intervalMs, timeoutMs - (now() - started)) });
    if (!settled.ok) return { ...settled, wanted: revision };
    if (!revision || revision.startsWith(settled.revision) || settled.revision.startsWith(revision)) return { ...settled, wanted: revision };
    if (now() - started >= timeoutMs) return { ...settled, ok: false, wanted: revision, problems: [`the live build is ${settled.revision}, not ${revision.slice(0, 9)}`] };
    log(`The live build is still ${settled.revision}; waiting for ${revision.slice(0, 9)}.`);
    await sleep(intervalMs);
  }
}

/** The smallest and largest channel value of an image, and how many of 64 sampled points differ from the first. */
export async function imageSpread(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let min = 255, max = 0;
  for (const byte of data) { if (byte < min) min = byte; if (byte > max) max = byte; }
  const at = (index) => { const x = Math.floor(info.width * (0.1 + 0.8 * (index % 8) / 7)), y = Math.floor(info.height * (0.1 + 0.8 * Math.floor(index / 8) / 7)), offset = (y * info.width + x) * 3; return `${data[offset]},${data[offset + 1]},${data[offset + 2]}`; };
  const colours = new Set(Array.from({ length: 64 }, (_unused, index) => at(index)));
  return { width: info.width, height: info.height, min, max, colours: colours.size };
}

const KEY = { KeyW: ['w', 87], Escape: ['Escape', 27] };

/** Run the smoke test against an opened page. Returns the steps, each `{ name, ok, detail }`. */
export async function smoke(page, { expectVersion = null, outDir = null, log = () => {} } = {}) {
  const steps = [];
  const step = (name, ok, detail) => { steps.push({ name, ok: !!ok, detail }); log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`); return !!ok; };
  const key = (type, code, repeat = false) => page.cdp('Input.dispatchKeyEvent', { type, code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], autoRepeat: repeat });
  const state = (js) => page.eval(js).catch(() => null);

  // 2. The title menu.
  let title = false;
  for (let i = 0; i < 1200 && !title; i++) { title = (await state('return window.tervain?.mode === "title" && document.querySelectorAll(".menu-choices button").length > 0')) === true; if (!title) await page.wait(250); }
  const printed = (await state(`return document.querySelector('.menu-build span')?.textContent ?? ''`)) ?? '';
  if (!step('title menu', title && (!expectVersion || printed.includes(`v${expectVersion}`)), title ? `shows "${printed}"${expectVersion ? `, deployment states ${expectVersion}` : ''}` : 'the menu did not come up within five minutes')) return steps;

  // 3. A new journey, by a real click.
  await page.wait(1500);
  const button = await state(`const b = [...document.querySelectorAll('.menu-choices button')].find((x) => /new/i.test(x.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, b.textContent.trim()]`);
  if (!step('new journey offered', !!button, button ? `"${button[2]}"` : 'no menu choice starts a journey')) return steps;
  for (const type of ['mousePressed', 'mouseReleased']) await page.cdp('Input.dispatchMouseEvent', { type, x: button[0], y: button[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  const started = Date.now();
  try {
    await waitUntilReady(page, { label: 'smoke test' });
    step('world loads', true, `playing after ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (error) {
    step('world loads', false, String(error?.message ?? error).split('\n').slice(0, 4).join(' | '));
    if (!(error instanceof LoadFailure)) return steps;
    return steps;
  }

  // 4. Rendering.
  const frame = () => state('const i = window.tervain.renderer.info; return { frame: i.render.frame, calls: i.render.calls, triangles: i.render.triangles }');
  const first = await frame();
  let last = first;
  for (let i = 0; i < 240 && last && first && last.frame < first.frame + 3; i++) { await page.wait(250); last = await frame(); }
  step('frames complete', !!first && !!last && last.frame >= first.frame + 3 && last.calls > 0 && last.triangles > 0, last ? `${last.frame - first.frame} more frames; ${last.calls} draw calls, ${last.triangles} triangles in the last` : 'the renderer could not be read');
  const png = await page.image('png');
  if (outDir) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, 'playing.png'), png); }
  const spread = await imageSpread(png);
  step('screenshot is not blank', spread.max - spread.min > 32 && spread.colours >= 8, `${spread.width}×${spread.height}, values ${spread.min} to ${spread.max}, ${spread.colours} of 64 sampled points differ`);

  // 5. Input: the pause key, then forward. A window without the pointer or the focus pauses itself, so the game may
  // already be paused here; the pause key must then resume it, and pause and resume it once more.
  const overlay = () => state('return window.tervain.overlay');
  // The key is held until the game has taken it: a tap between two slow frames is never seen.
  const press = async (wanted) => {
    await key('rawKeyDown', 'Escape');
    let seen = null;
    for (let i = 0; i < 240 && (seen = await overlay()) !== null && (seen === 'none') !== wanted; i++) await page.wait(250);
    await key('keyUp', 'Escape');
    await page.wait(500);
    return seen;
  };
  const pausedItself = (await overlay()) !== 'none';
  const seen = [];
  if (pausedItself) seen.push(await press(true));
  seen.push(await press(false), await press(true));
  const toggled = seen.every((value, index) => value !== null && (value === 'none') === ((seen.length - index) % 2 === 1));
  step('pause and resume', toggled, `${pausedItself ? 'the game had paused itself; ' : ''}the pause key gave "${seen.join('", then "')}"`);

  // Held until the hero has walked half a metre. On a software renderer the game runs far slower than the clock, and
  // a new journey begins with the wanderer getting to his feet, so this is given minutes, not seconds.
  const where = () => state('const p = window.tervain.player; return { x: p.x, z: p.z }');
  const from = await where();
  await key('rawKeyDown', 'KeyW');
  let to = from, moved = 0, held = Date.now();
  for (let i = 0; i < 1200 && from && moved < 0.5; i++) {
    await page.wait(250); await key('rawKeyDown', 'KeyW', true);
    to = await where(); moved = to ? Math.hypot(to.x - from.x, to.z - from.z) : 0;
    // If the window lost the pointer again while the key was held, resume and keep going.
    if (i % 8 === 7 && (await overlay()) !== 'none') { await key('keyUp', 'KeyW'); await press(true); await key('rawKeyDown', 'KeyW'); }
  }
  await key('keyUp', 'KeyW');
  step('move forward', moved >= 0.5, from && to ? `the hero moved ${moved.toFixed(2)} m with the forward key held for ${Math.round((Date.now() - held) / 1000)} s` : 'the hero could not be read');

  // 6. Nothing went wrong on the way.
  const errors = page.console().filter((line) => line.startsWith('[error]') || line.startsWith('[exception]'));
  step('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).map((line) => line.slice(0, 200)).join(' | ') : 'none');
  return steps;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, i, all) => (arg.startsWith('--') ? [[arg.slice(2), all[i + 1]]] : [])));
  const base = new URL(args.url ?? 'https://0xaell.github.io/Tervain/');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const local = /^(localhost|127\.|\[::1\])/.test(base.hostname);
  let version = null;
  if (!local) {
    const settled = await waitForRevision(base.href, args.revision ?? null, { log: (line) => console.log(line) });
    if (!settled.ok) { console.error(`live-smoke: FAIL: ${settled.unreachable ? 'the live build could not be reached' : 'the live deployment is not ready'}: ${settled.problems.join('; ')}`); process.exit(1); }
    console.log(`ok   deployment: whole, revision ${settled.revision}${args.revision ? ', the commit asked for' : ''}`);
    version = await fetch(new URL('version.json', base)).then((response) => response.json()).then((stated) => stated.version).catch(() => null);
  } else {
    const stated = await deployState(base.href);
    version = stated.ok ? await fetch(new URL('version.json', base)).then((response) => response.json()).then((value) => value.version).catch(() => null) : null;
  }
  const page = new URL(base);
  page.searchParams.set('quality', args.quality ?? 'low');
  let opened = null, steps = [];
  try {
    opened = await openPage(page.href, { w: 640, h: 360, requestTimeoutMs: 600000, init: PROBE_INIT });
    // A headless window has no focus of its own; without this the game sees a blur and pauses.
    await opened.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    steps = await smoke(opened, { expectVersion: version, outDir: args.out ?? null, log: (line) => console.log(line) });
  } catch (error) {
    steps.push({ name: 'browser', ok: false, detail: String(error?.message ?? error) });
    console.log(`FAIL browser: ${String(error?.message ?? error)}`);
  } finally { await opened?.close?.(); }
  const failed = steps.filter((entry) => !entry.ok);
  if (args.out) { fs.mkdirSync(args.out, { recursive: true }); fs.writeFileSync(path.join(args.out, 'report.json'), `${JSON.stringify({ url: base.href, revision: args.revision ?? null, version, steps }, null, 2)}\n`); }
  console.log(failed.length || steps.length < 7 ? `live-smoke: FAIL (${failed.map((entry) => entry.name).join(', ') || 'stopped early'})` : `live-smoke: PASS ${base.href}, ${steps.length} steps`);
  process.exit(failed.length || steps.length < 7 ? 1 : 0);
}
