/** Make a local, offline-playable edition from exactly the same entry point used by Vite. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2] ?? path.join(root, 'dist', 'Play Tervain.html'));
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
let revision = 'isometric-local';
try {
  const head = execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: root,
    encoding: 'utf8',
  });
  revision = head + (dirty ? '-local' : '');
} catch {
  /* A source archive can also produce an offline build. */
}
const assets = {};
const types = {
  png: 'image/png',
  ttf: 'font/ttf',
  json: 'application/json',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
};
async function add(relative) {
  const ext = relative.split('.').at(-1);
  if (!types[ext]) throw Error('Unknown asset format ' + relative);
  const data = await fs.readFile(path.join(root, 'public', relative));
  assets[relative] = 'data:' + types[ext] + ';base64,' + data.toString('base64');
}
async function folder(directory) {
  for (const e of await fs.readdir(path.join(root, 'public', directory), { withFileTypes: true })) {
    const key = directory + '/' + e.name;
    if (e.isDirectory()) await folder(key);
    else await add(key);
  }
}
await folder('vale');
await folder('valley');
await folder('assets/audio/vale');
const tracks = ['riverbank', 'banked-embers', 'bough-watch', 'lanterns', 'spring-stones', 'timber'];
for (const track of tracks)
  for (const ext of ['m4a', 'ogg']) await add('assets/audio/world/ford/' + track + '.' + ext);

for (const trade of ['mill', 'quarry'])
  for (const ext of ['ogg', 'm4a']) await add('assets/audio/world/loop-' + trade + '.' + ext);

const result = await build({
  root,
  configFile: false,
  logLevel: 'warn',
  base: './',
  publicDir: false,
  define: {
    __GAME_VERSION__: JSON.stringify(pkg.version),
    __SOURCE_REVISION__: JSON.stringify(revision),
    __MODEL_ASSET_BASE__: JSON.stringify(''),
  },
  build: {
    target: 'es2022',
    write: false,
    cssCodeSplit: false,
    modulePreload: false,
    lib: { entry: path.join(root, 'src/main.ts'), name: 'Tervain', formats: ['iife'], fileName: 'tervain' },
    minify: true,
  },
});
const files = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
const js = files.find((f) => f.type === 'chunk' && f.isEntry)?.code;
let css = files
  .filter((f) => f.type === 'asset' && f.fileName.endsWith('.css'))
  .map((f) => String(f.source))
  .join('\n');
if (!js || !css) throw Error('The game bundle is missing its script or stylesheet.');
css = css.replace(/url\((["']?)([^)'"]+)\1\)/g, (match, _quote, value) => {
  if (value.startsWith('data:')) return match;
  const asset = assets[value.replace(/^(?:\.\.\/|\.\/|\/)+/, '')];
  if (!asset) throw Error('Unpacked CSS asset ' + value);
  return 'url(' + asset + ')';
});
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const page = html
  .replace('href="./vale/icons/seal.png"', 'href="' + assets['vale/icons/seal.png'] + '"')
  .replace('</head>', () => '<style>' + css + '</style></head>')
  .replace(
    /<script type="module" src="\/src\/main\.ts"><\/script>/,
    () =>
      '<script>window.tervainFiles=' +
      JSON.stringify(assets) +
      '</script>\n<script>' +
      js.replace(/<\/script/gi, '<\\/script') +
      '</script>',
  );
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, page);
console.log(
  Object.keys(assets).length +
    ' embedded assets, ' +
    (Buffer.byteLength(page) / 1048576).toFixed(1) +
    ' MiB, SHA-256 ' +
    createHash('sha256').update(page).digest('hex'),
);
