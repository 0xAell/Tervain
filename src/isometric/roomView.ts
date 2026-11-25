import { heroPose } from './heroPose';
import { hourOfDay } from '../core/game/state';
import type { Atlas } from './atlas';
import { RoomArt } from './roomArt';
import { drawWaylight, type PickRegion } from './entryCues';
import { residentSpots } from './roomTargets';
import { roomProject, roomUnproject, type FloorPlan } from './roomPlans';
import type { Valley } from './simulation';
import type { V2 } from '../core/world/layout';

interface Sprite extends V2 {
  key: string;
  width: number;
  frame?: number;
  flip?: boolean;
  hero?: boolean;
  shade?: boolean;
  lift?: number;
}
export class RoomView {
  private art: RoomArt;
  private ox = 0;
  private oy = 0;
  private last?: FloorPlan;
  constructor(private atlas: Atlas) {
    this.art = new RoomArt(atlas);
  }
  point(x: number, y: number) {
    return roomUnproject(x - this.ox, y - this.oy);
  }
  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bright: number) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,189,92,' + bright + ')');
    g.addColorStop(1, 'rgba(255,165,67,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  draw(ctx: CanvasRenderingContext2D, valley: Valley, regions: PickRegion[], dt: number) {
    const plan = valley.room!,
      plate = this.art.plate(
        plan,
        plan.level === 'ground' && valley.game.state.facts['room_indigo:' + plan.site.id] === true
      ),
      { width: w, height: h } = ctx.canvas,
      p = valley.position;
    const hero = roomProject(p),
      midX = plate.left + plate.image.width / 2,
      midY = plate.top + plate.image.height / 2;
    const center = (mid: number, follow: number, span: number, viewport: number) => {
      const freedom = Math.max(0, (span - viewport * 0.84) / 2);
      return mid + Math.max(-freedom, Math.min(freedom, follow - mid));
    };
    const x = w * 0.5 - center(midX, hero.x, plate.image.width, w),
      y = h * 0.48 - center(midY, hero.y - 12, plate.image.height, h);
    const blend = this.last === plan ? 1 - Math.exp(-dt * 13) : 1;
    this.ox += (x - this.ox) * blend;
    this.oy += (y - this.oy) * blend;
    this.last = plan;
    const ox = Math.round(this.ox),
      oy = Math.round(this.oy);
    ctx.fillStyle = plan.level === 'cellar' ? '#172328' : '#202a2b';
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createRadialGradient(
      w * 0.5,
      h * 0.48,
      10,
      w * 0.5,
      h * 0.48,
      Math.max(w * 0.62, h * 0.7)
    );
    shade.addColorStop(0, plan.level === 'cellar' ? '#32403d' : '#445049');
    shade.addColorStop(1, '#121d24');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.shadowColor = 'rgba(8,14,18,.4)';
    ctx.shadowBlur = 11;
    ctx.shadowOffsetY = 7;
    ctx.drawImage(plate.image, plate.left + ox, plate.top + oy);
    ctx.restore();
    const daylight = Math.max(0, Math.sin(((hourOfDay(valley.game.state.clock) - 6) * Math.PI) / 12));
    if (plan.level !== 'cellar' && daylight > 0.03) {
      ctx.fillStyle = 'rgba(255,231,158,' + daylight * 0.14 + ')';
      for (const r of plan.rooms) {
        const x = (r.x0 + r.x1) / 2,
          z = r.z0 + 1.5;
        for (const offset of [-0.7, 0.15]) {
          const corners = [
            [x + offset, z],
            [x + offset + 0.52, z],
            [x + offset + 1.9, z + 2.8],
            [x + offset + 1.28, z + 2.8],
          ];
          ctx.beginPath();
          corners.forEach(([x, z], i) => {
            const s = roomProject({ x: x!, z: z! });
            if (i) ctx.lineTo(ox + s.x, oy + s.y);
            else ctx.moveTo(ox + s.x, oy + s.y);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    const clock = valley.time,
      sprites: Sprite[] = [];
    for (const f of plan.fixtures) {
      const open = f.use === 'chest' && valley.openChest === f.id;
      const key = open
        ? 'room_open_chest'
        : f.key === 'room_hearth' && valley.lightsOn
          ? 'room_hearth--flame'
          : f.key;
      const s = roomProject(f);
      if (valley.lightsOn && (f.key === 'room_hearth' || f.use === 'lamp'))
        this.glow(
          ctx,
          s.x + ox,
          s.y + oy - 9,
          f.use === 'lamp' ? 30 : 48,
          0.24 + 0.025 * Math.sin(clock * 5 + f.x)
        );
      sprites.push({ ...f, key, frame: f.key === 'room_hearth' ? Math.floor(clock * 5) : 0, shade: true });
    }
    for (const { a, at } of residentSpots(plan, valley.actors)) {
      const action = a.move ? 'walk' : (a.posture ?? 'idle'),
        motion = a.key + '--' + action;
      sprites.push({
        ...at,
        key: this.atlas.has(motion) ? motion : a.key,
        width: 40,
        frame: Math.floor(clock * 5),
        flip: a.flip,
        shade: true,
      });
    }
    sprites.push({
      ...valley.displayPosition,
      ...heroPose(valley, this.atlas, 44),
      hero: true,
      shade: true,
      lift: valley.jump ? Math.sin((Math.PI * valley.jump) / 0.52) * 10 : 0,
    });
    sprites.sort((a, b) => a.x + a.z - b.x - b.z || Number(!!a.hero) - Number(!!b.hero));
    let heroDrawn = false;
    for (const s of sprites) {
      const at = roomProject(s),
        sx = Math.round(at.x + ox),
        sy = Math.round(at.y + oy);
      if (s.shade) {
        ctx.fillStyle = 'rgba(37,25,33,.24)';
        ctx.beginPath();
        ctx.ellipse(
          sx,
          sy - 1,
          (s.hero ? 33 : s.width) * 0.32,
          Math.max(2, (s.hero ? 33 : s.width) * 0.095),
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      const hidden =
        !s.hero &&
        at.y > hero.y + 1 &&
        at.y - hero.y < this.atlas.height(s.key, s.width, s.frame) * 0.8 &&
        Math.abs(at.x - hero.x) < s.width * 0.34;
      ctx.globalAlpha = hidden ? 0.52 : 1;
      this.atlas.draw(ctx, s.key, sx, sy - (s.lift ?? 0), s.width, s.frame ?? 0, s.flip);
      if (s.hero) heroDrawn = true;
    }
    ctx.globalAlpha = 1;
    if (!valley.lightsOn) {
      ctx.fillStyle = 'rgba(17,29,46,.26)';
      ctx.fillRect(0, 0, w, h);
    }
    for (const target of valley.targets()) {
      const s = roomProject(target.at),
        x = s.x + ox,
        base = s.y + oy;
      const close = Math.hypot(target.at.x - p.x, target.at.z - p.z) < 3.3;
      if (target.passage) {
        drawWaylight(ctx, this.atlas, x, base, clock, close, false, true, target.passage.kind);
        regions.push({ id: target.id, x, y: base - 7, w: 29, h: 33, target });
      } else {
        const f = target.fixture,
          width = f?.width ?? 36,
          height = f ? this.atlas.height(f.key, width) : 36;
        regions.push({ id: target.id, x, y: base - height * 0.45, w: width, h: height, target });
        if (close) {
          ctx.fillStyle = '#243b3b';
          ctx.fillRect(Math.round(x) - 2, Math.round(base - height) - 4, 5, 5);
          ctx.fillStyle = '#a6ead4';
          ctx.fillRect(Math.round(x), Math.round(base - height) - 4, 1, 5);
          ctx.fillRect(Math.round(x) - 2, Math.round(base - height) - 2, 5, 1);
        }
      }
    }
    return { heroDrawn, draws: sprites.length + plan.passages.length + 1 };
  }
  leave() {
    this.last = undefined;
  }
}
