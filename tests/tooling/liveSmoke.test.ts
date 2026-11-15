import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { imageSpread, smoke, waitForRevision, type SmokePage } from '../../tools/live-smoke.mjs';

// The live smoke test (tools/live-smoke.mjs) loads the published build in a browser. Here its steps are driven with
// a stand-in page, so each way a build can be broken is shown to be reported, without a browser or the network.

const picture = (width: number, height: number, colour: (x: number, y: number) => [number, number, number]) => {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(colour(x, y), (y * width + x) * 3);
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
};
const scene = () => picture(64, 36, (x, y) => [x * 4 % 256, y * 7 % 256, (x + y) * 3 % 256]);
const blank = () => picture(64, 36, () => [12, 12, 12]);

interface Game { menuAfter: number; newGame: boolean; ready: boolean; failed: boolean; frames: boolean; picture: () => Promise<Buffer>; walks: boolean; pauses: boolean; pausedAtStart: boolean; errors: string[]; version: string }
const healthy = (): Game => ({ menuAfter: 2, newGame: true, ready: true, failed: false, frames: true, picture: scene, walks: true, pauses: true, pausedAtStart: false, errors: [], version: '0.0.48' });

/** A page that behaves as the game does, as far as the smoke test looks. */
function page(game: Game): SmokePage & { keys: string[] } {
  let looks = 0, frame = 10, x = 0, started = false, overlay = game.pausedAtStart ? 'panel' : 'none';
  const held = new Set<string>(), keys: string[] = [];
  return {
    keys,
    async eval(js: string) {
      if (js.includes('.menu-choices button").length')) return ++looks > game.menuAfter;
      if (js.includes('.menu-build span')) return `v${game.version} · abc1234 · pre-alpha`;
      if (js.includes('/new/i.test')) return game.newGame ? [320, 200, 'New Game'] : null;
      if (js.includes('loading-failed')) return { booted: true, ready: started && game.ready && !game.failed, failed: game.failed, text: game.failed ? 'Your journey could not begin. The graphics context was lost while preparing the view.' : 'Preparing the view 3 of 79', bad: [], resources: [], rejections: [] };
      if (js.includes('renderer.info')) { if (game.frames) frame++; return { frame, calls: 240, triangles: 900000 }; }
      if (js.includes('window.tervain.player')) { if (game.walks && held.has('KeyW') && overlay === 'none') x += 0.2; return { x, z: 0 }; }
      if (js.includes('window.tervain.overlay')) return overlay;
      throw new Error(`unexpected page read: ${js.slice(0, 60)}`);
    },
    async wait() {},
    async cdp(method: string, params?: object) {
      const event = params as { type?: string; code?: string; autoRepeat?: boolean };
      if (method === 'Input.dispatchMouseEvent' && event.type === 'mouseReleased') started = true;
      if (method === 'Input.dispatchKeyEvent') {
        if (event.type === 'rawKeyDown' && !event.autoRepeat) { keys.push(event.code!); if (event.code === 'Escape' && game.pauses && !held.has('Escape')) overlay = overlay === 'none' ? 'panel' : 'none'; held.add(event.code!); }
        if (event.type === 'keyUp') held.delete(event.code!);
      }
      return {};
    },
    image: () => game.picture(),
    console: () => game.errors,
  };
}
const run = async (change: Partial<Game> = {}, expectVersion: string | null = '0.0.48') => {
  const stand = page({ ...healthy(), ...change });
  const steps = await smoke(stand, { expectVersion });
  return { steps, failed: steps.filter((step) => !step.ok).map((step) => step.name), names: steps.map((step) => step.name), keys: stand.keys };
};

