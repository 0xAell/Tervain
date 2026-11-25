import { AUTOSAVE_SECONDS } from '../core/rules/journey';
import { initializePhysics } from '../physics/initialize';
import { PropPhysics } from './propPhysics';
import { Sound } from './audio';
import { defaultMix, type MixLevels } from './mixer';
import type { VoiceMode } from './reading';
import { Game } from '../core/game/game';
import { createInitialState } from '../core/game/state';
import { S } from '../core/content/strings';
import { NPCS } from '../core/content/npcs';
import { pickEntryNode } from '../core/game/dialogue';
import { ITEMS, itemAction } from '../core/content/items';
import { BrowserStore, SaveStore, type SlotId } from '../platform/storage';
import type { WorldState } from '../core/game/types';
import type { V2 } from '../core/world/layout';
import { Atlas } from './atlas';
import { Scene } from './scene';
import { Valley } from './simulation';
import { Interface, type Controls, type Screen } from './interface';
import { distance, inBuilding } from './land';
import { targetDistance, type RoomTarget } from './roomTargets';
import { wetPoint, onBridge } from './water';

const defaults: Record<string, string> = {
  north: 'KeyW',
  south: 'KeyS',
  west: 'KeyA',
  east: 'KeyD',
  interact: 'KeyE',
  grab: 'KeyG',
  turn: 'KeyR',
  attack: 'Space',
  guard: 'KeyQ',
  jump: 'KeyX',
  inventory: 'KeyI',
  journal: 'KeyJ',
  map: 'KeyM',
};
const store = new BrowserStore();
function readSettings() {
  let saved: {
    volume?: number;
    mix?: Partial<MixLevels>;
    voiceMode?: VoiceMode;
    bindings?: Record<string, string>;
  } = {};
  try {
    saved = JSON.parse(store.get('tervain:vale:settings') ?? '{}') ?? {};
  } catch {
    /* New installation. */
  }
  const bindings = { ...defaults };
  for (const key of Object.keys(bindings))
    if (typeof saved.bindings?.[key] === 'string') bindings[key] = saved.bindings[key]!;
  for (const action of ['grab', 'turn']) {
    if (typeof saved.bindings?.[action] === 'string') continue;
    const used = new Set(
      Object.entries(bindings)
        .filter(([key]) => key !== action)
        .map(([, code]) => code)
    );
    if (used.has(bindings[action]!)) {
      const letters = Array.from({ length: 26 }, (_, index) => 'Key' + String.fromCharCode(65 + index));
      bindings[action] = letters.find((code) => code !== 'KeyV' && !used.has(code))!;
    }
  }
  const mix = { ...defaultMix };
  for (const k of Object.keys(mix) as (keyof MixLevels)[]) {
    const value = saved.mix?.[k];
    if (typeof value === 'number' && Number.isFinite(value)) mix[k] = Math.max(0, Math.min(1, value));
  }
  const voiceMode: VoiceMode =
    saved.voiceMode === 'off' || saved.voiceMode === 'characters' ? saved.voiceMode : 'full';
  return {
    mix,
    voiceMode,
    volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 0.36,
    bindings,
  };
}

