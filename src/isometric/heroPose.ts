import { DRAW_TIME, RELEASE_TIME } from './fieldcraft';
import type { Atlas } from './atlas';
import type { Valley } from './simulation';

/** One source of facing, foot scale and action timing for the two camera spaces. */
export function heroPose(v: Valley, atlas: Atlas, width: number) {
  const face = v.facing;
  const activity = v.activity;
  const west = face.includes('west');
  const mirrorFace = face.replace('west', 'east');
  const bow = v.bow;
  if (
    activity ||
    bow ||
    (!v.room &&
      !v.jump &&
      !v.riding &&
      !v.swimming &&
      !v.guard &&
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
    } else if (clip === 'bowstep') frame = Math.floor(v.time * 9);
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
  const key = [hero + '--' + action, 'hero-' + cardinal + '--' + action, hero].find((k) => atlas.has(k))!;
  const frame = v.strike ? Math.floor((0.48 - v.strike) * 12) : Math.floor(v.time * (v.walk ? 9 : 5));
  return { key, frame, flip: false, width };
}