describe('the live smoke test', () => {
  it('passes a build that loads, draws, pauses, walks and logs nothing', async () => {
    const { steps, failed, names, keys } = await run();
    expect(failed).toEqual([]);
    expect(names).toEqual(['title menu', 'new journey offered', 'world loads', 'frames complete', 'screenshot is not blank', 'pause and resume', 'move forward', 'no console errors']);
    expect(steps.find((step) => step.name === 'title menu')!.detail).toBe('shows "v0.0.48 · abc1234 · pre-alpha", deployment states 0.0.48');
    expect(steps.find((step) => step.name === 'pause and resume')!.detail).toBe('the pause key gave "panel", then "none"');
    expect(steps.find((step) => step.name === 'move forward')!.detail).toMatch(/^the hero moved 0\.60 m with the forward key held for \d+ s$/);
    // Real input: the pause key twice, then the forward key.
    expect(keys).toEqual(['Escape', 'Escape', 'KeyW']);
  });

  it('resumes a game that paused itself, then pauses and resumes it again', async () => {
    const { steps, failed, keys } = await run({ pausedAtStart: true });
    expect(failed).toEqual([]);
    expect(steps.find((step) => step.name === 'pause and resume')!.detail).toBe('the game had paused itself; the pause key gave "none", then "panel", then "none"');
    expect(keys).toEqual(['Escape', 'Escape', 'Escape', 'KeyW']);
  });

  it('stops at the first step a visitor could not get past, and says why', async () => {
    expect((await run({ menuAfter: Infinity })).steps).toEqual([{ name: 'title menu', ok: false, detail: 'the menu did not come up within five minutes' }]);
    expect((await run({ version: '0.0.47' })).failed).toEqual(['title menu']);
    expect((await run({ newGame: false })).steps.at(-1)).toEqual({ name: 'new journey offered', ok: false, detail: 'no menu choice starts a journey' });
    const lost = await run({ failed: true });
    expect(lost.names).toEqual(['title menu', 'new journey offered', 'world loads']);
    expect(lost.steps.at(-1)!.detail).toContain('The graphics context was lost while preparing the view.');
    expect(lost.steps.at(-1)!.detail).toContain('what this means');
  });

  it('reports a build that loads but does not draw, take input or stay quiet, each by name', async () => {
    expect((await run({ frames: false })).failed).toEqual(['frames complete']);
    expect((await run({ picture: blank })).failed).toEqual(['screenshot is not blank']);
    expect((await run({ pauses: false })).failed).toEqual(['pause and resume']);
    expect((await run({ walks: false })).failed).toEqual(['move forward']);
    const noisy = await run({ errors: ['[log] fine', '[error] Graphics rebuild failed', '[exception] TypeError: x is undefined'] });
    expect(noisy.failed).toEqual(['no console errors']);
    expect(noisy.steps.at(-1)!.detail).toBe('[error] Graphics rebuild failed | [exception] TypeError: x is undefined');
  });

  it('tells a drawn frame from a blank one', async () => {
    expect(await imageSpread(await blank())).toEqual({ width: 64, height: 36, min: 12, max: 12, colours: 1 });
    const drawn = await imageSpread(await scene());
    expect(drawn.max - drawn.min).toBeGreaterThan(200);
    expect(drawn.colours).toBeGreaterThan(40);
  });
});

describe('waiting for the commit that was deployed', () => {
  const BASE = 'https://example.test/game/';
  const site = (revision: string) => ({
    [BASE]: '<script type="module" src="./assets/game-1.js"></script>', [`${BASE}assets/game-1.js`]: `const R="${revision}";`, [`${BASE}version.json`]: JSON.stringify({ version: '0.0.48', revision }),
  } as Record<string, string>);
  function clock(sites: Record<string, string>[]) {
    let at = 0, time = 0;
    const log: string[] = [];
    const fetchImpl = (async (address: string) => { const body = sites[Math.min(at, sites.length - 1)]![address]; return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '', json: async () => JSON.parse(body ?? 'null') }; }) as unknown as typeof fetch;
    return { log, options: { fetchImpl, sleep: async (ms: number) => { time += ms; at++; }, now: () => time, log: (line: string) => log.push(line) } };
  }

  it('returns at once when the live build is the commit asked for, by its full or its short name', async () => {
    expect(await waitForRevision(BASE, 'abc1234def5678', clock([site('abc1234')]).options)).toMatchObject({ ok: true, revision: 'abc1234', wanted: 'abc1234def5678' });
    expect(await waitForRevision(BASE, null, clock([site('abc1234')]).options)).toMatchObject({ ok: true, revision: 'abc1234' });
  });

  it('waits while the build before it is still live, and says so', async () => {
    const old = site('1111111'), fresh = site('2222222');
    const waiting = clock([old, old, old, old, old, fresh]);
    expect(await waitForRevision(BASE, '2222222aaaa', waiting.options)).toMatchObject({ ok: true, revision: '2222222' });
    expect(waiting.log).toContain('The live build is still 1111111; waiting for 2222222aa.');
  });

  it('gives up after the time allowed, naming the build that is live', async () => {
    const result = await waitForRevision(BASE, '2222222aaaa', { ...clock([site('1111111')]).options, timeoutMs: 60_000 });
    expect(result).toMatchObject({ ok: false, problems: ['the live build is 1111111, not 2222222aa'] });
  });
});
