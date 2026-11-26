import type { Atlas } from './atlas';
import type { V2 } from '../core/world/layout';

// Low slate flakes show a broad upper face. Rounded cobbles carry a narrower highlight.
const shapes = [
  [
    '.........22222......',
    '.....22224444422....',
    '...22444555543332...',
    '..2444444443333322..',
    '.23333333333322232..',
    '.12223322222232221..',
    '..111222222211111...',
    '....111111111.......',
  ],
  [
    '........33333.......',
    '......345554433.....',
    '.....34444444332....',
    '....3444433333322...',
    '...23333333322222...',
    '...23233322222212...',
    '....122222221111....',
    '.....1111111111.....',
  ],
  [
    '..........222.......',
    '.......2234432......',
    '......244444322.....',
    '.....2444433322223..',
    '...2244433322234432.',
    '..34443332222333332.',
    '.232222222212322221.',
    '..111122211111111...',
  ],
] as const;
const colours = [
  ['#4c4947', '#625c55', '#807a6d', '#a39c85', '#beb59d'],
  ['#4b4c46', '#5e6458', '#818675', '#9da28a', '#b7b89b'],
  ['#514b4c', '#685f61', '#867d79', '#a0978b', '#b9b0a2'],
] as const;
const keys = ['fieldstone', 'fieldstone-slate', 'fieldstone-cobble', 'fieldstone-split'] as const;

/** Keep the same stone and the same lit face when it is carried across the map or restored. */
export function fieldstoneAt(at: V2) {
  const hash = Math.imul(Math.round(at.x * 8), 73856093) ^ Math.imul(Math.round(at.z * 8), 19349663);
  return keys[((hash ^ (hash >>> 16)) >>> 0) % keys.length]!;
}

export function buildFieldstones(atlas: Atlas) {
  shapes.forEach((rows, i) => {
    const tile = document.createElement('canvas');
    tile.width = 20;
    tile.height = rows.length;
    const g = tile.getContext('2d')!;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const value = Number(row[x]);
        if (!value) continue;
        g.fillStyle = colours[i]![value - 1]!;
        g.fillRect(x, y, 1, 1);
      }
    });
    atlas.addAnimation(keys[i + 1]!, tile, tile.width, tile.height);
  });
}
