/**
 * Whether a deployed copy of the game is whole: the page, every script it can import, and version.json all belong to
 * one build and are all being served.
 *
 * GitHub Pages serves each file through a cache for up to ten minutes and replaces a deployment's files under the same
 * address. For a while after a deploy a request can therefore get the page of one build and be refused a script of
 * that build, because the script's name changes with every build and the old one is gone. A browser that loads the
 * page in that state never finishes loading. The budget gate asks here first and waits until the deployment is whole.
 *
 * The requests are made by Node, not by the browser. Behind a proxy that Node does not use on its own, start the gate
 * with NODE_USE_ENV_PROXY=1 (Node 22.21 or later); without it the gate stops with "could not be reached".
 */

/** The scripts and styles a page's HTML names, as absolute addresses. */
export function pageFiles(html, base) {
  const found = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+\.(?:js|mjs|css))"/g)) found.add(new URL(match[1], base).href);
  return [...found];
}

/** The script files a built script can import: Vite lists them as "./name-hash.js" beside the script itself. */
export function importedFiles(script, address) {
  const found = new Set();
  for (const match of script.matchAll(/["'](\.\/[A-Za-z0-9_.-]+\.(?:js|mjs|css))["']/g)) found.add(new URL(match[1], address).href);
  return [...found];
}

const REVISION = /^[0-9a-f]{7,40}$/i;

/** Why a request got no answer at all: the error's own words and, where it carries one, the system's code for it. */
function noAnswer(error) {
  const cause = error?.cause, code = cause?.code ?? cause?.errors?.[0]?.code;
  return [String(error?.message ?? error), code].filter(Boolean).join(': ');
}

/**
 * One look at a deployment. `problems` is empty when the page was served, every file it names or can import was
 * served, version.json names a revision, and the page's own script carries that same revision. `reached` is false
 * when the address gave no answer at all, which is this machine's network and not the deployment.
 */
export async function deployState(url, fetchImpl = fetch) {
  const problems = [];
  const base = url.endsWith('/') ? url : `${url}/`;
  const get = async (address) => {
    try { return await fetchImpl(address, { cache: 'no-store' }); } catch (error) { return { ok: false, status: 0, text: async () => '', json: async () => null, error: noAnswer(error) }; }
  };
  const page = await get(base);
  if (!page.ok) return { ok: false, reached: page.status !== 0, revision: null, files: 0, problems: [`the page was not served (${page.status || page.error})`] };
  const direct = pageFiles(await page.text(), base);
  if (!direct.some((file) => /\.m?js$/.test(file))) problems.push('the page names no script');
  const entryAddress = direct.find((file) => /\.m?js$/.test(file));
  let entry = '';
  const files = new Set(direct);
  if (entryAddress) {
    const response = await get(entryAddress);
    if (response.ok) { entry = await response.text(); for (const file of importedFiles(entry, entryAddress)) files.add(file); }
  }
  // Every file is asked for, the page's own script included: one refused file is enough to stop a load.
  const statuses = await Promise.all([...files].map(async (file) => [file, (await get(file)).status]));
  for (const [file, status] of statuses) if (status !== 200) problems.push(`${file.slice(base.length)} was refused (${status || 'no answer'})`);
  const version = await get(`${base}version.json`);
  const stated = version.ok ? (await version.json().catch(() => null))?.revision : null;
  const revision = typeof stated === 'string' && REVISION.test(stated) ? stated : null;
  if (!revision) problems.push('version.json names no revision');
  else if (entry && !entry.includes(revision)) problems.push(`version.json names revision ${revision}, which the page's script does not carry: they are from different builds`);
  return { ok: problems.length === 0, reached: true, revision, files: files.size, problems };
}

/**
 * Wait until a deployment is whole on `steady` looks in a row, `intervalMs` apart, so that a deploy still spreading
 * across the servers behind the address is not mistaken for a finished one. Gives up after `timeoutMs`, which is longer
 * than the ten minutes a cached file can outlive a deploy, and at once (`unreachable`) when the address has given no
 * answer at all on `deaf` looks in a row: waiting does not mend a machine that cannot reach the site.
 */
export async function waitForSettledDeploy(url, { timeoutMs = 12 * 60_000, intervalMs = 10_000, steady = 3, deaf = 4, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}, now = () => Date.now() } = {}) {
  const started = now();
  let run = 0, silent = 0, revision = null, last = null;
  for (;;) {
    last = await deployState(url, fetchImpl);
    if (last.ok && (run === 0 || last.revision === revision)) { run++; revision = last.revision; } else { run = last.ok ? 1 : 0; revision = last.ok ? last.revision : null; }
    if (run >= steady) return { ok: true, unreachable: false, revision, files: last.files, waitedMs: now() - started, problems: [] };
    silent = last.reached ? 0 : silent + 1;
    if (silent >= deaf) return { ok: false, unreachable: true, revision: null, files: 0, waitedMs: now() - started, problems: last.problems };
    if (!last.ok) log(`Live deployment is not whole yet: ${last.problems.join('; ')}`);
    if (now() - started >= timeoutMs) return { ok: false, unreachable: false, revision: last.revision, files: last.files, waitedMs: now() - started, problems: last.ok ? ['the deployment kept changing revision'] : last.problems };
    await sleep(intervalMs);
  }
}
