/** Runs in the page with the GL counters installed before the game starts. */
export function measureIsometricCost() {
  const { scene, valley } = window.tervain;
  const gl = scene.ground.gpu.gl;
  const counters = window.__renderCostStates.get(gl);
  if (!counters) throw new Error('Water GL counters missing');
  const frames = [];
  // Advance the water by one surface tick on each redraw while the camera is stationary.
  for (let i = 0; i < 4; i++) {
    const { draws, triangles, uploads } = counters;
    const frame = scene.renderedFrames;
    valley.time += 1 / 30;
    scene.render(valley, 0);
    gl.finish();
    if (i) frames.push({
      drawCalls: counters.draws - draws,
      triangles: counters.triangles - triangles,
      uploadBytes: counters.uploads - uploads,
      sceneDraws: scene.lastDraws,
      heroDrawn: scene.heroDrawn,
      completed: scene.renderedFrames === frame + 1 && !gl.isContextLost(),
      heapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
    });
  }
  let bytes = 0;
  for (const levels of counters.textures.values())
    for (const level of levels.values()) bytes += level.w * level.h * level.d * level.b;
  return {
    frames, textureCount: counters.textures.size, estimatedTextureStorageBytes: bytes,
    unknownTextureFormats: counters.unknownFormats,
    pixelRatio: scene.context.canvas.width / scene.context.canvas.clientWidth,
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    scope: 'Three completed isometric renders at the Rillford bridge. GL draws and triangles cover water and reflection passes. Scene draws count ground and sprites. Texture storage counts observed texels and mip levels. Heap usage measures occupancy.',
  };
}
