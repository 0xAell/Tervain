import { expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../src/core/world/noise';
import { components } from '../../src/diagnostics/canopyConnectivity';
import { woodAnchor } from '../../src/presentation/canopy';
import { anchorLeafIslands } from '../../src/presentation/leafIslands';

// The searches a tree's build runs hundreds of thousands of times, held to the plain searches they stand for.

it('finds the point on the wood that a search of every triangle finds, and nothing past its limit', () => {
  const random = mulberry32(7), corners: number[] = [];
  for (let t = 0; t < 700; t++) {
    const x = random() * 10 - 5, y = random() * 12, z = random() * 10 - 5;
    for (let k = 0; k < 3; k++) corners.push(x + random() - 0.5, y + random() - 0.5, z + random() - 0.5);
  }
  const wood = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  const position = wood.getAttribute('position'), anchor = woodAnchor(wood), triangle = new THREE.Triangle(), near = new THREE.Vector3();
  const p = new THREE.Vector3(), hit = new THREE.Vector3(), expected = new THREE.Vector3();
  for (let n = 0; n < 300; n++) {
    p.set(random() * 16 - 8, random() * 16 - 2, random() * 16 - 8);
    let best = Infinity;
    for (let t = 0; t < 700; t++) {
      triangle.a.fromBufferAttribute(position, t * 3); triangle.b.fromBufferAttribute(position, t * 3 + 1); triangle.c.fromBufferAttribute(position, t * 3 + 2);
      triangle.closestPointToPoint(p, near);
      const d = near.distanceTo(p);
      if (d < best) { best = d; expected.copy(near); }
    }
    expect(anchor(p, hit)).toBe(best);
    expect(hit.toArray()).toEqual(expected.toArray());
    expect(anchor(p, hit, best * 1.1)).toBe(best);
    expect(anchor(p, hit, best * 0.9)).toBe(Infinity);
  }
  wood.dispose();
});

it('welds leaf corners within a tenth of a millimetre, on either side of zero, and no farther', () => {
  // The first card's right edge and the second's left edge are 0.02 mm apart, either side of x = 0; the third card
  // stands 2 mm off the second.
  const leaf = mergeGeometries([
    new THREE.PlaneGeometry(1, 1).translate(-0.50001, 0, 0),
    new THREE.PlaneGeometry(1, 1).translate(0.50001, 0, 0),
    new THREE.PlaneGeometry(1, 1).translate(1.50201, 0, 0),
  ]);
  const parts = components(leaf, () => {});
  expect(parts.map((part) => part.vertices?.length)).toEqual([8, 4]);
  leaf.dispose();
});

it('finds the same leaf islands in a crown 5 km from the origin, beyond the cells its table numbers', () => {
  const crown = (x: number) => ({
    leaf: mergeGeometries([0.8, 3, -3].map((at, i) => new THREE.PlaneGeometry(1, 1).translate(x + at, 3 + i, 0))),
    wood: new THREE.CylinderGeometry(0.2, 0.3, 4, 6).translate(x, 2, 0),
  });
  const home = crown(0), far = crown(5000);
  const found = anchorLeafIslands(home.leaf, home.wood, null, { reach: 0.5, gap: 0.6 });
  expect(found).toEqual({ islands: 2, moved: 2, dropped: 0 });
  expect(anchorLeafIslands(far.leaf, far.wood, null, { reach: 0.5, gap: 0.6 })).toEqual(found);
  for (const g of [home.leaf, home.wood, far.leaf, far.wood]) g.dispose();
});
