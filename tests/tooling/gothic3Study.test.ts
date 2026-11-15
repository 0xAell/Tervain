import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A study of Gothic 3 and a browser reconstruction of it live in this repository beside the game. They are a separate
// project: kept here, but sharing no code with the game, outside the port seed and outside the seed's checks. This
// test holds the repository to that.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Where the study lives. Everything else under src/, tools/ and tests/ is the game's. */
const STUDY = [
  /^src\/gothic3(local)?\//, /^tools\/gothic3\//, /^tools\/gothic3LocalData\.ts$/, /^tests\/gothic3[^/]*\//, /^tests\/gothic3[^/]*\.test\.ts$/,
  /^scripts\//, /^gothic3(-local)?\//, /^assets\/gothic3\//, /^public\/gothic3\//,
];
const isStudy = (path: string) => STUDY.some((pattern) => pattern.test(path));
const isCode = (path: string) => /\.(ts|tsx|mts|mjs|js)$/.test(path) && /^(src|tools|tests)\//.test(path);

/** The repository files a source file imports by a relative path. */
function importsOf(path: string): string[] {
  const text = read(path), out: string[] = [];
  const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g), ...text.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)].map((match) => match[1]!);
  for (const specifier of specifiers) {
    const base = posix.normalize(posix.join(posix.dirname(path), specifier.replace(/\?.*$/, '')));
    const found = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`].find((candidate) => existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile());
    if (found) out.push(found);
  }
  return out;
}

describe('the separate Gothic 3 study', () => {
  const code = tracked.filter(isCode);
  const study = code.filter(isStudy), game = code.filter((path) => !isStudy(path));

  it('is found where the README says it is', () => {
    expect(study.length).toBeGreaterThan(300);
    expect(game.length).toBeGreaterThan(800);
    for (const folder of ['src/gothic3', 'src/gothic3local', 'tools/gothic3', 'tests/gothic3-dialogue', 'tests/gothic3local', 'assets/gothic3', 'public/gothic3', 'scripts']) {
      expect(tracked.some((path) => path.startsWith(`${folder}/`)), folder).toBe(true);
    }
  });

  it('shares no code with the game: neither side imports the other', () => {
    const crossings: string[] = [];
    for (const path of game) for (const imported of importsOf(path)) if (isStudy(imported)) crossings.push(`${path} imports the study's ${imported}`);
    for (const path of study) for (const imported of importsOf(path)) if (!isStudy(imported)) crossings.push(`the study's ${path} imports ${imported}`);
    expect(crossings).toEqual([]);
  });

  it('is joined to the game only by the configuration that builds and compiles both', () => {
    // Outside the study's own folders, a study source file is named only by the site's build configuration, which
    // serves both, and by the two TypeScript projects, which name the study's folders to keep them apart.
    const naming = tracked.filter((path) => /\.(ts|tsx|mts|mjs|js|json)$/.test(path) && !isStudy(path) && !/^(docs|public|assets|data|node_modules)\//.test(path) && !path.startsWith('tests/tooling/gothic3Study')
      && /(src\/gothic3|tools\/gothic3|gothic3LocalData|gothic3(-local)?\/index\.html)/.test(read(path)));
    expect(naming).toEqual(['tsconfig.game.json', 'tsconfig.gothic3.json', 'vite.config.ts']);
  });

  it('is not in the port seed: the core, the exported data and the Unreal project name none of its files', () => {
    const seed = tracked.filter((path) => /^(src\/core|data|unreal)\//.test(path) && !/\.(png|jpg|webp|glb|ogg|m4a)$/.test(path));
    expect(seed.length).toBeGreaterThan(100);
    const naming = seed.filter((path) => /gothic3/i.test(path) || /(src|assets|public|tools|tests)\/gothic3/.test(read(path)));
    expect(naming).toEqual([]);
    const manifest = JSON.parse(read('data/assets/manifest.json')) as { assets: { path: string }[] };
    expect(manifest.assets.some((asset) => /gothic3/i.test(asset.path))).toBe(false);
  });

  it('has its own test project: every test file runs in exactly one of the two', () => {
    const config = read('vite.config.ts');
    const globs = /GOTHIC3_STUDY_TESTS = \[([^\]]+)\]/.exec(config)?.[1]?.match(/'[^']+'/g)?.map((glob) => glob.slice(1, -1));
    expect(globs).toEqual(['tests/gothic3*/**/*.test.ts', 'tests/gothic3*.test.ts']);
    expect(config).toMatch(/name: 'game', include: \['tests\/\*\*\/\*\.test\.ts'\], exclude: GOTHIC3_STUDY_TESTS, setupFiles/);
    expect(config).toMatch(/name: 'gothic3', include: GOTHIC3_STUDY_TESTS \}/);
    const tests = tracked.filter((path) => /^tests\/.*\.test\.ts$/.test(path));
    const studyTests = tests.filter((path) => /^tests\/gothic3[^/]*\/.*\.test\.ts$|^tests\/gothic3[^/]*\.test\.ts$/.test(path));
    expect(studyTests).toEqual(tests.filter(isStudy));
    expect(studyTests.length).toBeGreaterThan(100);
    expect(tests.length - studyTests.length).toBeGreaterThan(350);
    // The game's shared test setup loads game code, so the study's project does not use it.
    expect(importsOf('tests/setup/downloads.ts').every((path) => !isStudy(path))).toBe(true);
    expect(config.match(/setupFiles/g)).toHaveLength(1);
  });

  it('is compiled as its own TypeScript project, apart from the game’s', () => {
    const config = (file: string) => JSON.parse(read(file)) as { include: string[]; exclude?: string[] };
    const study = config('tsconfig.gothic3.json'), game = config('tsconfig.game.json');
    const folders = ['src/gothic3', 'src/gothic3local', 'tests/gothic3-dialogue', 'tests/gothic3local', 'tests/gothic3-native-memory-admin.test.ts'];
    expect(game.exclude).toEqual(folders);
    // The study's project: its own folders, and the build tool's ambient types.
    expect(study.include).toEqual([...folders, 'src/vite-env.d.ts']);
    // Every study source and test is in the study's project, and in no folder the game's project compiles.
    for (const path of tracked.filter((file) => /^(src|tests)\/.*\.tsx?$/.test(file) && isStudy(file))) expect(folders.some((folder) => path === folder || path.startsWith(`${folder}/`)), path).toBe(true);
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['typecheck:game']).toBe('tsc --noEmit -p tsconfig.game.json && tsc --noEmit -p tsconfig.core.json');
    expect(scripts['typecheck:gothic3']).toBe('tsc --noEmit -p tsconfig.gothic3.json');
    expect(scripts.typecheck).toBe('npm run typecheck:game && npm run typecheck:gothic3');
  });

  it('is tested in its own CI jobs, outside the seed’s checks', () => {
    const workflow = read('.github/workflows/pages.yml');
    const job = (name: string) => new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9-]+:\\n|$)`).exec(workflow)?.[1] ?? '';
    // The game's and the seed's tests never run a study test.
    expect(job('test')).toMatch(/npx vitest run --project game --shard=/);
    expect(job('test')).not.toMatch(/gothic3[-/]/);
    for (const name of ['gothic3-study', 'test-shared-crt-heap', 'test-engine-browser', 'test-engine-io']) expect(job(name), name).toMatch(/tests\/gothic3-dialogue|--project gothic3/);
    expect(job('gothic3-study')).toMatch(/npx vitest run --project gothic3 --shard=/);
    // The seed's own workflows do not touch the study.
    for (const file of ['unreal-seed.yml', 'hygiene.yml', 'play-gate.yml']) expect(read(`.github/workflows/${file}`), file).not.toMatch(/gothic3/i);
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['test:game']).toBe('vitest run --project game');
    expect(scripts['test:gothic3']).toBe('vitest run --project gothic3');
    for (const name of ['data:check', 'assets:check', 'unreal:check', 'docs:sources', 'hygiene:check', 'smoke:live', 'play-gate']) expect(scripts[name], name).not.toMatch(/gothic3/i);
  });

  it('is described as separate in the README', () => {
    const readme = read('README.md');
    const section = /\n## Gothic 3 study and reconstruction\n([\s\S]*?)(?=\n## |$)/.exec(readme)?.[1] ?? '';
    expect(section).toMatch(/separate project/);
    expect(section).toMatch(/shares no code with the game/);
    expect(section).toMatch(/not part of the Unreal port/);
    for (const folder of ['src/gothic3', 'src/gothic3local', 'tools/gothic3', 'tests/gothic3', 'assets/gothic3', 'public/gothic3', 'scripts/']) expect(section, folder).toContain(folder);
    for (const command of ['npm run test:gothic3', 'npm run test:game', 'npm run typecheck:gothic3', 'npm run typecheck:game']) expect(section, command).toContain(command);
  });
});
