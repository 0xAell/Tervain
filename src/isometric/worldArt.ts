import { unproject } from './land';
import type { Stamp } from './reflections';

export interface WorldImage {
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
}
export interface ArtStrip extends WorldImage {
  windowLight?: HTMLCanvasElement;
  start: number;
  width: number;
  mirror?: WorldImage;
}
export function bitmap(left: number, top: number, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, left, top };
}
/** A reflected roof can be much taller than its water contact. Cache only occupied rows and columns. */
export function finishBitmap(image: WorldImage, data: ImageData) {
  const { width: w, height: h } = data;
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data.data[(y * w + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  image.canvas.width = Math.max(1, x1 - x0 + 1);
  image.canvas.height = Math.max(1, y1 - y0 + 1);
  image.left += x0;
  image.top += y0;
  image.canvas.getContext('2d')!.putImageData(data, -x0, -y0);
}
/** Each vertical slice sorts at its own wall or rail foot, so a walker can pass both ends of a long facade. */
export function depthStrips(
  key: string,
  image: WorldImage,
  depthAt: (worldScreenX: number) => number,
  mirror?: WorldImage
): Stamp[] {
  const result: Stamp[] = [];
  for (let start = 0; start < image.canvas.width; start += 6) {
    const width = Math.min(6, image.canvas.width - start),
      sx = image.left + start + width / 2;
    const at = unproject(sx, depthAt(sx));
    result.push({
      ...at,
      key,
      width,
      art: { ...image, start, width, mirror: start === 0 ? mirror : undefined },
    });
  }
  return result;
}
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  art: ArtStrip,
  ox: number,
  oy: number,
  image = art.canvas
) {
  ctx.drawImage(
    image,
    art.start,
    0,
    art.width,
    art.canvas.height,
    art.left + art.start + ox,
    art.top + oy,
    art.width,
    art.canvas.height
  );
}
