import type { Footprint } from './footfalls';
import type { Contact } from './fieldcraft';
import { project } from './projection';
import { windPhase } from './wind';

export function drawFootprints(
  ctx: CanvasRenderingContext2D,
  prints: readonly Footprint[],
  ox: number,
  oy: number,
  time: number
) {
  ctx.save();
  for (const p of prints) {
    const age = time - p.born,
      fade = 1 - age / (p.sand ? 12 : 5);
    const x = Math.round(p.x + ox),
      y = Math.round(p.y + oy);
    if (fade <= 0 || x < -8 || y < -8 || x > ctx.canvas.width + 8 || y > ctx.canvas.height + 8) continue;
    const dx = Math.cos(p.angle),
      dy = Math.sin(p.angle);
    ctx.globalAlpha = fade * (p.sand ? 0.68 : 0.48);
    ctx.fillStyle = p.sand ? '#785f50' : '#5c463b';
    ctx.fillRect(x - 1, y, 3, 2);
    ctx.fillRect(x + Math.round(dx * 2) - 1, y + Math.round(dy * 2), 3, 1);
    ctx.fillStyle = p.sand ? '#f6dfaa' : '#c3a16b';
    ctx.fillRect(x - Math.round(dx) - 1, y + 2, 2, 1);
    if (p.running && age < 0.32) {
      const t = age / 0.32;
      ctx.globalAlpha = (1 - t) * 0.67;
      ctx.fillStyle = p.sand ? '#ead5a5' : '#b69a74';
      for (let i = 0; i < 3; i++)
        ctx.fillRect(
          Math.round(x - dx * t * (5 + i * 3) - dy * i * p.side),
          Math.round(y - dy * t * 5 - Math.sin(t * Math.PI) * (2 + i)),
          2,
          1
        );
    }
  }
  ctx.restore();
}

/** A few cinders leave the mouth of an existing cookfire and drift in the local gust. */
export function drawFireAir(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  worldX: number,
  worldZ: number,
  night: number
) {
  ctx.save();
  const drift = Math.sin(windPhase(worldX, worldZ, time));
  for (let i = 0; i < 5; i++) {
    const t = (time * (0.42 + i * 0.023) + i * 0.37 + Math.abs(worldZ)) % 1;
    const px = Math.round(x + Math.sin(i * 2.4 + t * 4) * (2 + t * 2) + (3 + drift * 4) * t * t);
    const py = Math.round(y - 11 - t * (12 + i * 2));
    ctx.globalAlpha = Math.sin(Math.PI * t) * (0.48 + night * 0.46);
    ctx.fillStyle = i % 2 ? '#fff0a8' : '#ff9e51';
    ctx.fillRect(px, py, 1, i % 3 === 0 ? 2 : 1);
  }
  ctx.restore();
}

/** Contact flecks originate at the resolved intersection and keep their place in scene depth order. */
export function drawContact(
  ctx: CanvasRenderingContext2D,
  hit: Contact,
  time: number,
  ox: number,
  oy: number
) {
  const t = Math.min(1, (time - hit.born) / 0.28);
  if (t < 0 || t >= 1) return;
  const p = project(hit.x, hit.z, hit.height),
    x = Math.round(p.x + ox),
    y = Math.round(p.y + oy);
  const spark = hit.kind === 'guard' || hit.kind === 'blade';
  ctx.save();
  ctx.globalAlpha = 1 - t * t;
  ctx.fillStyle = spark ? '#ffe3a1' : hit.kind === 'earth' ? '#bb9977' : '#e2c4a0';
  const direction = project(hit.dx, hit.dz);
  const angle = Math.atan2(direction.y, direction.x);
  for (let i = -2; i <= 2; i++) {
    const a = angle + i * 0.62;
    const travel = (2 + 12 * t) * (1 - Math.abs(i) * 0.12);
    ctx.fillRect(
      Math.round(x + Math.cos(a) * travel),
      Math.round(y + Math.sin(a) * travel - 3 * Math.sin(t * Math.PI)),
      2,
      1
    );
  }
  if (t < 0.32 && spark) {
    ctx.fillStyle = '#fff8df';
    ctx.fillRect(x - 3, y, 7, 1);
    ctx.fillRect(x, y - 3, 1, 7);
  }
  ctx.restore();
}
