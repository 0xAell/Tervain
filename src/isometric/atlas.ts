import { gameFile } from './files';
export const artUrl = (file: string) => gameFile('vale/' + file);
type Frame = [number, number, number, number];
interface Sheet {
  frames: Record<string, Frame[]>;
}
interface Animation {
  image: HTMLCanvasElement | HTMLImageElement;
  frames: Frame[];
}

export class Atlas {
  private reflections = new Map<string, HTMLCanvasElement>();
  private animations = new Map<string, Animation>();
  private constructor(
    readonly image: HTMLImageElement,
    private sheet: Sheet
  ) {}

  static async load() {
    async function loadSheet(path: string) {
      const image = new Image();
      image.src = gameFile(path + '.png');
      const [response] = await Promise.all([fetch(gameFile(path + '.json')), image.decode()]);
      if (!response.ok) throw new Error('Could not load sprite sheet ' + path);
      return { image, sheet: await response.json() as Sheet };
    }
    const [base, valley] = await Promise.all([loadSheet('vale/sprites'), loadSheet('valley/scenery')]);
    const atlas = new Atlas(base.image, base.sheet);
    for (const [key, frames] of Object.entries(valley.sheet.frames))
      atlas.animations.set(key, { image: valley.image, frames });
    return atlas;
  }

  private shadowMasks = new Map<string, HTMLCanvasElement>();
  shadow(key: string, frame = 0) {
    const index = Math.floor(frame) % this.frameCount(key),
      id = key + '/' + index;
    let image = this.shadowMasks.get(id);
    if (!image) {
      image = document.createElement('canvas');
      image.width = 48;
      image.height = Math.max(1, this.height(key, 48, index));
      const ink = image.getContext('2d')!;
      ink.imageSmoothingEnabled = false;
      this.draw(ink, key, 24, image.height, 48, index);
      ink.globalCompositeOperation = 'source-in';
      ink.fillStyle = '#283544';
      ink.fillRect(0, 0, image.width, image.height);
      this.shadowMasks.set(id, image);
    }
    return image;
  }

  private materials = new Map<string, HTMLCanvasElement>();
  surface(key: string, frame = 0) {
    const animation = this.animations.get(key),
      index = Math.floor(frame) % this.frameCount(key),
      id = key + '/' + index;
    let surface = this.materials.get(id);
    if (!surface) {
      const [x, y, w, h] = (animation?.frames ?? this.sheet.frames[key])![index]!;
      surface = document.createElement('canvas');
      surface.width = w;
      surface.height = h;
      surface.getContext('2d')!.drawImage(animation?.image ?? this.image, x, y, w, h, 0, 0, w, h);
      this.materials.set(id, surface);
    }
    return surface;
  }

  addAnimation(key: string, image: HTMLCanvasElement, width: number, height: number) {
    const frames: Frame[] = [];
    for (let x = 0; x < image.width; x += width) frames.push([x, 0, width, height]);
    this.animations.set(key, { image, frames });
  }

  read(key: string) {
    const animation = this.animations.get(key);
    return (animation?.frames ?? this.sheet.frames[key])!.map(([x, y, w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(animation?.image ?? this.image, x, y, w, h, 0, 0, w, h);
      return { pixels: new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer), w, h };
    });
  }

  has(key: string) {
    return this.animations.has(key) || Object.hasOwn(this.sheet.frames, key);
  }

  frameCount(key: string) {
    return (this.animations.get(key)?.frames ?? this.sheet.frames[key])?.length ?? 0;
  }

  height(key: string, width: number, frame = 0) {
    const frames = this.animations.get(key)?.frames ?? this.sheet.frames[key];
    if (!frames?.length) throw Error('Missing sprite ' + key);
    const rect = frames[Math.max(0, Math.floor(frame)) % frames.length]!;
    return Math.round((width * rect[3]) / rect[2]);
  }

