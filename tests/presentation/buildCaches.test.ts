import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { releaseBuildCaches } from '../../src/presentation/buildCaches';
import { leafCutoutSampler } from '../../src/presentation/leafSurfaceSites';
import { treeWoodCollisionRadius } from '../../src/presentation/treeGrounding';
import type { TreeVariant } from '../../src/presentation/treeGen';

// Two caches serve only a world's build and were kept as long as the world: the leaf cards' decoded alpha (the island
// pass and the tree models' leaf sites) and the trees' wood edges and basal polygons (the planting and the colliders).
// A built world empties them (WorldScene); a later build reads its images and models again. Each test changes what was
// read under a cache, so only a read made afresh sees the change.

describe('the caches only a build reads', () => {
  it('let go of the leaves’ decoded alpha', () => {
    const rgba = new Uint8Array(4 * 4 * 4).fill(255);
    const material = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(rgba, 4, 4), alphaTest: 0.5 });
    expect(leafCutoutSampler(material)!.alpha(0.5, 0.5)).toBe(1);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 0;
    expect(leafCutoutSampler(material)!.alpha(0.5, 0.5), 'decoded once, while the build lasts').toBe(1);
    releaseBuildCaches();
    expect(leafCutoutSampler(material)!.alpha(0.5, 0.5)).toBe(0);
  });

  it('let go of the trees’ wood edges', () => {
    const wood = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, -1, 0, 0], 3));
    const variant = { lods: [{ wood, leaf: null, tris: 1 }] } as unknown as TreeVariant;
    expect(treeWoodCollisionRadius(variant, 1)).toBeCloseTo(1.04);
    (wood.getAttribute('position') as THREE.BufferAttribute).setX(0, 3);
    expect(treeWoodCollisionRadius(variant, 1), 'measured once, while the build lasts').toBeCloseTo(1.04);
    releaseBuildCaches();
    expect(treeWoodCollisionRadius(variant, 1)).toBeCloseTo(3.04);
  });
});
