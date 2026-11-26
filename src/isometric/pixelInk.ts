/** Integer coverage in the world canvas's native pixel grid. */
export function pixelLine(ctx: CanvasRenderingContext2D, x: number, y: number, endX: number, endY: number, weight = 1) {
  x = Math.round(x); y = Math.round(y); endX = Math.round(endX); endY = Math.round(endY);
  const dx = Math.abs(endX - x), dy = -Math.abs(endY - y), sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x, y, weight, weight);
    if (x === endX && y === endY) break;
    const twice = 2 * err;
    if (twice >= dy) { err += dy; x += sx; }
    if (twice <= dx) { err += dx; y += sy; }
  }
}
export function pixelPool(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  x = Math.round(x); y = Math.round(y); ry = Math.max(1, Math.round(ry));
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))));
    ctx.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
}
export function pixelArc(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number,
  start = 0, end = Math.PI * 2, weight = 1) {
  const steps = Math.max(3, Math.ceil(Math.max(rx, ry) * (end - start) / 2));
  let px = x + Math.cos(start) * rx, py = y + Math.sin(start) * ry;
  for (let i = 1; i <= steps; i++) {
    const angle = start + (end - start) * i / steps, nx = x + Math.cos(angle) * rx, ny = y + Math.sin(angle) * ry;
    pixelLine(ctx, px, py, nx, ny, weight); px = nx; py = ny;
  }
}
