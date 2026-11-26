/** Fit the eastern wolf and boar coats to their original regional skeletons and baked gaits. */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { classifyMeshy, writeLedger } from './model-ledger/meshy.mjs';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const root = new URL('../public/models/animals/',import.meta.url);
const ledgerPath = new URL('../../model-licenses.json', root);
const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
for (const [species,id,source,width,coat] of [
  ['highland_wolf','1005232739','wolf-1005232644',1.12,[0.82,0.88,0.88,1]],
  ['hill_boar','1005232726','boar-1005232450',1.18,[0.91,0.79,0.69,1]],
]) {
  const file = await fs.readFile(new URL(source+'.glb',root));
  const end = 20+file.readUInt32LE(12), gltf=JSON.parse(file.subarray(20,end));
  const bin=file.subarray(end+8,end+8+gltf.buffers[0].byteLength);
  const accessor=gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const ext=gltf.bufferViews[accessor.bufferView].extensions.EXT_meshopt_compression;
  const vertices=new Uint8Array(ext.count*ext.byteStride);
  MeshoptDecoder.decodeGltfBuffer(vertices,ext.count,ext.byteStride,bin.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode);
  const view=new DataView(vertices.buffer);
  for(let i=0;i<ext.count;i++){
    const at=i*ext.byteStride;
    view.setFloat32(at,view.getFloat32(at,true)*width,true);
  }
  accessor.min[0]*=width; accessor.max[0]*=width;
  const compressed=MeshoptEncoder.encodeGltfBuffer(vertices,ext.count,ext.byteStride,'ATTRIBUTES');
  const offset=Math.ceil(bin.length/4)*4;
  const payload=Buffer.alloc(Math.ceil((offset+compressed.length)/4)*4);
  bin.copy(payload);payload.set(compressed,offset);
  ext.byteOffset=offset;ext.byteLength=compressed.length;gltf.buffers[0].byteLength=payload.length;
  Object.assign(gltf.scenes[0].extras.animal,{id,species});
  for(const material of gltf.materials) material.pbrMetallicRoughness.baseColorFactor=coat;
  const json=Buffer.from(JSON.stringify(gltf)), padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+payload.length,8);
  header.writeUInt32LE(padded.length,12);header.write('JSON',16);
  const chunk=Buffer.alloc(8);chunk.writeUInt32LE(payload.length);chunk.write('BIN\0',4);
  const data = Buffer.concat([header,padded,chunk,payload]);
  const filename = species+'-'+id+'.glb';
  await fs.writeFile(new URL(filename,root), data);
  const original = ledger.assets.find(a => a.file === 'public/models/animals/' + source + '.glb');
  const derivative = { ...original, file: 'public/models/animals/' + filename, bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'), derivedFrom: original.file, modified: true };
  ledger.assets = ledger.assets.filter(a => a.file !== derivative.file);
  ledger.assets.push(derivative);
}
ledger.assets.sort((a,b) => a.file.localeCompare(b.file));
const shipped = ledger.assets.filter(a => a.file.startsWith('public/models/'));
ledger.summary.publicModelFiles = shipped.length;
ledger.summary.publicModelBytes = shipped.reduce((n,a) => n+a.bytes,0);
ledger.summary.hashesMatchedExistingSourceRecords = ledger.assets.length;
writeLedger(ledgerPath, classifyMeshy(ledger));
