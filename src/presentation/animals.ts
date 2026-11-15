import * as THREE from 'three';
import { compactAnimalBoneTexture } from './animals/boneTexture';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGltfLoader } from './assets/gltfLoader';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Collider } from '../core/world/colliders';
import type { PhysicalActor } from '../physics/physics';
import type { BuildContext, FrameContext, SceneModule } from './context';
import { modelAssetUrl } from './assets/modelUrl';
import { withModelLoadSlot } from './assets/modelLoadQueue';
import { downloadAsset } from './assets/download';
import { matteHide } from './matte';
import { ANIMAL_AUDIO, ANIMAL_CALL_EVENT, type AnimalCall } from './sound/animalAudio';
import { ANIMALS, ANIMAL_SPEEDS, ANIMAL_TRIANGLE_LIMIT, requiredAnimalClips, type AnimalClip, type AnimalDefinition, type AnimalSpecies } from '../core/content/animals';
import { animalNavigationColliders, findAnimalSite, type AnimalSite } from '../core/rules/animalNavigation';
import { AnimalHunting, type HuntingAnimal } from './animals/hunting/adapter';
import type { AnimalArrowHit } from './animals/hunting/hit';
import type { AnimalId, HuntingState } from '../core/game/hunting';
import { finishCooperatively, type CooperativeOptions } from '../platform/cooperative';
import { AnimalMind, Wildlife } from '../core/rules/animalMind';

export { ANIMALS, ANIMAL_TRIANGLE_LIMIT } from '../core/content/animals';
export type AnimalTemplates = ReadonlyMap<string, GLTF>;
export type AnimalCallEvent = AnimalCall;
export { ANIMAL_CALL_EVENT } from './sound/animalAudio';
const pending = new Map<string, Promise<GLTF>>();
const PAWS = new Set(['frontPawL', 'frontPawR', 'hindPawL', 'hindPawR']);
const SOLE_SAMPLES_PER_PAW = 12;

export function animalModelUrl(definition: AnimalDefinition, base = import.meta.env.BASE_URL, page = document.baseURI): URL {
  return modelAssetUrl(`animals/${definition.file}`, base, page);
}

function boneTrack(track: THREE.KeyframeTrack, bones: ReadonlySet<string>): boolean {
  const binding = THREE.PropertyBinding.parseTrackName(track.name);
  const name = binding.objectName === 'bones' ? binding.objectIndex : binding.nodeName;
  return typeof name === 'string' && bones.has(name) && ['position', 'quaternion', 'scale'].includes(binding.propertyName);
}

type MotionSpeeds = { Walk: number; Run: number };
type AnimalValidation = { bounds: THREE.Box3; triangles: number; motionSpeeds: MotionSpeeds };
const VALIDATION_BATCH = 512;
function modelMotionSpeeds(scene: THREE.Group, definition: AnimalDefinition): MotionSpeeds {
  if (definition.seated) return { Walk: 0, Run: 0 };
  let speeds: Partial<MotionSpeeds> | undefined;
  scene.traverse(object => { if (object.userData.animal?.motionSpeeds) speeds = object.userData.animal.motionSpeeds as Partial<MotionSpeeds>; });
  const motion = speeds as Partial<MotionSpeeds> | undefined;
  if (!motion || !Number.isFinite(motion.Walk) || !Number.isFinite(motion.Run) || motion.Walk! <= 0.1 || motion.Run! <= motion.Walk! || motion.Run! > 8) {
    throw new Error(`The ${definition.species} model requires measured Walk and Run stride speeds.`);
  }
  return { Walk: motion.Walk!, Run: motion.Run! };
}

