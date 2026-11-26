import { drawProp, propSprite } from './propArt';
import type { PropView } from './propPhysics';
import { heroPose } from './heroPose';
import { hourOfDay } from '../core/game/state';
import type { Atlas } from './atlas';
import { clipBelowRim, RoomArt, stairForeground, type RoomPlate } from './roomArt';
import { drawWaylight, type PickRegion } from './entryCues';
import { residentSpots } from './roomTargets';
import {
  roomUnproject,
  roomProject,
  roomFoot,
  roomLift,
  stairAt,
  pickRoomFloor,
  roomRisePixels,
  upperLandingRun,
  type FloorPlan,
} from './roomPlans';
import type { Valley } from './simulation';
import type { V2 } from '../core/world/layout';
import { windPhase } from './wind';

interface Sprite extends V2 {
  key: string;
  width: number;
  frame?: number;
  flip?: boolean;
  hero?: boolean;
  shade?: boolean;
  prop?: PropView;
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
    return this.last
      ? pickRoomFloor(this.last, x - Math.round(this.ox), y - Math.round(this.oy))
      : roomUnproject(x - this.ox, y - this.oy);
  }
  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bright: number) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,189,92,' + bright + ')');
    g.addColorStop(1, 'rgba(255,165,67,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  private windowLight(
    ctx: CanvasRenderingContext2D,
    plate: RoomPlate,
    day: number,
    hour: number,
    clock: number
  ) {
    if (!plate.casements.length || day < 0.025) return;
    const distance = 0.58 + (1 - day) * 0.64,
      xRay = 0.3 + 0.72 * Math.cos(((hour - 6) * Math.PI) / 12),
      zRay = 0.78;
    for (const [i, w] of plate.casements.entries()) {
      if (w.half.z !== 0 && xRay < 0.04) continue;
      const aperture = (along: number, raise: number, drop: number) => {
        const t = (drop * distance) / roomRisePixels;
        const p = roomProject({
          x: w.centre.x + w.half.x * along + xRay * t,
          z: w.centre.z + w.half.z * along + zRay * t,
        });
        p.y -= w.floor + raise - drop;
        return p;
      };
      const polygon = (points: { x: number; y: number }[]) => {
        ctx.beginPath();
        points.forEach((q, n) => (n ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.closePath();
        ctx.fill();
      };
      // Light travels from the actual window head and sill to its raised chamber floor.
      ctx.fillStyle = 'rgba(255,225,146,' + day * 0.064 + ')';
      polygon([
        aperture(-0.92, w.height, 0),
        aperture(0.92, w.height, 0),
        aperture(0.92, w.height, w.height),
        aperture(-0.92, w.height, w.height),
      ]);
      ctx.save();
      ctx.clip(plate.floors);
      ctx.fillStyle = 'rgba(255,227,163,' + day * 0.22 + ')';
      for (const [l, r] of [
        [-0.92, -0.09],
        [0.09, 0.92],
      ]) {
        for (const [lo, hi] of [
          [8.5, w.height * 0.52],
          [w.height * 0.59, w.height - 1],
        ])
          polygon([
            aperture(l!, lo!, lo!),
            aperture(r!, lo!, lo!),
            aperture(r!, hi!, hi!),
            aperture(l!, hi!, hi!),
          ]);
      }
      ctx.restore();
      for (let k = 0; k < 3; k++) {
        const phase = (clock * 0.052 + i * 0.347 + k * 0.31) % 1;
        const q = aperture(
          0.75 * Math.sin(clock * 0.39 + i * 2.1 + k * 5.3),
          w.height * (0.68 + 0.16 * k),
          phase * w.height * 0.62
        );
        ctx.fillStyle = 'rgba(255,239,188,' + day * 0.48 * Math.sin(phase * Math.PI) + ')';
        ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
      }
    }
  }
  private castShadows(
    ctx: CanvasRenderingContext2D,
    plan: FloorPlan,
    plate: RoomPlate,
    sprites: Sprite[],
    hour: number,
    lights: boolean
  ) {
    const daylight = plan.level === 'cellar' ? 0 : Math.max(0, Math.sin(((hour - 6) * Math.PI) / 12));
    const lamps = lights ? plan.fixtures.filter((f) => f.use === 'lamp' || f.key === 'room_hearth') : [];
    if (daylight < 0.02 && !lamps.length) return;
    ctx.save();
    ctx.clip(plate.floors);
    ctx.globalCompositeOperation = 'multiply';
    for (const s of sprites) {
      const at = roomFoot(plan, s),
        image = this.atlas.shadow(s.key, s.frame ?? 0);
      let dx = daylight * (0.28 + 0.64 * Math.cos(((hour - 6) * Math.PI) / 12)),
        dz = daylight * 0.69,
        weight = daylight;
      let nearest = Infinity,
        source: (typeof lamps)[number] | undefined;
      for (const f of lamps) {
        const x = s.x - f.x,
          z = s.z - f.z,
          d = Math.hypot(x, z);
        if (d < 0.8 || d >= nearest || d > 8) continue;
        nearest = d;
        source = f;
      }
      if (source) {
        const f = source;
        const strength = (1 - nearest / 9) * 0.95;
        dx += ((s.x - f.x) / nearest) * strength;
        dz += ((s.z - f.z) / nearest) * strength;
        weight += strength;
      }
      if (weight < 0.02) continue;
      const height = this.atlas.height(s.key, s.width, s.frame),
        length = (height * (0.5 + 0.14 * (1 - daylight))) / roomRisePixels;
      const tip = roomFoot(plan, { x: s.x + (dx / weight) * length, z: s.z + (dz / weight) * length });
      const scale = ((s.flip ? -1 : 1) * s.width * 0.68) / image.width;
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.17 * Math.min(1, weight);
      ctx.transform(
        scale,
        0,
        (at.x - tip.x) / image.height,
        (at.y - tip.y) / image.height,
        tip.x - (scale * image.width) / 2,
        tip.y
      );
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  draw(ctx: CanvasRenderingContext2D, valley: Valley, regions: PickRegion[], dt: number) {
    const plan = valley.room!,
      plate = this.art.plate(
        plan,
        plan.level === 'ground' && valley.game.state.facts['room_indigo:' + plan.site.id] === true
      ),
      { width: w, height: h } = ctx.canvas,
      p = valley.position;
    const hero = roomFoot(plan, p),
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
    const hour = hourOfDay(valley.game.state.clock),
      daylight = Math.max(0, Math.sin(((hour - 6) * Math.PI) / 12));
    ctx.save();
    ctx.translate(ox, oy);
    this.art.drawHangings(ctx, plate, windPhase(plan.site.x, plan.site.z, valley.time, 0.47));
    this.windowLight(ctx, plate, daylight, hour, valley.time);
    ctx.restore();
    const clock = valley.time,
      sprites: Sprite[] = [];
    for (const f of plan.fixtures) {
      const open = f.use === 'chest' && valley.openChest === f.id;
      const key = open
        ? 'room_open_chest'
        : f.key === 'room_hearth' && valley.lightsOn
          ? 'room_hearth--flame'
          : f.key;
      const s = roomFoot(plan, f);
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
    if (valley.props)
      for (const prop of valley.props.objects) {
        sprites.push({
          x: prop.x,
          z: prop.z,
          key: propSprite(prop.spec),
          width: (prop.spec.width * 11) / 6,
          prop,
          shade: true,
          lift: (prop.y - prop.spec.height / 2) * roomRisePixels - roomLift(plan, prop),
        });
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
      lift: (valley.standingLift + valley.hop) * roomRisePixels,
    });
    sprites.sort(
      (a, b) =>
        a.x + a.z + (a.prop ? a.prop.y * 0.45 : 0) - b.x - b.z - (b.prop ? b.prop.y * 0.45 : 0) ||
        Number(!!a.hero) - Number(!!b.hero)
    );
    ctx.save();
    ctx.translate(ox, oy);
    this.castShadows(ctx, plan, plate, sprites, hour, valley.lightsOn);
    let heroDrawn = false;
    for (const s of sprites) {
      const at = roomFoot(plan, s),
        sx = s.hero ? at.x : Math.round(at.x),
        sy = s.hero ? at.y : Math.round(at.y);
      ctx.save();
      const flight = stairAt(plan, s);
      if (flight?.passage.kind === 'down') clipBelowRim(ctx, flight);
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
      if (s.prop) drawProp(ctx, this.atlas, s.prop, sx, sy - (s.lift ?? 0), s.width, true);
      else this.atlas.draw(ctx, s.key, sx, sy + (s.hero ? 1 : 0) - (s.lift ?? 0),
        s.width, s.frame ?? 0, s.flip, 1, 0, false, s.hero);
      ctx.restore();
      const height = this.atlas.height(s.key, s.width, s.frame);
      stairForeground(
        ctx,
        plate,
        s,
        {
          x: sx - s.width / 2 - 2,
          y: sy - (s.lift ?? 0) - height - 2,
          w: s.width + 4,
          h: height + 5,
        },
        !!s.hero
      );
      if (s.hero) heroDrawn = true;
    }
    ctx.restore();
    if (!valley.lightsOn) {
      ctx.fillStyle = 'rgba(17,29,46,.26)';
      ctx.fillRect(0, 0, w, h);
    }
    for (const target of valley.targets()) {
      const prop = target.prop ? valley.props?.object(target.prop) : undefined;
      const s = roomFoot(plan, target.at),
        x = s.x + ox,
        base =
          s.y + oy - (prop ? (prop.y - prop.spec.height / 2) * roomRisePixels - roomLift(plan, prop) : 0);
      const close = Math.hypot(target.at.x - p.x, target.at.z - p.z) < 3.3;
      if (target.passage) {
        drawWaylight(ctx, this.atlas, x, base, clock, close, false, true, target.passage.kind);
        regions.push({ id: target.id, x, y: base - 7, w: 29, h: 33, target });
        if (target.passage.kind === 'up') {
          const flight = plan.stairs.find((s) => s.passage.id === target.passage!.id)!;
          const head = roomProject({ x: flight.passage.x, z: flight.z0 - upperLandingRun });
          const height = flight.treads[flight.treads.length - 1]!.height;
          regions.push({ id: target.id, x: head.x + ox, y: head.y + oy - height - 10, w: 27, h: 25, target });
        }
      } else {
        const f = target.fixture,
          width = prop ? (prop.spec.width * 11) / 6 : (f?.width ?? 36),
          height = prop ? this.atlas.height(propSprite(prop.spec), width) : f ? this.atlas.height(f.key, width) : 36;
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
    return {
      heroDrawn, draws: sprites.length + plan.passages.length + plate.hangings.length + 1,
      cameraX: this.ox, cameraY: this.oy,
    };
  }
  leave() {
    this.last = undefined;
  }
}
