import { smoothstep, valueNoise } from '../core/world/noise';
import type { Atlas } from './atlas';
import type { Stamp } from './reflections';
import { drawStrip, type WorldImage } from './worldArt';
import { project } from './projection';
import { isTree } from './treeHabitat';

/** The same solar elevation governs both twilight and when lamplight reaches the ground. */
export function skyLight(hour: number) {
  const sun = Math.sin(((hour - 6) * Math.PI) / 12);
  return {
    night: 1 - smoothstep(-0.34, 0.23, sun),
    amber: smoothstep(-0.23, 0.07, sun) * (1 - smoothstep(0.11, 0.68, sun)),
    daylight: smoothstep(0, 0.48, sun),
  };
}
type Sky = ReturnType<typeof skyLight>;
export interface LightSource {
  x: number;
  y: number;
  kind: 'fire' | 'lantern' | 'door';
}

function surface(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext('2d')!;
}

function lampFalloff() {
  const g = surface(96, 96);
  const gradient = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  for (const [at, opacity] of [
    [0, 0.94],
    [0.23, 0.8],
    [0.56, 0.36],
    [0.82, 0.09],
    [1, 0],
  ] as const) {
    const color = at < 0.3 ? '255,199,114' : '242,133,60';
    gradient.addColorStop(at, 'rgba(' + color + ',' + opacity + ')');
  }
  g.fillStyle = gradient;
  g.fillRect(0, 0, 96, 96);
  return g.canvas;
}

export function windowLightMask(house: WorldImage, panes: readonly { x: number; y: number }[]) {
  const g = surface(house.canvas.width, house.canvas.height);
  for (const pane of panes) {
    const x = pane.x - house.left,
      y = pane.y - house.top;
    const halo = g.createRadialGradient(x, y, 1, x, y, 12);
    halo.addColorStop(0, '#ffd183');
    halo.addColorStop(0.38, 'rgba(255,193,105,.78)');
    halo.addColorStop(1, 'rgba(239,144,67,0)');
    g.fillStyle = halo;
    g.fillRect(x - 12, y - 12, 24, 24);
  }
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(house.canvas, 0, 0);
  return g.canvas;
}

/** One repeating field of soft-edged shadow, anchored to the projected land rather than the camera. */
function cloudField() {
  const size = 192,
    g = surface(size, size),
    data = g.createImageData(size, size);
  for (let y = 0, i = 0; y < size; y++) {
    const b = (2 * Math.PI * y) / size;
    for (let x = 0; x < size; x++, i += 4) {
      const a = (2 * Math.PI * x) / size;
      // Sample on a torus so there is no visible edge when the field wraps.
      const u = Math.cos(a) * 1.7 + Math.sin(b) * 0.84;
      const v = Math.sin(a) * 1.6 + Math.cos(b) * 1.14;
      const cover = 0.72 * valueNoise(u, v, 51) + 0.28 * valueNoise(u * 2.3, v * 2.3, 93);
      data.data[i] = 47;
      data.data[i + 1] = 67;
      data.data[i + 2] = 96;
      data.data[i + 3] = Math.round(smoothstep(0.35, 0.72, cover) * 52);
    }
  }
  g.putImageData(data, 0, 0);
  return g.canvas;
}

export class SkyLighting {
  private clouds = cloudField();
  private lamp = lampFalloff();
  private shade = surface(1, 1);
  private radiance = surface(1, 1);

  constructor(private atlas: Atlas) {}

  draw(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    time: number,
    sky: Sky,
    sources: LightSource[],
    stamps: readonly Stamp[]
  ) {
    const { width, height } = ctx.canvas;
    ctx.save();
    if (sky.daylight > 0.01) {
      const w = 698,
        h = 414;
      const offset = (n: number, period: number) => n - Math.ceil(n / period) * period;
      const left = offset(Math.round(ox + time * 3.1), w);
      const top = offset(Math.round(oy + time * 1.05), h);
      ctx.globalAlpha = sky.daylight;
      ctx.globalCompositeOperation = 'multiply';
      ctx.imageSmoothingEnabled = true;
      for (let y = top; y < height; y += h)
        for (let x = left; x < width; x += w) ctx.drawImage(this.clouds, x, y, w, h);
    }
    if (sky.amber > 0.01) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = sky.amber * 0.59;
      ctx.fillStyle = '#ffc37a';
      ctx.fillRect(0, 0, width, height);
    }
    if (sky.night > 0.002) {
      const g = this.shade,
        light = this.radiance;
      if (g.canvas.width !== width || g.canvas.height !== height) {
        g.canvas.width = width;
        g.canvas.height = height;
        light.canvas.width = width;
        light.canvas.height = height;
      }
      g.globalCompositeOperation = 'copy';
      g.globalAlpha = 1;
      g.fillStyle = '#263657';
      g.fillRect(0, 0, width, height);
      light.globalCompositeOperation = 'source-over';
      light.globalAlpha = 1;
      light.clearRect(0, 0, width, height);
      for (const source of sources) {
        const x = source.x + ox,
          y = source.y + oy;
        const fire = source.kind === 'fire';
        const radius = fire ? 58 : source.kind === 'door' ? 27 : 37;
        if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
        const flicker =
          0.94 + 0.04 * Math.sin(time * 4.7 + source.x) + 0.02 * Math.sin(time * 7.1 + source.y);
        const rx = radius * flicker,
          ry = rx * 0.61;
        light.globalAlpha = fire ? 1 : 0.77;
        light.drawImage(this.lamp, x - rx, y - ry - 5, rx * 2, ry * 2);
      }
      // Nearby roofs, bridge decks and canopies intercept light spilled on the ground.
      // Reintroduce each facade's own lit panes at its actual depth.
      for (const s of stamps) {
        light.globalCompositeOperation = 'destination-out';
        light.globalAlpha = s.alpha ?? 1;
        if (s.art) {
          drawStrip(light, s.art, ox, oy);
          if (s.art.windowLight) {
            light.globalCompositeOperation = 'source-over';
            drawStrip(light, s.art, ox, oy, s.art.windowLight);
          }
        } else if (s.key === 'lantern' || s.key === 'beacon') {
          const at = project(s.x, s.z, s.elevation);
          const pole = s.key === 'lantern';
          const x = at.x + ox + (pole ? s.width * 0.32 : 0);
          const y = at.y + oy - this.atlas.height(s.key, s.width) * (pole ? 0.69 : 0.80);
          const radius = pole ? 6 : 10;
          light.globalCompositeOperation = 'source-over';
          light.drawImage(this.lamp, x - radius, y - radius, radius * 2, radius * 2);
        } else if (s.width > 25 && isTree(s.key.split('--')[0]!)) {
          const p = project(s.x, s.z, s.elevation);
          this.atlas.draw(light, s.key, p.x + ox, p.y + oy - (s.lift ?? 0), s.width, s.frame, s.flip);
        }
      }
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(light.canvas, 0, 0);
      ctx.globalAlpha = sky.night * 0.78;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(g.canvas, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = sky.night * 0.42;
      ctx.drawImage(light.canvas, 0, 0);
      // Skylight also reaches the deepest shadows.
      ctx.globalAlpha = sky.night * 0.19;
      ctx.fillStyle = '#334773';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }
}
