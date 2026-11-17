import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import packageJson from './package.json' with { type: 'json' };
import packageLock from './package-lock.json' with { type: 'json' };
import { defineConfig } from 'vitest/config';
import { gothic3LocalData } from './tools/gothic3LocalData.ts';
import { hostedModelDelivery, productionModelAssetBase } from './tools/modelAssetDelivery.ts';

if (!/^0\.0\.\d+$/.test(packageJson.version)) {
  throw new Error(`Tervain must stay on the 0.0.x build line until its quality gate is met (got ${packageJson.version}).`);
}

if (packageLock.version !== packageJson.version || packageLock.packages[''].version !== packageJson.version) {
  throw new Error(
    `Tervain package-lock.json must match package.json ${packageJson.version} (lockfile: ${packageLock.version}; root package: ${packageLock.packages[''].version}).`,
  );
}

function sourceRevision(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/** version.json next to index.html: the running build compares it with its own revision (src/platform/buildCheck.ts). */
function buildStamp() {
  return {
    name: 'tervain-build-stamp',
    apply: 'build' as const,
    generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): string }) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ version: packageJson.version, revision: sourceRevision() })}
` });
    },
  };
}

/**
 * How long one of the game's tests may run before it fails as a timeout (ms), wherever it runs. A dozen scene tests
 * build rigs, trees and terrain and take two to six seconds on an idle machine. Under vitest's own default of five
 * seconds they failed as timeouts on a busy machine while CI, which gave them ninety, passed them: the hero's
 * quarter turn among them (docs/decisions.md, 15 November 2026). Local runs and CI now read this one number.
 */
export const GAME_TEST_TIMEOUT = 90_000;
/** The tests of the separate Gothic 3 study: a project of their own, outside the game's and the seed's checks. */
export const GOTHIC3_STUDY_TESTS = ['tests/gothic3*/**/*.test.ts', 'tests/gothic3*.test.ts'];

// The site is served from https://0xaell.github.io/Tervain/ so assets need a repo-relative base.
export default defineConfig(({ command, mode }) => {
  const modelBase = productionModelAssetBase(command, mode, process.env);
  return {
    base: command === 'build' ? './' : '/',
    // Development only: serves a local Gothic 3 Data folder (G3_DATA) to /gothic3-local/; see tools/gothic3LocalData.ts.
    plugins: [gothic3LocalData(), hostedModelDelivery(modelBase), buildStamp()],
    define: {
      __GAME_VERSION__: JSON.stringify(packageJson.version),
      __SOURCE_REVISION__: JSON.stringify(sourceRevision()),
      __MODEL_ASSET_BASE__: JSON.stringify(modelBase),
    },
    server: {
      watch: {
        // These generated study archives are served/read on demand, not application sources.
        // Keep src/gothic3 and assets/gothic3 receipts/manifests watched for normal HMR.
        ignored: ['**/assets/gothic3/**/sources{,/**}', '**/public/gothic3{,/**}'],
      },
    },
    build: {
      rolldownOptions: {
        input: {
          tervain: fileURLToPath(new URL('./index.html', import.meta.url)),
          gothic3: fileURLToPath(new URL('./gothic3/index.html', import.meta.url)),
          gothic3Local: fileURLToPath(new URL('./gothic3-local/index.html', import.meta.url)),
        },
      },
      target: 'es2023',
      chunkSizeWarningLimit: 1200,
    },
    test: {
      environment: 'node',
      // Geometry and inline painting are CPU-heavy; avoid competing workers causing spurious timeouts.
      maxWorkers: 2,
      // Two sets of tests that share nothing: the game's, which are also the port seed's checks, and the separate
      // Gothic 3 study's. `vitest run --project game` never loads the study, and the study's tests never load the game
      // (tests/tooling/gothic3Study.test.ts holds both to that).
      projects: [
        { extends: true, test: { name: 'game', include: ['tests/**/*.test.ts'], exclude: GOTHIC3_STUDY_TESTS, setupFiles: ['tests/setup/downloads.ts'], testTimeout: GAME_TEST_TIMEOUT } },
        { extends: true, test: { name: 'gothic3', include: GOTHIC3_STUDY_TESTS } },
      ],
    },
  };
});
