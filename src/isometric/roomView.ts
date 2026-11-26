import { followAxis } from './camera';
import { pixelPool } from './pixelInk';
import { smoothstep } from '../core/world/noise';
import { drawProp, propSprite } from './propArt';
import type { PropView } from './propPhysics';
import { HeroReveal } from './heroReveal';
import { heroPose } from './heroPose';
import type { Atlas } from './atlas';
import { clipBelowRim, RoomArt, stairForeground, type RoomPlate } from './roomArt';
import { cuePass, spriteDepth, drawReachMark, drawWaylight, type DepthCue, type PickRegion } from './entryCues';
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
  resident?: boolean;
  shade?: boolean;
  prop?: PropView;
  lift?: number;
}
export class RoomView {
  private previousFocus = { x: 0, y: 0 };
  private art: RoomArt;
  private reveal = new HeroReveal();
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
    for (const [radius, opacity] of [[1,0.15],[0.67,0.24],[0.32,0.38]] as const) {
      ctx.fillStyle = 'rgba(255,185,103,' + bright * opacity + ')';
      pixelPool(ctx, x, y, r * radius, r * radius * 0.62);
    }
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
      const at = roomFoot(plan, s, !!(s.hero || s.resident)),
        image = this.atlas.shadow(s.key, s.frame ?? 0);
      let dx = daylight * (0.28 + 0.64 * Math.cos(((hour - 6) * Math.PI) / 12)),
        dz = daylight * 0.69,
        weight = daylight;
      for (const lamp of lamps) {
        const x = s.x - lamp.x, z = s.z - lamp.z, d = Math.hypot(x, z);
        if (d >= 9 || d === 0) continue;
        const strength = 0.95 * (1 - smoothstep(0, 9, d));
        dx += x * strength / Math.max(0.8, d);
        dz += z * strength / Math.max(0.8, d);
        weight += strength;
      }
      if (weight < 0.02) continue;
      const height = this.atlas.height(s.key, s.width, s.frame),
        length = (height * (0.5 + 0.14 * (1 - daylight))) / roomRisePixels;
      const tip = roomFoot(plan, { x: s.x + (dx / weight) * length, z: s.z + (dz / weight) * length }, true);
      const scale = ((s.flip ? -1 : 1) * s.width * 0.68) / image.width;
      ctx.save();
      ctx.globalAlpha = 0.29 * Math.min(1, weight);
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
  private interactionCues(ctx: CanvasRenderingContext2D, valley: Valley, regions: PickRegion[], ox: number, oy: number) {
    const plan = valley.room!, p = valley.position;
    const cues: DepthCue[] = [];
    for (const target of valley.targets()) {
      const prop = target.prop ? valley.props?.object(target.prop) : undefined;
      const s = roomFoot(plan, target.at, !!target.npc),
        x = s.x + ox,
        base =
          s.y + oy - (prop ? (prop.y - prop.spec.height / 2) * roomRisePixels - roomLift(plan, prop) : 0);
      const close = Math.max(0, Math.min(1, (3.8 - Math.hypot(target.at.x - p.x, target.at.z - p.z)) / 1.2));
      if (target.passage) {
        const kind = target.passage.kind;
        cues.push({ depth: spriteDepth(target.at),
          draw: () => drawWaylight(ctx, this.atlas, s.x, base - oy, valley.time, close, false, true, kind) });
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
        if (close > 0) cues.push({ depth: spriteDepth(target.at, prop),
          draw: () => drawReachMark(ctx, s.x, base - oy - height - 4, close) });
      }
    }
    return cuePass(cues);
  }
  draw(ctx: CanvasRenderingContext2D, valley: Valley, regions: PickRegion[], dt: number, ambient = valley.time, speaker?: V2) {
    const plan = valley.room!,
      plate = this.art.plate(
        plan,
        plan.level === 'ground' && valley.game.state.facts['room_indigo:' + plan.site.id] === true
      ),
      { width: w, height: h } = ctx.canvas,
      p = valley.position;
    const hero = roomFoot(plan, p, true),
      midX = plate.left + plate.image.width / 2,
      midY = plate.top + plate.image.height / 2;
    const center = (mid: number, follow: number, span: number, viewport: number) => {
      const freedom = Math.max(0, (span - viewport * 0.84) / 2);
      return mid + Math.max(-freedom, Math.min(freedom, follow - mid));
    };
    const talking = speaker && roomFoot(plan, speaker, true);
    const x = w * 0.5 - center(midX, talking ? (hero.x + talking.x) / 2 : hero.x, plate.image.width, w),
      y = h * (talking ? 0.36 : 0.48) - center(midY, (talking ? (hero.y + talking.y) / 2 : hero.y) - 12, plate.image.height, h);
    this.ox = this.last === plan ? followAxis(this.ox,this.previousFocus.x,x,dt,13) : x;
    this.oy = this.last === plan ? followAxis(this.oy,this.previousFocus.y,y,dt,13) : y;
    this.previousFocus.x = x;
    this.previousFocus.y = y;
    this.last = plan;
    const ox = Math.round(this.ox),
      oy = Math.round(this.oy);
    ctx.fillStyle = plan.level === 'cellar' ? '#172328' : '#202a2b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = plan.level === 'cellar' ? '#20292d' : '#2d3838';
    pixelPool(ctx, w / 2, h * 0.48, w * 0.57, h * 0.6);
    ctx.save();
    ctx.shadowColor = '#172023';
    ctx.shadowOffsetY = 4;
    ctx.drawImage(plate.image, plate.left + ox, plate.top + oy);
    ctx.restore();
    const hour = valley.skyHour,
      daylight = Math.max(0, Math.sin(((hour - 6) * Math.PI) / 12));
    ctx.save();
    ctx.translate(ox, oy);
    this.art.drawHangings(ctx, plate, windPhase(plan.site.x, plan.site.z, ambient, 0.47));
    this.windowLight(ctx, plate, daylight, hour, ambient);
    ctx.restore();
    const clock = ambient,
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
    for (const { a, at, moving, flip } of valley.roomResidents) {
      const action = moving ? 'walk' : (a.posture ?? 'idle'),
        motion = a.key + '--' + action;
      sprites.push({
        ...at,
        key: this.atlas.has(motion) ? motion : a.key,
        width: a.width,
        resident: true,
        frame: Math.floor(clock * (moving ? 8 : 5)),
        flip,
        shade: true,
      });
    }
    sprites.push({
      ...valley.displayPosition,
      ...heroPose(valley, this.atlas, 38),
      hero: true,
      shade: true,
      lift: (valley.standingLift + valley.hop) * roomRisePixels,
    });
    sprites.sort(
      (a, b) =>
        spriteDepth(a, a.prop) - spriteDepth(b, b.prop) ||
        Number(!!a.hero) - Number(!!b.hero)
    );
    ctx.save();
    ctx.translate(ox, oy);
    this.castShadows(ctx, plan, plate, sprites, hour, valley.lightsOn);
    const drawCues = this.interactionCues(ctx, valley, regions, ox, oy);
    let heroDrawn = false;
    this.reveal.reset();
    for (const s of sprites) {
      drawCues(spriteDepth(s, s.prop));
      const actor = !!(s.hero || s.resident);
      const at = roomFoot(plan, s, actor), sx = actor ? at.x : Math.round(at.x), sy = actor ? at.y : Math.round(at.y);
      const height = this.atlas.height(s.key, s.width, s.frame);
      const foot = sy + (s.hero ? 1 : 0) - (s.lift ?? 0);
      const pad = s.prop ? s.width / 2 : 3;
      ctx.save();
      const flight = stairAt(plan, s);
      if (flight?.passage.kind === 'down') clipBelowRim(ctx, flight);
      if (s.shade) {
        ctx.fillStyle = 'rgba(37,25,33,.24)';
        pixelPool(ctx, sx, sy - 1, (s.hero ? 33 : s.width) * 0.28, Math.max(1, s.width * 0.065));
        ctx.fillStyle = 'rgba(34,28,35,.33)';
        pixelPool(ctx, sx, sy, s.width * 0.16, 1);
      }
      const paint = (ctx: CanvasRenderingContext2D) => {
        if (s.prop) drawProp(ctx, this.atlas, s.prop, sx, sy - (s.lift ?? 0), s.width, true);
        else this.atlas.draw(ctx, s.key, sx, foot,
          s.width, s.frame ?? 0, s.flip, 1, 0, false, actor);
      };
      paint(ctx);
      const mask = this.reveal.foreground(sx - s.width / 2 - pad, foot - height - pad,
        s.width + 2 * pad, height + 2 * pad);
      if (mask) {
        mask.save();
        if (flight?.passage.kind === 'down') clipBelowRim(mask, flight);
        paint(mask);
        mask.restore();
      }
      ctx.restore();
      if (s.hero) {
        heroDrawn = true;
        this.reveal.track(sx, foot, s.width, height, (g) => {
          if (flight?.passage.kind === 'down') clipBelowRim(g, flight);
          this.atlas.draw(g, s.key, sx, foot, s.width, s.frame, s.flip, 1, 0, false, true);
        });
      }
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
        this.reveal
      );
    }
    drawCues(Infinity);
    this.reveal.finish(ctx);
    ctx.restore();
    if (!valley.lightsOn) {
      ctx.fillStyle = 'rgba(17,29,46,.26)';
      ctx.fillRect(0, 0, w, h);
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
