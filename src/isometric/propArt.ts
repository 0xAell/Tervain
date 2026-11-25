import type { Atlas } from './atlas';
import { rotate, angleOf, type PropView } from './propPhysics';

interface Point {
  x: number;
  y: number;
  z: number;
}
interface Pixel {
  x: number;
  y: number;
  depth: number;
}
type Project = (p: Point) => Pixel;
type Ink = CanvasRenderingContext2D;
interface Face {
  corners: Pixel[];
  depth: number;
  shade: number;
  braced: boolean;
  band: boolean;
}
function panel(faces: Face[], corners: Pixel[], shade: number, braced = false, band = false) {
  const [a, b, c] = corners;
  if ((b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x) < 0.02) return;
  faces.push({
    corners,
    shade,
    braced,
    band,
    depth: corners.reduce((v, p) => v + p.depth, 0) / corners.length,
  });
}
function timber(
  faces: Face[],
  project: Project,
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
  braced = false
) {
  const v: Pixel[] = [];
  for (const j of [-1, 1])
    for (const k of [-1, 1])
      for (const i of [-1, 1]) v.push(project({ x: x + i * hx, y: y + j * hy, z: z + k * hz }));
  for (const [ids, shade] of [
    [[2, 3, 1, 0], 0.42],
    [[4, 5, 7, 6], 0.02],
    [[0, 1, 5, 4], 0.33],
    [[3, 2, 6, 7], 0.16],
    [[2, 0, 4, 6], 0.41],
    [[1, 3, 7, 5], 0.26],
  ] as [number[], number][]) {
    panel(
      faces,
      ids.map((i) => v[i]!),
      shade,
      braced && shade > 0.08
    );
  }
}
function barrel(faces: Face[], project: Project, r: number, h: number) {
  const n = 10,
    rings: Pixel[][] = [];
  for (const [level, radius] of [
    [-0.5, 0.83],
    [-0.36, 0.94],
    [-0.29, 0.97],
    [0, 1],
    [0.29, 0.97],
    [0.36, 0.94],
    [0.5, 0.83],
  ] as const) {
    const ring: Pixel[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      ring.push(project({ x: Math.cos(a) * r * radius, y: level * h, z: Math.sin(a) * r * radius }));
    }
    rings.push(ring);
  }
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      panel(
        faces,
        [rings[j]![i]!, rings[j]![next]!, rings[j + 1]![next]!, rings[j + 1]![i]!],
        0.16 + 0.16 * (1 + Math.cos(i * 0.67)),
        false,
        j === 1 || j === 4
      );
    }
  panel(faces, [...rings[6]!], 0.05);
  panel(faces, [...rings[0]!].reverse(), 0.36);
}
function paint(ctx: Ink, atlas: Atlas, f: Face) {
  const a = f.corners[0]!,
    b = f.corners[1]!,
    d = f.corners.at(-1)!;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  for (const c of f.corners.slice(1)) ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fillStyle = f.band ? '#657078' : '#ad824e';
  ctx.fill();
  if (f.corners.length === 4 && !f.band) {
    ctx.save();
    ctx.clip();
    const tile = atlas.surface('room_oak');
    ctx.transform((b.x - a.x) / 32, (b.y - a.y) / 32, (d.x - a.x) / 24, (d.y - a.y) / 24, a.x, a.y);
    ctx.drawImage(tile, 0, 0, 32, 24);
    if (f.braced) {
      ctx.strokeStyle = '#674936';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(2, 22);
      ctx.lineTo(30, 2);
      ctx.stroke();
      ctx.strokeStyle = '#c39c65';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeRect(1, 1, 30, 22);
    }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(33,38,48,' + f.shade + ')';
  ctx.fill();
  ctx.strokeStyle = f.band ? '#373e43' : '#574839';
  ctx.lineWidth = 0.65;
  ctx.stroke();
}
export function drawProp(
  ctx: Ink,
  atlas: Atlas,
  v: PropView,
  sx: number,
  footY: number,
  width: number,
  indoor = false
) {
  const s = v.spec,
    q = v.rotation,
    scale = indoor ? 11 : 6,
    rise = indoor ? 14 : 8,
    cy = footY - (s.height * rise) / 2;
  const project: Project = (p) => {
    const v = rotate(p, q);
    return {
      x: Math.round(sx + (v.x - v.z) * scale),
      y: Math.round(cy + ((v.x + v.z) * scale) / 2 - v.y * rise),
      depth: v.x + v.z + (v.y * scale) / rise,
    };
  };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (
    s.key === 'furniture_crate' ||
    s.shape === 'table' ||
    s.shape === 'chair' ||
    s.key === 'furniture_barrel'
  ) {
    const faces: Face[] = [],
      hh = s.height / 2;
    if (s.key === 'furniture_crate') timber(faces, project, 0, 0, 0, s.hx, hh, s.hz, true);
    else if (s.key === 'furniture_barrel') barrel(faces, project, Math.min(s.hx, s.hz), s.height);
    else {
      const chair = s.shape === 'chair',
        level = s.height * (chair ? 0.43 : 0.89);
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          timber(faces, project, x * (s.hx - 0.1), level / 2 - hh, z * (s.hz - 0.1), 0.1, level / 2, 0.1);
      timber(faces, project, 0, level - hh, 0, s.hx, 0.105, s.hz);
      if (chair) {
        for (const x of [-1, 1])
          timber(
            faces,
            project,
            x * (s.hx - 0.11),
            level / 2,
            -s.hz + 0.09,
            0.09,
            (s.height - level) / 2,
            0.09
          );
        for (const y of [0.75, 0.94])
          timber(faces, project, 0, s.height * y - hh, -s.hz + 0.09, s.hx, 0.095, 0.085);
      }
    }
    faces.sort((a, b) => a.depth - b.depth);
    for (const f of faces) paint(ctx, atlas, f);
  } else {
    const up = rotate({ x: 0, y: 1, z: 0 }, q);
    ctx.translate(Math.round(sx), Math.round(cy));
    ctx.rotate(Math.atan2((up.x - up.z) * scale, up.y * rise - ((up.x + up.z) * scale) / 2));
    const a = angleOf(q);
    ctx.scale(0.88 + 0.12 * Math.abs(Math.cos(a)), 1);
    atlas.draw(ctx, s.key, 0, (s.height * rise) / 2, width, 0, Math.cos(a) < 0, 1);
  }
  ctx.restore();
}
