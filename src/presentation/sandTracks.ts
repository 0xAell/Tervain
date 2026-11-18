import * as THREE from 'three';
import type { Terrain } from '../core/world/terrain';

const CAPACITY = 40;
const LIFETIME = 24;
type Point = readonly [number, number];
// A split sole leaves a broader ball, an inward waist and a separate heel in damp sand.
const BALL: Point[] = [[-.046,.037],[-.057,.089],[-.053,.134],[-.030,.159],[.008,.166],[.044,.151],[.058,.113],[.05,.060],[.027,.015],[-.016,.022]];
const HEEL: Point[] = [[-.039,-.015],[-.047,-.075],[-.033,-.107],[.022,-.111],[.045,-.086],[.045,-.022]];

function sole() {
  const points: Point[] = [], shade: number[] = [], index: number[] = [];
  for (const outline of [HEEL, BALL]) {
    const cx = outline.reduce((sum, p) => sum + p[0], 0) / outline.length;
    const cz = outline.reduce((sum, p) => sum + p[1], 0) / outline.length;
    const centre = points.length;
    points.push([cx, cz]); shade.push(.27);
    for (const [x, z] of outline) {
      // A compressed edge throws more shadow than the flat bottom; loose sand feathers the rim.
      points.push([cx + (x-cx)*.76, cz + (z-cz)*.76], [x, z]); shade.push(.42, 0);
    }
    for (let i = 0; i < outline.length; i++) {
      const a = centre + 1 + i*2, b = centre + 1 + ((i+1)%outline.length)*2;
      index.push(centre,a,b, a,a+1,b, a+1,b+1,b);
    }
  }
  return { points, shade, index };
}
const SOLE = sole();

/** An unseen trail can receive several stamps before the renderer next uploads it. */
function markChanged(attribute: THREE.BufferAttribute, start: number, count: number) {
  const pending = attribute.updateRanges[0];
  if (pending) {
    const end = Math.max(pending.start + pending.count, start + count);
    pending.start = Math.min(pending.start, start);
    pending.count = end - pending.start;
  } else attribute.addUpdateRange(start, count);
  attribute.needsUpdate = true;
}

/** Ground-fitted prints share one small buffer. Walking elsewhere never submits it. */
export class SandTracks {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly printBounds = Array.from({ length: CAPACITY }, () => new THREE.Box3());
  private readonly point = new THREE.Vector3();
  private readonly vertices = SOLE.points.length;
  private readonly position = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY*this.vertices*3), 3).setUsage(THREE.DynamicDrawUsage);
  private readonly born = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY*this.vertices), 1).setUsage(THREE.DynamicDrawUsage);
  private readonly now = { value: 0 };
  private readonly material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: { uNow: this.now },
    vertexShader: `attribute float shade; attribute float born; uniform float uNow; varying float opacity;
      void main() { opacity = shade * (1.0 - smoothstep(9.0, ${LIFETIME.toFixed(1)}, uNow-born));
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying float opacity; void main() { gl_FragColor = vec4(0.0,0.0,0.0,opacity); }`,
  });
  readonly mesh = new THREE.Mesh(this.geometry, this.material);
  private next = 0;
  private count = 0;
  private last = -Infinity;
  private side = 1;

  constructor() {
    const indices: number[] = [], shades: number[] = [];
    for (let i=0; i<CAPACITY; i++) {
      for (const index of SOLE.index) indices.push(i*this.vertices+index);
      shades.push(...SOLE.shade);
    }
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('shade', new THREE.Float32BufferAttribute(shades, 1));
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('born', this.born);
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingBox = new THREE.Box3();
    this.geometry.boundingSphere = new THREE.Sphere();
    this.mesh.name = 'Boot impressions in the strand';
    this.mesh.visible = false;
  }

  stamp(terrain: Pick<Terrain, 'heightAt'>, x: number, feet: number, z: number, yaw: number) {
    if (Math.abs(terrain.heightAt(x, z) - feet) > .12) return;
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw), aheadX = -rightZ, aheadZ = rightX;
    const offset = this.next * this.vertices;
    const bounds = this.printBounds[this.next]!.makeEmpty();
    for (let i = 0; i < this.vertices; i++) {
      const [across, forward] = SOLE.points[i]!;
      const lateral = this.side * (.105 + across);
      const px = x+lateral*rightX+forward*aheadX, pz = z+lateral*rightZ+forward*aheadZ;
      this.position.setXYZ(offset+i, px, terrain.heightAt(px,pz)+.003, pz);
      bounds.expandByPoint(this.point.fromBufferAttribute(this.position, offset+i));
      this.born.setX(offset+i, this.now.value);
    }
    markChanged(this.position, offset*3, this.vertices*3);
    markChanged(this.born, offset, this.vertices);
    this.next = (this.next+1)%CAPACITY;
    this.count = Math.min(this.count+1,CAPACITY);
    this.geometry.setDrawRange(0,this.count*SOLE.index.length);
    const trail = this.geometry.boundingBox!.makeEmpty();
    for (let i = 0; i < this.count; i++) trail.union(this.printBounds[i]!);
    trail.getBoundingSphere(this.geometry.boundingSphere!);
    this.side *= -1;
    this.last = this.now.value;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (!this.mesh.visible) return;
    this.now.value += dt;
    if (this.now.value-this.last < LIFETIME) return;
    this.reset();
  }

  reset() {
    this.mesh.visible = false;
    this.next = this.count = 0;
    this.now.value = 0;
    this.last = -Infinity;
    this.side = 1;
    this.geometry.setDrawRange(0,0);
    this.geometry.boundingBox!.makeEmpty();
    this.geometry.boundingSphere!.makeEmpty();
    this.position.clearUpdateRanges(); this.born.clearUpdateRanges();
  }
}