function* animalValidationSteps(template: Pick<GLTF, 'scene' | 'animations'>, definition: AnimalDefinition): Generator<void, AnimalValidation> {
  let triangles = 0, skins = 0;
  const bones = new Set<string>();
  const meshes: THREE.Mesh[] = [];
  template.scene.traverse(object => {
    if ((object as THREE.Bone).isBone) bones.add(object.name);
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const vertices = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count;
    if (!vertices || vertices % 3) throw new Error(`The ${definition.species} model requires complete triangle geometry.`);
    triangles += vertices / 3;
    const parser = (template as GLTF).parser;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const association = parser?.associations?.get(material), authored = association?.materials === undefined ? undefined : parser?.json?.materials?.[association.materials];
      const expected: Record<string, unknown> = { map: authored?.pbrMetallicRoughness?.baseColorTexture,
        roughnessMap: authored?.pbrMetallicRoughness?.metallicRoughnessTexture, metalnessMap: authored?.pbrMetallicRoughness?.metallicRoughnessTexture,
        normalMap: authored?.normalTexture, aoMap: authored?.occlusionTexture, emissiveMap: authored?.emissiveTexture };
      for (const [slot, reference] of Object.entries(expected)) {
        const texture = Reflect.get(material, slot) as THREE.Texture | null | undefined;
        if (!texture && !reference) continue;
        const image = texture?.image as { width?: number; height?: number } | undefined;
        if (!texture?.isTexture || !image || !(image.width! > 0) || !(image.height! > 0)) throw new Error(`The ${definition.species} model texture could not be decoded.`);
      }
    }
    const skinned = mesh as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) continue;
    skins++;
    const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    if (!positions || !indices || !weights || indices.count !== positions.count || weights.count !== positions.count || skinned.skeleton.bones.length < 12) {
      throw new Error(`The ${definition.species} model requires a complete quadruped skin.`);
    }
    for (let i = 0; i < weights.count; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const joint = indices.getComponent(i, k), weight = weights.getComponent(i, k);
        if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(joint) || joint < 0 || joint >= skinned.skeleton.bones.length) throw new Error(`The ${definition.species} skin has invalid joint weights.`);
        sum += weight;
      }
      if (Math.abs(sum - 1) > 0.02) throw new Error(`The ${definition.species} skin weights are not normalized.`);
      if ((i + 1) % VALIDATION_BATCH === 0) yield;
    }
    if (weights.count % VALIDATION_BATCH) yield;
  }
  if (!skins || !triangles || triangles > ANIMAL_TRIANGLE_LIMIT) throw new Error(`The ${definition.species} model must be skinned and fit ${ANIMAL_TRIANGLE_LIMIT} triangles (${triangles}).`);
  for (const name of requiredAnimalClips(definition)) {
    const clip = template.animations.find(candidate => candidate.name === name);
    if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.some(track => boneTrack(track, bones))) {
      throw new Error(`The ${definition.species} model is missing its skinned ${name} motion.`);
    }
  }
  template.scene.updateMatrixWorld(true);
  // Box3 otherwise computes each cold skin's bounds in one uninterrupted vertex walk.
  // Use the same native posed vertices and expansion order, publishing only the complete box.
  for (const mesh of meshes) {
    const skin = mesh as THREE.SkinnedMesh;
    if (!skin.isSkinnedMesh || skin.boundingBox !== null) continue;
    const box = new THREE.Box3(), point = new THREE.Vector3(), count = skin.geometry.getAttribute('position').count;
    for (let i = 0; i < count; i++) {
      skin.getVertexPosition(i, point);
      box.expandByPoint(point);
      if ((i + 1) % VALIDATION_BATCH === 0) yield;
    }
    skin.boundingBox = box;
    if (count % VALIDATION_BATCH) yield;
  }
  const bounds = new THREE.Box3().setFromObject(template.scene), size = bounds.getSize(new THREE.Vector3());
  if (bounds.isEmpty() || ![size.x, size.y, size.z, bounds.min.y].every(Number.isFinite) || size.y < 0.2 || size.y > 3.4 || size.x > 6 || size.z > 6 || Math.abs(bounds.min.y) > 0.16) {
    throw new Error(`The ${definition.species} model must use grounded, metre-scale geometry.`);
  }
  return { bounds, triangles, motionSpeeds: modelMotionSpeeds(template.scene, definition) };
}

/** Validate the entire rendered model, including supplied saddles, ears, horns and tails. */
export function validateAnimalTemplate(template: Pick<GLTF, 'scene' | 'animations'>, definition: AnimalDefinition): AnimalValidation {
  const steps = animalValidationSteps(template, definition);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

/** Prepare an unpublished source while allowing the browser to present between bounded batches. */
export function validateAnimalTemplateAsync(template: Pick<GLTF, 'scene' | 'animations'>, definition: AnimalDefinition,
  options: CooperativeOptions = {}): Promise<AnimalValidation> {
  return finishCooperatively(animalValidationSteps(template, definition), { ...options, budgetMs: options.budgetMs ?? 2 });
}

function releaseRejectedTemplate(template: GLTF) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  template.scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometry.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  const images = new Set<{ close?: () => void }>();
  textures.forEach(value => { value.dispose(); if (value.image) images.add(value.image as { close?: () => void }); });
  images.forEach(value => value.close?.());
}

function loadAnimal(definition: AnimalDefinition): Promise<GLTF> {
  const cached = pending.get(definition.id);
  if (cached) return cached;
  const request = withModelLoadSlot(async () => {
    const url = animalModelUrl(definition);
    const bytes = await downloadAsset(url, { label: `The ${definition.species} model`, model: `animals/${definition.file}` });
    if (bytes.byteLength < 12) throw new Error('The animal model download is incomplete.');
    const header = new DataView(bytes);
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength) {
      throw new Error('The animal model download is not a complete GLB 2 file.');
    }
    const template = await createGltfLoader().parseAsync(bytes, new URL('.', url).href);
    try { await validateAnimalTemplateAsync(template, definition); } catch (error) { releaseRejectedTemplate(template); throw error; }
    return template;
  }).catch(error => { pending.delete(definition.id); throw error; });
  pending.set(definition.id, request);
  return request;
}

/** Required source animals load through the production commit pin, with three bounded concurrent downloads.
 * Rejected art reaches the existing loading Retry; completed CPU templates survive a world reload. */
