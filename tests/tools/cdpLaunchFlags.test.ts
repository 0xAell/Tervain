import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { NO_GPU_WATCHDOG, SOFTWARE_RENDERER_FLAGS } from '../../tools/cdp.mjs';

// How the tools start their browser. A stand-in browser records the arguments it was given and exits, so the launch
// is observed without a real one.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = mkdtempSync(join(tmpdir(), 'tervain-cdp-flags-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function launchedWith(options: string): string[] {
  const record = join(work, `args-${Math.random().toString(36).slice(2)}.txt`);
  const browser = join(work, 'browser.sh');
  writeFileSync(browser, '#!/bin/sh\nfor argument in "$@"; do printf "%s\\n" "$argument"; done > "$RECORD"\nexit 1\n');
  chmodSync(browser, 0o755);
  const script = `import { openPage } from ${JSON.stringify(pathToFileURL(join(root, 'tools', 'cdp.mjs')).href)};
    await openPage('about:blank', ${options}).catch((error) => { if (error.message !== 'browser did not start') throw error; });`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20000, env: { ...process.env, CHROME: browser, RECORD: record, CDP_STARTUP_MS: '5000' } });
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return readFileSync(record, 'utf8').trim().split('\n');
}

describe.skipIf(process.platform === 'win32')('the browser the tools start', () => {
  it('uses the software renderer without the GPU watchdog when headless', () => {
    const args = launchedWith('{}');
    expect(args).toContain('--headless=new');
    for (const flag of SOFTWARE_RENDERER_FLAGS) expect(args).toContain(flag);
    expect(args).toContain('--disable-gpu-watchdog');
  });

  it('leaves the watchdog on for a headed run on the machine\'s own GPU, unless the caller turns it off', () => {
    const headed = launchedWith('{ headed: true }');
    expect(headed).not.toContain('--headless=new');
    expect(headed).not.toContain(NO_GPU_WATCHDOG);
    expect(headed).not.toContain('--use-angle=swiftshader');
    expect(launchedWith(`{ headed: true, flags: [${JSON.stringify(NO_GPU_WATCHDOG)}] }`)).toContain('--disable-gpu-watchdog');
  });

  it('names the flag once, for the gate and the headless tools alike', () => {
    expect(NO_GPU_WATCHDOG).toBe('--disable-gpu-watchdog');
    expect(SOFTWARE_RENDERER_FLAGS.filter((flag) => flag === NO_GPU_WATCHDOG)).toHaveLength(1);
    expect(readFileSync(join(root, 'tools', 'play-gate.mjs'), 'utf8')).toContain('flags: [NO_GPU_WATCHDOG]');
  });
});
