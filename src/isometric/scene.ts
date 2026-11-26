import { drawProp } from './propArt';
import { sceneryProp } from './propCatalogue';
import { buildSwordPoses, drawSwordSweep, heroPose } from './heroPose';
import { terrainHeight, groundProject, pickSurface, supportHeight } from './relief';
import { Sunlight } from './sunlight';
import { SkyLighting, skyLight, type LightSource } from './skyLight';
import { doorOpen, frontDoor } from './doorways';
import { drawFootprints, drawContact, drawDamageLabels, drawEnemyWarning, drawFireAir } from './fieldEffects';
import type { BuildingSpec } from '../core/world/layout';
import { CONTACT_TIME, arrowHeight, enemyContactRemaining, enemySwingProgress, ENEMY_SWING_TIME, SWING_TIME } from './fieldcraft';
import { isHuntableAnimalId } from '../core/game/hunting';
import { ENEMY_ARCHETYPES } from '../core/content/enemies';
import { Atlas } from './atlas';
import { Ground } from './ground';
import { WaterReflections, type Stamp } from './reflections';
import { floatHeight } from './swell';
import { wetPoint } from './water';
import { drawWaterSpray } from './waterImpact';
import type { PropView } from './propPhysics';
import { crossings, deckAt } from './crossing';
import { RiverLife } from './riverLife';
import { Architecture } from './architecture';
import { isHegemonyStandard } from './hegemony';
import { chartPoint, paintValeMap } from './valeMap';
import { bridgeArt } from './bridgeArt';
import { drawStrip } from './worldArt';
import { worldView } from '../core/game/worldView';
import { RoomView } from './roomView';
import { landingHalfWidth } from './roomPlans';
import { drawFocus, drawWaylight, pickRegion, type PickRegion } from './entryCues';
import { targetDistance } from './roomTargets';
import { AMBIENT_RESIDENTS } from '../core/content/ambientPeople';
import { project, unproject, inBuilding, scenery, type Scenery } from './land';
import { COOKFIRES, PICKUP_LOCATIONS, type V2 } from '../core/world/layout';
import { hourOfDay } from '../core/game/state';
import { facesLeft, type Valley } from './simulation';
import { isTree } from './treeHabitat';
import { Meadow } from './meadow';
import { buildWindArt, windFrame, windPhase, type WindSprite } from './wind';