export async function loadAnimalTemplates(progress?: (loaded: number, total: number) => void,
  definitions: readonly AnimalDefinition[] = ANIMALS): Promise<AnimalTemplates> {
  const templates = new Map<string, GLTF>();
  let next = 0, loaded = 0, failed = false;
  progress?.(0, definitions.length);
  await Promise.all(Array.from({ length: Math.min(3, definitions.length) }, async () => {
    while (!failed && next < definitions.length) {
      const definition = definitions[next++]!;
      try {
        const template = await loadAnimal(definition); templates.set(definition.id, template); loaded++;
        if (!failed) progress?.(loaded, definitions.length);
      } catch (error) { failed = true; throw error; }
    }
  }));
  return templates;
}

/**
 * How many quarters of a stride clip were crossed between two phases (0..1) in one update: forwards the phase grows and
 * wraps from 1 to 0, backwards (A75) it falls and wraps from 0 to 1.
 */
export function strideQuartersCrossed(before: number, after: number, backwards = false): number {
  const [from, to] = backwards ? [1 - before, 1 - after] : [before, after];
  const crossed = Math.floor(to * 4) - Math.floor(from * 4) + (to < from ? 4 : 0);
  return Math.max(0, Math.min(4, crossed));
}

/** Own actions on an independently cloned skeleton. Only bones can be clip targets; world placement is authoritative. */
export class AnimalAnimation {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<AnimalClip, THREE.AnimationAction>();
  current: AnimalClip = 'Idle';
  constructor(private scene: THREE.Group, clips: readonly THREE.AnimationClip[], species: AnimalSpecies,
    private motionSpeeds: MotionSpeeds = { Walk: ANIMAL_SPEEDS[species].walk, Run: ANIMAL_SPEEDS[species].run }) {
    this.mixer = new THREE.AnimationMixer(scene);
    const bones = new Set<string>(); scene.traverse(object => { if ((object as THREE.Bone).isBone) bones.add(object.name); });
    for (const source of clips) {
      if (!['Idle', 'Walk', 'Run', 'Alert', 'Call', 'Graze', 'Groom', 'Sleep'].includes(source.name)) continue;
      const clip = source.clone(); clip.tracks = clip.tracks.filter(track => boneTrack(track, bones));
      if (!clip.tracks.length) continue;
      const action = this.mixer.clipAction(clip);
      if (['Alert', 'Call', 'Groom'].includes(clip.name)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
      this.actions.set(clip.name as AnimalClip, action);
    }
    this.actions.get('Idle')?.play();
  }
  duration(clip: AnimalClip) { return this.actions.get(clip)?.getClip().duration ?? 2; }
  has(clip: AnimalClip) { return this.actions.has(clip); }
  referenceSpeed(clip: 'Walk' | 'Run') { return this.motionSpeeds[clip]; }
  /** How far through its stride a walking or running animal is (0..1), or null standing (A71). */
  gaitPhase(): number | null {
    if (this.current !== 'Walk' && this.current !== 'Run') return null;
    const action = this.actions.get(this.current);
    if (!action) return null;
    const duration = action.getClip().duration;
    return duration > 0 ? ((action.time % duration) + duration) % duration / duration : null;
  }
  transition(clip: AnimalClip) {
    if (clip === this.current) return;
    const next = this.actions.get(clip);
    if (!next) return;
    const previous = this.actions.get(this.current);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (previous) previous.crossFadeTo(next, 0.22, false); else next.fadeIn(0.22);
    this.current = clip;
  }
  update(dt: number, speed: number) {
    const action = this.actions.get(this.current);
    if (action && (this.current === 'Walk' || this.current === 'Run')) {
      const reference = this.referenceSpeed(this.current);
      // A negative speed (a ridden deer backing up, A75) plays the stride backwards.
      action.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / reference, -1.5, 1.5));
    }
    this.mixer.update(dt);
  }
  reset() { this.mixer.stopAllAction(); this.current = 'Idle'; this.actions.get('Idle')?.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play(); }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.scene); }
}

interface AnimalBody {
  scene: THREE.Group;
  bounds: THREE.Box3;
  size: THREE.Vector3;
  triangles: number;
  paws: { mesh: THREE.SkinnedMesh; vertices: number[] }[];
  skeletons: Set<THREE.Skeleton>;
  animation: AnimalAnimation;
}

