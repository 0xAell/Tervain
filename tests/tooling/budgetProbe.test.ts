import { describe, expect, it } from 'vitest';
import { describeState, LoadFailure, loadFailure, PROBE_INIT, PROBE_STATE, waitUntilReady, type ProbeState } from '../../tools/budget-probe.mjs';

const state = (over: Partial<ProbeState> = {}): ProbeState => ({ booted: true, ready: false, failed: false, text: 'Preparing the view 3 of 79', bad: [], resources: [], rejections: [], ...over });

/** A page that goes through the given states, one per look, and stays on the last. */
function page(states: (ProbeState | null)[], consoleLines: string[] = []) {
  const seen = { looks: 0, waited: 0 };
  return {
    seen,
    async eval() { const at = states[Math.min(seen.looks, states.length - 1)]; seen.looks++; if (at === null) throw new Error('page gone'); return at; },
    async wait(ms: number) { seen.waited += ms; },
    console: () => consoleLines,
  };
}

describe('waiting for the budget scene', () => {
  it('returns as soon as the page is playing, without waiting first', async () => {
    const ready = page([state({ ready: true })]);
    await expect(waitUntilReady(ready)).resolves.toMatchObject({ ready: true });
    expect(ready.seen).toEqual({ looks: 1, waited: 0 });
  });

  it('keeps looking while the page loads', async () => {
    const loading = page([state(), state(), state({ ready: true })]);
    await waitUntilReady(loading, { pollMs: 250 });
    expect(loading.seen).toEqual({ looks: 3, waited: 500 });
  });

  it('stops at once when the loading screen shows its failure card, and says what it showed', async () => {
    const failed = page([state(), state({ failed: true, text: 'The journey could not be prepared. Resident fisher could not load (HTTP 404).', bad: ['404 npcs/fisher.glb'] })], ['[error] Graphics rebuild failed']);
    const error = await waitUntilReady(failed, { label: 'live, first probe' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LoadFailure);
    expect((error as Error).message).toContain('Budget scene did not become ready (live, first probe): the loading screen reports a failed load: The journey could not be prepared. Resident fisher could not load (HTTP 404).');
    expect((error as Error).message).toContain('request: 404 npcs/fisher.glb');
    expect((error as Error).message).toContain('console: [error] Graphics rebuild failed');
    // One wait between the two looks: not the ten minutes of a page that is only slow.
    expect(failed.seen).toEqual({ looks: 2, waited: 250 });
  });

  it('stops at once when a script the page needs was refused', async () => {
    for (const broken of [state({ booted: false, text: '', resources: ['https://example.test/game/assets/world-abc.js'] }), state({ rejections: ['Failed to fetch dynamically imported module: https://example.test/game/assets/world-abc.js'] })]) {
      const error = await waitUntilReady(page([broken])).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(LoadFailure);
      expect((error as Error).message).toContain('world-abc.js');
    }
  });

  it('does not treat a failed image or an unrelated rejection as a failed load', () => {
    expect(loadFailure(state({ resources: ['https://example.test/game/textures/moss.webp'] }))).toBeNull();
    expect(loadFailure(state({ rejections: ['AbortError: The play() request was interrupted'] }))).toBeNull();
    expect(loadFailure(state({ bad: ['404 version.json'] }))).toBeNull();
    expect(loadFailure(null)).toBeNull();
  });

  it('gives up on a page that is still loading after the allowed looks, with what it was showing', async () => {
    const slow = page([state({ text: 'Preparing surface textures… 17 of 79' })]);
    const error = await waitUntilReady(slow, { polls: 8, pollMs: 250, label: 'candidate' }).catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(LoadFailure);
    expect((error as Error).message).toContain('Budget scene did not become ready (candidate): still loading after 2 s');
    expect((error as Error).message).toContain('loading screen: Preparing surface textures… 17 of 79');
    expect(slow.seen).toEqual({ looks: 9, waited: 2000 });
  });

  it('says so when the page\'s script never started or the page cannot be read', async () => {
    expect(describeState(state({ booted: false, text: '' }))).toEqual(['the page\'s script had not started']);
    expect(describeState(null)).toEqual(['the page could not be read']);
    const gone = await waitUntilReady(page([null]), { polls: 1 }).catch((caught: unknown) => caught);
    expect((gone as Error).message).toContain('the page could not be read');
  });
});

describe('what the probe records inside the page', () => {
  /** A stand-in window, enough for the two scripts. */
  function fakeWindow(fetchImpl: (url: string) => Promise<{ ok: boolean; status: number }>) {
    const listeners: Record<string, ((event: unknown) => void)[]> = {};
    const window = {
      fetch: (input: string) => fetchImpl(input),
      addEventListener: (type: string, listener: (event: unknown) => void) => { (listeners[type] ??= []).push(listener); },
    } as Record<string, unknown>;
    const fire = (type: string, event: unknown) => { for (const listener of listeners[type] ?? []) listener(event); };
    new Function('window', PROBE_INIT)(window);
    const read = () => new Function('window', PROBE_STATE)(window) as ProbeState;
    return { window, fire, read };
  }

  it('notes requests that were refused or did not complete, failed scripts, and unhandled rejections', async () => {
    const page = fakeWindow(async (url) => { if (url.endsWith('down.glb')) throw new TypeError('Failed to fetch'); return { ok: !url.endsWith('missing.glb'), status: url.endsWith('missing.glb') ? 404 : 200 }; });
    const fetchInPage = page.window.fetch as (url: string) => Promise<unknown>;
    await fetchInPage('https://example.test/models/fine.glb');
    await fetchInPage('https://example.test/models/missing.glb');
    await fetchInPage('https://example.test/models/down.glb').catch(() => undefined);
    page.fire('error', { target: { src: 'https://example.test/assets/world-abc.js' } });
    page.fire('error', { target: page.window }); // A script error, not a failed file: not recorded.
    page.fire('unhandledrejection', { reason: new Error('Failed to fetch dynamically imported module') });
    const read = page.read();
    expect(read.booted).toBe(false);
    expect(read.bad).toEqual(['404 https://example.test/models/missing.glb', 'failed https://example.test/models/down.glb (Failed to fetch)']);
    expect(read.resources).toEqual(['https://example.test/assets/world-abc.js']);
    expect(read.rejections).toEqual(['Failed to fetch dynamically imported module']);
    expect(loadFailure(read)).toContain('world-abc.js');
  });

  it('reads ready, failed and the loading text from the game', () => {
    const page = fakeWindow(async () => ({ ok: true, status: 200 }));
    const classes = new Set(['loading']);
    page.window.tervain = { mode: 'title', world: null, loadingEl: { classList: { contains: (name: string) => classes.has(name) }, innerText: ' Preparing   the view\n 3 of 79 ' } };
    expect(page.read()).toMatchObject({ booted: true, ready: false, failed: false, text: 'Preparing the view 3 of 79' });
    Object.assign(page.window.tervain as object, { mode: 'play', world: {} });
    classes.add('off');
    expect(page.read().ready).toBe(true);
    classes.delete('off'); classes.add('loading-failed');
    expect(page.read()).toMatchObject({ ready: false, failed: true });
  });
});
