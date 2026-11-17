#!/usr/bin/env node
/**
 * How long each stage of a journey's load takes, from the click on New journey to the moment the loading screen lifts.
 *
 *   npm run perf:load -- --url http://127.0.0.1:4173/ [--url http://127.0.0.1:4174/] [--runs 3] [--title-wait 15]
 *                        [--until view] [--headed] [--json results.json]
 *
 * Each run opens a fresh browser (software rendering, unless --headed draws on this machine's GPU), waits on the title
 * menu for --title-wait seconds (the menu fetches the journey's files ahead, A86), clicks New journey and timestamps
 * every update of the loading screen and its lifting. A stage lasts from the first update that names it until the
 * first update of the next. With several URLs the runs alternate between them, so the machine's slow and fast spells
 * fall on each alike; compare two builds by serving each on its own port (`npx vite preview --outDir <dir> --port <n>`).
 * With --until view a run ends where the first view's preparation begins: without a GPU that stage is mostly the
 * software renderer compiling shaders, and a run is a third as long. It prints every run, then each stage's median per URL.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPage } from './cdp.mjs';

/** Each stage's start (s after the click) and length (s), in the order the stages first showed. */
export function stageTimes(updates, clickAt, liftedAt) {
  const starts = new Map();
  for (const update of updates) if (update.t >= clickAt && !starts.has(update.phase)) starts.set(update.phase, update.t);
  const order = [...starts].sort((a, b) => a[1] - b[1]);
  return order.map(([phase, t], i) => ({ phase, start: (t - clickAt) / 1000, seconds: ((order[i + 1]?.[1] ?? liftedAt) - t) / 1000 }));
}

/** A run's stages and total: to the lifting of the loading screen, or with `until` 'view' to the first view's preparation. */
export function runResult(record, until = 'lifted') {
  const end = until === 'view' ? record.updates.find((update) => update.t >= record.clickAt && update.phase === 'graphics')?.t ?? record.liftedAt : record.liftedAt;
  return { stages: stageTimes(record.updates.filter((update) => update.t < end), record.clickAt, end), total: (end - record.clickAt) / 1000 };
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** One row per stage (in the order they first showed in any run) and one for the whole load, with each URL's median. */
export function summary(results) {
  const urls = [...new Set(results.map((r) => r.url))];
  const stages = [];
  for (const r of results) for (const s of r.stages) if (!stages.includes(s.phase)) stages.push(s.phase);
  const cell = (url, pick) => {
    const value = median(results.filter((r) => r.url === url).map(pick));
    return Number.isFinite(value) ? value.toFixed(1).padStart(8) : '       –';
  };
  const lines = [`${'stage'.padEnd(12)}${urls.map((_, i) => `   url ${i + 1}`.padStart(8)).join('')}`];
  for (const phase of stages) lines.push(`${phase.padEnd(12)}${urls.map((url) => cell(url, (r) => r.stages.find((s) => s.phase === phase)?.seconds ?? NaN)).join('')}`);
  lines.push(`${'total'.padEnd(12)}${urls.map((url) => cell(url, (r) => r.total)).join('')}`);
  const runs = (url) => { const n = results.filter((r) => r.url === url).length; return `${n} run${n === 1 ? '' : 's'}`; };
  return [...lines, '', ...urls.map((url, i) => `url ${i + 1}: ${url} (${runs(url)}, medians in seconds)`)].join('\n');
}

const RECORD = `
  const screen = window.tervain.loadingScreen, update = screen.update.bind(screen), finish = screen.finish.bind(screen);
  const record = window.__tervainLoad = { updates: [], clickAt: null, liftedAt: null };
  screen.update = (u) => { record.updates.push({ t: performance.now(), phase: u.phase, detail: u.detail ?? '' }); return update(u); };
  screen.finish = (...args) => { record.liftedAt ??= performance.now(); return finish(...args); };
  const button = [...document.querySelectorAll('.menu-choices button')].find((b) => /new/i.test(b.textContent));
  button.addEventListener('pointerdown', () => { record.clickAt ??= performance.now(); }, { once: true, capture: true });
  const box = button.getBoundingClientRect();
  return [box.x + box.width / 2, box.y + box.height / 2];`;

async function until(page, condition, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await page.eval(condition).catch(() => false)) return;
    await page.wait(250);
  }
  throw new Error(`timed out after ${seconds} s waiting for: ${condition.trim().slice(0, 80)}`);
}

async function measure(url, { titleWait, headed, until: stop }) {
  const page = await openPage(url, { w: 960, h: 540, headed });
  try {
    await until(page, `return window.tervain?.mode === 'title' && document.querySelectorAll('.menu-choices button').length > 0`, 600);
    await page.wait(titleWait * 1000);
    const [x, y] = await page.eval(RECORD);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    }
    await until(page, stop === 'view' ? `return !!window.__tervainLoad?.updates.some((u) => u.phase === 'graphics')`
      : `return window.tervain?.mode === 'play' && window.__tervainLoad?.liftedAt !== null`, 1800);
    const record = await page.eval('return window.__tervainLoad');
    return { url, ...runResult(record, stop) };
  } finally {
    await page.close();
  }
}

function options(argv) {
  const out = { urls: [], runs: 3, titleWait: 15, headed: false, json: null, until: 'lifted' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--url') { out.urls.push(value); i++; }
    else if (flag === '--runs') { out.runs = Number(value); i++; }
    else if (flag === '--title-wait') { out.titleWait = Number(value); i++; }
    else if (flag === '--json') { out.json = value; i++; }
    else if (flag === '--until') { out.until = value; i++; }
    else if (flag === '--headed') out.headed = true;
    else throw new Error(`unknown option ${flag}`);
  }
  if (!out.urls.length) out.urls.push(process.env.TERVAIN_URL ?? 'http://127.0.0.1:4173/');
  if (!Number.isInteger(out.runs) || out.runs < 1) throw new Error('--runs takes a whole number of runs');
  if (!(out.titleWait >= 0)) throw new Error('--title-wait takes seconds');
  if (!['lifted', 'view'].includes(out.until)) throw new Error('--until takes lifted or view');
  return out;
}

async function main() {
  const opts = options(process.argv.slice(2)), results = [];
  for (let run = 1; run <= opts.runs; run++) {
    for (const url of opts.urls) {
      const result = await measure(url, opts);
      results.push(result);
      console.log(`run ${run} ${url}: ${result.stages.map((s) => `${s.phase} ${s.seconds.toFixed(1)}`).join(', ')}; total ${result.total.toFixed(1)} s`);
    }
  }
  console.log(`\n${summary(results)}`);
  if (opts.json) fs.writeFileSync(opts.json, `${JSON.stringify(results, null, 1)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
