import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The engine-agnostic core (src/core) holds the game's data and rules. It must stay free of the renderer, the browser
// and every other package, so it can run headless and be mirrored by another engine. This test reads every file in it.
// `npm run typecheck` checks the same boundary from the other side (tsconfig.core.json: no DOM or Node types).

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const core = join(root, 'src', 'core');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|mts|js|mjs)$/.test(name) ? [path] : [];
  });
}

/** Every module specifier a file names: static imports and re-exports, dynamic imports and `import type`. */
export function specifiers(code: string): string[] {
  // Whole-line comments are dropped. Block comments are kept: a stray "/*" inside a string could otherwise hide a real
  // import after it, and a false alarm here is the cheaper mistake.
  const stripped = code.replace(/^\s*\/\/.*$/gm, '');
  const found: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g,
    /\bimport\s*(['"])([^'"]+)\1/g,
    /\bimport\s*\(\s*(['"`])([^'"`]+)\1/g,
    /\brequire\s*\(\s*(['"`])([^'"`]+)\1/g,
  ];
  for (const pattern of patterns) for (const match of stripped.matchAll(pattern)) found.push(match[2]!);
  return found;
}

const files = sources(core);

describe('engine-agnostic core boundary', () => {
  it('finds the core', () => {
    expect(files.length).toBeGreaterThan(40);
    for (const part of ['game', 'content', 'world']) expect(files.some((file) => file.startsWith(join(core, part) + sep))).toBe(true);
  });

  it('imports nothing but its own modules: no renderer, physics engine, browser layer or package', () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
        const name = relative(root, file);
        if (!specifier.startsWith('.')) { violations.push(`${name} imports the package or absolute path '${specifier}'`); continue; }
        const target = resolve(dirname(file), specifier);
        if (target !== core && !target.startsWith(core + sep)) violations.push(`${name} imports '${specifier}', outside src/core`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('recognises the import forms it must reject', () => {
    expect(specifiers(`import * as THREE from 'three';`)).toEqual(['three']);
    expect(specifiers(`import type { Vector3 } from "three";\nexport { x } from '../presentation/world';`)).toEqual(['three', '../presentation/world']);
    expect(specifiers(`import './style.css';\nconst m = await import('../platform/input');`)).toEqual(['./style.css', '../platform/input']);
    expect(specifiers(`import {\n  a,\n  b,\n} from '@dimforge/rapier3d-compat';`)).toEqual(['@dimforge/rapier3d-compat']);
    expect(specifiers(`// import x from 'three'\nconst from = 'three';`)).toEqual([]);
  });
});
