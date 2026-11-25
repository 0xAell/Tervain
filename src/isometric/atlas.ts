import { gameFile } from './files';
export const artUrl = (file: string) => gameFile('vale/' + file);
type Frame = [number, number, number, number];
interface Sheet {
  frames: Record<string, Frame[]>;
}

export class Atlas {
  private reflections = new Map<string, HTMLCanvasElement>();
  private constructor(
    readonly image: HTMLImageElement,
    private sheet: Sheet
  ) {}

  static async load() {
    const image = new Image();
    image.src = artUrl('sprites.png');
    const [response] = await Promise.all([fetch(artUrl('sprites.json')), image.decode()]);
    if (!response.ok) throw new Error('The valley sprite atlas could not be loaded.');
    return new Atlas(image, (await response.json()) as Sheet);
  }

  private materials = new Map<string, HTMLCanvasElement>();
  surface(key: string) {
    let surface = this.materials.get(key);
    if (!surface) {
      const [x, y, w, h] = this.sheet.frames[key]![0]!;
      surface = document.createElement('canvas');
      surface.width = w;
      surface.height = h;
      surface.getContext('2d')!.drawImage(this.image, x, y, w, h, 0, 0, w, h);
      this.materials.set(key, surface);
    }
    return surface;
  }

  read(key: string) {
    return this.sheet.frames[key]!.map(([x, y, w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(this.image, x, y, w, h, 0, 0, w, h);
      return { pixels: new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer), w, h };
    });
  }

  has(key: string) {
    return Object.hasOwn(this.sheet.frames, key);
  }

  height(key: string, width: number, frame = 0) {
    const frames = this.sheet.frames[key];
    if (!frames?.length) throw Error('Missing PixelLab sprite ' + key);
    const rect = frames[Math.max(0, Math.floor(frame)) % frames.length]!;
    return Math.round((width * rect[3]) / rect[2]);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    width: number,
    frame = 0,
    flip = false,
    anchor = 1,
    submerged = 0,
    reflected = false
  ) {
    const frames = this.sheet.frames[key];
    if (!frames?.length) throw new Error('Missing PixelLab sprite ' + key);
    const [sx, sy, sw, sh] = frames[Math.floor(frame) % frames.length]!;
    const w = Math.round(width),
      h = Math.round((w * sh) / sw);
    const cut = Math.min(sh - 1, Math.max(0, Math.round(sh * submerged)));
    const visibleH = Math.round((h * (sh - cut)) / sh);
    const left = Math.round(x - w / 2),
      top = Math.round(y - visibleH * anchor);
    if (flip) {
      ctx.save();
      ctx.translate(left + w, 0);
      ctx.scale(-1, 1);
    }
    if (reflected) {
      const id = key + '/' + (Math.floor(frame) % frames.length);
      let copy = this.reflections.get(id);
      if (!copy) {
        copy = document.createElement('canvas');
        copy.width = sw;
        copy.height = sh;
        const layer = copy.getContext('2d')!;
        layer.drawImage(this.image, sx, sy, sw, sh, 0, 0, sw, sh);
        const fog = layer.createLinearGradient(0, 0, 0, sh);
        fog.addColorStop(0, 'rgba(0,0,0,.17)');
        fog.addColorStop(1, 'rgba(0,0,0,.9)');
        layer.globalCompositeOperation = 'destination-in';
        layer.fillStyle = fog;
        layer.fillRect(0, 0, sw, sh);
        this.reflections.set(id, copy);
      }
      ctx.drawImage(copy, 0, 0, sw, sh - cut, flip ? 0 : left, top, w, visibleH);
    } else ctx.drawImage(this.image, sx, sy, sw, sh - cut, flip ? 0 : left, top, w, visibleH);
    if (flip) ctx.restore();
  }
}