  private masks = new Map<string, HTMLCanvasElement>();
  /** Cache the opaque colour on the native cel. All passes sample it at the same foot anchor. */
  private mask(key: string, index: number, tint: string) {
    const id = key + '/' + index + '/' + tint;
    let image = this.masks.get(id);
    if (!image) {
      const source = this.surface(key, index);
      image = document.createElement('canvas');
      image.width = source.width;
      image.height = source.height;
      const ink = image.getContext('2d')!;
      ink.drawImage(source, 0, 0);
      ink.globalCompositeOperation = 'source-in';
      ink.fillStyle = tint;
      ink.fillRect(0, 0, image.width, image.height);
      this.masks.set(id, image);
    }
    return image;
  }

  // Scale a given cel once at its destination's native resolution. Final blits, tints and
  // water cuts then share the same texel boundaries, including odd-width props and masks.
  private sized = new Map<string, HTMLCanvasElement>();
  private native(ctx: CanvasRenderingContext2D, id: string, source: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number, w: number, h: number, visible: number, left: number, top: number) {
    if (sw === w && sh === h) {
      ctx.drawImage(source, sx, sy, w, visible, left, top, w, visible);
      return;
    }
    const key = id + '@' + w;
    let cel = this.sized.get(key);
    if (!cel) {
      cel = document.createElement('canvas');
      cel.width = w; cel.height = h;
      const ink = cel.getContext('2d')!;
      ink.imageSmoothingEnabled = false;
      ink.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
      if (this.sized.size >= 3000) this.sized.delete(this.sized.keys().next().value!);
      this.sized.set(key, cel);
    }
    ctx.drawImage(cel, 0, 0, w, visible, left, top, w, visible);
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
    reflected = false,
    moving = false,
    tint?: string
  ) {
    const animation = this.animations.get(key),
      source = animation?.image ?? this.image,
      frames = animation?.frames ?? this.sheet.frames[key];
    if (!frames?.length) throw new Error('Missing sprite ' + key);
    const [sx, sy, sw, sh] = frames[Math.floor(frame) % frames.length]!;
    const w = Math.round(width),
      h = Math.round((w * sh) / sw);
    if (w < 1 || h < 1) return;
    const visibleH = Math.max(1, Math.min(h, h - Math.round(h * submerged)));
    const celId = key + '/' + (Math.floor(frame) % frames.length);
    const left = Math.round(x - w / 2),
      top = Math.round(y - visibleH * anchor);
    const crisp = moving && ctx.imageSmoothingEnabled;
    if (flip || crisp) ctx.save();
    if (crisp) ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(left + w, 0);
      ctx.scale(-1, 1);
    }
    if (tint) {
      const mask = this.mask(key, Math.floor(frame) % frames.length, tint);
      this.native(ctx, celId + tint, mask, 0, 0, sw, sh, w, h, visibleH, flip ? 0 : left, top);
    } else if (reflected) {
      const id = key + '/' + (Math.floor(frame) % frames.length);
      let copy = this.reflections.get(id);
      if (!copy) {
        copy = document.createElement('canvas');
        copy.width = sw;
        copy.height = sh;
        const layer = copy.getContext('2d')!;
        layer.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
        const fog = layer.createLinearGradient(0, 0, 0, sh);
        fog.addColorStop(0, 'rgba(0,0,0,.17)');
        fog.addColorStop(1, 'rgba(0,0,0,.9)');
        layer.globalCompositeOperation = 'destination-in';
        layer.fillStyle = fog;
        layer.fillRect(0, 0, sw, sh);
        this.reflections.set(id, copy);
      }
      this.native(ctx, celId + '/water', copy, 0, 0, sw, sh, w, h, visibleH, flip ? 0 : left, top);
    } else this.native(ctx, celId, source, sx, sy, sw, sh, w, h, visibleH, flip ? 0 : left, top);
    if (flip || crisp) ctx.restore();
  }
}