function cloneAnimal(template: GLTF, definition: AnimalDefinition, validated = validateAnimalTemplate(template, definition)): AnimalBody {
  const scene = cloneSkinned(template.scene) as THREE.Group;
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>(), materials = new Map<THREE.Material, THREE.Material>(), textures = new Map<THREE.Texture, THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>(), paws: AnimalBody['paws'] = [];
  const soles = new Map<string, { mesh: THREE.SkinnedMesh; vertex: number; y: number }[]>();
  const fallbackSoles: { mesh: THREE.SkinnedMesh; vertex: number; y: number }[] = [];
  const ownMaterial = (source: THREE.Material) => {
    let copy = materials.get(source);
    if (!copy) {
      copy = source.clone(); materials.set(source, copy);
      for (const [key, value] of Object.entries(copy)) if (value instanceof THREE.Texture) {
        let texture = textures.get(value); if (!texture) { texture = value.clone(); textures.set(value, texture); }
        Reflect.set(copy, key, texture);
      }
      // Some source animals are authored almost fully metallic or polished; every hide is matte (A67).
      if ((copy as THREE.MeshStandardMaterial).isMeshStandardMaterial) matteHide(copy as THREE.MeshStandardMaterial);
    }
    return copy;
  };
  scene.updateMatrixWorld(true);
  const inverse = scene.matrixWorld.clone().invert(), position = new THREE.Vector3();
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    let geometry = geometries.get(mesh.geometry);
    if (!geometry) { geometry = mesh.geometry.clone(); geometries.set(mesh.geometry, geometry); }
    mesh.geometry = geometry;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(ownMaterial) : ownMaterial(mesh.material);
    mesh.receiveShadow = true;
    const skinned = mesh as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) return;
    if (!skeletons.has(skinned.skeleton)) compactAnimalBoneTexture(skinned.skeleton);
    skeletons.add(skinned.skeleton);
    // Animation can raise heads and swing tails outside the rest sphere.
    geometry.computeBoundingSphere();
    skinned.boundingSphere = geometry.boundingSphere!.clone(); skinned.boundingSphere.radius = skinned.boundingSphere.radius * 1.8 + 0.04;
    const footJoints = new Set(skinned.skeleton.bones.flatMap((bone, index) => PAWS.has(bone.name) ? [index] : []));
    const positions = geometry.getAttribute('position'), skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
    for (let vertex = 0; vertex < positions.count; vertex++) {
      position.fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      if (!footJoints.size) {
        if (position.y <= validated.bounds.min.y + 0.075) fallbackSoles.push({ mesh: skinned, vertex, y: position.y });
        continue;
      }
      let influence = 0, paw = '';
      for (let k = 0; k < 4; k++) {
        const joint = skinIndex.getComponent(vertex, k), weight = skinWeight.getComponent(vertex, k);
        if (!footJoints.has(joint) || weight <= influence) continue;
        influence = weight; paw = skinned.skeleton.bones[joint]!.name;
      }
      if (influence <= 0.35) continue;
      const points = soles.get(paw) ?? []; points.push({ mesh: skinned, vertex, y: position.y }); soles.set(paw, points);
    }
  });
  const byMesh = new Map<THREE.SkinnedMesh, number[]>();
  const retain = (points: typeof fallbackSoles, limit: number) => {
    const minimum = points.reduce((y, point) => Math.min(y, point.y), Infinity);
    const bottom = points.filter(point => point.y <= minimum + 0.075), stride = Math.max(1, Math.ceil(bottom.length / limit));
    bottom.forEach((point, index) => {
      if (index % stride) return;
      const vertices = byMesh.get(point.mesh) ?? []; vertices.push(point.vertex); byMesh.set(point.mesh, vertices);
    });
  };
  // Rest art may hold a paw above the other three. Select each paw's own sole so it can land later;
  // share the 48-sample cap across every mesh of the complete animal.
  if (soles.size) for (const points of soles.values()) retain(points, SOLE_SAMPLES_PER_PAW);
  else retain(fallbackSoles, SOLE_SAMPLES_PER_PAW * 4);
  byMesh.forEach((vertices, mesh) => paws.push({ mesh, vertices }));
  return { scene, bounds: validated.bounds, size: validated.bounds.getSize(new THREE.Vector3()), triangles: validated.triangles,
    paws, skeletons, animation: new AnimalAnimation(scene, template.animations, definition.species, validated.motionSpeeds) };
}

/** One posable copy of a validated animal with its own skeleton, materials and actions, outside the wildlife module
 * (the title meadow's grazing deer). Disposing it releases only what the copy owns. */
export interface AnimalFigure {
  readonly scene: THREE.Group;
  readonly size: THREE.Vector3;
  readonly animation: AnimalAnimation;
  dispose(): void;
}

