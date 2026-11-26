import { followAxis } from './camera';
import { pixelLine, pixelPool } from './pixelInk';
import { journeyLead } from '../core/game/valeJourney';
import { buildFieldstones } from './fieldstones';
import { drawProp, propSprite } from './propArt';
import { sceneryProp } from './propCatalogue';
import { buildSwordPoses, drawSwordSweep, heroPose } from './heroPose';
import { terrainHeight, groundProject, pickSurface, supportHeight } from './relief';
import { Sunlight } from './sunlight';
import { SkyLighting, skyLight, type LightSource } from './skyLight';
import { doorOpen, frontDoor } from './doorways';
import { drawFootprints, drawContact, drawDamageLabels, drawEnemyWarning, drawFireAir, drawBootDust } from './fieldEffects';
import type { BuildingSpec } from '../core/world/layout';
import { CONTACT_TIME, DEFEAT_TIME, arrowHeight, meleeWarning, enemySwingProgress, SWING_TIME } from './fieldcraft';
import { isHuntableAnimalId } from '../core/game/hunting';
import { ENEMY_ARCHETYPES } from '../core/content/enemies';
import { Atlas } from './atlas';
import { Ground } from './ground';
import { HeroReveal } from './heroReveal';
import { WaterReflections, type Stamp } from './reflections';
import { floatHeight } from './swell';
import { waterline, wetPoint } from './water';
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
import { cuePass, spriteDepth, drawReachMark, drawFocus, drawThreshold, pickRegion, type DepthCue, type PickRegion } from './entryCues';
import { targetDistance } from './roomTargets';
import { AMBIENT_RESIDENTS } from '../core/content/ambientPeople';
import { distance, project, unproject, inBuilding, scenery, type Scenery } from './land';
import { PICKUP_LOCATIONS, type V2 } from '../core/world/layout';
import { facesLeft, type Valley } from './simulation';
import { isTree } from './treeHabitat';
import { strandResident, buildResidentWalks } from './strandResidents';
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
  private reveal = new HeroReveal();
  private opponentReveal = new HeroReveal('rgba(88,54,46,.82)', '#f6c096', 0.63);
  private bounds = new WeakMap<Scenery, { left: number; top: number; right: number; bottom: number }>();
  private reach = { across: 100, above: 250, below: 160 };
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
  private lastFocus = { x: 0, y: 0 };
  private kick = { x: 0, y: 0 };
  private ambientOffset = 0;
  private lastRoom?: string;
  private curtain?: HTMLElement;
  private initialized = false;
  private pixelScale = 1;
  private viewWidth = 0;
  private viewHeight = 0;
  private density = 0;
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
    buildFieldstones(atlas);
    buildResidentWalks(atlas);
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
      const flat = project(item.x, item.z), foot = project(item.x, item.z, item.elevation ?? terrainHeight(item.x, item.z));
      const key = this.bucket(item);
      const sprite = item.sprite ?? item.key;
      const high = this.atlas.height(sprite, item.width);
      // Keep receivers in view even when their caster or the foot of its sprite has left the screen.
      const halo = Math.max(3, high * 1.7, item.key === 'fire' || item.key === 'lantern' ? 60 : 0);
      const top = foot.y - (item.lift ?? 0);
      const bounds = {
        left: foot.x - item.width / 2 - halo, right: foot.x + item.width / 2 + halo,
        top: top - high - halo, bottom: Math.max(foot.y + halo, flat.y + high + (item.lift ?? 0)),
      };
      if (item.building) {
        const face = this.architecture.exterior(item.building, false, 0)[0]!.art!;
        for (const image of [face, face.mirror!]) {
          bounds.left = Math.min(bounds.left, image.left);
          bounds.top = Math.min(bounds.top, image.top);
          bounds.right = Math.max(bounds.right, image.left + image.canvas.width);
          bounds.bottom = Math.max(bounds.bottom, image.top + image.canvas.height);
        }
      }
      this.bounds.set(item, bounds);
      this.reach.across = Math.max(this.reach.across, flat.x - bounds.left, bounds.right - flat.x);
      this.reach.above = Math.max(this.reach.above, flat.y - bounds.top);
      this.reach.below = Math.max(this.reach.below, bounds.bottom - flat.y);
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
    const p = this.pixel(clientX, clientY);
    if (this.indoors) return this.rooms.point(p.x, p.y);
    const sx = p.x - Math.round(this.canvas.width / 2 - this.center.x + this.kick.x);
    const sy = p.y - Math.round(this.canvas.height * 0.54 - this.center.y + 24 + this.kick.y);
    return pickSurface(sx, sy);
  }
  resetCamera() {
    this.initialized = false;
    this.lead.x = this.lead.y = 0;
    this.kick.x = this.kick.y = 0;
    this.regions.length = 0;
    this.rooms.leave();
    this.water.reset();
    this.riverLife.reset();
  }
  private sizeViewport() {
    const viewport = this.canvas.parentElement!;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const density = window.devicePixelRatio || 1;
    if (width === this.viewWidth && height === this.viewHeight && density === this.density) return;
    this.viewWidth = width;
    this.viewHeight = height;
    this.density = density;
    this.pixelScale = Math.max(1, Math.round(Math.min(height / 432, width / 410) * density)) / density;
    // An extra texel on each side covers the compositor's fractional pan, even at the viewport edges.
    const w = Math.max(1, Math.ceil(width / this.pixelScale)) + 2;
    const h = Math.max(1, Math.ceil(height / this.pixelScale)) + 2;
    this.canvas.width = w;
    this.canvas.height = h;
    const style = this.canvas.style;
    style.width = w * this.pixelScale + 'px';
    style.height = h * this.pixelScale + 'px';
    style.left = Math.round((width - w * this.pixelScale) * 0.5 * density) / density + 'px';
    style.top = Math.round((height - h * this.pixelScale) * 0.5 * density) / density + 'px';
  }
  private present(x: number, y: number) {
    const dx = (x - Math.round(x)) * this.pixelScale;
    const dy = (y - Math.round(y)) * this.pixelScale;
    this.canvas.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }
  private crossThreshold(room: string) {
    if (room === this.lastRoom) return;
    const shown = this.lastRoom !== undefined;
    this.lastRoom = room;
    this.curtain?.remove();
    if (!shown || this.reducedMotion.matches) return;
    const curtain = document.createElement('div');
    curtain.className = 'room-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('canvas');
    frame.width = this.canvas.width;
    frame.height = this.canvas.height;
    frame.style.cssText = this.canvas.style.cssText;
    frame.getContext('2d')!.drawImage(this.canvas, 0, 0);
    curtain.append(frame);
    this.canvas.after(curtain);
    this.curtain = curtain;
    frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 95, fill: 'forwards' });
    const fade = curtain.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 95, duration: 125 });
    fade.onfinish = () => {
      curtain.remove();
      if (this.curtain === curtain) this.curtain = undefined;
    };
  }
  render(valley: Valley, dt: number, conversation?: { speaker?: V2 }) {
    const ctx = this.context;
    this.crossThreshold(valley.roomKey);
    this.sizeViewport();
    const { width: w, height: h } = this.canvas;
    ctx.imageSmoothingEnabled = false;
    this.regions.length = 0;
    this.aimRegions.length = 0;
    if (conversation) this.ambientOffset += dt;
    const ambient = valley.time + this.ambientOffset;
    if (valley.room) {
      this.indoors = true;
      const frame = this.rooms.draw(ctx, valley, this.regions, dt, ambient, this.reducedMotion.matches ? undefined : conversation?.speaker);
      this.present(frame.cameraX, frame.cameraY);
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
    if (conversation && !this.reducedMotion.matches) {
      const speaker = conversation.speaker;
      const at = speaker && project(speaker.x, speaker.z, supportHeight(speaker));
      if (at) gaze.x += Math.max(-22, Math.min(22, (at.x - target.x) * 0.45));
      gaze.y += h * 0.115;
    }
    const foe = valley.combatTarget;
    if (foe && !foe.dead && !valley.bow && !this.reducedMotion.matches) {
      const at = project(foe.x, foe.z, supportHeight(foe));
      gaze.x += Math.max(-14, Math.min(14, (at.x - target.x) * 0.24));
      gaze.y += Math.max(-7, Math.min(7, (at.y - target.y) * 0.20));
    }
    const elapsed = Math.max(dt, 0);
    const ease = 1 - Math.exp(-elapsed * 8);
    this.lead.x += (gaze.x - this.lead.x) * ease;
    this.lead.y += (gaze.y - this.lead.y) * ease;
    // Running keeps the wanderer centered. Frame-rate-independent damping absorbs turns and sudden grade changes.
    const focusX = target.x + this.lead.x, focusY = target.y + this.lead.y;
    this.center.x = this.initialized ? followAxis(this.center.x, this.lastFocus.x, focusX, elapsed, 26) : focusX;
    this.center.y = this.initialized ? followAxis(this.center.y, this.lastFocus.y, focusY, elapsed, 18) : focusY;
    this.lastFocus.x = focusX;
    this.lastFocus.y = focusY;
    this.initialized = true;
    const hit = valley.contacts.at(-1);
    const shudder = { x: 0, y: 0 };
    if (hit?.actorId && valley.hitStopRemaining > 0 && !this.reducedMotion.matches) {
      const axis = project(hit.dx,hit.dz);
      const size = Math.hypot(axis.x,axis.y) || 1;
      const beat = Math.floor(valley.hitStopRemaining * 180) % 2 ? 2 : -1;
      shudder.x = Math.round(-axis.y / size * beat);
      shudder.y = Math.round(axis.x / size * beat);
    }
    this.kick.x = this.kick.y = 0;
    if (hit && hit.kind !== 'earth' && !this.reducedMotion.matches) {
      const age = valley.time - hit.born;
      if (age >= 0 && age < 0.26) {
        const axis = project(hit.dx, hit.dz), length = Math.hypot(axis.x, axis.y) || 1;
        const power = hit.defeated || hit.kind === 'counter' ? 2.3 : hit.kind === 'parry' ? 1.75 : 0.95;
        const wave = Math.sin((age + 0.008) * 39) * Math.exp(-age * 19) * power;
        this.kick.x = wave * axis.x / length;
        this.kick.y = wave * axis.y / length;
      }
    }
    const cameraX = w / 2 - this.center.x + this.kick.x, cameraY = h * 0.54 - this.center.y + 24 + this.kick.y;
    const ox = Math.round(cameraX), oy = Math.round(cameraY);
    this.present(cameraX, cameraY);
    const groundBounds = (across: number, above: number, below: number) => {
      const left = -ox - across, right = w - ox + across, top = -oy - below, bottom = h - oy + above;
      return { xmin: unproject(left, top).x, xmax: unproject(right, bottom).x,
        zmin: unproject(right, top).z, zmax: unproject(left, bottom).z };
    };
    const { xmin, xmax, zmin, zmax } = groundBounds(this.reach.across, this.reach.above, this.reach.below);
    const stamps: Stamp[] = [];
    const buildings: BuildingSpec[] = [];
    this.lastDraws = 0;
    this.heroDrawn = false;
    const time = valley.time;
    const windTime = this.reducedMotion.matches ? 0 : ambient;
    const ringAge = time - valley.bellStruckAt;
    const bellFrame = !this.reducedMotion.matches && ringAge < 1.1
      ? Math.min(this.atlas.frameCount('bell--ring') - 1, 1 + Math.floor(ringAge * 12)) : 0;
    const view = worldView(valley.game.state),
      hour = valley.skyHour;
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
          const b = this.bounds.get(prop)!;
          if (b.right + ox < 0 || b.left + ox >= w || b.bottom + oy < 0 || b.top + oy >= h) continue;
          if (valley.props && sceneryProp(prop)) continue;
          const screen = groundProject(prop);
          if (prop.building) {
            buildings.push(prop.building);
            const lamps =
              sky.night > 0.002 && !valley.game.state.facts['room_dim:' + prop.building.id + '/ground'];
            const windowsLit = lamps && sky.night > 0.24 + Math.abs(Math.sin(prop.x * 3 + prop.z)) * 0.23;
            const strips = this.architecture.exterior(
              prop.building,
              view.millTurning,
              Math.floor(ambient * 6),
              windowsLit
            );
            if (lamps) {
              const door = frontDoor(prop.building);
              if (doorOpen(door, valley.game.state))
                lights.push({ ...groundProject(door.outside), kind: 'door' });
            }
            stamps.push(...strips);
            continue;
          }
          if (sky.night > 0.002 && (prop.key === 'fire' || prop.key === 'lantern'))
            lights.push({ x: screen.x + (prop.key === 'lantern' ? 8 : 0), y: screen.y, kind: prop.key });
          const standard = isHegemonyStandard(prop.key);
          const sprite = prop.sprite ?? (prop.key === 'rockpile' && prop.width < 30 ? 'fieldstone' : prop.key);
          const wind = this.windSprites.get(sprite);
          const motion =
            prop.key === 'rill_lilies'
              ? 'bob'
              : !wind && this.atlas.has(sprite + '--sway')
                ? 'sway'
                : prop.key === 'fire'
                  ? 'firelight'
                  : '';
          const ringing = prop.key === 'bell' && bellFrame > 0;
          const key = ringing ? 'bell--ring' :
            prop.paidKey && valley.game.state.facts.wagon_iron_paid
              ? prop.paidKey
              : (wind?.key ?? (motion ? this.motion(sprite, motion) : sprite));
          const offset = prop.phase ?? Math.abs(prop.z) % 5;
          const frame = ringing ? bellFrame :
            standard || wind || motion === 'sway'
              ? windFrame(
                  windPhase(prop.x, prop.z, windTime, isTree(prop.key) ? 0.61 : standard ? 1.12 : 1),
                  this.atlas.frameCount(key),
                  offset
                )
              : Math.floor(ambient * (motion === 'bob' ? 2.5 : 6) + offset);
          stamps.push({
            ...prop,
            sway: valley.props?.sway(prop),
            reflect: prop.key !== 'rill_lilies',
            anchor: prop.key === 'rill_lilies' ? 0.55 : 1,
            key,
            width: prop.width * (wind?.widthScale ?? 1),
            frame,
          });
        }
      }
    for (const p of PICKUP_LOCATIONS) {
      if (valley.game.state.locationChanges['pickup:' + p.id] === 'taken') continue;
      const herb = p.item === 'healing_herb' ? this.windSprites.get('field_herbs') : undefined;
      const key = herb?.key ?? (p.item === 'field_mushroom' ? 'field_caps' : p.item);
      const width = p.item === 'shore_apple' ? 7 : p.item === 'field_mushroom' ? 10 : p.item === 'iron_scrap' ? 9 : 14;
      stamps.push({
        ...p,
        key,
        width: p.id === 'wreck_blade' ? 24 : herb ? 16 * herb.widthScale : width,
        frame: herb ? windFrame(windPhase(p.x, p.z, windTime), this.atlas.frameCount(key)) : 0,
        lift: p.id === 'wreck_blade' ? 4 : 0,
      });
    }
    for (const resident of AMBIENT_RESIDENTS) {
      const traveller = strandResident(resident, hour);
      if (traveller.stand > 0) {
        stamps.push({ x: resident.x, z: resident.z, key: 'furniture_stool', width: 12, alpha: traveller.stand });
        if (traveller.visible) stamps.push({ x: traveller.x, z: traveller.z, key: resident.id + '--journey',
          width: 28, frame: Math.floor(traveller.distance * 4), flip: traveller.flip, moving: true,
          alpha: traveller.visible * traveller.stand });
        if (traveller.stand === 1) continue;
      }
      let elapsed = time % resident.cycle.reduce((n, c) => n + c[1], 0);
      const posture = resident.cycle.find((c) => {
        elapsed -= c[1];
        return elapsed < 0;
      })?.[0];
      stamps.push({
        ...resident,
        key: this.motion(resident.id, posture === 'work' ? 'work' : posture === 'sit' ? 'rest' : 'idle'),
        width: resident.id === 'keeper' ? 30 : 28,
        alpha: 1 - traveller.stand,
        frame: Math.floor(ambient * 4),
      });
    }
    const immersion = (p: V2, swimmer: boolean) => {
      const deck = deckAt(p);
      if (deck) return { submerged: 0, lift: 0 };
      const wet = wetPoint(p.x, p.z);
      if (!wet) return { submerged: 0, lift: 0 };
      const submerged = waterline(wet, swimmer);
      const lift = wet.course === 'ocean' ? floatHeight(p.x, p.z, wet.bank, ambient) : 0;
      return { submerged, lift };
    };
    for (const [i, a] of valley.actors.entries()) {
      if (a.npc && a.dead) continue;
      const defeat = a.enemy && a.dead
        ? valley.contacts.find((hit) => hit.defeated && hit.actorId === a.id && time - hit.born < DEFEAT_TIME)
        : undefined;
      if (a.enemy && a.dead && !defeat) continue;
      const reaction = !defeat && a.enemy && !this.reducedMotion.matches
        ? valley.contacts.findLast(hit => hit.actorId === a.id && time - hit.born < 0.18) : undefined;
      const recoil = reaction ? Math.round(Math.sin(Math.PI * (time - reaction.born) / 0.18) *
        (reaction.kind === 'parry' ? -2 : 2) * (Math.sign(project(reaction.dx, reaction.dz).x) || 1)) : 0;
      const fallAge = defeat ? time - defeat.born : 0;
      const fall = Math.min(1, fallAge / 0.28);
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
        alpha: defeat ? Math.min(1, (DEFEAT_TIME - fallAge) / 0.36) : undefined,
        tint: !this.reducedMotion.matches && (reaction || defeat) && time - (reaction ?? defeat)!.born < 2 / 60
          ? reaction?.kind === 'parry' ? '#b7f3dd' : '#fff6dc' : undefined,
        impact: reaction || hit?.actorId === a.id ? {
          x: recoil + (hit?.actorId === a.id ? shudder.x : 0),
          y: hit?.actorId === a.id ? shudder.y : 0,
        } : undefined,
        lift: immersion(a, false).lift + (defeat && !this.reducedMotion.matches ? Math.max(0, Math.sin(fall * Math.PI) * 7) : 0),
        reflect: defeat ? false : undefined,
        wakeId: a.id,
        moving: a.move,
        frame: a.dead
          ? defeat ? Math.min(4, Math.floor(fall * 5)) : 0
          : pet
            ? Math.floor(valley.activity!.elapsed * 7)
            : a.attack
              ? Math.min(
                  this.atlas.frameCount(key) - 1,
                  Math.floor(enemySwingProgress(a.attack, ENEMY_ARCHETYPES[a.enemyKind ?? 'bandit'].heavy) * this.atlas.frameCount(key))
                )
              : Math.floor((a.move ? time : ambient) * (a.move ? 8 : 4)) + i,
      });
    }
    const floating: PropView[] = [];
    // Inverse isometric projection of the farthest viewport corner, including relief and loose cargo.
    const propRadius = Math.SQRT2 * Math.hypot((w * 0.5 + 52) / 12, (h * 0.56 + 200) / 6);
    if (valley.props)
      for (const v of valley.props.outdoorObjects(propRadius)) {
        const base = v.y - v.spec.height / 2,
          at = project(v.x, v.z, base);
        if (at.x + ox < -64 || at.x + ox > w + 64 || at.y + oy < -36 || at.y + oy > h + 70) continue;
        if (v.wet >= 0.1 && v.wet <= 0.89) floating.push(v);
        stamps.push({
          x: v.x,
          z: v.z,
          elevation: base,
          key: propSprite(v.spec),
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
    if (valley.dash && !this.reducedMotion.matches) {
      for (const [i, point] of valley.dash.trail.entries()) {
        if (distance(point, valley.player) < 0.27) continue;
        stamps.push({ ...point, ...pose, tint: '#b8c9ba', alpha: (0.10 + i * 0.06) *
          Math.min(1, (0.18 - valley.dash.elapsed) / 0.065), reflect: false });
      }
    }
    stamps.push({
      ...valley.displayPosition,
      ...immersed,
      ...pose,
      hero: true,
      impact: hit?.actorId === 'player' ? shudder : undefined,
      tint: !this.reducedMotion.matches && hit?.actorId === 'player' && time - hit.born < 2 / 60 ? '#fff6dc' : undefined,
      wakeId: 'player',
      moving: valley.walk,
      airborne: hop > 0 || valley.standingLift > 0.08,
      submerged: immersed.submerged * Math.max(0, 1 - hop / 8 - valley.standingLift - (valley.riding ? 1 : 0)),
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
        arrow: { angle: Math.atan2(dir.y, dir.x), exposed: Math.hypot(fromBow.x, fromBow.y), focused: arrow.focused },
        reflect: false,
        elevation,
      });
    }
    for (const contact of valley.contacts) {
      if (time - contact.born >= (contact.defeated ? DEFEAT_TIME : CONTACT_TIME)) continue;
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
      ambient,
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
        spriteDepth(a, a.prop) - spriteDepth(b, b.prop) ||
        (a.hero ? 1 : 0) - (b.hero ? 1 : 0)
    );
    const nearWaterView = stamps.filter((p) => {
      if (!p.wakeId) return false;
      const pos = project(p.x, p.z, p.elevation);
      return pos.x + ox > -48 && pos.x + ox < w + 48 && pos.y + oy > -48 && pos.y + oy < h + 48;
    });
    const ripples = [
      ...fishRipples,
      ...this.water.advance(nearWaterView, ambient, view.flow),
      ...(valley.props?.waterRipples() ?? []),
    ].slice(-16);
    this.lastDraws = this.ground.draw(ctx, ox, oy, w, h, ambient, view.flow, hour, ripples, floating);
    if (valley.dash && !this.reducedMotion.matches) {
      const at = valley.dash.origin, foot = project(at.x, at.z, supportHeight(at));
      drawBootDust(ctx, foot.x + ox, foot.y + oy, valley.dash.elapsed, !!wetPoint(at.x, at.z));
    }
    for (const arrow of valley.arrows) {
      const foot = project(arrow.x, arrow.z, supportHeight(arrow));
      if (!this.ground.groundVisible(foot.x, foot.y, project(arrow.x, arrow.z).y)) continue;
      ctx.fillStyle = 'rgba(40,44,47,.37)';
      ctx.fillRect(Math.round(foot.x + ox) - 2, Math.round(foot.y + oy), 5, 1);
    }
    drawFootprints(ctx, valley.gait.prints, ox, oy, time, this.reducedMotion.matches);
    this.lastDraws += this.meadow.draw(ctx, this.ground, ox, oy, windTime, groundBounds(18, 196, 18));
    this.riverLife.drawShoals(ctx, this.ground, ox, oy, ambient);
    this.water.draw(ctx, this.ground, stamps, ox, oy, ambient);
    this.sun.draw(ctx, stamps, buildings, ox, oy, hour);
    for (const enemy of valley.actors) {
      if (!enemy.enemy || enemy.dead || !enemy.attack || inBuilding(enemy)) continue;
      const def = ENEMY_ARCHETYPES[enemy.enemyKind ?? 'bandit'];
      if (enemy.aimed) {
        const aim = enemy.aimed, end = Math.min(17, Math.max(7, distance(enemy, valley.player) + 2));
        ctx.fillStyle = enemy.attack < 0.18 ? '#ffd396' : '#bc8267';
        for (let d = 1; d < end; d += 1.1) {
          const from = project(aim.x + aim.direction.x*d, aim.z + aim.direction.z*d, arrowHeight(aim,d));
          const to = project(aim.x + aim.direction.x*(d+0.55), aim.z + aim.direction.z*(d+0.55), arrowHeight(aim,d+0.55));
          pixelLine(ctx, from.x+ox, from.y+oy, to.x+ox, to.y+oy);
        }
        continue;
      }
      const cue = meleeWarning(enemy.attack, def.heavy, valley.parryWindow);
      if (!cue.visible) continue;
      const at = project(enemy.x, enemy.z, supportHeight(enemy));
      if (at.x + ox < -40 || at.x + ox > w + 40 || at.y + oy < -40 || at.y + oy > h + 40) continue;
      drawEnemyWarning(ctx, at.x + ox, at.y + oy, def.reach + 0.5, cue.progress, def.heavy, this.reducedMotion.matches, cue.ready);
    }
    if (this.ground.hasWater && this.ground.waterImpacts.length)
      drawWaterSpray(ctx, this.ground.waterImpacts, ox, oy);
    const drawCues = this.interactionCues(ctx, valley, ox, oy);
    const opponent = valley.combatTarget;
    const outlines = opponent && !opponent.dead ? [this.reveal, this.opponentReveal] : [this.reveal];
    for (const outline of outlines) outline.reset();
    for (const stamp of stamps) {
      drawCues(spriteDepth(stamp, stamp.prop));
      if (stamp.art) {
        const art = stamp.art;
        const left = art.left + art.start + ox, top = art.top + oy;
        if (left >= w || left + art.width <= 0 || top >= h || top + art.canvas.height <= 0) continue;
        for (const outline of outlines) {
          const mask = outline.foreground(left, top, art.width, art.canvas.height);
          if (mask) drawStrip(mask, art, ox, oy);
        }
        ctx.globalAlpha = stamp.alpha ?? 1;
        drawStrip(ctx, stamp.art, ox, oy);
        this.lastDraws++;
        continue;
      }
      const s = project(stamp.x, stamp.z, stamp.elevation);
      const x = s.x + ox + (stamp.impact?.x ?? 0),
        y = s.y + oy - (stamp.lift ?? 0) + (stamp.impact?.y ?? 0);
      const spriteHeight = this.atlas.height(stamp.key, stamp.width, stamp.frame);
      const bottom = y + spriteHeight * (1 - (stamp.anchor ?? 1));
      const margin = stamp.prop || stamp.arrow || stamp.contact ? Math.max(20, stamp.width) : 3;
      if (x + stamp.width / 2 + margin < 0 || x - stamp.width / 2 - margin > w ||
        bottom + margin < 0 || bottom - spriteHeight - margin > h) continue;
      ctx.globalAlpha = stamp.alpha ?? 1;
      if (stamp.contact) {
        const hit = stamp.contact, age = time - hit.born;
        if (hit.defeated && !this.reducedMotion.matches && age > 0.18) {
          const foot = project(hit.x,hit.z,supportHeight(hit));
          if (age < 0.36) drawBootDust(ctx,foot.x+ox,foot.y+oy,age-0.18,false);
          if (age > 0.34 && age < 0.71) {
            const r = 1 + Math.round(2 * Math.sin((age - 0.34) * Math.PI / 0.37));
            ctx.fillStyle = '#efd08d'; pixelLine(ctx,foot.x+ox-r,foot.y+oy-2,foot.x+ox+r,foot.y+oy-2);
            pixelLine(ctx,foot.x+ox,foot.y+oy-2-r,foot.x+ox,foot.y+oy-2+r);
          }
        }
        drawContact(ctx, stamp.contact, time, ox, oy, this.reducedMotion.matches);
        continue;
      }
      if (stamp.arrow) {
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(stamp.arrow.angle);
        if (stamp.arrow.focused && !this.reducedMotion.matches) {
          const length = Math.min(stamp.arrow.exposed, stamp.width + 11);
          ctx.fillStyle = '#e1a45a';
          ctx.fillRect(-length, 0, length, 1);
          ctx.fillStyle = '#ffebac';
          ctx.fillRect(-length * 0.62, -1, length * 0.62, 1);
        }
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
      if (stamp.airborne || (stamp.wakeId && deckAt(stamp))) {
        const foot = project(stamp.x, stamp.z, supportHeight(stamp));
        const altitude = stamp.airborne ? Math.max(0, (stamp.lift ?? 0) / 8) : 0;
        if (this.ground.groundVisible(foot.x, foot.y, project(stamp.x, stamp.z).y)) {
          ctx.fillStyle = 'rgba(43,39,42,.40)';
          pixelPool(ctx, foot.x + ox, foot.y + oy, Math.max(3, stamp.width * 0.19 - altitude), Math.max(1, 2.7 - altitude * 0.35));
        }
      }
      const clip = this.paintBody(ctx, stamp, x, y, bottom, spriteHeight, ox, oy, valley, sky.night);
      const left = x - stamp.width / 2 - margin, top = bottom - spriteHeight - margin;
      for (const outline of outlines) {
        const mask = outline.foreground(left, top, stamp.width + margin * 2, spriteHeight + margin * 2);
        if (mask) {
          mask.save();
          mask.globalAlpha = stamp.alpha ?? 1;
          this.paintBody(mask, stamp, x, y, bottom, spriteHeight, ox, oy, valley, sky.night);
          mask.restore();
        }
      }
      this.lastDraws++;
      const outline = stamp.hero ? this.reveal : opponent && !opponent.dead && stamp.wakeId === opponent.id ? this.opponentReveal : undefined;
      if (outline) {
        if (stamp.hero) this.heroDrawn = true;
        const foot = y + (stamp.hero ? 1 : 0);
        outline.track(x, foot, stamp.width, spriteHeight, g => {
          this.atlas.draw(g, stamp.key, x, foot, stamp.width, stamp.frame, stamp.flip, 1, stamp.submerged, false, true);
        });
        if (clip) {
          const mask = outline.foreground(left, top, stamp.width + margin * 2, spriteHeight + margin * 2)!;
          const depth = project(stamp.x, stamp.z).y + Math.max(4, stamp.width * 0.09);
          // Leave the visible half of the actor untouched. Record only the solid face of the nearer hill.
          if (this.ground.clipUpright(mask, x, bottom, stamp.width, spriteHeight, depth, ox, oy, true)) {
            mask.fillStyle = '#fff';
            mask.fillRect(left, top, stamp.width + margin * 2, spriteHeight + margin * 2);
            mask.restore();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    drawCues(Infinity);
    if (outlines.length > 1) this.opponentReveal.finish(ctx);
    this.reveal.finish(ctx);
    this.sky.draw(ctx, ox, oy, ambient, sky, lights, stamps);
    drawDamageLabels(ctx, valley.contacts, time, ox, oy, this.reducedMotion.matches);

    const guide = valley.bowGuide();
    if (guide) {
      const { arrow, distance } = guide;
      const at = (d: number) => project(
        arrow.x + arrow.direction.x * d,
        arrow.z + arrow.direction.z * d,
        arrowHeight(arrow, d)
      );
      const held = valley.bow?.phase === 'hold';
      const focus = valley.bowFocus;
      ctx.fillStyle = focus >= 1 ? '#ffdf81' : held ? '#ffe3a1' : '#cfd5b8';
      ctx.globalAlpha = held ? 0.66 : 0.4;
      for (let d = 2.5; d < distance - 1; d += 2.5) {
        const dot = at(d);
        ctx.fillRect(Math.round(dot.x + ox), Math.round(dot.y + oy), 2, 1);
      }
      const spreadAngle = (1 - focus) * Math.PI / 10;
      for (const sign of [-1, 1]) {
        const theta = sign * spreadAngle, vx = arrow.direction.x * Math.cos(theta) - arrow.direction.z * Math.sin(theta);
        const vz = arrow.direction.x * Math.sin(theta) + arrow.direction.z * Math.cos(theta);
        for (let d = 2.1; d < distance; d += 1.7) {
          const stop = Math.min(distance, d + 0.62);
          const a = project(arrow.x + vx*d, arrow.z + vz*d, arrowHeight(arrow,d));
          const b = project(arrow.x + vx*stop, arrow.z + vz*stop, arrowHeight(arrow,stop));
          pixelLine(ctx, a.x+ox, a.y+oy, b.x+ox, b.y+oy);
        }
      }
      ctx.globalAlpha = 1;
      const tip = at(distance);
      const x = Math.round(tip.x + ox), y = Math.round(tip.y + oy);
      const spread = held ? Math.round(5 - focus * 4) : 6;
      ctx.fillRect(x - spread - 2, y, 3, 1);
      ctx.fillRect(x + spread, y, 3, 1);
      ctx.fillRect(x, y - spread - 2, 1, 3);
      ctx.fillRect(x, y + spread, 1, 3);
    }
    this.focus();
    this.renderedFrames++;
  }

  private interactionCues(ctx: CanvasRenderingContext2D, valley: Valley, ox: number, oy: number) {
    const { width: w, height: h } = ctx.canvas;
    const cues: DepthCue[] = [];
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
          target.sprite?.width ?? prop?.spec.width ??
          target.animal?.width ??
          (target.field === 'seat' ? 34 : target.field === 'fire' ? 24 : 20);
        const high = target.sprite ? this.atlas.height(target.sprite.key, width) : prop
          ? this.atlas.height(propSprite(prop.spec), width)
          : target.animal
            ? this.atlas.height(target.animal.key, width)
            : target.field === 'seat'
              ? 19
              : target.field === 'fire'
                ? 30
                : 17;
        this.regions.push({ id: target.id, x, y: base - high * 0.47, w: width, h: high + 4, target });
        if ((!target.prop || target.prop === nearestProp) && !valley.activity && !valley.bow) {
          const within = target.reach - targetDistance(target, valley.player);
          if (within > 0) cues.push({ depth: spriteDepth(prop ?? target.at, prop),
            draw: () => drawReachMark(ctx, x, base - high - 5, within / 0.65) });
        }
        continue;
      }
      const sill = {
        x: door.sill.x * 0.68 + door.outside.x * 0.32,
        z: door.sill.z * 0.68 + door.outside.z * 0.32,
      };
      const s = groundProject(sill);
      const x = s.x + ox,
        y = s.y + oy;
      if (x < -16 || x > w + 16 || y < -12 || y > h + 20) continue;
      const proximity = Math.min(1, (target.reach + 4 - targetDistance(target, valley.player)) / 4);
      if (proximity > 0) {
        const side = project(Math.cos(door.site.yaw) * door.halfWidth, -Math.sin(door.site.yaw) * door.halfWidth);
        cues.push({ depth: spriteDepth(sill), draw: () => drawThreshold(ctx, x, y, side, proximity, !!target.locked) });
      }
      this.regions.push({ id: target.id, x, y: y - 6, w: 24, h: 26, target });
    }
    return cuePass(cues);
  }

  private paintBody(ctx: CanvasRenderingContext2D, stamp: Stamp, x: number, y: number,
    bottom: number, spriteHeight: number, ox: number, oy: number, valley: Valley, night: number) {
    const clip = this.ground.clipUpright(
      ctx,
      x,
      bottom,
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
      if (stamp.sway) {
        ctx.save();
        ctx.translate(x, y);
        if (stamp.sway) ctx.transform(1, 0, stamp.sway * 0.15, 1, 0, 0);
        ctx.translate(-x, -y);
      }
      if (stamp.hero && valley.strike && valley.swordSwing && !this.reducedMotion.matches)
        drawSwordSweep(ctx, x, y, stamp.width, valley.facing, SWING_TIME - valley.strike, valley.stroke);
      const frame = Math.max(0, stamp.frame ?? 0);
      this.atlas.draw(ctx, stamp.key, x, y + (stamp.hero ? 1 : 0), stamp.width, frame, stamp.flip,
        stamp.anchor ?? 1, stamp.submerged, false, !!stamp.wakeId || stamp.moving, stamp.tint);
      const bow = stamp.hero && valley.bow;
      if (bow && bow.phase === 'loose' && bow.elapsed < 0.075 && !this.reducedMotion.matches) {
        const hand = project(bow.direction.x * 0.72, bow.direction.z * 0.72);
        const hx = Math.round(x + hand.x), hy = Math.round(y + hand.y - 20);
        const radius = bow.focused ? 4 : 2;
        ctx.save();
        ctx.globalAlpha *= 1 - bow.elapsed / 0.075;
        ctx.fillStyle = bow.focused ? '#ffedaa' : '#eee5c6';
        ctx.fillRect(hx - radius, hy, radius * 2 + 1, 1);
        ctx.fillRect(hx, hy - radius, 1, radius * 2 + 1);
        ctx.restore();
      }
      if ((stamp.key.startsWith('fire--') || stamp.key.startsWith('cookfire--')) && !this.reducedMotion.matches)
        drawFireAir(ctx, x, y, valley.time, stamp.x, stamp.z, night);
      if (stamp.sway) ctx.restore();
    }
    if (clip) ctx.restore();
    return clip;
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
    const lead = journeyLead(valley.game.state);
    if (lead.at) {
      const pt = chartPoint(lead.at, w, h);
      const x = Math.round(pt.x), y = Math.round(pt.y);
      for (let dy = -6; dy <= 6; dy++) {
        const r = 6 - Math.abs(dy);
        ctx.fillStyle = '#3a3028'; ctx.fillRect(x - r - 1, y + dy, 2 * r + 3, 1);
        ctx.fillStyle = '#ffe393'; ctx.fillRect(x - r, y + dy, 2 * r + 1, 1);
      }
    }
    if (valley.game.state.mapMarker) plot(valley.game.state.mapMarker, 'cursor', 13);
    plot(valley.player, 'hero-south', 19);
  }
}
