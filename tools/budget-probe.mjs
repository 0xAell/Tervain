/**
 * How the budget gate waits for a page to finish loading, and what it reports when the page does not.
 *
 * The gate used to poll for the playing world for ten minutes and then say only "Budget scene did not become ready".
 * A load that has failed says so on the page long before that: the loading screen shows its failure card, or a script
 * the page imports could not be fetched. This reads those signs, stops as soon as one appears, and puts what the page
 * said into the error, so a failed run names its cause.
 */

/**
 * Runs before the page's own scripts. It keeps a short record of what a failed load looks like from inside the page:
 * requests that came back with an error status or did not complete, scripts and styles that failed to load, and
 * promise rejections nothing handled (a failed dynamic import is one).
 */
export const PROBE_INIT = `(() => {
  const record = (window.__gateNet = { bad: [], resources: [], rejections: [] });
  const tail = (url) => String(url).slice(-120);
  const original = window.fetch;
  if (typeof original === 'function') window.fetch = async function (input, options) {
    const url = input && input.url ? input.url : input;
    try {
      const response = await original.call(this, input, options);
      if (!response.ok && record.bad.length < 40) record.bad.push(response.status + ' ' + tail(url));
      return response;
    } catch (error) {
      if (!(options && options.signal && options.signal.aborted) && record.bad.length < 40) record.bad.push('failed ' + tail(url) + ' (' + String(error && error.message || error).slice(0, 80) + ')');
      throw error;
    }
  };
  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window && (target.src || target.href) && record.resources.length < 20) record.resources.push(tail(target.src || target.href));
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    if (record.rejections.length < 20) record.rejections.push(String(event.reason && event.reason.message || event.reason).slice(0, 200));
  });
})();`;

/** Evaluated in the page: where its loading stands. */
export const PROBE_STATE = `const T = window.tervain, el = T && T.loadingEl, net = window.__gateNet || null;
  return {
    booted: !!T,
    ready: !!T && T.mode === "play" && !!T.world && !!el && el.classList.contains("off"),
    failed: !!el && el.classList.contains("loading-failed"),
    text: el ? String(el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 400) : "",
    bad: net ? net.bad.slice(0, 12) : [], resources: net ? net.resources.slice(0, 8) : [], rejections: net ? net.rejections.slice(0, 8) : [],
  };`;

/** A load that the page itself reports as failed, as opposed to one that is merely slow. */
export class LoadFailure extends Error {
  constructor(message, state) {
    super(message);
    this.name = 'LoadFailure';
    this.state = state;
  }
}

const MODULE_FAILURE = /dynamically imported module|module script|Failed to load module|error loading dynamically/i;

/** Why a page that is not ready will not become ready, or null while it may still be loading. */
export function loadFailure(state) {
  if (!state) return null;
  if (state.failed) return `the loading screen reports a failed load: ${state.text || '(no text)'}`;
  const script = (state.resources ?? []).find((url) => /\.(js|mjs|css)(\?|$)/.test(url));
  if (script) return `a script or style the page needs did not load: ${script}`;
  const rejection = (state.rejections ?? []).find((text) => MODULE_FAILURE.test(text));
  if (rejection) return `a script the page imports did not load: ${rejection}`;
  return null;
}

/** The lines a failed or timed-out wait adds to its message. */
export function describeState(state, consoleLines = []) {
  const lines = [];
  if (!state) return ['the page could not be read'];
  lines.push(state.booted ? `loading screen: ${state.text || '(empty)'}` : 'the page\'s script had not started');
  for (const bad of state.bad ?? []) lines.push(`request: ${bad}`);
  for (const resource of state.resources ?? []) lines.push(`did not load: ${resource}`);
  for (const rejection of state.rejections ?? []) lines.push(`unhandled: ${rejection}`);
  for (const line of consoleLines.filter((entry) => entry.startsWith('[error]') || entry.startsWith('[exception]')).slice(0, 8)) lines.push(`console: ${line.slice(0, 240)}`);
  return lines;
}

/**
 * Wait until the page is playing. Throws a LoadFailure as soon as the page shows that its load has failed, and an
 * ordinary error, with what the page showed, if it is still loading after `polls` checks `pollMs` apart.
 */
export async function waitUntilReady(page, { polls = 2400, pollMs = 250, label = 'page' } = {}) {
  let state = null;
  for (let i = 0; i <= polls; i++) {
    state = await page.eval(PROBE_STATE).catch(() => null);
    if (state?.ready) return state;
    const failure = loadFailure(state);
    if (failure) throw new LoadFailure(`Budget scene did not become ready (${label}): ${failure}\n  ${describeState(state, page.console?.() ?? []).join('\n  ')}`, state);
    if (i < polls) await page.wait(pollMs);
  }
  throw new Error(`Budget scene did not become ready (${label}): still loading after ${Math.round(polls * pollMs / 1000)} s\n  ${describeState(state, page.console?.() ?? []).join('\n  ')}`);
}