export class Scene {
  readonly context: CanvasRenderingContext2D;
  private ground: Ground;
  private sun: Sunlight;
  private sky: SkyLighting;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  readonly water: WaterReflections;
  private architecture: Architecture;
  private riverLife: RiverLife;
  private meadow: Meadow;
  private windSprites: Map<string, WindSprite>;
  private bridges: Stamp[][];
  private props = new Map<string, Scenery[]>();
  private rooms: RoomView;
  private indoors = false;
  private regions: PickRegion[] = [];
  private aimRegions: { x: number; y: number; w: number; h: number; at: V2; id: string; flip: boolean }[] =
    [];
  aimAt(clientX: number, clientY: number) {
    const p = this.pixel(clientX, clientY);
    for (let i = this.aimRegions.length - 1; i >= 0; i--) {
      const r = this.aimRegions[i]!;
      const x = (p.x - r.x) / r.w,
        y = (p.y - r.y) / r.h;
      if (Math.abs(x) <= 0.48 && y >= -0.92 && y <= 0.04)
        return { at: r.at, head: y < -0.4 && (r.flip ? -x : x) > 0.17 ? r.id : undefined };
    }
    return { at: this.pointAt(clientX, clientY), head: undefined };
  }
  hoveredProp?: string;
  hoverLabel = '';
  private pointer?: { x: number; y: number };
  private center = { x: 0, y: 0 };
  private lead = { x: 0, y: 0 };
  private initialized = false;
  private mapBase: HTMLCanvasElement | null = null;
  renderedFrames = 0;
  lastDraws = 0;
  heroDrawn = false;
  constructor(
    private canvas: HTMLCanvasElement,
    readonly atlas: Atlas
  ) {
    this.context = canvas.getContext('2d', { alpha: false })!;
    this.sky = new SkyLighting(atlas);
    buildSwordPoses(atlas);
    const wind = buildWindArt(atlas);
    this.windSprites = wind.sprites;
    this.meadow = new Meadow(atlas, wind);
    this.rooms = new RoomView(atlas);
    this.ground = new Ground(atlas);
    this.sun = new Sunlight(atlas);
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
  private pixel(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * this.canvas.width,
      y: ((clientY - r.top) / r.height) * this.canvas.height,
    };
  }
  targetAt(clientX: number, clientY: number) {
    const p = this.pixel(clientX, clientY);
    return pickRegion(this.regions, p.x, p.y)?.target;
  }
  hover(clientX?: number, clientY?: number) {
    this.pointer = clientX === undefined || clientY === undefined ? undefined : { x: clientX, y: clientY };
  }
  private focus() {
    const point = this.pointer && this.pixel(this.pointer.x, this.pointer.y);
    const selected = point && pickRegion(this.regions, point.x, point.y);
    this.hoveredProp = selected?.target.prop;
    this.hoverLabel = selected?.target.label ?? '';
    this.canvas.style.cursor = selected ? 'pointer' : '';
    if (selected) drawFocus(this.context, selected);
  }
  pointAt(clientX: number, clientY: number): V2 {
    const r = this.canvas.getBoundingClientRect();
    if (this.indoors) {
      const p = this.pixel(clientX, clientY);
      return this.rooms.point(p.x, p.y);
    }
    const sx =
      ((clientX - r.left) / r.width) * this.canvas.width - Math.round(this.canvas.width / 2 - this.center.x);
    const sy =
      ((clientY - r.top) / r.height) * this.canvas.height -
      Math.round(this.canvas.height * 0.54 - this.center.y + 24);
    return pickSurface(sx, sy);
  }
  resetCamera() {
    this.initialized = false;
    this.lead.x = this.lead.y = 0;
    this.regions.length = 0;
    this.rooms.leave();
    this.water.reset();
    this.riverLife.reset();
  }
  render(valley: Valley, dt: number) {
    const ctx = this.context;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(1, Math.round((this.canvas.clientHeight * dpr) / 368)) / dpr;
    const w = Math.max(1, Math.round(this.canvas.clientWidth / scale)),
      h = Math.max(1, Math.round(this.canvas.clientHeight / scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    ctx.imageSmoothingEnabled = false;
    this.regions.length = 0;
    this.aimRegions.length = 0;
    if (valley.room) {
      this.indoors = true;
      const frame = this.rooms.draw(ctx, valley, this.regions, dt);
      this.heroDrawn = frame.heroDrawn;
      this.lastDraws = frame.draws;
      this.renderedFrames++;
      this.focus();
      return;
    }
    if (this.indoors) {
      this.indoors = false;
      this.resetCamera();
    }
    const target = project(valley.player.x, valley.player.z, supportHeight(valley.player));
    const dir = valley.bow?.direction ?? { x: Math.sin(valley.player.yaw), z: Math.cos(valley.player.yaw) };
    const ahead = valley.bow && !this.reducedMotion.matches ? 3.8 : 0;
    const gaze = project(dir.x * ahead, dir.z * ahead);
    const elapsed = Math.max(dt, 0);
    const ease = 1 - Math.exp(-elapsed * 8);
    this.lead.x += (gaze.x - this.lead.x) * ease;
    this.lead.y += (gaze.y - this.lead.y) * ease;
    // Running keeps the wanderer centered. Frame-rate-independent damping absorbs turns and sudden grade changes.
    const across = this.initialized ? 1 - Math.exp(-elapsed * 26) : 1;
    const vertical = this.initialized ? 1 - Math.exp(-elapsed * 18) : 1;
    this.center.x += (target.x + this.lead.x - this.center.x) * across;
    this.center.y += (target.y + this.lead.y - this.center.y) * vertical;
    this.initialized = true;
    const ox = Math.round(w / 2 - this.center.x),
      oy = Math.round(h * 0.54 - this.center.y + 24);
    const corners = [
      unproject(-ox - 100, -oy - 160),
      unproject(w - ox + 100, -oy - 160),
      unproject(-ox - 100, h - oy + 250),
      unproject(w - ox + 100, h - oy + 250),
    ];
    const xmin = Math.min(...corners.map((p) => p.x)),
      xmax = Math.max(...corners.map((p) => p.x));
    const zmin = Math.min(...corners.map((p) => p.z)),
      zmax = Math.max(...corners.map((p) => p.z));
    const stamps: Stamp[] = [];
    const buildings: BuildingSpec[] = [];
    this.lastDraws = 0;
    this.heroDrawn = false;
    const time = valley.time;
    const subject = valley.displayPosition;
    const focusAt = (p: V2) => ({ ...groundProject(p), depth: project(p.x, p.z).y });
    const focal = focusAt(subject);
    const object = valley.activity?.target.at;
    const focusPoints = object ? [focal, focusAt(object)] : [focal];
    const fieldwork = !!valley.activity || !!valley.bow;
    const view = worldView(valley.game.state),
      hour = hourOfDay(valley.game.state.clock);
    const sky = skyLight(hour),
      lights: LightSource[] = [];
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
    for (let i = Math.floor(xmin / 32); i <= Math.floor(xmax / 32); i++)
      for (let j = Math.floor(zmin / 32); j <= Math.floor(zmax / 32); j++) {
        for (const prop of this.props.get(i + ',' + j) ?? []) {
          if (valley.props && sceneryProp(prop)) continue;
          const screen = groundProject(prop);
          if (
            screen.x + ox < -110 ||
            screen.x + ox > w + 110 ||
            screen.y + oy < -155 ||
            screen.y + oy > h + 180
          )
            continue;
          if (prop.building) {
            buildings.push(prop.building);
            const lamps =
              sky.night > 0.002 && !valley.game.state.facts['room_dim:' + prop.building.id + '/ground'];
            const windowsLit = lamps && sky.night > 0.24 + Math.abs(Math.sin(prop.x * 3 + prop.z)) * 0.23;
            const strips = this.architecture.exterior(
              prop.building,
              view.millTurning,
              Math.floor(time * 6),
              windowsLit
            );
            if (lamps) {
              const door = frontDoor(prop.building);
              if (doorOpen(door, valley.game.state))
                lights.push({ ...groundProject(door.outside), kind: 'door' });
            }
            const behind = focusPoints.some((p) =>
              strips.some((q) => {
                const art = q.art!,
                  left = art.left + art.start;
                return (
                  p.x + 12 >= left &&
                  p.x - 12 < left + q.width &&
                  project(q.x, q.z).y > p.depth - 0.5 &&
                  p.y > art.top + 3 &&
                  p.y - 23 < art.top + art.canvas.height
                );
              })
            );
            stamps.push(...(behind ? strips.map((q) => ({ ...q, alpha: fieldwork ? 0.1 : 0.35 })) : strips));
            continue;
          }
          const furniture = prop.key === 'seat' || prop.key === 'fire';
          if (sky.night > 0.002 && (prop.key === 'fire' || prop.key === 'lantern'))
            lights.push({ ...screen, kind: prop.key });
          const standard = isHegemonyStandard(prop.key);
          const wind = this.windSprites.get(prop.key);
          const overlaps =
            !furniture &&
            focusPoints.some(
              (p) =>
                screen.y >= p.y - 0.6 &&
                Math.abs(screen.x - p.x) < prop.width * 0.47 + 10 &&
                screen.y - p.y < this.atlas.height(prop.key, prop.width) + 16
            );
          const motion =
            prop.key === 'rill_lilies'
              ? 'bob'
              : this.atlas.has(prop.key + '--sway')
                ? 'sway'
                : prop.key === 'fire'
                  ? 'firelight'
                  : prop.key === 'lantern'
                    ? 'light'
                    : '';
          const key =
            prop.paidKey && valley.game.state.facts.wagon_iron_paid
              ? prop.paidKey
              : (wind?.key ?? (motion ? this.motion(prop.key, motion) : prop.key));
          const offset = prop.phase ?? Math.abs(prop.z) % 5;
          const frame =
            standard || wind || motion === 'sway'
              ? windFrame(
                  windPhase(prop.x, prop.z, time, isTree(prop.key) ? 0.61 : standard ? 1.12 : 1),
                  this.atlas.frameCount(key),
                  offset
                )
              : Math.floor(time * (motion === 'bob' ? 2.5 : 6) + offset);
          stamps.push({
            ...prop,
            sway: valley.props?.sway(prop),
            reflect: prop.key !== 'rill_lilies',
            anchor: prop.key === 'rill_lilies' ? 0.55 : 1,
            key,
            width: prop.width * (wind?.widthScale ?? 1),
            frame,
            alpha: overlaps && (standard || prop.width > 27) ? (fieldwork ? 0.08 : 0.26) : 1,
          });
        }
      }
    for (const fire of COOKFIRES)
      stamps.push({
        ...fire,
        x: fire.x + 0.06,
        z: fire.z + 0.07,
        key: 'furniture_cauldron',
        width: 20,
        lift: 5,
      });
    for (const p of PICKUP_LOCATIONS) {
      if (valley.game.state.locationChanges['pickup:' + p.id] === 'taken') continue;
      const herb = p.item === 'healing_herb' ? this.windSprites.get('field_herbs') : undefined;
      const key = herb?.key ?? (p.item === 'field_mushroom' ? 'field_caps' : p.item);
      const width = p.item === 'shore_apple' ? 8 : p.item === 'field_mushroom' ? 16 : 14;
      stamps.push({
        ...p,
        key,
        width: p.id === 'wreck_blade' ? 24 : herb ? 16 * herb.widthScale : width,
        frame: herb ? windFrame(windPhase(p.x, p.z, time), this.atlas.frameCount(key)) : 0,
        lift: p.id === 'wreck_blade' ? 4 : 1,
      });
    }
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
      if (deck) return { submerged: 0, lift: 0 };
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
      if (a.npc && a.dead) continue;
      const defeat = a.enemy && a.dead
        ? valley.contacts.find((hit) => hit.defeated && hit.actorId === a.id && time - hit.born < CONTACT_TIME)
        : undefined;
      if (a.enemy && a.dead && !defeat) continue;
      const fall = defeat ? Math.min(1, (time - defeat.born) / CONTACT_TIME) : 0;
      if (a.animal && valley.game.state.hunting[a.animal]?.status === 'skinned') continue;
      const inside = inBuilding(a);
      if (inside) continue;
      const pet = valley.activity?.kind === 'pet' && valley.activity.target.animal === a;
      const key = this.motion(
        a.key,
        a.dead ? 'down' : pet ? 'affection' : a.attack ? 'attack' : a.move ? 'walk' : (a.posture ?? 'idle')
      );
      if (!a.dead && (a.enemy || isHuntableAnimalId(a.animal))) {
        const at = project(a.x, a.z, supportHeight(a));
        at.y -= immersion(a, false).lift;
        this.aimRegions.push({
          x: at.x + ox,
          y: at.y + oy,
          w: a.width,
          h: this.atlas.height(key, a.width),
          at: a,
          id: a.id,
          flip: a.flip !== facesLeft(a.key),
        });
      }
      stamps.push({
        ...a,
        ...immersion(a, false),
        key,
        alpha: defeat ? 1 - fall * fall : undefined,
        fall: defeat && !this.reducedMotion.matches
          ? (Math.sign(project(defeat.dx, defeat.dz).x) || 1) * fall ** 1.6 * 1.13
          : undefined,
        reflect: defeat ? false : undefined,
        wakeId: a.id,
        moving: a.move,
        frame: a.dead
          ? 0
          : pet
            ? Math.floor(valley.activity!.elapsed * 7)
            : a.attack
              ? Math.min(
                  this.atlas.frameCount(key) - 1,
                  Math.floor(enemySwingProgress(a.attack, a.key === 'thornback') * this.atlas.frameCount(key))
                )
              : Math.floor(time * (a.move ? 8 : 4)) + i,
      });
    }
    const floating: PropView[] = [];
    if (valley.props)
      for (const v of valley.props.objects) {
        const base = v.y - v.spec.height / 2,
          at = project(v.x, v.z, base);
        if (at.x + ox < -64 || at.x + ox > w + 64 || at.y + oy < -36 || at.y + oy > h + 70) continue;
        if (v.wet >= 0.1 && v.wet <= 0.89) floating.push(v);
        stamps.push({
          x: v.x,
          z: v.z,
          elevation: base,
          key: v.spec.key,
          width: v.spec.width,
          prop: v,
          moving: v.moving,
          submerged: v.wet * 0.72,
          wakeId: v.wet > 0.02 || v.moving ? 'cargo/' + v.spec.id : undefined,
        });
      }
    const pose = heroPose(valley, this.atlas, 38);
    const hop = valley.hop * 8;
    const immersed = immersion(valley.player, valley.swimming);
    stamps.push({
      ...valley.displayPosition,
      ...immersed,
      ...pose,
      hero: true,
      wakeId: 'player',
      moving: valley.walk,
      airborne: hop > 1,
      submerged: immersed.submerged * Math.max(0, 1 - hop / 8),
      lift: immersed.lift + hop + valley.standingLift * 8 + (valley.riding ? 16 : 0),
    });
    for (const arrow of valley.arrows) {
      const elevation = arrowHeight(arrow, arrow.travelled);
      const dir = project(
        arrow.direction.x, arrow.direction.z, arrowHeight(arrow, arrow.travelled + 1) - elevation
      );
      const fromBow = project(
        arrow.direction.x * arrow.travelled, arrow.direction.z * arrow.travelled, elevation - arrowHeight(arrow, 0)
      );
      stamps.push({
        ...arrow,
        key: 'field_arrow',
        width: 23,
        arrow: { angle: Math.atan2(dir.y, dir.x), exposed: Math.hypot(fromBow.x, fromBow.y) },
        reflect: false,
        elevation,
      });
    }
    for (const contact of valley.contacts) {
      if (time - contact.born >= CONTACT_TIME) continue;
      stamps.push({
        x: contact.x,
        z: contact.z,
        key: 'field_arrow',
        width: 1,
        elevation: contact.height,
        contact,
        reflect: false,
      });
    }
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
    for (const stamp of stamps)
      if (!stamp.art && stamp.elevation === undefined)
        stamp.elevation = stamp.wakeId ? supportHeight(stamp) : terrainHeight(stamp.x, stamp.z);
    stamps.sort(
      (a, b) =>
        a.x + a.z + (a.prop ? a.prop.y * 0.45 : 0) - (b.x + b.z + (b.prop ? b.prop.y * 0.45 : 0)) ||
        (a.hero ? 1 : 0) - (b.hero ? 1 : 0)
    );
    const nearWaterView = stamps.filter((p) => {
      if (!p.wakeId) return false;
      const pos = project(p.x, p.z, p.elevation);
      return pos.x + ox > -48 && pos.x + ox < w + 48 && pos.y + oy > -48 && pos.y + oy < h + 48;
    });
    const ripples = [
      ...fishRipples,
      ...this.water.advance(nearWaterView, time, view.flow),
      ...(valley.props?.waterRipples() ?? []),
    ].slice(-16);
    this.lastDraws = this.ground.draw(ctx, ox, oy, w, h, time, view.flow, hour, ripples, floating);
    drawFootprints(ctx, valley.gait.prints, ox, oy, time, this.reducedMotion.matches);
    this.lastDraws += this.meadow.draw(ctx, this.ground, ox, oy, time, { xmin, xmax, zmin, zmax });
    this.riverLife.drawShoals(ctx, this.ground, ox, oy, time);
    this.water.draw(ctx, this.ground, stamps, ox, oy, time);
    this.sun.draw(ctx, stamps, buildings, ox, oy, hour);
    for (const enemy of valley.actors) {
      if (!enemy.enemy || enemy.dead || !enemy.attack || inBuilding(enemy)) continue;
      const def = ENEMY_ARCHETYPES[enemy.key === 'thornback' ? 'thornback' : 'bandit'];
      const contact = enemyContactRemaining(def.heavy);
      if (enemy.attack <= contact) continue;
      const at = project(enemy.x, enemy.z, supportHeight(enemy));
      if (at.x + ox < -40 || at.x + ox > w + 40 || at.y + oy < -40 || at.y + oy > h + 40) continue;
      const progress = (ENEMY_SWING_TIME - enemy.attack) / (ENEMY_SWING_TIME - contact);
      drawEnemyWarning(ctx, at.x + ox, at.y + oy, def.reach + 0.5, progress, def.heavy, this.reducedMotion.matches);
    }
    if (this.ground.hasWater && this.ground.waterImpacts.length)
      drawWaterSpray(ctx, this.ground.waterImpacts, ox, oy);
    for (const stamp of stamps) {
      if (stamp.art) {
        ctx.globalAlpha = stamp.alpha ?? 1;
        drawStrip(ctx, stamp.art, ox, oy);
        this.lastDraws++;
        continue;
      }
      const s = project(stamp.x, stamp.z, stamp.elevation);
      const x = s.x + ox,
        y = s.y + oy - (stamp.lift ?? 0);
      if (x < -130 || x > w + 130 || y < -20 || y > h + 180) continue;
      ctx.globalAlpha = stamp.alpha ?? 1;
      if (stamp.contact) {
        drawContact(ctx, stamp.contact, time, ox, oy, this.reducedMotion.matches);
        continue;
      }
      if (stamp.arrow) {
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(stamp.arrow.angle);
        // Reveal the shaft as it clears the bow, keeping the nock out of the hero's back.
        if (stamp.arrow.exposed < stamp.width) {
          ctx.beginPath();
          ctx.rect(-stamp.arrow.exposed, -stamp.width / 2, stamp.arrow.exposed, stamp.width);
          ctx.clip();
        }
        // The point at the right edge of the arrow sprite is the swept collision position.
        this.atlas.draw(ctx, stamp.key, -stamp.width / 2, 0, stamp.width, 0, false, 0.5);
        ctx.restore();
        this.lastDraws++;
        continue;
      }
      if (stamp.wakeId && deckAt(stamp)) {
        ctx.fillStyle = 'rgba(41,38,42,.30)';
        ctx.beginPath();
        ctx.ellipse(
          s.x + ox,
          s.y + oy,
          stamp.width * 0.18,
          Math.max(1, stamp.width * 0.058),
          0,
          0,
          2 * Math.PI
        );
        ctx.fill();
      }
      const spriteHeight = this.atlas.height(stamp.key, stamp.width, stamp.frame);
      const clip = this.ground.clipUpright(
        ctx,
        x,
        y + spriteHeight * (1 - (stamp.anchor ?? 1)),
        stamp.width,
        spriteHeight,
        project(stamp.x, stamp.z).y + Math.max(4, stamp.width * 0.09),
        ox,
        oy
      );
      if (stamp.prop) {
        const submerged = stamp.prop.wet;
        if (submerged > 0.04) {
          const surfaceY = project(stamp.x, stamp.z).y + oy;
          ctx.save();
          ctx.globalAlpha *= Math.max(0.1, 0.44 - submerged * 0.31);
          drawProp(ctx, this.atlas, stamp.prop, x, y, stamp.width);
          ctx.restore();
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - stamp.width * 2, surfaceY - stamp.width * 4, stamp.width * 4, stamp.width * 4);
          ctx.clip();
        }
        drawProp(ctx, this.atlas, stamp.prop, x, y, stamp.width);
        if (submerged > 0.04) ctx.restore();
      } else {
        if (stamp.sway || stamp.fall) {
          ctx.save();
          ctx.translate(x, y);
          if (stamp.fall) ctx.rotate(stamp.fall);
          if (stamp.sway) ctx.transform(1, 0, stamp.sway * 0.15, 1, 0, 0);
          ctx.translate(-x, -y);
        }
        if (stamp.hero && valley.strike && valley.swordSwing && !this.reducedMotion.matches)
          drawSwordSweep(ctx, x, y, stamp.width, valley.facing, SWING_TIME - valley.strike);
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
        if (stamp.key.startsWith('fire--') && !this.reducedMotion.matches)
          drawFireAir(ctx, x, y, time, stamp.x, stamp.z, sky.night);
        if (stamp.sway || stamp.fall) ctx.restore();
      }
      if (clip) ctx.restore();
      this.lastDraws++;
      if (stamp.hero) this.heroDrawn = true;
    }
    ctx.globalAlpha = 1;
    this.sky.draw(ctx, ox, oy, time, sky, lights, stamps);
    drawDamageLabels(ctx, valley.contacts, time, ox, oy, this.reducedMotion.matches);

    const nearestProp = valley.props?.nearby()?.spec.id;
    for (const target of valley.targets()) {
      const door = target.door;
      if (!door) {
        const prop = target.prop ? valley.props?.object(target.prop) : undefined;
        const at = prop ? project(prop.x, prop.z, prop.y - prop.spec.height / 2) : groundProject(target.at),
          x = at.x + ox,
          base = at.y + oy;
        if (x < -30 || x > w + 30 || base < 0 || base > h + 45) continue;
        const width =
          prop?.spec.width ??
          target.animal?.width ??
          (target.field === 'seat' ? 34 : target.field === 'fire' ? 24 : 20);
        const high = prop
          ? this.atlas.height(prop.spec.key, width)
          : target.animal
            ? this.atlas.height(target.animal.key, width)
            : target.field === 'seat'
              ? 19
              : target.field === 'fire'
                ? 30
                : 17;
        this.regions.push({ id: target.id, x, y: base - high * 0.47, w: width, h: high + 4, target });
        if (
          (!target.prop || target.prop === nearestProp) &&
          !valley.activity &&
          !valley.bow &&
          targetDistance(target, valley.player) <= target.reach
        ) {
          ctx.fillStyle = '#233c39';
          ctx.fillRect(Math.round(x) - 2, Math.round(base - high) - 5, 5, 5);
          ctx.fillStyle = '#b2efd5';
          ctx.fillRect(Math.round(x), Math.round(base - high) - 5, 1, 5);
          ctx.fillRect(Math.round(x) - 2, Math.round(base - high) - 3, 5, 1);
        }
        continue;
      }
      const s = groundProject({
        x: door.sill.x * 0.68 + door.outside.x * 0.32,
        z: door.sill.z * 0.68 + door.outside.z * 0.32,
      });
      const x = s.x + ox,
        y = s.y + oy;
      if (x < -16 || x > w + 16 || y < -12 || y > h + 20) continue;
      const near = targetDistance(target, valley.player) <= target.reach;
      drawWaylight(ctx, this.atlas, x, y, time, near, target.locked);
      this.regions.push({ id: target.id, x, y: y - 6, w: 24, h: 26, target });
    }
    const guide = valley.bowGuide();
    if (guide) {
      const { arrow, distance } = guide;
      const at = (d: number) => project(
        arrow.x + arrow.direction.x * d,
        arrow.z + arrow.direction.z * d,
        arrowHeight(arrow, d)
      );
      const held = valley.bow?.phase === 'hold';
      ctx.fillStyle = held ? '#ffe3a1' : '#cfd5b8';
      ctx.globalAlpha = held ? 0.66 : 0.4;
      for (let d = 2.5; d < distance - 1; d += 2.5) {
        const dot = at(d);
        ctx.fillRect(Math.round(dot.x + ox), Math.round(dot.y + oy), 2, 1);
      }
      ctx.globalAlpha = 1;
      const tip = at(distance);
      const x = Math.round(tip.x + ox), y = Math.round(tip.y + oy);
      const spread = held ? 3 : 5;
      ctx.fillRect(x - spread - 2, y, 3, 1);
      ctx.fillRect(x + spread, y, 3, 1);
      ctx.fillRect(x, y - spread - 2, 1, 3);
      ctx.fillRect(x, y + spread, 1, 3);
    }
    this.focus();
    this.renderedFrames++;
  }
  drawFloorMap(canvas: HTMLCanvasElement, valley: Valley) {
    const plan = valley.room!;
    const ctx = canvas.getContext('2d')!,
      { width: w, height: h } = canvas;
    const [left, hall, right] = plan.rooms;
    const scale = Math.min((w - 28) / (right.x1 - left.x0), (h - 44) / (hall.z1 - hall.z0));
    const px = (x: number) => w / 2 + (x - (left.x0 + right.x1) / 2) * scale,
      py = (z: number) => h / 2 + z * scale;
    ctx.fillStyle = '#253030';
    ctx.fillRect(0, 0, w, h);
    const walls = new Path2D();
    walls.rect(0, 0, w, h);
    for (const arch of plan.arches)
      walls.rect(px(arch.x) - 2, py(arch.z - landingHalfWidth), 4, 2 * landingHalfWidth * scale);
    for (const [i, r] of plan.rooms.entries()) {
      ctx.fillStyle = i === 1 ? '#776042' : '#5a5646';
      ctx.strokeStyle = '#d6b784';
      ctx.lineWidth = 2;
      ctx.fillRect(px(r.x0), py(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      ctx.save();
      ctx.clip(walls, 'evenodd');
      ctx.strokeRect(px(r.x0), py(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = false;
    for (const f of plan.fixtures) {
      ctx.fillStyle = f.use ? '#9bb9a4' : '#847861';
      ctx.fillRect(px(f.x - f.hx), py(f.z - f.hz), f.hx * 2 * scale, f.hz * 2 * scale);
    }
    for (const room of plan.rooms) {
      const cx = px((room.x0 + room.x1) / 2),
        y = py(room.z0) + 13;
      ctx.font = '13px Vale, serif';
      ctx.textAlign = 'center';
      const roomWidth = (room.x1 - room.x0) * scale - 8;
      const width = Math.min(roomWidth, ctx.measureText(room.name).width + 8);
      ctx.fillStyle = 'rgba(36,35,32,.82)';
      ctx.fillRect(cx - width / 2, y - 10, width, 14);
      ctx.fillStyle = '#f5dfac';
      ctx.fillText(room.name, cx, y, roomWidth - 5);
    }
    for (const p of plan.passages) {
      const x = px(p.x),
        y = py(p.z);
      ctx.fillStyle = '#ffe0a2';
      this.atlas.draw(ctx, 'room_waylight', x - 7, y + 2, 8, 0, false, 0.6);
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.kind === 'up' ? '↑' : p.kind === 'down' ? '↓' : '◆', x, y + 5);
    }
    const pos = valley.position;
    this.atlas.draw(ctx, 'hero-south', px(pos.x), py(pos.z), 24, 0, false, 0.75);
  }
  drawMap(canvas: HTMLCanvasElement, valley: Valley) {
    const w = canvas.width,
      h = canvas.height,
      ctx = canvas.getContext('2d')!;
    if (this.mapBase?.width !== w || this.mapBase.height !== h) this.mapBase = paintValeMap(w, h, this.atlas);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapBase, 0, 0);
    const plot = (p: V2, key: string, size: number) => {
      const at = chartPoint(p, w, h);
      this.atlas.draw(ctx, key, at.x, at.y, size, 0, false, 0.75);
    };
    if (valley.game.state.mapMarker) plot(valley.game.state.mapMarker, 'cursor', 13);
    plot(valley.player, 'hero-south', 19);
  }
}
