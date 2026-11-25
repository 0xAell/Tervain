import { Atlas } from './atlas';
import { Ground } from './ground';
import { WaterReflections, type Stamp } from './reflections';
import { floatHeight } from './swell';
import { wetPoint } from './water';
import { crossings, deckAt, deckHeight, pickDeck, risePixels } from './crossing';
import { RiverLife } from './riverLife';
import { Architecture } from './architecture';
import { bridgeArt } from './bridgeArt';
import { drawStrip } from './worldArt';
import { worldView } from '../core/game/worldView';
import { FURNITURE, pieceSize } from '../core/world/furniture';
import { fromBuildingLocal } from '../core/world/interiors';
import { AMBIENT_RESIDENTS } from '../core/content/ambientPeople';
import { project, unproject, PROJECTION, groundAt, inBuilding, scenery, type Scenery } from './land';
import { PICKUP_LOCATIONS, type V2 } from '../core/world/layout';
import { hourOfDay } from '../core/game/state';
import type { Valley } from './simulation';

export class Scene {
  readonly context: CanvasRenderingContext2D;
  private ground: Ground;
  readonly water: WaterReflections;
  private architecture: Architecture;
  private riverLife: RiverLife;
  private bridges: Stamp[][];
  private props = new Map<string, Scenery[]>();
  private center = { x: 0, y: 0 };
  private initialized = false;
  private mapBase: HTMLCanvasElement | null = null;
  private lastLight = '';
  renderedFrames = 0;
  lastDraws = 0;
  heroDrawn = false;
  constructor(
    private canvas: HTMLCanvasElement,
    readonly atlas: Atlas
  ) {
    this.context = canvas.getContext('2d', { alpha: false })!;
    this.ground = new Ground(atlas);
    this.water = new WaterReflections(atlas);
    this.architecture = new Architecture(atlas);
    this.riverLife = new RiverLife(atlas);
    this.bridges = crossings.map((b) => bridgeArt(atlas, b));
    for (const item of scenery()) {
      const key = this.bucket(item);
      const bucket = this.props.get(key) ?? [];
      bucket.push(item);
      this.props.set(key, bucket);
    }
  }
  private bucket(p: V2) {
    return Math.floor(p.x / 32) + ',' + Math.floor(p.z / 32);
  }
  private motion(sprite: string, action: string) {
    const clip = sprite + '--' + action;
    return this.atlas.has(clip) ? clip : sprite;
  }
  pointAt(clientX: number, clientY: number): V2 {
    const r = this.canvas.getBoundingClientRect();
    const ground = unproject(
      ((clientX - r.left) / r.width) * this.canvas.width - this.canvas.width / 2 + this.center.x,
      ((clientY - r.top) / r.height) * this.canvas.height - this.canvas.height * 0.54 - 24 + this.center.y
    );
    return pickDeck(ground, PROJECTION);
  }
  resetCamera() {
    this.initialized = false;
    this.water.reset();
    this.riverLife.reset();
  }
  render(valley: Valley, dt: number) {
    const ctx = this.context;
    const zoom = Math.max(1, Math.min(4, Math.round(window.innerHeight / 360)));
    const w = Math.ceil((this.canvas.clientWidth / zoom) * (zoom > 1 ? 1.11 : 1)),
      h = Math.ceil((this.canvas.clientHeight / zoom) * (zoom > 1 ? 1.11 : 1));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    ctx.imageSmoothingEnabled = false;
    const target = project(valley.player.x, valley.player.z);
    const follow = this.initialized ? 1 - Math.exp(-Math.max(dt, 0) * 12) : 1;
    this.center.x += (target.x - this.center.x) * follow;
    this.center.y += (target.y - this.center.y) * follow;
    this.initialized = true;
    const ox = Math.round(w / 2 - this.center.x),
      oy = Math.round(h * 0.54 - this.center.y + 24);
    const corners = [
      unproject(-ox - 100, -oy - 160),
      unproject(w - ox + 100, -oy - 160),
      unproject(-ox - 100, h - oy + 160),
      unproject(w - ox + 100, h - oy + 160),
    ];
    const xmin = Math.min(...corners.map((p) => p.x)),
      xmax = Math.max(...corners.map((p) => p.x));
    const zmin = Math.min(...corners.map((p) => p.z)),
      zmax = Math.max(...corners.map((p) => p.z));
    const stamps: Stamp[] = [];
    this.lastDraws = 0;
    this.heroDrawn = false;
    const playerBuilding = inBuilding(valley.player),
      time = valley.time;
    const view = worldView(valley.game.state),
      hour = hourOfDay(valley.game.state.clock);
    for (const bridge of this.bridges) {
      const image = bridge[0]!.art!;
      if (
        image.left + ox < w &&
        image.left + ox + image.canvas.width >= 0 &&
        image.top + oy < h &&
        image.top + oy + image.canvas.height >= 0
      )
        stamps.push(...bridge);
    }
    if (playerBuilding) {
      for (const piece of FURNITURE) {
        if (piece.room.building !== playerBuilding) continue;
        const pos = fromBuildingLocal(playerBuilding, piece.x, piece.z),
          size = pieceSize(piece.piece);
        const key =
          piece.piece === 'bench'
            ? 'seat'
            : this.atlas.has('furniture_' + piece.piece)
              ? 'furniture_' + piece.piece
              : piece.piece;
        if (this.atlas.has(key))
          stamps.push({ ...pos, key, width: Math.max(6, (size[0] + size[2]) * 6.1), reflect: false });
      }
    }
    for (let i = Math.floor(xmin / 32); i <= Math.floor(xmax / 32); i++)
      for (let j = Math.floor(zmin / 32); j <= Math.floor(zmax / 32); j++) {
        for (const prop of this.props.get(i + ',' + j) ?? []) {
          const screen = project(prop.x, prop.z);
          if (
            screen.x + ox < -110 ||
            screen.x + ox > w + 110 ||
            screen.y + oy < -155 ||
            screen.y + oy > h + 180
          )
            continue;
          if (prop.building && prop.building === playerBuilding) continue;
          if (prop.building) {
            const strips = this.architecture.exterior(prop.building, view.millTurning, Math.floor(time * 6));
            const front = strips.find(
              (q) => target.x >= q.art!.left + q.art!.start && target.x < q.art!.left + q.art!.start + q.width
            );
            const behind =
              front && project(front.x, front.z).y > target.y + 0.8 && target.y > front.art!.top + 10;
            stamps.push(...(behind ? strips.map((q) => ({ ...q, alpha: 0.48 })) : strips));
            continue;
          }
          const overlaps =
            screen.y > target.y &&
            screen.y - target.y < prop.width * 1.15 &&
            Math.abs(screen.x - target.x) < prop.width * 0.43;
          const motion =
            prop.key === 'rill_lilies'
              ? 'bob'
              : ['rill_iris', 'rill_sedge', 'rill_willow', 'rill_alder', 'rill_fern'].includes(prop.key)
                ? 'sway'
                : prop.key === 'fire'
                  ? 'firelight'
                  : prop.key === 'lantern'
                    ? 'light'
                    : ['oak', 'fir', 'birch', 'pine'].includes(prop.key)
                      ? 'sway'
                      : '';
          const key = motion ? this.motion(prop.key, motion) : prop.key;
          stamps.push({
            ...prop,
            reflect: prop.key !== 'rill_lilies',
            anchor: prop.key === 'rill_lilies' ? 0.55 : 1,
            key,
            frame: Math.floor(
              time * (motion === 'sway' ? 3.5 : motion === 'bob' ? 2.5 : 6) +
                (prop.phase ?? Math.abs(prop.z) % 5)
            ),
            alpha: overlaps && prop.width > 27 ? 0.35 : 1,
          });
        }
      }
    for (const p of PICKUP_LOCATIONS)
      if (valley.game.state.locationChanges['pickup:' + p.id] !== 'taken')
        stamps.push({
          ...p,
          key: p.item,
          width: p.id === 'wreck_blade' ? 24 : 14,
          lift: p.id === 'wreck_blade' ? 4 : 1,
        });
    for (const resident of AMBIENT_RESIDENTS) {
      if (resident.sleeps && (hour < 6 || hour >= 21)) continue;
      let elapsed = time % resident.cycle.reduce((n, c) => n + c[1], 0);
      const posture = resident.cycle.find((c) => {
        elapsed -= c[1];
        return elapsed < 0;
      })?.[0];
      stamps.push({
        ...resident,
        key: this.motion(resident.id, posture === 'work' ? 'work' : posture === 'sit' ? 'rest' : 'idle'),
        width: 32,
        frame: Math.floor(time * 4),
      });
    }
    const immersion = (p: V2, swimmer: boolean) => {
      const deck = deckAt(p);
      if (deck) return { submerged: 0, lift: deckHeight(deck.b, deck.s) * risePixels };
      const wet = wetPoint(p.x, p.z);
      if (!wet) return { submerged: 0, lift: 0 };
      const submerged =
        wet.kind === 'sea'
          ? swimmer
            ? 0.46
            : 0.38
          : wet.kind === 'pool'
            ? 0.28
            : wet.kind === 'river'
              ? Math.min(0.31, 0.09 + wet.bank * 0.13)
              : Math.min(0.3, 0.04 + wet.bank * 0.082);
      const lift = wet.course === 'ocean' ? floatHeight(p.x, p.z, wet.bank, time) : 0;
      return { submerged, lift };
    };
    for (const [i, a] of valley.actors.entries()) {
      if ((a.npc && a.dead) || (a.enemy && a.dead)) continue;
      if (a.animal && valley.game.state.hunting[a.animal]?.status === 'skinned') continue;
      const inside = inBuilding(a);
      if (inside && inside !== playerBuilding) continue;
      const key = a.dead
        ? a.key
        : this.motion(a.key, a.attack ? 'attack' : a.move ? 'walk' : (a.posture ?? 'idle'));
      stamps.push({
        ...a,
        ...immersion(a, false),
        key,
        wakeId: a.id,
        moving: a.move,
        frame: a.dead ? 0 : Math.floor(time * (a.attack ? 13 : a.move ? 8 : 4)) + i,
        alpha: a.dead ? 0.55 : 1,
      });
    }
    const hero = 'hero-' + valley.facing;
    const action = valley.strike
      ? valley.swing
      : valley.riding
        ? 'ride'
        : valley.swimming
          ? 'swim'
          : valley.jump
            ? 'jump'
            : valley.guard
              ? 'guard'
              : valley.walk
                ? 'walk'
                : 'idle';
    const cardinal = valley.facing.includes('east')
      ? 'east'
      : valley.facing.includes('west')
        ? 'west'
        : valley.facing;
    const full = hero + '--' + action,
      other = 'hero-' + cardinal + '--' + action;
    const key = this.atlas.has(full) ? full : this.atlas.has(other) ? other : hero;
    const hop = valley.jump > 0 ? Math.sin((Math.PI * valley.jump) / 0.52) * 12 : 0;
    const immersed = immersion(valley.player, valley.swimming);
    stamps.push({
      ...valley.player,
      ...immersed,
      key,
      width: 38,
      hero: true,
      wakeId: 'player',
      moving: valley.walk,
      airborne: hop > 1,
      submerged: immersed.submerged * Math.max(0, 1 - hop / 8),
      frame: valley.strike
        ? Math.floor((valley.swing === 'bow' ? 0.65 - valley.strike : 0.48 - valley.strike) * 12)
        : Math.floor(time * (valley.walk ? 9 : 5)),
      lift: immersed.lift + hop + (valley.riding ? 16 : 0),
    });
    const mapMark = valley.game.state.mapMarker;
    if (mapMark) stamps.push({ ...mapMark, key: 'cursor', width: 15, lift: 3 });
    const fishRipples = this.riverLife.frame(
      valley.player,
      valley.walk,
      time,
      hour,
      view.flow,
      ox,
      oy,
      w,
      h,
      stamps
    );
    stamps.sort((a, b) => a.x + a.z - (b.x + b.z) || (a.hero ? 1 : 0) - (b.hero ? 1 : 0));
    const nearWaterView = stamps.filter((p) => {
      if (!p.wakeId) return false;
      const pos = project(p.x, p.z);
      return pos.x + ox > -48 && pos.x + ox < w + 48 && pos.y + oy > -48 && pos.y + oy < h + 48;
    });
    const ripples = [...fishRipples, ...this.water.advance(nearWaterView, time, view.flow)].slice(-16);
    this.lastDraws = this.ground.draw(ctx, ox, oy, w, h, time, view.flow, hour, ripples);
    if (playerBuilding) {
      const floor = this.architecture.floor(playerBuilding);
      ctx.drawImage(floor.canvas, floor.left + ox, floor.top + oy);
    }
    this.riverLife.drawShoals(ctx, this.ground, ox, oy, time);
    this.water.draw(ctx, this.ground, stamps, ox, oy, time);
    for (const stamp of stamps) {
      if (stamp.art) {
        ctx.globalAlpha = stamp.alpha ?? 1;
        drawStrip(ctx, stamp.art, ox, oy);
        this.lastDraws++;
        continue;
      }
      const s = project(stamp.x, stamp.z);
      const x = s.x + ox,
        y = s.y + oy - (stamp.lift ?? 0);
      if (x < -130 || x > w + 130 || y < -20 || y > h + 180) continue;
      ctx.globalAlpha = stamp.alpha ?? 1;
      this.atlas.draw(
        ctx,
        stamp.key,
        x,
        y,
        stamp.width,
        Math.max(0, stamp.frame ?? 0),
        stamp.flip,
        stamp.anchor ?? 1,
        stamp.submerged
      );
      this.lastDraws++;
      if (stamp.hero) this.heroDrawn = true;
    }
    ctx.globalAlpha = 1;

    const light =
      hour < 5.5 || hour > 20.5
        ? 'brightness(.56) saturate(.75)'
        : hour < 7 || hour > 18
          ? 'brightness(.82) sepia(.13)'
          : 'none';
    this.renderedFrames++;
    if (light !== this.lastLight) {
      this.canvas.style.filter = light;
      this.lastLight = light;
    }
  }
  drawMap(canvas: HTMLCanvasElement, valley: Valley) {
    const w = canvas.width,
      h = canvas.height,
      ctx = canvas.getContext('2d')!;
    if (!this.mapBase) {
      const base = document.createElement('canvas');
      base.width = w;
      base.height = h;
      const c = base.getContext('2d')!;
      c.imageSmoothingEnabled = false;
      for (let y = 0; y < h; y += 3)
        for (let x = 0; x < w; x += 3) {
          const g = groundAt((x / w) * 580 - 380, (y / h) * 340 - 170);
          this.atlas.draw(c, g, x + 1.5, y + 2, 8, 0, false, 0.5);
        }
      this.mapBase = base;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapBase, 0, 0);
    const plot = (p: V2, key: string, size: number) =>
      this.atlas.draw(ctx, key, ((p.x + 380) / 580) * w, ((p.z + 170) / 340) * h, size, 0, false, 0.75);
    if (valley.game.state.mapMarker) plot(valley.game.state.mapMarker, 'cursor', 13);
    plot(valley.player, 'hero-south', 19);
  }
}