export class Client implements Controls {
  controllerActive = false;
  readonly settings = readSettings();
  readonly saves = new SaveStore(store);
  readonly sound = new Sound(this.settings.volume, this.settings.voiceMode, this.settings.mix);
  readonly ui: Interface;
  game = new Game();
  valley = new Valley(this.game);
  scene!: Scene;
  private keys = new Set<string>();
  private buttons: boolean[] = [];
  private aimPointer?: number;
  private lastTime = 0;
  private nextAuto = 0;
  private nextAudio = 0;
  private destination: V2 | null = null;
  private route: V2[] = [];
  private pendingTarget?: string;
  private gamepadBlocked = false;
  private playing = false;
  constructor(
    private canvas: HTMLCanvasElement,
    root: HTMLElement
  ) {
    this.ui = new Interface(root, this.saves, this);
    this.sound.setCaption((text) => this.ui.caption(text));
  }
  get mode() {
    return this.ui.mode;
  }
  async init() {
    const [atlas] = await Promise.all([Atlas.load(), initializePhysics()]);
    this.scene = new Scene(this.canvas, atlas);
    this.ui.bind(this.valley, this.scene);
    this.ui.title();
    const unlock = () => {
      this.sound.unlock();
      if (this.mode === 'title') this.sound.titleMusic();
    };
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = [];
      if (this.mode === 'play') this.page('pause');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.sound.mixer.sleep();
      else this.sound.unlock();
      if (document.hidden && this.mode === 'play') {
        this.save('auto', true);
        this.page('pause');
      }
    });
    window.addEventListener('pagehide', () => {
      if (this.playing && this.game.state.player.health > 0) this.save('auto', true);
    });
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Right-button aiming is driven by pointer press and release.
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.scene.hover(e.clientX, e.clientY);
      if (this.aimPointer === e.pointerId && this.mode === 'play') {
        const aim = this.scene.aimAt(e.clientX, e.clientY),
          p = this.valley.player;
        this.valley.aimDirection(aim.at.x - p.x, aim.at.z - p.z, aim.head);
      }
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.aimPointer || e.button !== 2) return;
      this.aimPointer = undefined;
      this.valley.releaseAttack();
    });
    this.canvas.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === this.aimPointer) {
        this.aimPointer = undefined;
        this.valley.bow = undefined;
      }
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.mode === 'play' && this.valley.props?.grip) {
          e.preventDefault();
          this.valley.props.turn(Math.sign(e.deltaY));
        }
      },
      { passive: false }
    );
    this.canvas.addEventListener('pointerleave', () => this.scene.hover());
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'play') return;
      if (e.button === 2) {
        e.preventDefault();
        this.stopWalking();
        this.controllerActive = false;
        const aim = this.scene.aimAt(e.clientX, e.clientY);
        this.valley.startAttack(aim.at, aim.head);
        if (this.valley.bow) {
          this.aimPointer = e.pointerId;
          this.canvas.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (e.button !== 0) return;
      if (this.valley.activity) this.valley.cancelPose();
      this.controllerActive = false;
      this.canvas.focus();
      const point = this.scene.pointAt(e.clientX, e.clientY);
      const site = !this.valley.room && inBuilding(point);
      const target =
        this.scene.targetAt(e.clientX, e.clientY) ??
        (site ? this.valley.targets().find((t) => t.door?.site === site && !t.door.rear) : undefined);
      this.stopWalking();
      const physics = this.valley.props;
      if (physics?.grip && !target?.door && !target?.passage) {
        const surface = target?.prop ? physics.object(target.prop) : target?.fixture;
        if (physics.placeAt(surface ?? point)) {
          this.ui.update(true);
          return;
        }
        if (target?.prop) return;
      }
      if (target && this.inReach(target)) this.activateTarget(target);
      else {
        this.walkTo(target?.approach ?? point);
        if (target && this.destination) this.pendingTarget = target.id;
      }
    });
    requestAnimationFrame((t) => this.frame(t));
  }
  private stopWalking() {
    this.pendingTarget = undefined;
    this.destination = null;
    this.route = [];
  }
  private inReach(target: RoomTarget) {
    return targetDistance(target, this.valley.position, this.valley.room) <= target.reach;
  }
  private walkTo(target: V2) {
    this.destination = target;
    this.route = [];
    const p = this.valley.position;
    const room = this.valley.room;
    const canReach = (a: V2, b: V2) => this.valley.canWalk(a, b) && (!!room || !inBuilding(b));
    const step = room ? 0.64 : 1.25,
      limit = 90;
    if (distance(p, target) > limit) {
      this.destination = null;
      return;
    }
    const start = { x: p.x, z: p.z, i: 0, j: 0, g: 0, parent: -1 };
    const nodes = [start];
    const open = [0];
    const best = new Map<string, number>([['0,0', 0]]);
    for (let n = 0; open.length && n < 6500; n++) {
      open.sort(
        (a, b) => nodes[b]!.g + distance(nodes[b]!, target) - nodes[a]!.g - distance(nodes[a]!, target)
      );
      const index = open.pop()!,
        node = nodes[index]!;
      if (distance(node, target) < step && canReach(node, target)) {
        const path = [target];
        let k = index;
        while (k > 0) {
          path.push(nodes[k]!);
          k = nodes[k]!.parent;
        }
        this.route = path.reverse();
        this.destination = this.route.shift() ?? null;
        return;
      }
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const i = node.i + di,
          j = node.j + dj,
          key = i + ',' + j,
          x = p.x + i * step,
          z = p.z + j * step;
        const surface = room ? undefined : wetPoint(x, z);
        const resistance =
          surface?.kind === 'river' && !onBridge({ x, z }) ? 1 + 0.65 * Math.min(1, surface.bank / 1.9) : 1;
        const g = node.g + step * Math.hypot(di, dj) * resistance;
        if ((best.get(key) ?? Infinity) <= g || g > limit * 1.65) continue;
        const next = { x, z, i, j, g, parent: index };
        if (!canReach(node, next)) continue;
        best.set(key, g);
        open.push(nodes.length);
        nodes.push(next);
      }
    }
    this.destination = null;
  }
  private bind(state: WorldState) {
    this.valley.props?.dispose();
    this.sound.reset();
    this.game = new Game(state);
    this.valley = new Valley(this.game);
    const physics = new PropPhysics(() => this.game.state);
    this.valley.enableProps(physics);
    physics.onContact = (material, energy, at) =>
      this.sound.contact(material, energy, at, this.valley.position);
    this.scene.resetCamera();
    this.ui.bind(this.valley, this.scene);
    this.valley.onMessage = (t) => this.ui.message(t);
    this.valley.onFieldSound = (cue, range) => this.sound.field(cue, range);
    this.game.subscribe((events) => {
      for (const e of events) {
        if (e.t === 'toast') this.ui.message(S(e.key, e.params));
        this.sound.event(e, this.valley);
        if (e.t === 'autosave' && this.valley.player.health > 0) this.save('auto', true);
      }
    });
    this.playing = true;
    this.keys.clear();
    this.stopWalking();
    this.nextAuto = performance.now() + AUTOSAVE_SECONDS * 1000;
    this.nextAudio = 0;
    this.sound.enabled = true;
    this.sound.unlock();
  }
  start(load: boolean) {
    const latest = load ? this.saves.latest() : null;
    this.bind(latest?.state ?? createInitialState());
    if (this.valley.player.health <= 0) {
      this.game.dispatch({ t: 'healPlayer', amount: this.valley.player.maxHealth });
    }
    this.resume();
    this.sound.update(this.valley);
    if (!latest) this.sound.tell(['hero.arrival'], 3);
  }
  resume() {
    this.valley.openChest = undefined;
    this.sound.endLine();
    if (!this.playing) {
      this.ui.title();
      return;
    }
    if (this.valley.player.health <= 0) {
      this.ui.open('death');
      return;
    }
    this.keys.clear();
    this.stopWalking();
    this.ui.play();
    this.canvas.focus();
  }
  private page(screen: Screen) {
    this.aimPointer = undefined;
    this.valley.cancelPose();
    this.keys.clear();
    this.stopWalking();
    this.ui.open(screen);
  }
  quit() {
    if (this.playing && this.valley.player.health > 0) this.save('auto', true);
    this.playing = false;
    this.sound.stop();
    this.sound.titleMusic();
    this.ui.title();
  }
  save(slot: SlotId, silent = false) {
    this.valley.props?.checkpoint();
    const r = this.saves.save(slot, this.game.state);
    if (!r.ok || !silent) this.ui.message(r.ok ? 'Journey saved' : r.message);
  }
  load(slot: SlotId) {
    const r = this.saves.load(slot);
    if (!r.ok) {
      this.ui.message(r.message);
      return;
    }
    this.bind(r.state);
    this.resume();
    this.ui.message('Journey restored');
  }
  setVolume(v: number) {
    this.settings.volume = v;
    this.sound.setVolume(v);
    this.storeSettings();
  }
  setVoiceMode(mode: VoiceMode) {
    this.settings.voiceMode = mode;
    this.sound.mode = mode;
    this.sound.endLine();
    this.storeSettings();
  }
  setMix(key: keyof MixLevels, value: number) {
    this.settings.mix[key] = value;
    this.sound.mixer.setLevels(this.settings.mix);
    this.storeSettings();
  }
  setBindings(action: string, key: string) {
    const other = Object.keys(this.settings.bindings).find(
      (k) => k !== action && this.settings.bindings[k] === key
    );
    if (other) this.settings.bindings[other] = this.settings.bindings[action]!;
    this.settings.bindings[action] = key;
    this.storeSettings();
  }
  private storeSettings() {
    try {
      store.set('tervain:vale:settings', JSON.stringify(this.settings));
    } catch {
      this.ui.message('Settings apply for this session.');
    }
  }
  slot(i: number) {
    const id = this.game.state.quickSlots[i];
    if (!id) {
      this.ui.open('inventory');
      return;
    }
    const act = itemAction(id);
    if (act)
      this.valley.action(act === 'equip' ? { t: 'equipWeapon', item: id } : { t: 'useItem', item: id });
  }
  pressAttack() {
    if (this.mode === 'play') {
      this.stopWalking();
      this.valley.startAttack();
    }
  }
  releaseAttack() {
    if (this.mode === 'play') this.valley.releaseAttack();
  }
  attack() {
    if (this.mode === 'play') this.valley.attack();
  }
  grab() {
    const physics = this.valley.props;
    if (!physics) return;
    this.stopWalking();
    if (physics.grip) physics.release();
    else if (!this.valley.grabProp(this.scene.hoveredProp)) this.ui.message('Nothing within reach');
    this.ui.update(true);
  }
  interact() {
    if (this.valley.activity) {
      this.valley.cancelPose();
      return;
    }
    if (this.valley.bow) return;
    const offers = this.valley.offers();
    if (this.valley.props?.grip && !offers[0]?.target?.door && !offers[0]?.target?.passage) {
      this.grab();
      return;
    }
    if (!offers.length) {
      this.ui.message('Nothing within reach');
      return;
    }
    if (this.valley.chooseNearby(offers)) {
      this.ui.chooseOffers();
      return;
    }
    this.interactIndex(0);
  }
  interactIndex(index: number) {
    const offer = this.valley.offers()[index];
    if (!offer) {
      this.resume();
      return;
    }
    this.resume();
    if (offer.target) {
      this.activateTarget(offer.target);
      return;
    }
    const act = offer.entry!.act,
      v = this.valley;
    switch (act.do) {
      case 'observe': {
        const node = pickEntryNode(this.game.state, act.npc);
        if (node) this.ui.dialogue(node);
        else this.ui.message(NPCS[act.npc].name + ' has nothing more to say.');
        break;
      }
      case 'pickup':
        if (v.action({ t: 'pickup', pickupId: act.pickup, item: act.item, qty: act.qty })) {
          this.ui.message(S(ITEMS[act.item].nameKey) + ' × ' + act.qty);
          if (itemAction(act.item) === 'equip' && !this.game.state.equippedWeapon)
            v.action({ t: 'equipWeapon', item: act.item });
          const slot = this.game.state.quickSlots.indexOf(null);
          if (slot >= 0 && itemAction(act.item) && !this.game.state.quickSlots.includes(act.item))
            v.action({ t: 'assignQuickSlot', slot, item: act.item });
        }
        break;
      case 'inspect':
        if (v.action({ t: 'inspect', pointId: act.point }))
          this.ui.message(
            act.point === 'noticeboard' ? this.ui.describeNoticeboard() : S('inspect.' + act.point)
          );
        break;
      case 'dismount':
        v.riding = false;
        this.ui.message('Dismounted');
        break;
      case 'mount':
        v.riding = true;
        this.ui.message('Mounted');
        break;
      case 'hunting_notes':
      case 'open_sluice':
      case 'try_archive_door':
        this.ui.controlsAt(act);
        break;
      case 'restock_arrows':
        v.action({ t: 'restockArrows' });
        break;
      case 'sell_game_meat':
        v.action({ t: 'sellGameMeat' });
        break;
      case 'perform_rite':
        v.action({ t: 'performRite' });
        break;
      case 'read_ledger':
        v.action({ t: 'readLedger' });
        break;
      case 'pull_lever':
        v.action({ t: 'openShortcut' });
        break;
      case 'check_result':
        v.action({ t: 'settle', via: 'check_channel' });
        break;
      case 'force_shutter':
        v.action({
          t: 'archiveAccess',
          method: 'trespass',
          observedBy: v.actors
            .filter((a) => a.npc && !a.dead && distance(a, v.player) < 12)
            .map((a) => a.npc!),
        });
        break;
    }
  }
  private activateTarget(target: RoomTarget) {
    if (!this.inReach(target)) return;
    this.stopWalking();
    const v = this.valley;
    if (target.plant && v.props) {
      v.props.touch(target.plant);
      v.perform('gather', target, 0.65);
    } else if (target.prop && !target.field) {
      v.grabProp(target.prop);
    } else if (target.field === 'fire') {
      this.ui.cooking(target, 'Campfire');
    } else if (target.field || target.fixture?.use === 'seat') v.interactField(target);
    else if (target.door) {
      if (target.locked) {
        if (!target.door.rear) {
          this.ui.controlsAt({ do: 'try_archive_door' }, () => v.enterDoor(target.door!));
          return;
        }
        this.ui.actions(
          'Archive shutter',
          [
            {
              text: 'Force the shutter',
              run: () => {
                const opened = v.action({
                  t: 'archiveAccess',
                  method: 'trespass',
                  observedBy: v.actors
                    .filter((a) => a.npc && !a.dead && distance(a, v.player) < 12)
                    .map((a) => a.npc!),
                });
                this.resume();
                if (opened) v.enterDoor(target.door!);
              },
            },
          ],
          'The shutter is fastened from inside.'
        );
        return;
      }
      v.enterDoor(target.door);
    } else if (target.passage) {
      const p = target.passage;
      if (p.kind === 'arch') {
        const direction = v.position.x > p.x ? -1 : v.position.x < p.x ? 1 : p.side!;
        this.walkTo({ x: p.x + direction * 2.25, z: p.z });
      } else v.usePassage(p);
    } else if (target.fixture) this.ui.roomFixture(target.fixture);
    else if (target.npc) {
      const node = pickEntryNode(this.game.state, target.npc);
      if (node) this.ui.dialogue(node);
      else this.ui.message(NPCS[target.npc].name + ' has nothing more to say.');
    }
    this.nextAudio = 0;
    this.ui.update(true);
  }
  private key(e: KeyboardEvent, down: boolean) {
    if (down) this.controllerActive = false;
    if (!down) {
      const wasHeld = this.keys.delete(e.code);
      if (wasHeld && this.mode === 'play' && e.code === this.settings.bindings.attack)
        this.valley.releaseAttack();
      return;
    }
    if (
      e.code === 'KeyV' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !Object.values(this.settings.bindings).includes(e.code)
    ) {
      if (!e.repeat) this.ui.readAloud();
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape') {
      if (e.repeat) return;
      if (this.mode === 'play') this.page('pause');
      else if (this.mode !== 'title' && this.mode !== 'death') this.playing ? this.resume() : this.ui.title();
      return;
    }
    if (this.mode !== 'play') return;
    if (['Tab', 'Space', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'F5', 'F9'].includes(e.code))
      e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    const b = this.settings.bindings;
    if (e.code === b.interact) this.interact();
    else if (e.code === b.grab) this.grab();
    else if (e.code === b.turn) this.valley.props?.turn(e.shiftKey ? -1 : 1);
    else if (e.code === b.attack) {
      this.stopWalking();
      this.valley.startAttack();
    } else if (e.code === b.jump && !this.valley.jump && !this.valley.swimming && !this.valley.bow) {
      this.valley.cancelPose();
      this.valley.jump = 0.52;
    } else if (e.code === b.inventory) this.page('inventory');
    else if (e.code === b.journal || e.code === 'Tab') this.page('journal');
    else if (e.code === b.map) this.page('map');
    else if (e.code === 'F5') this.save('quick');
    else if (e.code === 'F9') this.load('quick');
    else if (/^Digit\d$/.test(e.code)) this.slot((Number(e.code.slice(-1)) + 9) % 10);
  }
  private pad() {
    if (this.gamepadBlocked) return;
    try {
      return Array.from(navigator.getGamepads?.() ?? []).find((p) => p?.connected) ?? undefined;
    } catch {
      this.gamepadBlocked = true;
      return;
    }
  }
  private frame(t: number) {
    const dt = Math.min(0.05, (t - (this.lastTime || t)) * 0.001);
    this.lastTime = t;
    const pad = this.pad();
    if (pad) {
      const buttons = pad.buttons.map((b) => b.pressed);
      const hit = (n: number) => buttons[n] && !this.buttons[n];
      if (buttons.some((_, i) => hit(i)) || pad.axes.some((a) => Math.abs(a) > 0.18))
        this.controllerActive = true;
      if (hit(9)) {
        if (this.mode === 'play') this.page('pause');
        else if (this.mode === 'title') this.start(!!this.saves.latest());
        else this.resume();
      } else if (hit(0) && this.mode === 'play') this.interact();
      else if (this.mode !== 'play' && (hit(12) || hit(13) || hit(14) || hit(15) || hit(0)))
        this.ui.padMenu(
          hit(12) || hit(14) ? -1 : hit(13) || hit(15) ? 1 : 0,
          !!hit(0),
          hit(14) ? -1 : hit(15) ? 1 : 0
        );
      else if (hit(3) && this.mode === 'play') this.grab();
      else if (hit(5) && this.mode === 'play') this.valley.props?.turn(1);
      else if ((hit(2) || hit(7)) && this.mode === 'play') {
        this.stopWalking();
        this.valley.startAttack();
      }
      if (this.mode === 'play' && !buttons[2] && !buttons[7] && (this.buttons[2] || this.buttons[7]))
        this.valley.releaseAttack();
      else if (hit(1) && this.mode !== 'title') this.resume();
      if (this.mode === 'play' && this.valley.bow && Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0) > 0.22) {
        const x = pad.axes[2] ?? 0,
          y = pad.axes[3] ?? 0;
        this.valley.aimDirection(x + y, y - x);
      }
      this.buttons = buttons;
    } else if (this.buttons.length) {
      this.buttons = [];
      this.valley.bow = undefined;
    }
    if (this.mode === 'play') {
      const b = this.settings.bindings;
      const held = (s: string) => this.keys.has(s);
      let h = Number(held(b.east!) || held('ArrowRight')) - Number(held(b.west!) || held('ArrowLeft'));
      let v = Number(held(b.south!) || held('ArrowDown')) - Number(held(b.north!) || held('ArrowUp'));
      const ax = pad?.axes[0] ?? 0,
        ay = pad?.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.16) {
        h = ax;
        v = ay;
      }
      let dx = h + v,
        dz = v - h;
      if (dx || dz) {
        this.stopWalking();
      } else if (this.destination) {
        const remaining = distance(this.destination, this.valley.position),
          next = this.route[0];
        if (
          remaining < 0.025 ||
          (remaining < (this.valley.room ? 0.16 : 0.35) &&
            (!next || this.valley.canWalk(this.valley.position, next)))
        )
          this.destination = this.route.shift() ?? null;
        if (this.destination) {
          dx = this.destination.x - this.valley.position.x;
          dz = this.destination.z - this.valley.position.z;
        }
      }
      this.valley.guard = held(b.guard!) || !!pad?.buttons[4]?.pressed;
      const previousRoom = this.valley.roomKey;
      this.valley.step(
        dt,
        dx,
        dz,
        held('ShiftLeft') || held('ShiftRight') || !!pad?.buttons[5]?.pressed,
        !this.destination
      );
      if (previousRoom !== this.valley.roomKey) {
        this.sound.endLine();
        this.stopWalking();
        this.nextAudio = 0;
      } else if (this.pendingTarget) {
        const target = this.valley.targets().find((t) => t.id === this.pendingTarget);
        if (target && this.inReach(target)) this.activateTarget(target);
        else if (!target) this.stopWalking();
        else if (!this.destination && target.field === 'pet') this.walkTo(target.approach);
        else if (!this.destination) this.stopWalking();
      }
      this.scene.render(this.valley, dt);
      this.sound.movement(this.valley);
      this.ui.update();
      if (this.valley.player.health <= 0) this.page('death');
      else if (t > this.nextAuto) {
        this.save('auto', true);
        this.nextAuto = t + AUTOSAVE_SECONDS * 1000;
      }
      if (t > this.nextAudio) {
        this.sound.update(this.valley);
        this.nextAudio = t + 1800;
      }
    }
    requestAnimationFrame((n) => this.frame(n));
  }
}
