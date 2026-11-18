import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { shadowIndex } from './shadowTriangles';

// The wanderer's shadow triangles (shadowTriangles.ts), worked out off the main thread from plain arrays; three stays out.
self.onmessage = async (event: MessageEvent<{ indices: Uint32Array; positions: Float32Array }>) => {
  try {
    await MeshoptSimplifier.ready;
    const { indices, error } = shadowIndex(MeshoptSimplifier, event.data.indices, event.data.positions);
    self.postMessage({ type: 'complete', indices, error }, { transfer: [indices.buffer] });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The shadow triangles could not be made.' });
  }
};
