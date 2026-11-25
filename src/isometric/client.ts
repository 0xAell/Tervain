import { AUTOSAVE_SECONDS } from '../core/rules/journey';
import { Sound } from './audio';
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
import { distance, navigable } from './land';
import { wetPoint, onBridge } from './water';

const defaults: Record<string, string> = {
  north: 'KeyW',
  south: 'KeyS',
  west: 'KeyA',
  east: 'KeyD',
  interact: 'KeyE',
  attack: 'Space',
  guard: 'KeyQ',
  jump: 'KeyX',
  inventory: 'KeyI',
  journal: 'KeyJ',
  map: 'KeyM',
};
const store = new BrowserStore();
function readSettings() {
  let saved: { volume?: number; bindings?: Record<string, string> } = {};
  try {
    saved = JSON.parse(store.get('tervain:vale:settings') ?? '{}') ?? {};
  } catch {
    /* New installation. */
  }
  const bindings = { ...defaults };
  for (const key of Object.keys(bindings))
    if (typeof saved.bindings?.[key] === 'string') bindings[key] = saved.bindings[key]!;
  return {
    volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 0.36,
    bindings,
  };
}

export class Client implements Controls {
  readonly settings = readSettings();
  readonly saves = new SaveStore(store);
  readonly sound = new Sound(this.settings.volume);
  readonly ui: Interface;
  game = new Game();
  valley = new Valley(this.game);
  scene!: Scene;
  private keys = new Set<string>();
  private buttons: boolean[] = [];
  private lastTime = 0;
  private nextAuto = 0;
  private nextAudio = 0;
  private destination: V2 | null = null;
  private route: V2[] = [];
  private gamepadBlocked = false;
  private playing = false;
  constructor(
    private canvas: HTMLCanvasElement,
    root: HTMLElement
  ) {
    this.ui = new Interface(root, this.saves, this);
  }
  get mode() {
    return this.ui.mode;
  }
  async init() {
    this.scene = new Scene(this.canvas, await Atlas.load());
    this.ui.bind(this.valley, this.scene);
    this.ui.title();
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = [];
      if (this.mode === 'play') this.page('pause');
    });
    document.addEventListener('visibilitychange', () => {
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
      if (this.mode === 'play') this.valley.attack(this.scene.pointAt(e.clientX, e.clientY));
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.mode !== 'play') return;
      this.canvas.focus();
      this.walkTo(this.scene.pointAt(e.clientX, e.clientY));
    });
    requestAnimationFrame((t) => this.frame(t));
  }
  private walkTo(target: V2) {
    this.destination = target;
    this.route = [];
    const p = this.valley.player;
    // The first click need only find a local route round a house or through its door.
    const step = 1.25,
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
      if (distance(node, target) < step && navigable(node, target, this.valley.archiveOpen)) {
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
        const surface = wetPoint(x, z);
        const resistance =
          surface?.kind === 'river' && !onBridge({ x, z }) ? 1 + 0.65 * Math.min(1, surface.bank / 1.9) : 1;
        const g = node.g + step * Math.hypot(di, dj) * resistance;
        if ((best.get(key) ?? Infinity) <= g || g > limit * 1.65) continue;
        const next = { x, z, i, j, g, parent: index };
        if (!navigable(node, next, this.valley.archiveOpen)) continue;
        best.set(key, g);
        open.push(nodes.length);
        nodes.push(next);
      }
    }
    this.destination = null;
  }
  private bind(state: WorldState) {
    this.sound.reset();
    this.game = new Game(state);
    this.valley = new Valley(this.game);
    this.scene.resetCamera();
    this.ui.bind(this.valley, this.scene);
    this.valley.onMessage = (t) => this.ui.message(t);
    this.game.subscribe((events) => {
      for (const e of events) {
        if (e.t === 'toast') this.ui.message(S(e.key, e.params));
        if (e.t === 'autosave' && this.valley.player.health > 0) this.save('auto', true);
      }
    });
    this.playing = true;
    this.keys.clear();
    this.destination = null;
    this.route = [];
    this.nextAuto = performance.now() + AUTOSAVE_SECONDS * 1000;
    this.nextAudio = 0;
    this.sound.enabled = true;
  }
  start(load: boolean) {
    const latest = load ? this.saves.latest() : null;
    this.bind(latest?.state ?? createInitialState());
    if (this.valley.player.health <= 0) {
      this.game.dispatch({ t: 'healPlayer', amount: this.valley.player.maxHealth });
    }
    this.resume();
    this.sound.update(this.valley);
  }
  line(id: string) {
    this.sound.line(id);
  }
  resume() {
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
    this.destination = null;
    this.route = [];
    this.ui.play();
    this.canvas.focus();
  }
  private page(screen: Screen) {
    this.keys.clear();
    this.destination = null;
    this.route = [];
    this.ui.open(screen);
  }
  quit() {
    if (this.playing && this.valley.player.health > 0) this.save('auto', true);
    this.playing = false;
    this.sound.stop();
    this.ui.title();
  }
  save(slot: SlotId, silent = false) {
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
  attack() {
    if (this.mode === 'play') this.valley.attack();
  }
  interact() {
    const offers = this.valley.offers();
    if (!offers.length) {
      this.ui.message('Nothing within reach');
      return;
    }
    if (offers.length > 1) {
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
    if (offer.skin) {
      this.valley.skin(offer.skin);
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
  private key(e: KeyboardEvent, down: boolean) {
    if (!down) {
      this.keys.delete(e.code);
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
    else if (e.code === b.attack) this.attack();
    else if (e.code === b.jump && !this.valley.jump && !this.valley.swimming) this.valley.jump = 0.52;
    else if (e.code === b.inventory) this.page('inventory');
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
      if (hit(9)) {
        if (this.mode === 'play') this.page('pause');
        else if (this.mode === 'title') this.start(!!this.saves.latest());
        else this.resume();
      } else if (hit(0) && this.mode === 'play') this.interact();
      else if (hit(2) && this.mode === 'play') this.attack();
      else if (hit(1) && this.mode !== 'title') this.resume();
      this.buttons = buttons;
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
        this.destination = null;
        this.route = [];
      } else if (this.destination) {
        if (distance(this.destination, this.valley.player) < 0.35)
          this.destination = this.route.shift() ?? null;
        if (this.destination) {
          dx = this.destination.x - this.valley.player.x;
          dz = this.destination.z - this.valley.player.z;
        }
      }
      this.valley.guard = held(b.guard!) || !!pad?.buttons[4]?.pressed;
      this.valley.step(dt, dx, dz, held('ShiftLeft') || held('ShiftRight') || !!pad?.buttons[5]?.pressed);
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
