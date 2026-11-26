import type { V2 } from '../core/world/layout';
import { distance } from './land';
import { onBridge, wetPoint } from './water';

/** Shared click and household routes use the same grid, diagonals and swept clearance. */
export function walkingRoute(p: V2, target: V2, indoors: boolean, canReach: (a: V2, b: V2) => boolean): V2[] {
  const step = indoors ? 0.64 : 1.25;
  const limit = 90;
  if (distance(p, target) > limit) return [];
  const start = { x: p.x, z: p.z, i: 0, j: 0, g: 0, parent: -1 };
  const nodes = [start];
  const open = [0];
  const best = new Map<string, number>([['0,0', 0]]);
  for (let n = 0; open.length && n < 6500; n++) {
    open.sort(
      (a, b) => nodes[b]!.g + distance(nodes[b]!, target) - nodes[a]!.g - distance(nodes[a]!, target)
    );
    const index = open.pop()!,
      node = nodes[index]!;
    if (distance(node, target) < step && canReach(node, target)) {
      const path = [target];
      let k = index;
      while (k > 0) {
        path.push(nodes[k]!);
        k = nodes[k]!.parent;
      }
      return path.reverse();
    }
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const i = node.i + di,
        j = node.j + dj,
        key = i + ',' + j,
        x = p.x + i * step,
        z = p.z + j * step;
      const surface = indoors ? undefined : wetPoint(x, z);
      const resistance =
        surface?.kind === 'river' && !onBridge({ x, z }) ? 1 + 0.65 * Math.min(1, surface.bank / 1.9) : 1;
      const g = node.g + step * Math.hypot(di, dj) * resistance;
      if ((best.get(key) ?? Infinity) <= g || g > limit * 1.65) continue;
      const next = { x, z, i, j, g, parent: index };
      if (!canReach(node, next)) continue;
      best.set(key, g);
      open.push(nodes.length);
      nodes.push(next);
    }
  }
  return [];
}