export function createAnimalFigure(template: GLTF, definition: AnimalDefinition): AnimalFigure {
  const body = cloneAnimal(template, definition);
  let disposed = false;
  return {
    scene: body.scene, size: body.size, animation: body.animation,
    dispose() {
      if (disposed) return;
      disposed = true;
      body.animation.dispose(); body.skeletons.forEach(skeleton => skeleton.dispose());
      const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      body.scene.traverse(object => {
        const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
        geometry.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    },
  };
}

export interface AnimalSnapshot { id: string; species: AnimalSpecies; x: number; y: number; z: number; yaw: number; radius: number; state: AnimalClip | 'Dead' | 'Skinned' | 'Returning'; visible: boolean }
/** An animal here: its mind (core/rules/animalMind.ts), which decides and moves, and the body that is drawn. */
type AnimalInstance = AnimalMind & AnimalBody & { root: THREE.Group; turn: THREE.Quaternion };

export interface AnimalWildlife extends SceneModule {
  setPeople(people: readonly PhysicalActor[]): void;
  readonly contacts: readonly Collider[];
  /** Borrowed inputs refreshed on each read; copy values when retaining a historical snapshot. */
  readonly physicalActors: readonly PhysicalActor[];
  snapshot(): AnimalSnapshot[];
  /** `hunter`: where the hunter stands for a restore, so returning animals settle away from him (A101 scout). */
  syncHunting(records: HuntingState, restore?: boolean, hunter?: { x: number; z: number }): void;
  traceArrow(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): AnimalArrowHit | null;
  showArrowImpact(hit: AnimalArrowHit, direction: THREE.Vector3): void;
  alertShot(position: { x: number; z: number }, radius?: number): void;
  nearestCarcass: AnimalHunting['nearestCarcass'];
  skinningFrame: AnimalHunting['skinningFrame'];
  setRunning(value: boolean): void;
  setReduceEffects(value: boolean): void;
  /** Where a rideable animal stands and how high its saddle sits above the ground there (A70); null for others. */
  mount(id: string): { x: number; y: number; z: number; yaw: number; seat: number } | null;
  /** Carry a rider: the animal stands, walks or runs where he steers; null lets it go where it stands. */
  ride(id: string, at: { x: number; z: number; yaw: number; speed: number } | null): void;
  /**
   * The ridden animal's stride (A71): its phase (0..1, null standing), which gait, and how many hooves have struck since
   * last asked: a four-beat stride strikes at each quarter of its clip.
   */
  rideGait(id: string): { phase: number | null; gait: 'Idle' | 'Walk' | 'Run'; footfalls: number } | null;
  /** The animals' roots, drawn between fixed simulation steps (A72). */
  movers?(): readonly THREE.Object3D[];
}

/** Independent peaceful wildlife controllers with optional durable hunting presentation. */
export function buildAnimals(ctx: Pick<BuildContext, 'terrain' | 'colliders' | 'quality'>, templates: AnimalTemplates,
  definitions: readonly AnimalDefinition[] = ANIMALS, emit: (event: AnimalCallEvent) => void = event => window.dispatchEvent(new CustomEvent(ANIMAL_CALL_EVENT, { detail: event }))): AnimalWildlife {
  let abandon: (() => void) | undefined;
  const steps = buildAnimalSteps(ctx, templates, definitions, emit, dispose => { abandon = dispose; });
  try {
    for (;;) { const next = steps.next(); if (next.done) return next.value; }
  } catch (error) { abandon?.(); throw error; }
  finally { steps.return(undefined as never); }
}

/** Deferred wildlife is assembled in bounded turns while the existing world keeps playing. */
export async function buildAnimalsAsync(ctx: Pick<BuildContext, 'terrain' | 'colliders' | 'quality'>, templates: AnimalTemplates,
  options: CooperativeOptions = {}, definitions: readonly AnimalDefinition[] = ANIMALS,
  emit: (event: AnimalCallEvent) => void = event => window.dispatchEvent(new CustomEvent(ANIMAL_CALL_EVENT, { detail: event }))): Promise<AnimalWildlife> {
  let abandon: (() => void) | undefined;
  try {
    return await finishCooperatively(buildAnimalSteps(ctx, templates, definitions, emit, dispose => { abandon = dispose; }), { budgetMs: 3, ...options });
  } catch (error) { abandon?.(); throw error; }
}

function* buildAnimalSteps(ctx: Pick<BuildContext, 'terrain' | 'colliders' | 'quality'>, templates: AnimalTemplates,
  definitions: readonly AnimalDefinition[], emit: (event: AnimalCallEvent) => void, onAbandon: (dispose: () => void) => void): Generator<void, AnimalWildlife> {
  const group = new THREE.Group(); group.name = 'Land wildlife';
  const animals: AnimalInstance[] = [], occupied: AnimalSite[] = [];
  let disposed = false, running = true, calls = 0;
  let hunting!: AnimalHunting;
  const dispose = () => {
    if (disposed) return;
    disposed = true; hunting?.dispose();
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    for (const animal of animals) {
      animal.animation.dispose(); animal.skeletons.forEach(skeleton => skeleton.dispose());
      animal.scene.traverse(object => {
        const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
        geometry.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
      });
    }
    geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
  };
  onAbandon(dispose);
  const { terrain } = ctx, colliders = animalNavigationColliders(ctx.colliders);
  // What the animals decide together is the core's; what is seen, shot and heard of them is answered from here.
  const herd = new Wildlife(terrain, colliders, {
    present: mind => hunting.isVisible(mind as AnimalInstance), dead: mind => hunting.isDead(mind as AnimalInstance),
    callReach: species => ANIMAL_AUDIO.species[species].maxDistance,
  });
  const facingScratch = new THREE.Vector3();
  // Fit every habitat before allocating disposable copies, so a bad placement cannot strand a partial set of GPU resources.
  // Reuse validation only within this build; a subsequent build still checks its source anew.
  const fitted: { definition: AnimalDefinition; template: GLTF; home: AnimalSite; validated: ReturnType<typeof validateAnimalTemplate> }[] = [];
  for (const definition of definitions) {
    const template = templates.get(definition.id);
    if (!template) throw new Error(`The ${definition.species} source model was not loaded.`);
    const validated = validateAnimalTemplate(template, definition);
    const size = validated.bounds.getSize(new THREE.Vector3()), radius = Math.hypot(size.x, size.z) / 2 + 0.14;
    const home = findAnimalSite(definition, radius, terrain, colliders, occupied, size.y); occupied.push(home);
    fitted.push({ definition, template, home, validated });
    yield;
  }
  for (const [index, { definition, template, home, validated }] of fitted.entries()) {
    const body = cloneAnimal(template, definition, validated), root = new THREE.Group(); root.name = `${definition.species} / ${definition.id}`; root.add(body.scene);
    body.scene.traverse(object => { if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).castShadow = ctx.quality !== 'low'; });
    // The body as the mind needs it: where it stands, how tall it is, its motions, and the way the drawn body faces.
    const mind = new AnimalMind(definition, home, index, {
      position: root.position, height: body.size.y,
      has: clip => body.animation.has(clip), duration: clip => body.animation.duration(clip), referenceSpeed: clip => body.animation.referenceSpeed(clip),
      transition: clip => body.animation.transition(clip),
      facing: () => { facingScratch.set(0, 0, 1).applyQuaternion(root.quaternion); return Math.atan2(facingScratch.x, facingScratch.z); },
    }, herd);
    root.position.set(home.x, terrain.heightAt(home.x, home.z), home.z); root.rotation.y = mind.yaw; group.add(root);
    const animal: AnimalInstance = Object.assign(mind, body, { root, turn: new THREE.Quaternion() });
    animals.push(animal);
    yield;
  }
  const up = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), basis = new THREE.Matrix4(), vertex = new THREE.Vector3();
  const normal: [number, number, number] = [0, 1, 0];
  const place = (animal: AnimalInstance, dt: number) => {
    const point = animal.root.position;
    // The mount stands where a rider does (A86 scout): on a deck or a bridge, not on the stream bed beneath it, ridden
    // or left there. Wild animals keep to open ground, which their paths never leave.
    const groundOf = animal.definition.tame ? (x: number, z: number) => terrain.groundAt(x, z) : (x: number, z: number) => terrain.heightAt(x, z);
    // On a deck it stands level, not tilted to the ground under the planks.
    const ground = groundOf(point.x, point.z);
    if (animal.definition.tame && ground > terrain.heightAt(point.x, point.z) + 0.05) up.set(0, 1, 0);
    else { terrain.normalAt(point.x, point.z, normal); up.set(...normal); }
    forward.set(Math.sin(animal.yaw), 0, Math.cos(animal.yaw)).addScaledVector(up, -forward.dot(up)).normalize();
    right.crossVectors(up, forward).normalize(); forward.crossVectors(right, up).normalize();
    basis.makeBasis(right, up, forward); animal.turn.setFromRotationMatrix(basis);
    animal.root.quaternion.slerp(animal.turn, 1 - Math.exp(-dt * 9));
    point.y = ground - animal.bounds.min.y;
    animal.root.updateMatrixWorld(true);
    // Without CPU contact samples, Three refreshes these bones when the animal is rendered.
    if (animal.paws.length) animal.skeletons.forEach(skeleton => skeleton.update());
    let correction = -Infinity;
    for (const paw of animal.paws) for (const index of paw.vertices) {
      paw.mesh.getVertexPosition(index, vertex).applyMatrix4(paw.mesh.matrixWorld);
      correction = Math.max(correction, groundOf(vertex.x, vertex.z) - vertex.y);
    }
    if (Number.isFinite(correction)) {
      point.y += THREE.MathUtils.clamp(correction, -0.06, 0.18) + 0.006;
      animal.root.updateMatrixWorld(true);
    }
  };
  // The saddled deer can be ridden (A70): while carried, it follows its rider and keeps out of its own routine.
  let ridden: { animal: AnimalInstance; at: { x: number; z: number; yaw: number; speed: number } } | null = null;
  const seats = new Map<AnimalInstance, number>();
  let rideGait: { id: string; phase: number | null; gait: 'Idle' | 'Walk' | 'Run'; footfalls: number } | null = null;
  const seatOf = (animal: AnimalInstance) => {
    let seat = seats.get(animal);
    if (seat !== undefined) return seat;
    // The highest point of the back over the middle of the body, in the standing pose: the saddle.
    const box = animal.bounds, mid = (box.min.z + box.max.z) / 2, span = (box.max.z - box.min.z) * 0.12;
    let top = -Infinity;
    animal.scene.updateMatrixWorld(true);
    const inverse = animal.root.matrixWorld.clone().invert();
    animal.scene.traverse(object => {
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      const count = mesh.geometry.attributes.position!.count;
      for (let i = 0; i < count; i += 3) {
        (mesh.isSkinnedMesh ? mesh.getVertexPosition(i, vertex) : vertex.fromBufferAttribute(mesh.geometry.attributes.position!, i)).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        if (Math.abs(vertex.z - mid) < span && Math.abs(vertex.x) < span) top = Math.max(top, vertex.y);
      }
    });
    seat = Number.isFinite(top) ? top + 0.02 : animal.size.y * 0.62;
    seats.set(animal, seat);
    return seat;
  };
  hunting = new AnimalHunting([], terrain, (body: HuntingAnimal, fallback, wounded) => (body as AnimalInstance).startled(fallback, wounded), (body, returning) => {
    const animal = body as AnimalInstance;
    if (!animal.resettle(returning)) return false;
    animal.root.rotation.set(0, animal.yaw, 0);
    return true;
  });
  yield* hunting.prepare(animals);
  hunting.group.traverse(object => { if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).castShadow = ctx.quality !== 'low'; });
  group.add(hunting.group);
  const physicalInputs: PhysicalActor[] = [];
  const physicalRows: PhysicalActor[] = animals.map(animal => ({ id: `animal:${animal.definition.id}`,
    x: 0, y: 0, z: 0, radius: 0, height: 0, active: true }));
  let animalShadows = ctx.quality !== 'low';

  return {
    group,
    movers: () => animals.map(animal => animal.root),
    setPeople(next) { herd.people = next; },
    syncHunting: (records, restore, at) => { if (at) herd.hunter = { x: at.x, z: at.z }; hunting.syncHunting(records, restore); },
    mount(id) {
      const animal = animals.find(a => a.definition.id === id && a.definition.tame && !a.definition.seated && a.definition.species === 'deer');
      if (!animal || !hunting.isVisible(animal)) return null;
      const p = animal.root.position;
      return { x: p.x, y: p.y, z: p.z, yaw: animal.yaw, seat: seatOf(animal) };
    },
    ride(id, at) {
      const animal = animals.find(a => a.definition.id === id);
      if (!animal) return;
      if (at) { ridden = { animal, at: { ...at } }; return; }
      if (ridden?.animal === animal) { ridden = null; rideGait = null; animal.path = []; animal.settle(); }
    },
    rideGait(id) {
      if (!rideGait || rideGait.id !== id) return null;
      const out = { phase: rideGait.phase, gait: rideGait.gait, footfalls: rideGait.footfalls };
      rideGait.footfalls = 0;
      return out;
    },
    traceArrow: (origin, direction, distance) => running ? hunting.traceArrow(origin, direction, distance) : null,
    showArrowImpact: (hit, direction) => hunting.showArrowImpact(hit, direction),
    alertShot: (position, radius) => hunting.alertShot(position, radius),
    nearestCarcass: (player, distance) => hunting.nearestCarcass(player, distance),
    skinningFrame: (id: AnimalId, player) => hunting.skinningFrame(id, player),
    setRunning(value) { running = value && !disposed; hunting.setRunning(running); },
    setReduceEffects: value => hunting.setReduceEffects(value),
    get contacts(): Collider[] {
      return animals.filter(animal => hunting.isVisible(animal) && animal !== ridden?.animal).map(animal => hunting.corpseContact(animal) ?? ({ id: `animal:${animal.definition.id}`, kind: 'box', x: animal.root.position.x, z: animal.root.position.z,
        hw: animal.size.x / 2 + 0.07, hd: animal.size.z / 2 + 0.07, yaw: animal.yaw, active: true,
        minY: animal.root.position.y, maxY: animal.root.position.y + animal.size.y }));
    },
    get physicalActors(): PhysicalActor[] {
      physicalInputs.length = 0;
      for (let i = 0; i < animals.length; i++) {
        const animal = animals[i]!;
        if (!hunting.isVisible(animal) || animal === ridden?.animal) continue;
        const corpse = hunting.corpseContact(animal), row = physicalRows[i]!;
        row.x = corpse?.x ?? animal.root.position.x;
        row.y = corpse?.minY ?? animal.root.position.y;
        row.z = corpse?.z ?? animal.root.position.z;
        row.radius = corpse ? corpse.kind === 'box' ? Math.max(.18, Math.hypot(corpse.hw, corpse.hd)) : corpse.r : Math.max(.18, animal.size.x * .5);
        row.height = corpse ? Math.max(.25, corpse.maxY! - corpse.minY!) : Math.max(animal.size.x, animal.size.y);
        physicalInputs.push(row);
      }
      return physicalInputs;
    },
    snapshot: () => animals.map(animal => ({ id: animal.definition.id, species: animal.definition.species, x: animal.root.position.x,
      y: animal.root.position.y, z: animal.root.position.z, yaw: animal.yaw, radius: animal.home.radius,
      state: hunting.isReturning(animal) ? 'Returning' : !hunting.isVisible(animal) ? 'Skinned' : hunting.isDead(animal) ? 'Dead' : animal.state, visible: animal.root.visible })),
    stats: () => ({ animals: animals.length, animalModels: new Set(animals.map(animal => animal.definition.id)).size,
      animalVisible: animals.filter(animal => animal.root.visible).length, animalCalls: calls, animalTriangles: animals.reduce((sum, animal) => sum + animal.triangles, 0),
      animalDead: animals.filter(animal => hunting.isDead(animal)).length, animalSkinned: animals.filter(animal => !hunting.isVisible(animal) && !hunting.isReturning(animal)).length }),
    update(inputDt: number, frame: FrameContext) {
      if (disposed || !running || frame.wildlifeActive === false) return;
      const dt = Math.min(Math.max(0, inputDt), 0.1);
      herd.hunter = { x: frame.focus.x, z: frame.focus.z };
      hunting.update(dt, frame.reducedMotion);
      hunting.group.traverse(object => { if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).castShadow = frame.quality !== 'low'; });
      const shadows = frame.quality !== 'low';
      if (shadows !== animalShadows) {
        // Animal meshes are fixed after construction. Refresh them only when shadow
        // policy changes, before the ridden-animal early return as well. Effects
        // above can create meshes during hunting.update and still need their walk.
        for (const animal of animals) animal.scene.traverse(object => {
          if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).castShadow = shadows;
        });
        animalShadows = shadows;
      }
      for (const animal of animals) {
        const p = animal.root.position;
        if (ridden?.animal === animal) {
          const { at } = ridden, gait = animal.carry(at);
          const before = animal.animation.gaitPhase();
          animal.animation.update(dt, at.speed); place(animal, dt);
          const after = animal.animation.gaitPhase();
          if (!rideGait || rideGait.id !== animal.definition.id) rideGait = { id: animal.definition.id, phase: null, gait, footfalls: 0 };
          // Each quarter of the stride clip crossed is a hoof striking, whichever way the stride runs.
          if (before !== null && after !== null) rideGait.footfalls += strideQuartersCrossed(before, after, at.speed < 0);
          rideGait.phase = after; rideGait.gait = gait;
          continue;
        }
        // All nineteen remain in the scene on every preset. Expanded skin bounds let Three's actual
        // camera/shadow frusta reject submissions without a visible distance seam.
        // What it does this step is its mind's (core/rules/animalMind.ts); nothing of it moves while it is gone or dead.
        const step = animal.step(dt, frame.focus, frame.nightness);
        if (!step) continue;
        animal.animation.update(dt, step.speed); place(animal, dt);
        if (step.call) {
          calls++;
          const mouth = animal.scene.getObjectByName('jaw') ?? animal.scene.getObjectByName('head');
          if (mouth) mouth.getWorldPosition(vertex); else vertex.set(p.x, p.y + animal.size.y * 0.68, p.z);
          emit({ id: animal.definition.id, species: animal.definition.species,
            position: { x: vertex.x, y: vertex.y, z: vertex.z }, callVariant: step.call });
        }
      }
    },
    dispose,
  };
}

