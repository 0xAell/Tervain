import { DRAW_TIME, RELEASE_TIME, SWING_RELEASE, SWING_TIME, type SwordStroke } from './fieldcraft';
import { JUMP_TIME } from './locomotion';
import type { Atlas } from './atlas';
import type { Valley } from './simulation';

type Grip = readonly [number, number];
// Hand positions in the 48-pixel body cels, from wind-up to recovery.
const swingGrips: Record<string, readonly Grip[]> = {
  east: [
    [25, 32],
    [25, 31],
    [31, 27],
    [34, 22],
    [34, 21],
    [32, 26],
    [31, 28],
  ],
  'south-east': [
    [24, 32],
    [24, 31],
    [26, 31],
    [33, 24],
    [35, 21],
    [34, 24],
    [32, 26],
  ],
  south: [
    [17, 31],
    [17, 31],
    [19, 29],
    [21, 26],
    [23, 25],
    [22, 26],
    [18, 29],
  ],
  'north-east': [
    [30, 29],
    [30, 29],
    [34, 28],
    [34, 25],
    [35, 23],
    [33, 25],
    [31, 28],
  ],
  north: [
    [29, 29],
    [29, 29],
    [30, 28],
    [32, 25],
    [32, 25],
    [31, 27],
    [30, 28],
  ],
};
// Each stroke binds the blade to the wrist of its selected body cel.
const strokes = {
  attack: { body: [0, 1, 2, 3, 4, 5, 6], angles: [-1, -1.5, -2.17, -1.06, 0.09, 0.69, 0.92] },
  return: { body: [6, 6, 5, 4, 3, 2, 1], angles: [0.92, 1.02, 1.21, 0.68, -0.30, -1.14, -1.33] },
  counter: { body: [1, 2, 2, 3, 4, 5, 6], angles: [-1.29, -1.04, -0.82, -0.36, 0, -0.08, -0.32] },
  thrust: { body: [1, 1, 2, 3, 4, 4, 5], angles: [-0.94, -0.75, -0.47, -0.18, 0.12, 0.16, 0.42] },
} as const;
const bearings: Record<string, number> = {
  east: 0,
  'north-east': -0.58,
  north: -1.45,
  south: 1.47,
  'south-east': 0.41,
};

