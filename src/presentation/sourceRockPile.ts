import * as THREE from 'three';
import { parseModel, type ModelGltf } from './assets/gltfLoader';
import { coastalRockPiles, type RockPile } from '../core/world/rockPiles';
import type { PhysicalRockGeometry } from '../core/world/physicsGeometry';
import type { BuildContext, SceneModule } from './context';
import { assertNaturalModelBudget } from './naturalModelBudget';
import { groundedNaturalGeometryY } from './treeGrounding';
import { attachGroundedRockSurface } from './rockSurface';
import { modelAssetUrl } from './assets/modelUrl';
import { observeModelLoad, withModelLoadSlot, type ModelLoadProgress } from './assets/modelLoadQueue';
import { downloadAsset } from './assets/download';

export const ROCK_PILE_FILE = 'weathered-rock-pile-under-20k.glb';
let pending: Promise<ModelGltf> | null = null;

export function rockPileUrl(base = import.meta.env.BASE_URL, page = document.baseURI): URL {
  return modelAssetUrl(`scenery/${ROCK_PILE_FILE}`, base, page);
}

function sourceMesh(template: ModelGltf): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  let result: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  template.scene.updateMatrixWorld(true);
  template.scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (result || Array.isArray(mesh.material) || !(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      throw new Error('Rock pile requires one source mesh with a PBR material.');
    }
    assertNaturalModelBudget('Weathered Rock Pile', [mesh.geometry]);
    result = mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  });
  if (!result) throw new Error('Rock pile contains no geometry.');
  return result;
}

/** Required art shares a CPU template; failure reaches the existing loading Retry. */
export function loadSourceRockPile(progress?: ModelLoadProgress): Promise<ModelGltf> {
  if (pending) return observeModelLoad(pending, progress);
  pending = withModelLoadSlot(async () => {
    const url = rockPileUrl();
    const bytes = await downloadAsset(url, { label: 'Rock pile', model: `scenery/${ROCK_PILE_FILE}` });
    if (bytes.byteLength < 12) throw new Error('Rock pile download is incomplete.');
    const header = new DataView(bytes);
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength) {
      throw new Error('Rock pile download is not a complete GLB 2 file.');
    }
    const template = await parseModel(bytes, new URL('.', url).href);
    sourceMesh(template);
    return template;
  }).catch(error => { pending = null; throw error; });
  return observeModelLoad(pending, progress);
}

export interface RockPilePlacement extends RockPile { y: number }

/** How far the model reaches from its centre across the ground (m): the core keeps this as `ROCK_PILE_REACH`. */
export function rockPileReach(geometry: THREE.BufferGeometry): number {
  const p = geometry.getAttribute('position');
  let reach = 0;
  for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
  return reach;
}

/** The core's rock piles (core/world/rockPiles.ts), each seated on the ground by its own base. */
export function sourceRockPilePlacements(ctx: Pick<BuildContext, 'terrain' | 'colliders' | 'excl'>,
  geometry: THREE.BufferGeometry): RockPilePlacement[] {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const basalPlane = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.12;
  return coastalRockPiles(ctx.terrain, ctx.excl, ctx.colliders)
    .map((rock) => ({ ...rock, y: groundedNaturalGeometryY(ctx.terrain, rock, geometry, basalPlane, 0.055) }));
}

function physicalContact(geometry: THREE.BufferGeometry, placement: RockPilePlacement, matrix: THREE.Matrix4): PhysicalRockGeometry {
  const p = geometry.getAttribute('position'), point = new THREE.Vector3();
  const positions = new Float32Array(p.count * 3), index = geometry.index;
  const indices = new Uint32Array(index?.count ?? p.count);
  const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i).applyMatrix4(matrix);
    positions.set([point.x, point.y, point.z], i * 3);
    bounds.minX = Math.min(bounds.minX, positions[i * 3]!); bounds.maxX = Math.max(bounds.maxX, positions[i * 3]!);
    bounds.minY = Math.min(bounds.minY, positions[i * 3 + 1]!); bounds.maxY = Math.max(bounds.maxY, positions[i * 3 + 1]!);
    bounds.minZ = Math.min(bounds.minZ, positions[i * 3 + 2]!); bounds.maxZ = Math.max(bounds.maxZ, positions[i * 3 + 2]!);
  }
  for (let i = 0; i < indices.length; i++) indices[i] = index ? index.getX(i) : i;
  return { id: placement.id, positions, indices, bounds };
}

/** Original source forms stay rigid, uniformly scaled and resident; contacts use their exact rendered triangles. */
export function buildSourceRockPiles(ctx: BuildContext, template: ModelGltf): SceneModule & {
  placements: readonly RockPilePlacement[]; contacts: readonly PhysicalRockGeometry[];
} {
  const original = sourceMesh(template), geometry = original.geometry.clone().applyMatrix4(original.matrixWorld);
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const triangles = assertNaturalModelBudget('Weathered Rock Pile', [geometry]);
  const material = original.material.clone(), textures = new Map<THREE.Texture, THREE.Texture>();
  const fields = material as unknown as Record<string, unknown>;
  for (const [key, field] of Object.entries(fields)) if ((field as THREE.Texture | null)?.isTexture) {
    const texture = field as THREE.Texture;
    let clone = textures.get(texture);
    if (!clone) { clone = texture.clone(); clone.anisotropy = 16; clone.needsUpdate = true; textures.set(texture, clone); }
    fields[key] = clone;
  }
  material.name = 'Weathered source rock pile';
  material.metalness = 0; material.roughness = 1; material.envMapIntensity = 0.35;
  material.emissive.set(0); material.emissiveMap = null; material.normalScale.set(0.8, 0.8);
  attachGroundedRockSurface(material, ctx.terrain);
  const placements = sourceRockPilePlacements(ctx, geometry), contacts: PhysicalRockGeometry[] = [];
  const group = new THREE.Group(); group.name = 'source-rock-piles';
  for (const placement of placements) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = placement.id;
    mesh.position.set(placement.x, placement.y, placement.z); mesh.rotation.y = placement.yaw;
    mesh.scale.setScalar(placement.s); mesh.castShadow = true; mesh.receiveShadow = true; mesh.updateMatrixWorld(true);
    const contact = physicalContact(geometry, placement, mesh.matrixWorld);
    ctx.colliders.registerRockMesh(contact);
    ctx.colliders.circle(placement.id, placement.x, placement.z, placement.radius, true,
      { minY: contact.bounds.minY, maxY: contact.bounds.maxY, rockMesh: contact });
    contacts.push(contact); group.add(mesh);
  }
  // register replaces the terrain registry, so carry forward every existing exact scatter surface.
  ctx.terrain.registerRockSurfaces(ctx.colliders.rockMeshes);
  let disposed = false;
  return { group, placements, contacts, update() {},
    stats: () => ({ sourceRockPiles: placements.length, sourceRockModelTris: triangles, sourceRockTris: triangles * placements.length }),
    dispose() {
      if (disposed) return; disposed = true;
      geometry.dispose(); material.dispose(); textures.forEach(texture => texture.dispose()); textures.clear(); group.clear();
    },
  };
}
