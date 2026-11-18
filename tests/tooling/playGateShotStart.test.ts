import { installPopulationProbe, fullPopulation } from './fixtures/budgetPopulation';
import { expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(failure = '') {
  const fixture = mkdtempSync(join(tmpdir(), 'tervain-budget-start-'));
  try {
    installPopulationProbe(fixture);
    for (const name of ['play-gate.mjs', 'webgl-upload-bytes.mjs', 'budget-frame-samples.mjs', 'hero-draw-observer.mjs', 'budget-probe.mjs']) writeFileSync(join(fixture, name), readFileSync(`tools/${name}`));
    // The live deployment is whole unless the scenario says otherwise.
    writeFileSync(join(fixture, 'live-deploy.mjs'), `export async function waitForSettledDeploy() {
      const fail = process.env.GATE_FIXTURE_FAIL;
      if (fail === 'unsettled') return { ok: false, unreachable: false, revision: null, files: 0, waitedMs: 720000, problems: ['assets/world-old.js was refused (404)'] };
      if (fail === 'unreachable') return { ok: false, unreachable: true, revision: null, files: 0, waitedMs: 30000, problems: ['the page was not served (fetch failed: ENOTFOUND)'] };
      return { ok: true, unreachable: false, revision: '1234567', files: 7, waitedMs: 0, problems: [] };
    }`);
    writeFileSync(join(fixture, 'cdp.mjs'), `
      import fs from 'node:fs';
      const all = [];
      export const NO_GPU_WATCHDOG = '--disable-gpu-watchdog';
      export async function openPage(url, options = {}) {
        const head = url.includes('/head/'), fail = process.env.GATE_FIXTURE_FAIL;
        const trace = { titlePolls: 0, mouseEvents: 0, waitMs: 0, samples: 0, flags: options.flags ?? [] };
        all.push(trace);
        // The first live load fails for 'load-failed-once'; every live load fails for 'load-failed'.
        const failedLoad = !head && (fail === 'load-failed' || (fail === 'load-failed-once' && all.length === 1));
        return {
          async eval(js) {
            if (js.includes('mode === "title"')) { trace.titlePolls++; return false; }
            if (js.includes('menu-choices')) return [0, 0]; // Hidden button remains in the live DOM.
            if (js.includes('loading-failed')) return { booted: true, ready: fail !== 'not-ready' && !failedLoad, failed: failedLoad,
              text: failedLoad ? 'The journey could not be prepared. Resident fisher could not load (HTTP 404).' : 'Preparing the view 3 of 79', bad: failedLoad ? ['404 public/models/npcs/fisher.glb'] : [], resources: [], rejections: [] };
            if (js.includes('window.__readBudgetPopulation =')) return { figures: ${JSON.stringify(fullPopulation.figures)} };
            if (js.includes('T.arrivals.count')) return {population:${JSON.stringify(fullPopulation)}, pending:0, settled:'done'};
            if (js.includes('return [T.player.x')) return [0,0,0,0];
            if (js.includes('window.requestAnimationFrame')) return 1;
            if (js.includes('__budgetFrames.samples.length')) return true;
            if (js.includes('return r.samples')) { trace.samples += 4; return Array.from({ length: 4 }, () =>
              [242 + Number(head && fail === 'draws'), 2874566 + Number(head && fail === 'triangles'), ${JSON.stringify(fullPopulation)}]); }
            if (js.includes('version.json')) return { revision: head ? (fail === 'revision' ? 'badcafe' : 'abcdef0') : '1234567' };
            if (js.includes('T.hud.show')) return 1;
            throw Error('Unexpected probe operation');
          },
          async wait(ms) { trace.waitMs += ms; },
          async cdp(method) { if (method === 'Input.dispatchMouseEvent') trace.mouseEvents++; },
          console() { return head && fail === 'console' ? ['[error] fixture error'] : []; },
          close() { fs.writeFileSync(process.env.GATE_FIXTURE_TRACE, JSON.stringify(all)); }
        };
      }
    `);
    const traceFile = join(fixture, 'trace.json');
    const result = spawnSync(process.execPath, [join(fixture, 'play-gate.mjs'), '--url', 'https://gate.invalid/head/',
      '--budget-url', 'https://gate.invalid/live/', '--head', 'abcdef012345'],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, GATE_FIXTURE_FAIL: failure, GATE_FIXTURE_TRACE: traceFile } });
    // No trace is written when no page was opened at all.
    const trace = existsSync(traceFile) ? JSON.parse(readFileSync(traceFile, 'utf8')) as { titlePolls: number; mouseEvents: number; waitMs: number; samples: number; flags: string[] }[] : [];
    return { result, trace };
  } finally { rmSync(fixture, { recursive: true, force: true }); }
}

it('probes an already-started shot world without waiting for or clicking its hidden title menu', () => {
  const { result, trace } = run();
  expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
  expect(result.stdout).toContain('play-gate: PASS abcdef0');
  expect(trace.reduce((n, p) => n + p.samples, 0)).toBe(24);
  expect(result.stderr).toBe('');
  expect(trace).toHaveLength(3); // Two live probes and the candidate remain required.
  // Every probe's browser is started without the GPU watchdog: a software renderer's first view can outlast it.
  for (const probe of trace) expect(probe.flags).toEqual(['--disable-gpu-watchdog']);
  expect(trace.reduce((n, p) => n + p.titlePolls, 0)).toBe(0);
  expect(trace.reduce((n, p) => n + p.mouseEvents, 0)).toBe(0);
  expect(trace.reduce((n, p) => n + p.waitMs, 0)).toBe(81000); // Each visit has 15 s to stream and two four-frame samples.
});

it('fails without a receipt when shot gameplay never becomes ready', () => {
  const { result } = run('not-ready');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Budget scene did not become ready');
  expect(result.stdout).not.toContain('play-gate: PASS');
});

it.each(['draws', 'triangles', 'console', 'revision'])('still rejects a %s regression', failure => {
  const { result } = run(failure);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain('# Budget gate: FAIL');
  expect(result.stdout).not.toContain('play-gate: PASS');
});

it('stops at once when the live page reports a failed load, says why, and passes when one more load succeeds', () => {
  const { result, trace } = run('load-failed-once');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('play-gate: PASS abcdef0');
  expect(result.stderr).toContain('Resident fisher could not load (HTTP 404)');
  expect(result.stderr).toContain('loading it once more');
  expect(trace).toHaveLength(4); // The failed live load, its repeat, the second live probe and the candidate.
  expect(trace[0]!.waitMs).toBe(0); // No ten-minute wait on a page that has already said it failed.
});

it('fails with the page\'s own words when the live load fails twice', () => {
  const { result, trace } = run('load-failed');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Budget scene did not become ready (live, first probe): the loading screen reports a failed load');
  expect(result.stderr).toContain('request: 404 public/models/npcs/fisher.glb');
  expect(result.stdout).not.toContain('play-gate: PASS');
  expect(trace).toHaveLength(2);
});

it('says so when the live build cannot be reached at all, and how to reach it behind a proxy', () => {
  const { result, trace } = run('unreachable');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Budget gate: FAIL: The live build could not be reached from this machine: the page was not served (fetch failed: ENOTFOUND). Behind a proxy, start the gate with NODE_USE_ENV_PROXY=1.');
  expect(trace).toHaveLength(0);
});

it('fails without opening a page when the live deployment is not whole', () => {
  const { result, trace } = run('unsettled');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Budget gate: FAIL: The live deployment was not whole after 12 minutes: assets/world-old.js was refused (404)');
  expect(result.stdout).not.toContain('play-gate: PASS');
  expect(trace).toHaveLength(0);
});