/**
 * Wildlife that arrives after the world opens (A70). The animals' models are about a fifth of what a first visit
 * downloads, and none is needed to set foot in the valley, so the world opens with this stand-in and the real animals
 * move in once their models are here. Until then there are no animals to see, hit or ride; settings and the hunting
 * records it is given are passed on when they arrive, the records restored as on a load.
 */
export function deferredWildlife(): AnimalWildlife & { attach(inner: AnimalWildlife): void; readonly arrived: boolean } {
  const group = new THREE.Group(); group.name = 'Land wildlife (arriving)';
  let inner: AnimalWildlife | null = null, disposed = false, people: readonly PhysicalActor[] = [];
  let records: HuntingState = {}, running = true, reduce = false, hunterAt: { x: number; z: number } | null = null;
  return {
    group,
    get arrived() { return inner !== null; },
    attach(next) {
      if (disposed) { next.dispose?.(); return; }
      inner = next;
      group.add(next.group);
      next.setPeople(people); next.setRunning(running); next.setReduceEffects(reduce);
      if (hunterAt) next.syncHunting(records, true, hunterAt); else next.syncHunting(records, true);
    },
    update(dt, f) { inner?.update(dt, f); },
    stats: () => inner?.stats?.() ?? {},
    dispose() { disposed = true; inner?.dispose?.(); inner = null; },
    setPeople(next) { people = next; inner?.setPeople(next); },
    get contacts() { return inner?.contacts ?? []; },
    get physicalActors() { return inner?.physicalActors ?? []; },
    snapshot: () => inner?.snapshot() ?? [],
    syncHunting(next, restore, at) { records = next; if (at) hunterAt = { x: at.x, z: at.z }; inner?.syncHunting(next, restore, at); },
    traceArrow: (origin, direction, distance) => inner?.traceArrow(origin, direction, distance) ?? null,
    showArrowImpact(hit, direction) { inner?.showArrowImpact(hit, direction); },
    alertShot(position, radius) { inner?.alertShot(position, radius); },
    nearestCarcass: ((...args: Parameters<AnimalWildlife['nearestCarcass']>) => inner ? inner.nearestCarcass(...args) : null) as AnimalWildlife['nearestCarcass'],
    skinningFrame: ((...args: Parameters<AnimalWildlife['skinningFrame']>) => inner ? inner.skinningFrame(...args) : null) as AnimalWildlife['skinningFrame'],
    setRunning(value) { running = value; inner?.setRunning(value); },
    setReduceEffects(value) { reduce = value; inner?.setReduceEffects(value); },
    mount: (id) => inner?.mount(id) ?? null,
    ride(id, at) { inner?.ride(id, at); },
    rideGait: (id) => inner?.rideGait(id) ?? null,
    movers: () => inner?.movers?.() ?? [],
  };
}
