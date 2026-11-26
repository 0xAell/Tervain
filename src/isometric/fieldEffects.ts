import type { Footprint } from './footfalls';
import { CONTACT_TIME, DAMAGE_LABEL_TIME, type Contact } from './fieldcraft';
import { project, PROJECTION } from './projection';
import { windPhase } from './wind';

export function drawFootprints(
  ctx: CanvasRenderingContext2D,
  prints: readonly Footprint[],
  ox: number,
  oy: number,
  time: number,
  reducedMotion: boolean
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
    if ((p.running || p.landing) && age < 0.32 && !reducedMotion) {
      const t = age / 0.32;
      ctx.globalAlpha = (1 - t) * 0.67;
      ctx.fillStyle = p.sand ? '#ead5a5' : '#b69a74';
      for (let i = 0; i < 3; i++) {
        const spread = p.side * (p.landing ? (3 + i * 2) * t : i);
        const drag = p.landing ? 3 : 5 + i * 3;
        const lift = Math.sin(t * Math.PI) * (2 + i);
        ctx.fillRect(
          Math.round(x - dx * t * drag - dy * spread),
          Math.round(y - dy * t * 5 + (p.landing ? dx * spread * 0.5 : 0) - lift),
          2,
          1
        );
      }
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

/** Show the grounded reach of a committed attack, including the hit tolerance. */
export function drawEnemyWarning(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  reach: number,
  progress: number,
  heavy: boolean,
  reducedMotion: boolean
) {
  const radius = reach * PROJECTION * Math.SQRT2;
  const color = heavy ? '#f6a36e' : '#efd08d';
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), radius, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = reducedMotion ? 0.09 : 0.04 + progress * 0.11;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = heavy ? 2 : 1;
  ctx.globalAlpha = reducedMotion ? 0.62 : 0.31 + progress * 0.5;
  ctx.stroke();
  // Closing gaps beneath the enemy show how much preparation remains on the actual blow.
  const start = -Math.PI / 2;
  ctx.beginPath();
  ctx.ellipse(x, y, radius + 2, (radius + 2) * 0.5, 0, start, start + Math.max(0.01, progress) * Math.PI * 2);
  ctx.strokeStyle = reducedMotion ? color : '#ffe1a6';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.84;
  ctx.stroke();
  ctx.restore();
}

function contactColor(hit: Contact) {
  if (hit.kind === 'parry' || hit.kind === 'counter') return '#acf0d7';
  return hit.kind === 'guard' ? '#eaf6ed' : hit.kind === 'blade' ? '#ffe3a1' : '#d5ac86';
}

/** Flecks stay in the world at the resolved impact, in front of or behind passing sprites. */
export function drawContact(
  ctx: CanvasRenderingContext2D,
  hit: Contact,
  time: number,
  ox: number,
  oy: number,
  reducedMotion: boolean
) {
  const t = (time - hit.born) / CONTACT_TIME;
  if (t < 0 || t >= 1) return;
  const p = project(hit.x, hit.z, hit.height),
    x = Math.round(p.x + ox),
    y = Math.round(p.y + oy);
  const turned = hit.kind === 'parry';
  const spark = turned || hit.kind === 'guard' || hit.kind === 'blade' || hit.kind === 'counter';
  const strong = !!(turned || hit.kind === 'counter' || hit.heavy || hit.defeated);
  ctx.save();
  ctx.globalAlpha = 1 - t * t;
  const color = contactColor(hit);
  if (!reducedMotion) {
    const direction = project(hit.dx, hit.dz);
    const angle = Math.atan2(direction.y, direction.x);
    if (turned) {
      // The paired arcs open towards the attacker, around the point where the blades met.
      ctx.strokeStyle = color;
      const radius = 4 + 13 * (1 - (1 - t) ** 2);
      for (const scale of [1, 0.72]) {
        ctx.beginPath();
        ctx.arc(x, y, radius * scale, angle + 2.2, angle + 4.1);
        ctx.stroke();
      }
    }
    const reach = strong ? 19 : 11;
    const count = strong ? 3 : 2;
    ctx.fillStyle = color;
    for (let i = -count; i <= count; i++) {
      const a = angle + i * 0.49;
      const travel = (2 + reach * (1 - (1 - t) ** 2)) * (1 - Math.abs(i) * 0.1);
      const fleckX = x + Math.cos(a) * travel;
      const fleckY = y + Math.sin(a) * travel - 4 * Math.sin(t * Math.PI);
      ctx.fillRect(Math.round(fleckX), Math.round(fleckY), t < 0.35 ? 3 : 1, 1);
    }
    if (strong && t > 0.1) {
      const radius = 3 + 18 * t;
      ctx.globalAlpha = 0.65 * (1 - t);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, radius, radius * 0.41, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (t < (reducedMotion ? 0.28 : 0.19)) {
    const size = strong && !reducedMotion ? 5 : 3;
    ctx.globalAlpha = reducedMotion ? 0.78 : 1 - t * 2;
    ctx.fillStyle = spark ? '#fff3cf' : color;
    ctx.fillRect(x - size, y, size * 2 + 1, 1);
    ctx.fillRect(x, y - size, 1, size * 2 + 1);
  }
  ctx.restore();
}

/** Keep the newest number nearest the hit and give overlapping numbers a line of their own. */
export function drawDamageLabels(
  ctx: CanvasRenderingContext2D,
  hits: readonly Contact[],
  time: number,
  ox: number,
  oy: number,
  reducedMotion: boolean
) {
  if (!hits.length) return;
  const placed: { x: number; y: number; halfWidth: number }[] = [];
  ctx.save();
  ctx.font = 'bold 10px Vale, monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#352921';
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i]!;
    const age = time - hit.born;
    if (!hit.damage || age < 0 || age >= DAMAGE_LABEL_TIME) continue;
    const label = String(hit.damage);
    const p = project(hit.x, hit.z, hit.height);
    const x = Math.round(p.x + ox);
    const rise = reducedMotion ? 0 : Math.round(8 * Math.min(1, age / 0.34));
    let y = Math.round(p.y + oy) - 11 - rise;
    const halfWidth = ctx.measureText(label).width * 0.5 + 2;
    // Scan the occupied lines from bottom to top so an adjustment cannot re-enter a checked line.
    for (const line of placed)
      if (Math.abs(x - line.x) < halfWidth + line.halfWidth && Math.abs(y - line.y) < 12) y = line.y - 12;
    placed.push({ x, y, halfWidth });
    placed.sort((a, b) => b.y - a.y);
    ctx.globalAlpha = Math.min(1, (DAMAGE_LABEL_TIME - age) / 0.13);
    ctx.fillStyle = contactColor(hit);
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}
