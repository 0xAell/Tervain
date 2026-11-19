import { makeWaterTexels } from './waterTexels';

// This worker owns CPU arrays only: the textures are built on the main thread from the texels it hands over.
self.onmessage = () => {
  try {
    const texels = makeWaterTexels();
    self.postMessage({ type: 'complete', texels }, { transfer: [texels.ripples.buffer, texels.foam.buffer, texels.caustics.buffer] });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The water texels could not be made.' });
  }
};
