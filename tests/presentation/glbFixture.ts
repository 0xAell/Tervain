import { readFileSync } from 'node:fs';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createGltfLoader } from '../../src/presentation/assets/gltfLoader';

// The shipped model files, read and decoded in node as the game decodes them. A binary glTF is a JSON chunk and a
// binary chunk. Node cannot decode images (it has no ImageBitmap), so a test that decodes a model edits the JSON to
// leave them out and packs it again in front of the file's own binary chunk: every vertex, joint and animation sample
// it decodes is the shipped one. Five fixtures and seven tests had their own copy of this; these are the one.

const MAGIC = 0x46546c67, VERSION = 2, JSON_CHUNK = 0x4e4f534a;

export interface Glb {
  /** The whole file. */
  bytes: Buffer<ArrayBuffer>;
  /** Its JSON chunk, parsed: a fresh object on every read, free to edit. */
  json: any;
  /** The JSON chunk's length in bytes. */
  length: number;
  /** The binary chunk's data, after its eight-byte header. */
  binary: Buffer<ArrayBuffer>;
}

/** A model file under public/models (`flora/hero/hero-oak-near.glb`), checked to be a whole binary glTF. */
export function readGlb(path: string): Glb {
  const bytes = readFileSync(new URL(`../../public/models/${path}`, import.meta.url));
  if (bytes.readUInt32LE(0) !== MAGIC || bytes.readUInt32LE(4) !== VERSION || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== JSON_CHUNK) {
    throw new Error(`public/models/${path} is not a whole binary glTF 2.0 file.`);
  }
  const length = bytes.readUInt32LE(12);
  return { bytes, json: JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')), length, binary: bytes.subarray(28 + length) };
}

/** The file with `json` as its JSON chunk (padded with spaces to four bytes) and its own binary chunk after it. */
export function packGlb(glb: Pick<Glb, 'bytes' | 'length'>, json: unknown): ArrayBuffer {
  const text = Buffer.from(JSON.stringify(json)), padded = Math.ceil(text.length / 4) * 4, rest = glb.bytes.subarray(20 + glb.length);
  const out = Buffer.alloc(20 + padded + rest.length);
  out.writeUInt32LE(MAGIC, 0); out.writeUInt32LE(VERSION, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded, 12); out.writeUInt32LE(JSON_CHUNK, 16); out.fill(0x20, 20, 20 + padded);
  text.copy(out, 20); rest.copy(out, 20 + padded);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

/**
 * A buffer view's bytes as a loader sees them. The models' geometry is compressed losslessly (EXT_meshopt_compression,
 * tools/optimise-models.mjs): a compressed view is decoded with the decoder the game's loader carries, and an
 * uncompressed one is read from the binary chunk as it stands.
 */
export async function bufferViewData(glb: Glb, index: number): Promise<Buffer> {
  const view = glb.json.bufferViews[index], compressed = view.extensions?.EXT_meshopt_compression;
  if (!compressed) return glb.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  await MeshoptDecoder.ready;
  const source = glb.binary.subarray(compressed.byteOffset ?? 0, (compressed.byteOffset ?? 0) + compressed.byteLength);
  const out = new Uint8Array(compressed.count * compressed.byteStride);
  MeshoptDecoder.decodeGltfBuffer(out, compressed.count, compressed.byteStride, source, compressed.mode, compressed.filter ?? 'NONE');
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

/** Decoded by the game's own loader, with the extensions it reads (meshopt compression among them). */
export function parseGlb(buffer: ArrayBuffer): Promise<GLTF> {
  return createGltfLoader().parseAsync(buffer, '');
}

/** The JSON with every material's texture slots cleared and its factors kept, and the images, textures and samplers gone. */
export function withoutTextures<T extends { materials?: unknown[]; textures?: unknown; images?: unknown; samplers?: unknown }>(json: T): T {
  for (const material of (json.materials ?? []) as { normalTexture?: unknown; occlusionTexture?: unknown; emissiveTexture?: unknown; pbrMetallicRoughness?: { baseColorTexture?: unknown; metallicRoughnessTexture?: unknown } }[]) {
    delete material.normalTexture; delete material.occlusionTexture; delete material.emissiveTexture;
    if (material.pbrMetallicRoughness) { delete material.pbrMetallicRoughness.baseColorTexture; delete material.pbrMetallicRoughness.metallicRoughnessTexture; }
  }
  delete json.textures; delete json.images; delete json.samplers;
  return json;
}
