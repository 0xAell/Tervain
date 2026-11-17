import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGltfLoader, parseModel } from '../../src/presentation/assets/gltfLoader';
import { packGlb, readGlb, withoutTextures } from './glbFixture';

// The game keeps the models it loads for the life of the page, in caches (the residents', the animals', the trees',
// the hero's). Three's result carries its parser, which holds the whole file and what it decoded from it: kept with the
// models, that was 156 MB of a settled journey's 810 MB of array buffers. parseModel keeps what is read afterwards.

const FILE = 'flora/hero/hero-oak-far.glb';

/** Every ArrayBuffer reachable from a value through objects, arrays, maps and sets. */
function reachableBuffers(root: unknown): ArrayBufferLike[] {
  const found = new Set<ArrayBufferLike>(), seen = new Set<object>(), stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (value instanceof ArrayBuffer) found.add(value);
    else if (ArrayBuffer.isView(value)) found.add(value.buffer);
    else if (value instanceof Map) for (const [key, entry] of value) stack.push(key, entry);
    else if (value instanceof Set) for (const entry of value) stack.push(entry);
    else for (const key of Object.keys(value)) stack.push((value as Record<string, unknown>)[key]);
  }
  return [...found];
}

async function parsedBothWays() {
  const glb = readGlb(FILE), bytes = packGlb(glb, withoutTextures(glb.json));
  return { glb, raw: await createGltfLoader().parseAsync(bytes.slice(0), ''), kept: await parseModel(bytes.slice(0), '') };
}

describe('a model the game keeps', () => {
  it('keeps everything three gives but the parser, and of the parser what is read afterwards', async () => {
    const { raw, kept } = await parsedBothWays();
    expect(Object.keys(kept).sort()).toEqual(Object.keys(raw).sort());
    expect(Object.keys(kept.parser).sort()).toEqual(['associations', 'json']);
    const materials: THREE.Material[] = [];
    kept.scene.traverse((object) => { const material = (object as THREE.Mesh).material; if (material) materials.push(...[material].flat()); });
    expect(materials.length).toBeGreaterThan(0);
    for (const material of materials) expect(kept.parser.json.materials[kept.parser.associations.get(material)!.materials!]).toBeDefined();
  });

  it('holds no copy of its file once it is built', async () => {
    const { glb, raw, kept } = await parsedBothWays();
    // The parser holds the binary chunk whole; the geometry the model keeps is decoded into buffers of its own.
    const isFile = (buffer: ArrayBufferLike) => buffer.byteLength === glb.binary.length;
    expect(reachableBuffers(raw).some(isFile), 'the loader’s own result holds the file').toBe(true);
    expect(reachableBuffers(kept).some(isFile)).toBe(false);
  });

  it('is how the game parses every model', () => {
    // A model parsed with a loader of its own would keep its parser, and the file with it, in whatever cache holds it.
    const offenders = execFileSync('git', ['ls-files', '-z', 'src'], { encoding: 'utf8' }).split('\0')
      .filter((path) => path.endsWith('.ts') && !/^src\/gothic3\//.test(path) && path !== 'src/presentation/assets/gltfLoader.ts')
      .filter((path) => /\bcreateGltfLoader\(|\bnew GLTFLoader\(/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
