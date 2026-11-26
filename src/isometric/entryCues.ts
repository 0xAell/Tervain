import type { Atlas } from './atlas';
import type { RoomTarget } from './roomTargets';
import type { Passage } from './roomPlans';

export interface PickRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  target: RoomTarget;
}
export function pickRegion(regions: PickRegion[], x: number, y: number) {
  let found: PickRegion | undefined,
    best = Infinity;
  for (const r of regions) {
    const dx = Math.abs(x - r.x),
      dy = Math.abs(y - r.y);
    if (dx > r.w / 2 || dy > r.h / 2) continue;
    const distance = dx / (r.w / 2) + dy / (r.h / 2);
    if (distance <= best) {
      found = r;
      best = distance;
    }
  }
  return found;
}
/** Follow the real doorstep so the interaction highlight reads as part of the building. */
export function drawThreshold(ctx: CanvasRenderingContext2D, x: number, y: number,
  side: { x: number; y: number }, opacity: number, locked: boolean) {
  ctx.save();
  ctx.globalAlpha = opacity * 0.88;
  ctx.strokeStyle = locked ? '#d4a497' : '#e6cd91';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (const sign of [-1, 1]) {
    const a = x + side.x * sign, b = y + side.y * sign;
    ctx.moveTo(a, b - 2);
    ctx.lineTo(a, b);
    ctx.lineTo(x + side.x * sign * 0.42, y + side.y * sign * 0.42);
  }
  ctx.stroke();
  ctx.restore();
}

/** Mark exits and stairs between interior floors. */
export function drawWaylight(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  x: number,
  y: number,
  time: number,
  near: boolean,
  locked = false,
  wide = false,
  kind?: Passage['kind']
) {
  const cx = Math.round(x),
    cy = Math.round(y),
    w = wide ? 12 : 10;
  ctx.save();
  if (!locked) {
    const halo = ctx.createRadialGradient(cx, cy - 7, 1, cx, cy - 7, near ? 16 : 12);
    halo.addColorStop(0, near ? 'rgba(255,221,125,.44)' : 'rgba(255,213,115,.29)');
    halo.addColorStop(1, 'rgba(255,197,92,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - 16, cy - 23, 32, 32);
  }
  ctx.fillStyle = locked ? 'rgba(71,62,75,.75)' : 'rgba(72,47,31,.72)';
  ctx.beginPath();
  ctx.moveTo(cx - w, cy);
  ctx.lineTo(cx, cy - 4);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx, cy + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = locked ? '#cfaaa8' : near ? '#ffecaa' : '#eac16d';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = locked ? '#c0b9b7' : '#ffe4a0';
  ctx.fillRect(cx - 2, cy - 1, 4, 2);
  const ly = cy - (near ? 12 : 10) - Math.round(0.8 * Math.sin(time * 2.6)),
    size = near ? 14 : 11;
  ctx.globalAlpha = locked ? 0.64 : 1;
  atlas.draw(ctx, 'room_waylight', cx, ly, size, 0, false, 0.66);
  if (near && (kind === 'up' || kind === 'down')) {
    const dir = kind === 'up' ? -1 : 1;
    ctx.strokeStyle = '#fff0b4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 6, ly + 1);
    ctx.lineTo(cx + 8, ly + 1 + dir * 2);
    ctx.lineTo(cx + 10, ly + 1);
    ctx.stroke();
  }
  if (locked) {
    ctx.fillStyle = '#302a37';
    ctx.fillRect(cx - 3, ly - 1, 6, 4);
    ctx.strokeStyle = '#e2c3ba';
    ctx.strokeRect(cx - 1.5, ly - 3, 3, 3);
    ctx.fillStyle = '#e2c3ba';
    ctx.fillRect(cx - 2, ly, 4, 3);
  }
  ctx.restore();
}
export function drawFocus(ctx: CanvasRenderingContext2D, region: PickRegion) {
  const text = region.target.label;
  ctx.save();
  ctx.font = '10px Vale, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.ceil(ctx.measureText(text).width) + 12,
    x = Math.max(width / 2 + 3, Math.min(ctx.canvas.width - width / 2 - 3, region.x));
  const y = Math.max(12, Math.min(ctx.canvas.height - 12, region.y - region.h / 2 - 7));
  ctx.fillStyle = '#222b2b';
  ctx.fillRect(Math.round(x - width / 2), Math.round(y - 7), width, 14);
  ctx.fillStyle = '#bf9b5e';
  ctx.fillRect(Math.round(x - width / 2), Math.round(y + 6), width, 1);
  ctx.fillStyle = '#ffdf9b';
  ctx.fillText(text, Math.round(x), Math.round(y));
  ctx.restore();
}
