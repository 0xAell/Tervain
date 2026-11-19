import { makeBarkFields } from './barkFields';
import { canopyAtlas } from './canopyAtlasTexels';
import type { WoodTexelRequest } from './woodTexels';

// This worker owns CPU arrays only: the atlas and the bark are built on the main thread from what it hands over.
self.onmessage = (event: MessageEvent<WoodTexelRequest>) => {
  try {
    const { atlas, barkSizes } = event.data;
    const level = atlas ? canopyAtlas(atlas.size, atlas.cells, atlas.seed) : null;
    const bark = barkSizes.map((n) => ({ n, ...makeBarkFields(n) }));
    const transfer = [...(level ? [level.data.buffer] : []), ...bark.flatMap((fields) => [fields.warp.buffer, fields.fine.buffer, fields.low.buffer])];
    self.postMessage({ type: 'complete', atlas: level, bark }, { transfer });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The wood texels could not be made.' });
  }
};
