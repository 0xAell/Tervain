/**
 * Caches that only a world's build reads: the leaf cards' decoded alpha the tree models and the island pass sample
 * (leafSurfaceSites.ts), and the trees' basal polygons and wood edges the planting seats and measures them by
 * (treeGrounding.ts). Each is keyed by something the world keeps (an image, a tree model), so it lived as long as the
 * world: about 40 MB that nothing read once the world was built. A module registers how to empty its own; the world
 * empties them all when its build is done, and a later build fills them again.
 */
const releases = new Set<() => void>();

/** Register how to empty a cache only a build reads. */
export function buildCache(release: () => void): void {
  releases.add(release);
}

/** Empty every cache only a build reads (WorldScene, once a world is built). */
export function releaseBuildCaches(): void {
  for (const release of releases) release();
}
