import { expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../src/core/world/noise';
import { boundsTree, boxPointDistance, closestPointOnTriangle, components, contactDistances, sortByKey, type Component, type LeafNode } from '../../src/diagnostics/canopyConnectivity';
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

it('finds the closest point on a triangle and a box\'s distance to the doubles three\'s own methods give', () => {
  const random = mulberry32(11), triangle = new THREE.Triangle(), expected = new THREE.Vector3(), p = new THREE.Vector3();
  const corners = new Float64Array(9), out = new Float64Array(3), regions = new Set<string>();
  const shapes: (() => number[])[] = [
    () => Array.from({ length: 9 }, () => random() * 4 - 2),
    // Degenerate: a corner repeated, three corners on a line, all three at one point.
    () => { const a = [random(), random(), random()], b = [random(), random(), random()]; return [...a, ...a, ...b]; },
    () => { const a = [random(), random(), random()], d = [random(), random(), random()]; return [...a, ...a.map((v, i) => v + d[i]!), ...a.map((v, i) => v + 2 * d[i]!)]; },
    () => { const a = [random(), random(), random()]; return [...a, ...a, ...a]; },
  ];
  for (let n = 0; n < 20000; n++) {
    corners.set(shapes[n % shapes.length]!());
    triangle.a.fromArray(corners, 0); triangle.b.fromArray(corners, 3); triangle.c.fromArray(corners, 6);
    p.set(random() * 8 - 4, random() * 8 - 4, random() * 8 - 4);
    triangle.closestPointToPoint(p, expected);
    closestPointOnTriangle(corners, 0, p.x, p.y, p.z, out);
    expect(Array.from(out)).toEqual(expected.toArray());
    // Which of the seven regions answered: a corner, an edge or the face.
    regions.add(expected.equals(triangle.a) ? 'a' : expected.equals(triangle.b) ? 'b' : expected.equals(triangle.c) ? 'c' : 'edge or face');
  }
  expect([...regions].sort()).toEqual(['a', 'b', 'c', 'edge or face']);
  const box = new THREE.Box3();
  for (let n = 0; n < 5000; n++) {
    box.setFromPoints([new THREE.Vector3(random(), random(), random()), new THREE.Vector3(random(), random(), random())]);
    if (n % 7 === 0) box.max.copy(box.min);
    p.set(random() * 3 - 1, random() * 3 - 1, random() * 3 - 1);
    expect(boxPointDistance(box, p.x, p.y, p.z)).toBe(box.distanceToPoint(p));
  }
});

it('finds each component\'s contact with the wood as the recursive search of three\'s triangles did, charging the same', () => {
  // The search as it stood before it moved to a stack and scalars: the first triangle within maxGap, nearer half first.
  const before = (parts: readonly Component[], wood: THREE.BufferGeometry, maxGap: number, charge: () => void) => {
    const p = wood.getAttribute('position'), index = wood.index, triangles: THREE.Triangle[] = [];
    const corner = (i: number) => new THREE.Vector3().fromBufferAttribute(p, index?.getX(i) ?? i);
    for (let i = 0; i + 2 < (index?.count ?? p.count); i += 3) triangles.push(new THREE.Triangle(corner(i), corner(i + 1), corner(i + 2)));
    const support = boundsTree(triangles.map(t => new THREE.Box3().expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c)), charge), nearest = new THREE.Vector3();
    return parts.map(c => {
      let distance = maxGap, found = false;
      for (const sample of c.samples) {
        const visit = (node: LeafNode) => {
          charge(); if (node.box.distanceToPoint(sample) > distance) return;
          if (node.ids) { for (const i of node.ids) { charge(); triangles[i]!.closestPointToPoint(sample, nearest); const d = nearest.distanceTo(sample); if (d <= distance) { distance = d; found = true; } if (found && distance <= maxGap) return; } return; }
          const left = node.left!, right = node.right!, first = left.box.distanceToPoint(sample) <= right.box.distanceToPoint(sample) ? left : right, second = first === left ? right : left;
          visit(first); if (!found || distance > maxGap) visit(second);
        };
        visit(support); if (found && distance <= maxGap) break;
      }
      return found ? distance : Infinity;
    });
  };
  const random = mulberry32(5), corners: number[] = [];
  for (let t = 0; t < 400; t++) {
    const x = random() * 6 - 3, y = random() * 8, z = random() * 6 - 3;
    for (let k = 0; k < 3; k++) corners.push(x + random() * 0.6, y + random() * 0.6, z + random() * 0.6);
  }
  const wood = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  const cards = Array.from({ length: 160 }, () => new THREE.PlaneGeometry(0.4, 0.4).rotateY(random() * 3).translate(random() * 10 - 5, random() * 10 - 1, random() * 10 - 5));
  const leaf = mergeGeometries(cards), parts = components(leaf, () => {});
  expect(parts.length).toBeGreaterThan(100);
  for (const maxGap of [0.05, 0.4, 1.5]) {
    let charged = 0, charges = 0;
    const found = contactDistances(parts, wood, maxGap, () => { charged++; }), expected = before(parts, wood, maxGap, () => { charges++; });
    expect(found).toEqual(expected);
    expect(charged).toBe(charges);
    // Some components touch the wood within the gap and some do not.
    expect(found.some(Number.isFinite) && found.some(d => d === Infinity)).toBe(true);
  }
  for (const g of [wood, leaf, ...cards]) g.dispose();
});

