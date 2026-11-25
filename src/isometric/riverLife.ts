import { channelPoint, coursesInFrame, wetPoint, type Flow } from './channels';
import { onBridge } from './crossing';
import { habitats, noise01 } from './riverHabitat';
import { project } from './land';
import type { Atlas } from './atlas';
import type { Ground } from './ground';
import type { Ripple } from './water';
import type { Stamp } from './reflections';
import type { V2 } from '../core/world/layout';

interface Flight {
  when: number;
  direction: number;
  splash: V2;
}
interface Fish extends Stamp {
  shade: number;
}
const daylight = (hour: number) => Math.max(0.3, Math.min(1, (hour - 4.5) / 2, (21 - hour) / 2));
export class RiverLife {
  private flights = new Map<number, Flight>();
  private last = -1;
  private bed = document.createElement('canvas').getContext('2d')!;
  private coverage = document.createElement('canvas').getContext('2d')!;
  private fish: Fish[] = [];
  constructor(private atlas: Atlas) {}
  reset() {
    this.flights.clear();
    this.last = -1;
  }
  frame(
    player: V2,
    walking: boolean,
    time: number,
    hour: number,
    flow: Flow,
    ox: number,
    oy: number,
    width: number,
    height: number,
    stamps: Stamp[]
  ) {
    if (time < this.last) this.reset();
    this.last = time;
    this.fish = [];
    const disturbance: Ripple[] = [],
      inWater = !onBridge(player) && !!wetPoint(player.x, player.z);
    for (const [i, h] of habitats.entries()) {
      const mid = channelPoint(h.course, h.s),
        screen = project(mid.x, mid.z);
      if (
        screen.x + ox < -90 ||
        screen.x + ox > width + 90 ||
        screen.y + oy < -60 ||
        screen.y + oy > height + 65
      )
        continue;
      const gait = 0.51 + flow[h.course] * 0.26,
        moment = time * gait + h.seed * 1.6;
      const school = h.s + 3.5 * Math.sin(moment * 0.62),
        shoal = channelPoint(h.course, school, h.side * mid.width * 0.26);
      let startled = this.flights.get(i);
      if (
        inWater &&
        walking &&
        Math.hypot(player.x - shoal.x, player.z - shoal.z) < 3.9 &&
        (!startled || time - startled.when > 3.1)
      ) {
        const down = (shoal.x - player.x) * mid.tx + (shoal.z - player.z) * mid.tz;
        startled = { when: time, direction: down < 0 ? -1 : 1, splash: { x: shoal.x, z: shoal.z } };
        this.flights.set(i, startled);
      }
      const age = startled ? time - startled.when : 100,
        burst = age < 4 ? (1 - Math.exp(-age * 6)) * Math.exp(-age * 1.1) : 0;
      if (startled && age < 1.4)
        disturbance.push({
          ...startled.splash,
          radius: 0.19 + age * 1.49,
          amplitude: 0.53 * (1 - age / 1.4),
          course: coursesInFrame.indexOf(h.course),
        });
      const slip = (startled?.direction ?? 1) * burst * 3.9;
      const alongDirection =
        3.5 * 0.62 * gait * Math.cos(moment * 0.62) +
        (startled?.direction ?? 1) * 3.9 * (age < 4 ? 6 * Math.exp(-age * 7.1) - 1.1 * burst : 0);
      const count = i % 4 === 0 ? 3 : 2;
      for (let j = 0; j < count; j++) {
        const s = school + slip - j * 1.27 + 0.29 * Math.sin(moment * 1.5 + j);
        const t =
          h.side * mid.width * 0.26 +
          Math.sin(moment * 0.91 + j * 1.85) * 0.53 +
          j * 0.37 +
          burst * (j - 0.8) * 1.32;
        const p = channelPoint(h.course, s, t),
          water = wetPoint(p.x, p.z);
        if (!water || water.bank < 0.65 || water.course !== h.course) continue;
        this.fish.push({
          ...p,
          key: 'rill_trout--swim',
          width: (j === 0 ? 13 : 9.2) * (1 + 0.13 * noise01(i)),
          frame: Math.floor(time * (burst ? 11 : 6) + j + i),
          flip: (p.tx - p.tz) * alongDirection < 0,
          lift: -1,
          shade: (0.63 - 0.15 * Math.min(1, water.bank / 5)) * daylight(hour),
          reflect: false,
        });
      }
      const fly = channelPoint(
        h.course,
        h.s + 2.8 * Math.sin(time * 0.46 + i),
        h.side * (mid.width * 0.79 + 0.7 * Math.cos(time * 1.15 + i))
      );
      const fright = Math.min(1, Math.max(0, (4.5 - Math.hypot(fly.x - player.x, fly.z - player.z)) / 4.5));
      stamps.push({
        ...fly,
        key: 'rill_dragonfly--hover',
        width: 7.5 + 2 * noise01(i),
        lift: 5 + fright * 10 + 2 * Math.sin(time * 3.1 + i),
        frame: Math.floor(time * 12 + i),
        alpha: daylight(hour),
      });
      if (i % 3 === 0 || h.seed === 70.6) {
        const phase = time * 0.53 + h.seed,
          along = 8.4 * Math.sin(phase),
          side = mid.width * 0.76 * Math.cos(phase);
        const p = channelPoint(h.course, h.s + along, side);
        const dx = 8.4 * Math.cos(phase) * (p.tx - p.tz) + mid.width * 0.76 * Math.sin(phase) * (p.tz + p.tx);
        const scare = Math.max(0, 1 - Math.hypot(p.x - player.x, p.z - player.z) / 5);
        stamps.push({
          ...p,
          key: 'rill_kingfisher--fly',
          width: 15.2,
          flip: dx < 0,
          frame: Math.floor(time * 10 + i),
          lift: 6 + 15 * (0.5 + 0.5 * Math.cos(phase * 2 + i)) + scare * 9,
          alpha: daylight(hour),
        });
      }
    }
    return disturbance.slice(-4);
  }
  drawShoals(ctx: CanvasRenderingContext2D, ground: Ground, ox: number, oy: number, time: number) {
    if (!this.fish.length || !ground.hasWater) return;
    const w = ctx.canvas.width,
      h = ctx.canvas.height;
    for (const c of [this.bed, this.coverage]) {
      if (c.canvas.width !== w || c.canvas.height !== h) {
        c.canvas.width = w;
        c.canvas.height = h;
      }
      c.clearRect(0, 0, w, h);
      c.imageSmoothingEnabled = false;
    }
    for (const fish of this.fish) {
      const p = project(fish.x, fish.z);
      this.bed.globalAlpha = fish.shade;
      this.atlas.draw(
        this.bed,
        fish.key,
        p.x + ox + Math.sin(fish.z * 1.3 - time * 2.4) * 0.71,
        p.y + oy + 1.1,
        fish.width,
        fish.frame,
        fish.flip,
        0.5
      );
    }
    this.bed.globalAlpha = 1;
    ground.drawMask(this.coverage);
    this.bed.globalCompositeOperation = 'destination-in';
    this.bed.drawImage(this.coverage.canvas, 0, 0);
    this.bed.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bed.canvas, 0, 0);
  }
}
