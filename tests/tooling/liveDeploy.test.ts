import { describe, expect, it } from 'vitest';
import { deployState, importedFiles, pageFiles, waitForSettledDeploy } from '../../tools/live-deploy.mjs';

const BASE = 'https://example.test/game/';
const page = (entry: string) => `<!doctype html><html><head>
  <script type="module" crossorigin src="./assets/${entry}"></script>
  <link rel="modulepreload" crossorigin href="./assets/three.module-AAAA.js">
  <link rel="stylesheet" crossorigin href="./assets/game-CCCC.css">
  <link rel="icon" href="data:image/svg+xml,%3Csvg%3E"></head><body></body></html>`;
const script = (revision: string, world: string) => `import"./three.module-AAAA.js";const R="${revision}";const deps=["./${world}","./three.module-AAAA.js"];export{R,deps};`;

/** A site as a table of addresses; anything not in it is refused. */
function site(files: Record<string, string>) {
  const asked: string[] = [];
  const fetchImpl = (async (address: string) => {
    asked.push(address);
    const body = files[address];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '', json: async () => JSON.parse(body ?? 'null') };
  }) as unknown as typeof fetch;
  return { fetchImpl, asked };
}
const build = (revision: string, tag: string) => ({
  [BASE]: page(`game-${tag}.js`),
  [`${BASE}assets/game-${tag}.js`]: script(revision, `world-${tag}.js`),
  [`${BASE}assets/world-${tag}.js`]: 'export{}',
  [`${BASE}assets/three.module-AAAA.js`]: 'export{}',
  [`${BASE}assets/game-CCCC.css`]: 'body{}',
  [`${BASE}version.json`]: JSON.stringify({ version: '0.0.1', revision }),
});

describe('reading a deployment', () => {
  it('finds the files a page names and the files its script can import', () => {
    expect(pageFiles(page('game-1111.js'), BASE)).toEqual([`${BASE}assets/game-1111.js`, `${BASE}assets/three.module-AAAA.js`, `${BASE}assets/game-CCCC.css`]);
    expect(importedFiles(script('abc1234', 'world-1111.js'), `${BASE}assets/game-1111.js`)).toEqual([`${BASE}assets/three.module-AAAA.js`, `${BASE}assets/world-1111.js`]);
  });

  it('is whole when the page, every file and version.json come from one build', async () => {
    const whole = site(build('abc1234', '1111'));
    expect(await deployState(BASE, whole.fetchImpl)).toEqual({ ok: true, revision: 'abc1234', files: 4, problems: [] });
    // Each file was asked for, not assumed.
    for (const name of ['assets/game-1111.js', 'assets/world-1111.js', 'assets/three.module-AAAA.js', 'assets/game-CCCC.css', 'version.json']) expect(whole.asked).toContain(BASE + name);
    expect((await deployState(BASE.slice(0, -1), whole.fetchImpl)).ok).toBe(true);
  });

  it('names the file when a script the page can import is refused', async () => {
    // The page of the old build is still being served, but the old build's files are gone.
    const files = { ...build('2222bbb', '2222'), [BASE]: page('game-1111.js'), [`${BASE}assets/game-1111.js`]: script('1111aaa', 'world-1111.js') };
    const skewed = await deployState(BASE, site(files).fetchImpl);
    expect(skewed.ok).toBe(false);
    expect(skewed.problems).toContain('assets/world-1111.js was refused (404)');
    expect(skewed.problems.join(' ')).toContain('version.json names revision 2222bbb, which the page\'s script does not carry');
  });

  it('says when the page itself, its script or version.json is missing', async () => {
    expect((await deployState(BASE, site({}).fetchImpl)).problems).toEqual(['the page was not served (404)']);
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect((await deployState(BASE, down)).problems).toEqual(['the page was not served (fetch failed)']);
    expect((await deployState(BASE, site({ [BASE]: '<html></html>', [`${BASE}version.json`]: '{"revision":"abc1234"}' }).fetchImpl)).problems).toEqual(['the page names no script']);
    const { [`${BASE}version.json`]: _dropped, ...withoutVersion } = build('abc1234', '1111');
    expect((await deployState(BASE, site(withoutVersion).fetchImpl)).problems).toEqual(['version.json names no revision']);
  });
});

describe('waiting for a deployment to settle', () => {
  /** Looks at a different site each time, by a script of states, with a clock that only sleeping moves. */
  function clock(looks: Record<string, string>[]) {
    let at = 0, time = 0;
    const log: string[] = [];
    const fetchImpl = (async (address: string) => site(looks[Math.min(at, looks.length - 1)]!).fetchImpl(address)) as unknown as typeof fetch;
    return { log, options: { fetchImpl, intervalMs: 10_000, sleep: async (ms: number) => { time += ms; at++; }, now: () => time, log: (line: string) => log.push(line) }, looks: () => at + 1 };
  }

  it('needs three whole looks in a row at one revision', async () => {
    const steady = clock([build('abc1234', '1111')]);
    expect(await waitForSettledDeploy(BASE, steady.options)).toEqual({ ok: true, revision: 'abc1234', files: 4, waitedMs: 20_000, problems: [] });
    expect(steady.looks()).toBe(3);
  });

  it('waits out a deploy that is still spreading, and starts counting again when the revision changes', async () => {
    const old = build('1111aaa', '1111'), fresh = build('2222bbb', '2222');
    const halfway = { ...fresh, [BASE]: old[BASE]!, [`${BASE}assets/game-1111.js`]: old[`${BASE}assets/game-1111.js`]! };
    const deploying = clock([old, old, halfway, halfway, fresh, fresh, fresh]);
    const settled = await waitForSettledDeploy(BASE, deploying.options);
    expect(settled).toMatchObject({ ok: true, revision: '2222bbb', waitedMs: 60_000 });
    expect(deploying.looks()).toBe(7);
    expect(deploying.log).toHaveLength(2);
    expect(deploying.log[0]).toContain('Live deployment is not whole yet: assets/world-1111.js was refused (404)');
  });

  it('gives up after the time allowed and says what was still wrong', async () => {
    const broken = clock([{ ...build('abc1234', '1111'), [`${BASE}assets/world-1111.js`]: undefined as unknown as string }]);
    const result = await waitForSettledDeploy(BASE, { ...broken.options, timeoutMs: 60_000 });
    expect(result).toMatchObject({ ok: false, waitedMs: 60_000, problems: ['assets/world-1111.js was refused (404)'] });
  });

  it('allows more than the ten minutes a cached file can outlive a deploy', async () => {
    const broken = clock([{}]);
    expect((await waitForSettledDeploy(BASE, broken.options)).waitedMs).toBeGreaterThan(10 * 60_000);
  });
});
