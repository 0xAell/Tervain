/**
 * Whether a deployed copy of the game is whole: the page, every script it can import, and version.json all belong to
 * one build and are all being served.
 *
 * GitHub Pages serves each file through a cache for up to ten minutes and replaces a deployment's files under the same
 * address. For a while after a deploy a request can therefore get the page of one build and be refused a script of
 * that build, because the script's name changes with every build and the old one is gone. A browser that loads the
 * page in that state never finishes loading. The budget gate asks here first and waits until the deployment is whole.
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

/**
 * One look at a deployment. `problems` is empty when the page was served, every file it names or can import was
 * served, version.json names a revision, and the page's own script carries that same revision.
 */
export async function deployState(url, fetchImpl = fetch) {
  const problems = [];
  const base = url.endsWith('/') ? url : `${url}/`;
  const get = async (address) => {
    try { return await fetchImpl(address, { cache: 'no-store' }); } catch (error) { return { ok: false, status: 0, text: async () => '', json: async () => null, error: String(error?.message ?? error) }; }
  };
  const page = await get(base);
  if (!page.ok) return { ok: false, revision: null, files: 0, problems: [`the page was not served (${page.status || page.error})`] };
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
  return { ok: problems.length === 0, revision, files: files.size, problems };
}

/**
 * Wait until a deployment is whole on `steady` looks in a row, `intervalMs` apart, so that a deploy still spreading
 * across the servers behind the address is not mistaken for a finished one. Gives up after `timeoutMs`, which is longer
 * than the ten minutes a cached file can outlive a deploy.
 */
export async function waitForSettledDeploy(url, { timeoutMs = 12 * 60_000, intervalMs = 10_000, steady = 3, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}, now = () => Date.now() } = {}) {
  const started = now();
  let run = 0, revision = null, last = null;
  for (;;) {
    last = await deployState(url, fetchImpl);
    if (last.ok && (run === 0 || last.revision === revision)) { run++; revision = last.revision; } else { run = last.ok ? 1 : 0; revision = last.ok ? last.revision : null; }
    if (run >= steady) return { ok: true, revision, files: last.files, waitedMs: now() - started, problems: [] };
    if (!last.ok) log(`Live deployment is not whole yet: ${last.problems.join('; ')}`);
    if (now() - started >= timeoutMs) return { ok: false, revision: last.revision, files: last.files, waitedMs: now() - started, problems: last.ok ? ['the deployment kept changing revision'] : last.problems };
    await sleep(intervalMs);
  }
}