it('builds the bounding tree that unions of three\'s boxes built: the same boxes and the same ids at every node', () => {
  // The tree as it was built before its boxes were taken from a flat array: each node's box the union of its boxes.
  const before = (boxes: readonly THREE.Box3[]): LeafNode => {
    const doubled = { x: boxes.map(b => b.min.x + b.max.x), y: boxes.map(b => b.min.y + b.max.y), z: boxes.map(b => b.min.z + b.max.z) };
    const build = (ids: number[]): LeafNode => {
      const box = new THREE.Box3(); for (const i of ids) box.union(boxes[i]!);
      if (ids.length <= 8) return { box, ids, uniform: -1 };
      const size = box.getSize(new THREE.Vector3()), axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z', centre = doubled[axis];
      ids.sort((a, b) => centre[a]! - centre[b]!);
      const middle = ids.length >> 1;
      return { box, left: build(ids.slice(0, middle)), right: build(ids.slice(middle)), uniform: -1 };
    };
    return build(boxes.map((_, i) => i));
  };
  const flatten = (node: LeafNode): unknown[] => [node.box.min.toArray(), node.box.max.toArray(), node.ids ?? null, ...(node.left ? [flatten(node.left), flatten(node.right!)] : [])];
  const random = mulberry32(19);
  for (const count of [1, 8, 9, 300, 2000]) {
    // Corners on a coarse grid, so many boxes share a centre and the sorts meet ties.
    const boxes = Array.from({ length: count }, () => {
      const at = () => Math.round(random() * 40) / 8 - 2.5;
      return new THREE.Box3().setFromPoints([new THREE.Vector3(at(), at(), at()), new THREE.Vector3(at(), at(), at())]);
    });
    let charged = 0;
    expect(flatten(boundsTree(boxes, () => { charged++; }))).toEqual(flatten(before(boxes)));
    expect(charged).toBeGreaterThan(0);
  }
});

it('orders ids by key as V8\'s stable sorts with a comparator do, equal keys staying in the order they came', () => {
  const random = mulberry32(23);
  for (const count of [0, 1, 7, 8, 9, 64, 1000, 5000]) {
    // Keys on a coarse grid, with signed zeros among them, so most keys are shared by many ids.
    const keys = new Float32Array(count * 3).map(() => (random() < 0.05 ? -0 : Math.round(random() * 60) / 4 - 7));
    const scratch = new Int32Array(count);
    for (let axis = 0; axis < 3; axis++) {
      const start = count ? Math.floor(random() * count / 3) : 0, end = count ? start + Math.floor(random() * (count - start + 1)) : 0;
      const typed = new Int32Array(count).map((_, i) => count - 1 - i), expected = typed.slice();
      expected.subarray(start, end).sort((a, b) => keys[a * 3 + axis]! - keys[b * 3 + axis]!);
      sortByKey(typed, start, end, keys, 3, axis, scratch);
      expect(Array.from(typed)).toEqual(Array.from(expected));
      const plain = Array.from({ length: count }, (_, i) => (i * 7919) % Math.max(1, count)), sorted = plain.slice().sort((a, b) => keys[a * 3 + axis]! - keys[b * 3 + axis]!);
      sortByKey(plain, 0, count, keys, 3, axis, scratch);
      expect(plain).toEqual(sorted);
    }
  }
});
