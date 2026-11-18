import * as THREE from 'three';
import { expect, it } from 'vitest';
import { TileLayer } from '../../src/presentation/ground/tileStream';

it('submits every potentially visible clump across movement, reflection and tile reuse', () => {
  const material = new THREE.MeshBasicMaterial();
  const centers = [1, 14, 2, 12, 3, 11, 4, 10];
  const layer = new TileLayer({
    name: 'near grass', tileSize: 16, capacity: centers.length,
    geometry: new THREE.PlaneGeometry(), material, fadeStart: 22, fadeEnd: 23, power: 1, maxHeight: .4,
    receiveShadow: false, band: { start: -2, end: 6 }, compactOuterBand: true,
    generate(tx, tz, out) {
      out.ymin = out.ymax = 0;
      if (tz) return 0;
      centers.forEach((x, i) => {
        out.base.set([16 * tx + x, 0, 0, i / centers.length], i * 4);
        for (const a of [out.shape, out.tint, out.slope]) a.set([x, x + 1, x + 2, x + 3], i * 4);
      });
      return centers.length;
    },
  });
  const eye = new THREE.PerspectiveCamera(100, 1, .1, 150);
  const scene = new THREE.Scene();
  let firstBaseVersion = 0;
  try {
    for (const x of [0, .5, 2.99, 3.01, 9, 14, 100, 0, -3]) {
      const main = new THREE.Vector3(x, .2, 0);
      layer.update(main);
      const tx = Math.floor(x / 16);
      const mesh = layer.group.children.find(o => {
        const m = o as THREE.Mesh<THREE.InstancedBufferGeometry>;
        return m.visible && m.geometry.boundingSphere!.center.x === tx * 16 + 8 && m.geometry.boundingSphere!.center.z === 8;
      }) as THREE.Mesh<THREE.InstancedBufferGeometry>;
      expect(mesh).toBeDefined();
      const geo = mesh.geometry, base = geo.getAttribute('aBase'), primaryCount = geo.instanceCount;
      const version = (base as THREE.InstancedBufferAttribute).version;
      if (x === 0) firstBaseVersion = version;
      else if (x === .5 || x === 2.99) expect(version).toBe(firstBaseVersion);
      for (const cx of [x, x + 2, x + 12, x]) {
        eye.position.set(cx, .2, 0); eye.updateMatrixWorld(true);
        mesh.onBeforeRender({} as THREE.WebGLRenderer, scene, eye, geo, material, {} as THREE.Group);
        const submitted = new Set(Array.from({ length: geo.instanceCount }, (_, i) => base.getX(i)));
        const required = centers.map(anchor => anchor + 16 * tx).filter(anchor => Math.hypot(anchor - cx, .2) <= 6);
        for (const anchor of required) expect(submitted).toContain(anchor);
        if (x === 0 && cx === 0) expect(submitted.size).toBe(4);
        for (let i = 0; i < centers.length; i++) {
          const anchor = base.getX(i) - 16 * tx;
          for (const name of ['aShape', 'aTint', 'aSlope']) expect(geo.getAttribute(name).getX(i)).toBe(anchor);
          expect(base.getW(i)).toBe(centers.indexOf(anchor) / centers.length);
        }
        mesh.onAfterRender({} as THREE.WebGLRenderer, scene, eye, geo, material, {} as THREE.Group);
        expect(geo.instanceCount).toBe(primaryCount);
      }
    }
  } finally {
    layer.dispose();
  }
});