/** Trace the last part of the same grip and blade motion used by the authored swing cels. */
export function drawSwordSweep(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  face: string,
  elapsed: number,
  stroke: SwordStroke = 'attack'
) {
  const age = elapsed - SWING_RELEASE;
  if (age < 0 || age >= 0.15) return;
  const mirror = face.includes('west');
  const facing = face.replace('west', 'east');
  const grips = swingGrips[facing];
  if (!grips) return;
  const scale = width / 72;
  const { body, angles } = strokes[stroke];
  const head = Math.min(6, (elapsed * 7) / SWING_TIME);
  const tail = Math.max(2.55, head - 1.35);
  const edge = (cel: number, reach: number) => {
    const i = Math.min(5, Math.floor(cel)),
      fraction = cel - i,
      a = grips[body[i]!]!,
      b = grips[body[i + 1]!]!,
      angle = bearings[facing]! + angles[i]! * (1 - fraction) + angles[i + 1]! * fraction;
    const px = a[0] + (b[0] - a[0]) * fraction - 24 + Math.cos(angle) * reach;
    const py = a[1] + (b[1] - a[1]) * fraction - 48 + Math.sin(angle) * reach;
    ctx.lineTo(Math.round(x + px * scale * (mirror ? -1 : 1)), Math.round(y + py * scale));
  };
  ctx.save();
  ctx.globalAlpha *= (1 - age / 0.15) * 0.68;
  ctx.fillStyle = stroke === 'counter' ? '#b7e9d5' : '#f0d8a5';
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) edge(tail + ((head - tail) * i) / 4, 18);
  for (let i = 4; i >= 0; i--) edge(tail + ((head - tail) * i) / 4, 17 - i * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Bind the original sword sprite to the right hand before caching shadows and water reflections. */
export function buildSwordPoses(atlas: Atlas) {
  const sword = atlas.surface('rusted_sword');
  for (const face of [
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
    'north-west',
    'north',
    'north-east',
  ]) {
    const west = face.includes('west'),
      side = face.replace('west', 'east');
    for (const action of ['attack', 'return', 'thrust', 'counter', 'guard'] as const) {
      const stroke = action === 'guard' ? undefined : strokes[action];
      const native = 'hero-' + face + '--' + (stroke ? 'attack' : 'guard');
      const raised = action === 'guard' && !atlas.has(native);
      const source = raised ? 'hero-' + face + '--attack' : native;
      const count = stroke?.body.length ?? (raised ? 4 : atlas.frameCount(source));
      const strip = document.createElement('canvas');
      strip.width = 72 * count;
      strip.height = 54;
      const ctx = strip.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      for (let frame = 0; frame < count; frame++) {
        const cel = stroke?.body[frame] ?? frame;
        const body = atlas.surface(source, cel);
        const grip =
          stroke || raised
            ? swingGrips[side]![cel]!
            : ([25 + Math.min(frame, 3) * 1.8, 31 - Math.min(frame, 3) * 2.4] as const);
        const left = frame * 72 + 12,
          top = 6;
        const behind = face.startsWith('north') || (stroke && cel < 2);
        if (!behind) ctx.drawImage(body, left, top);
        ctx.save();
        ctx.translate(left + (west ? 48 - grip[0] : grip[0]), top + grip[1]);
        if (west) ctx.scale(-1, 1);
        const angle = stroke ? bearings[side]! + stroke.angles[frame]! : -1.29 + frame * 0.05;
        ctx.rotate(angle + Math.PI / 4);
        ctx.drawImage(sword, -4, -18, 22, 22);
        ctx.restore();
        if (behind) ctx.drawImage(body, left, top);
      }
      atlas.addAnimation('hero-' + face + '--sword-' + action, strip, 72, 54);
    }
  }
}

/** One source of facing, foot scale and action timing for the two camera spaces. */
export function heroPose(v: Valley, atlas: Atlas, width: number) {
  const face = v.facing;
  if (v.dash) {
    const key = 'hero-' + face + '--walk';
    return { key, width, flip: false, frame: Math.min(atlas.frameCount(key) - 1, 1 + Math.floor(v.dash.elapsed * 18)) };
  }
  const activity = v.activity;
  const west = face.includes('west');
  const mirrorFace = face.replace('west', 'east');
  if (v.props?.grip && !v.jump) {
    const key = 'hero-' + (face.startsWith('north') ? 'north-east' : 'south-east') + '--work';
    const count = atlas.frameCount(key);
    return {
      key,
      frame: v.walk ? Math.floor(v.gait.phase * count * 0.5) : Math.min(2, count - 1),
      width: width * 1.5,
      flip: west,
    };
  }
  const bow = v.bow;
  if (
    activity ||
    bow ||
    (!v.room &&
      !v.jump &&
      !v.riding &&
      !v.swimming &&
      !v.guard &&
      !v.strike &&
      v.game.state.equippedWeapon === 'hunting_bow')
  ) {
    const dir = activity ? (face.startsWith('north') ? 'north-east' : 'south-east') : mirrorFace;
    const clip =
      activity?.kind ?? (bow ? (bow.phase === 'hold' ? 'aim' : bow.phase) : v.walk ? 'bowstep' : 'ready');
    const key = 'hero-' + dir + '--' + clip;
    const last = atlas.frameCount(key) - 1;
    let frame = 0;
    if (activity) {
      frame =
        activity.kind === 'gather'
          ? Math.min(last, Math.floor(((last + 1) * activity.elapsed) / activity.duration))
          : Math.floor(activity.elapsed * (activity.kind === 'sit' ? 3.6 : 6.8)) % (last + 1);
    } else if (bow?.phase === 'draw' || bow?.phase === 'loose') {
      const phase = bow.phase === 'draw' ? DRAW_TIME : RELEASE_TIME;
      frame = Math.min(last, Math.floor(((last + 1) * bow.elapsed) / phase));
    } else if (clip === 'bowstep') frame = Math.floor(v.gait.phase * (last + 1) * 0.5);
    return { key, frame, flip: west, width: width * 1.5 };
  }
  const action = v.strike
    ? 'attack'
    : v.riding
      ? 'ride'
      : v.swimming
        ? 'swim'
        : v.jump
          ? 'jump'
          : v.guard
            ? 'guard'
            : v.walk
              ? 'walk'
              : 'idle';
  const hero = 'hero-' + face,
    cardinal = face.includes('east') ? 'east' : west ? 'west' : face;
  const armed =
    (action === 'attack' && v.swordSwing) ||
    (action === 'guard' && v.game.state.equippedWeapon === 'rusted_sword');
  const weaponPose = hero + '--sword-' + (action === 'attack' ? v.stroke : action);
  const showSword = armed && atlas.has(weaponPose);
  const key = showSword
    ? weaponPose
    : [hero + '--' + action, 'hero-' + cardinal + '--' + action, hero].find((k) => atlas.has(k))!;
  const count = atlas.frameCount(key);
  const frame = v.strike
    ? Math.min(count - 1, Math.floor((1 - v.strike / SWING_TIME) * count))
    : action === 'guard'
      ? Math.min(count - 1, Math.floor(v.guardTime * 15))
      : action === 'jump'
        ? Math.min(count - 1, Math.floor((1 - v.jump / JUMP_TIME) * count))
        : v.walk && !v.jump
          ? Math.floor(v.gait.phase * count * 0.5)
          : Math.floor(v.time * 5);
  return { key, frame, flip: false, width: showSword ? width * 1.5 : width };
}
