import { commitPreconditions, hasProcedure, riteCalmActive, rotationBlockers, stabilizePreconditions } from '../core/game/commands';
import { quiverCapacity } from '../core/game/hunting';
import { fordPatrol, journeyLead } from '../core/game/valeJourney';
import { bladeDamage } from '../core/rules/valeCombat';
import { project } from './projection';
import { artUrl } from './atlas';
import { gameFile } from './files';
import type { VoiceMode } from './reading';
import type { Sound, MixLevels } from './audio';
import { SPEAKER_NAMES, VOICE_LINES, shown } from '../core/content/voice';
import { S } from '../core/content/strings';
import { ITEMS, ITEM_ORDER, itemAction, hotbarEligible } from '../core/content/items';
import { NPCS } from '../core/content/npcs';
import { getNode } from '../core/game/dialogue';
import { buildJournal } from '../core/game/journal';
import { formatClock } from '../core/game/state';
import { COUNTER_WINDOW, meleeWarning, gestureLabels } from './fieldcraft';
import type { RoomTarget } from './roomTargets';
import { households } from './households';
import type { Fixture } from './roomPlans';
import type { Game } from '../core/game/game';
import type { ItemId, NpcId } from '../core/game/types';
import { ENEMY_ARCHETYPES } from '../core/content/enemies';
import { PLACES } from '../core/world/layout';
import { worldView } from '../core/game/worldView';
import { HAND_SAVE_SLOTS } from '../core/rules/session';
import { type SaveStore, type SlotId } from '../platform/storage';
import type { Valley } from './simulation';
import type { Scene } from './scene';
import { chartMarker } from './valeMap';
import type { InteractableAct } from '../core/rules/interactables';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text) element.textContent = text;
  return element;
}
function button(label: string, action: () => void, cls = '') {
  const b = el('button', cls, label);
  b.type = 'button';
  b.onclick = action;
  return b;
}
const fieldIcons = new Set(['raw_meat', 'iron_scrap', 'shore_apple', 'field_mushroom']);
function icon(key: string) {
  const i = el('img');
  i.src = fieldIcons.has(key) ? gameFile('valley/icons/' + key + '.png') : artUrl('icons/' + key + '.png');
  i.alt = '';
  i.draggable = false;
  return i;
}
const castRows: Partial<Record<NpcId | 'wanderer', number>> = {
  rillford_reeve: 0, quarry_foreman: 1, spring_steward: 2, caravan_master: 3, shrine_warden: 4, wanderer: 5,
};
function castPortrait(who: NpcId | 'wanderer', mood: number) {
  const row = castRows[who];
  if (row === undefined) return icon(who);
  const face = el('span', 'pixel-portrait');
  face.setAttribute('role', 'img');
  face.setAttribute('aria-label', (who === 'wanderer' ? 'Wanderer' : NPCS[who].name) + ', ' +
    ['composed', 'stern', 'worried', 'warm', 'surprised'][mood]);
  face.style.backgroundImage = 'url("' + gameFile('valley/portraits.png') + '")';
  face.style.backgroundPosition = (mood * 25) + '% ' + (row * 20) + '%';
  return face;
}
const charmText: Partial<Record<ItemId, string>> = {
  league_sash: '+15% stamina recovery', contract_band: '+15% thrust damage', witness_cord: '+0.04 s parry window · 18% shorter bow focus',
};
const filters = ['All', 'Gear', 'Supplies', 'Quest'] as const;
type PackFilter = (typeof filters)[number];
function category(id: ItemId): PackFilter {
  if (id === 'gate_wrench' || ITEMS[id].kind === 'quest') return 'Quest';
  return ['clothing', 'weapon', 'tool'].includes(ITEMS[id].kind) ? 'Gear' : 'Supplies';
}
function iconButton(label: string, key: string, action: () => void) {
  const b = button('', action, 'tool');
  b.title = label;
  b.setAttribute('aria-label', label);
  b.append(icon(key));
  return b;
}
function readerLabel(node: HTMLElement): string {
  if (node instanceof HTMLInputElement)
    return (
      (node.labels?.[0]?.firstChild?.textContent ?? '') + ' ' + Math.round(Number(node.value) * 100) + '%'
    );
  if (node instanceof HTMLSelectElement)
    return (node.getAttribute('aria-label') ?? '') + ' ' + (node.selectedOptions[0]?.text ?? '');
  if (node.classList.contains('item'))
    return Array.from(node.querySelectorAll('span,small'), (n) => n.textContent).join(' times ');
  return node.getAttribute('aria-label') ?? node.textContent ?? '';
}
function pageText(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>('h1,h2,h3,p,dt,dd,strong,.save-row > span,button,select,input,canvas')
  )
    .filter((n) => !n.closest('[hidden],.read-aloud,.close') && !n.parentElement?.closest('button'))
    .map(readerLabel);
}
export type Screen =
  | 'title'
  | 'play'
  | 'pause'
  | 'journal'
  | 'inventory'
  | 'map'
  | 'dialogue'
  | 'actions'
  | 'help'
  | 'saves'
  | 'death'
  | 'settings';
export interface Controls {
  readonly controllerActive?: boolean;
  readonly sound: Sound;
  setVoiceMode(mode: VoiceMode): void;
  setMix(key: keyof MixLevels, value: number): void;
  start(load: boolean): void;
  resume(): void;
  save(slot: SlotId): void;
  load(slot: SlotId): void;
  interact(): void;
  interactIndex(i: number): void;
  attack(): void;
  setTouchGuard(down: boolean): void;
  pressAttack(): void;
  releaseAttack(): void;
  dodge(): void;
  aimTouch(x: number, y: number): void;
  quit(): void;
  setVolume(value: number): void;
  slot(i: number): void;
  setBindings(action: string, key: string): void;
  readonly settings: {
    volume: number;
    mix: MixLevels;
    voiceMode: VoiceMode;
    bindings: Record<string, string>;
  };
}

export class Interface {
  mode: Screen = 'title';
  private layer = el('div', 'modal-layer');
  private hud = el('div', 'hud');
  private leadButton = el('button', 'journey-lead');
  private leadTitle = el('small');
  private leadText = el('strong');
  private leadBearing = el('span', 'journey-bearing');
  private packFilter: PackFilter = 'All';
  private titleBar = el('div', 'region');
  private chamber = el('span', 'room-name');
  private clock = el('span', 'clock');
  private place = el('strong');
  private health = el('span');
  private healthLoss = el('span', 'health-loss');
  private lastHealth = -1;
  private lastMaxHealth = -1;
  private vigor = el('span');
  private lifeNumber = el('span', 'life-number');
  private foePanel = el('section', 'foe-panel');
  private foeName = el('strong');
  private foeState = el('span', 'foe-state');
  private foeHealth = el('div', 'foe-health');
  private foeLoss = el('span', 'foe-loss');
  private foeLife = el('span', 'foe-life');
  private foeTiming = el('span', 'foe-timing');
  private foeId = '';
  private prompt = el('button', 'prompt');
  private promptText = '';
  private slots = el('div', 'belt');
  private notice = el('div', 'notice');
  private noticeUntil = 0;
  private notices = new Map<string, { node: HTMLElement; timer: number }>();
  private subtitle = el('div', 'spoken-caption plate');
  private passage?: { play: () => boolean; button: HTMLButtonElement; playing: boolean };
  private hoverTimer = 0;
  private nearbyPrompt = '';
  private promptSince = 0;
  private slotSig = '';
  private currentDialog = '';
  private selectedItem?: ItemId;
  private uiStamp = 0;
  private backTo: Screen = 'play';
  private game!: Game;
  private valley!: Valley;
  private scene!: Scene;
  constructor(
    private root: HTMLElement,
    private store: SaveStore,
    private controls: Controls
  ) {
    this.notice.setAttribute('role', 'status');
    this.notice.setAttribute('aria-live', 'polite');
    this.subtitle.hidden = true;
    this.subtitle.setAttribute('role', 'status');
    this.root.append(this.hud, this.layer, this.notice, this.subtitle);
    const controlAt = (e: Event) =>
      e.target instanceof Element
        ? e.target.closest<HTMLElement>('button:enabled,select,input,p.entry')
        : null;
    const preview = (node: HTMLElement) => {
      if (node.matches('.read-aloud') && this.passage?.playing) return;
      controls.sound.readInterface([readerLabel(node)]);
    };
    this.root.addEventListener('focusin', (e) => {
      const node = controlAt(e);
      if (
        controls.sound.mode === 'interface' &&
        node &&
        (controls.controllerActive || node.matches(':focus-visible'))
      )
        preview(node);
    });
    this.root.addEventListener('pointerover', (e) => {
      const node = controlAt(e);
      if (controls.sound.mode !== 'interface' || e.pointerType === 'touch' || !node) return;
      if (e.relatedTarget instanceof Node && node.contains(e.relatedTarget)) return;
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = window.setTimeout(() => {
        if (node.isConnected && !controls.sound.mixer.speaking) preview(node);
      }, 480);
    });
    this.root.addEventListener('pointerout', (e) => {
      if (!(e.relatedTarget instanceof Node && controlAt(e)?.contains(e.relatedTarget)))
        window.clearTimeout(this.hoverTimer);
    });
    this.root.addEventListener('change', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) preview(e.target);
    });
    this.prompt.onclick = () => controls.interact();
    this.chamber.hidden = true;
    this.chamber.setAttribute('aria-live', 'polite');
    this.leadButton.type = 'button';
    this.leadButton.onclick = () => this.open('journal');
    this.leadButton.append(this.leadTitle, this.leadText, this.leadBearing);
    this.titleBar.append(this.place, this.chamber, this.clock);
    const nav = el('nav', 'tools');
    nav.setAttribute('aria-label', 'Journey tools');
    nav.append(
      iconButton('Journal (J)', 'journal_icon', () => this.open('journal')),
      iconButton('Map (M)', 'map_icon', () => this.open('map')),
      iconButton('Inventory (I)', 'bag_icon', () => this.open('inventory')),
      iconButton('Pause (Esc)', 'seal', () => this.open('pause'))
    );
    const vitals = el('div', 'vitals');
    const bars = el('div', 'bars');
    for (const [label, value, cls] of [
      ['Health', this.health, 'health'],
      ['Stamina', this.vigor, 'stamina'],
    ] as const) {
      const row = el('div', 'meter ' + cls),
        track = el('div', 'track');
      row.append(el('span', 'meter-label', label));
      track.setAttribute('role', 'meter');
      track.setAttribute('aria-label', label);
      track.setAttribute('aria-valuemin', '0');
      if (cls === 'health') track.append(this.healthLoss);
      track.append(value);
      row.append(track);
      bars.append(row);
    }
    this.lifeNumber.setAttribute('aria-hidden', 'true');
    bars.firstElementChild!.append(this.lifeNumber);
    vitals.append(icon('seal'), bars);
    const foeHeading = el('div', 'foe-heading');
    foeHeading.append(this.foeName, this.foeState);
    this.foeHealth.setAttribute('role', 'meter');
    this.foeHealth.setAttribute('aria-valuemin', '0');
    this.foeHealth.append(this.foeLoss, this.foeLife);
    this.foePanel.append(foeHeading, this.foeHealth, this.foeTiming);
    this.foePanel.hidden = true;
    const attack = el('button', 'attack-touch', 'Attack');
    attack.type = 'button';
    let touchAim: { x: number; y: number } | undefined;
    attack.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      attack.setPointerCapture(e.pointerId);
      touchAim = { x: e.clientX, y: e.clientY };
      controls.pressAttack();
    };
    attack.onpointermove = e => {
      if (!touchAim || !attack.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - touchAim.x, dy = e.clientY - touchAim.y;
      if (Math.hypot(dx, dy) > 8) controls.aimTouch(dx, dy);
    };
    attack.onpointerup = (e) => {
      touchAim = undefined;
      if (e.button === 0) controls.releaseAttack();
    };
    attack.onpointercancel = () => { touchAim = undefined; this.valley.cancelPose(); };
    attack.onclick = (e) => {
      if (e.detail === 0) controls.attack();
    };
    const guard = el('button', 'guard-touch', 'Guard');
    guard.type = 'button';
    guard.setAttribute('aria-pressed', 'false');
    const holdGuard = (down: boolean) => {
      controls.setTouchGuard(down);
      guard.setAttribute('aria-pressed', String(down));
    };
    guard.onpointerdown = e => {
      if (e.button !== 0) return;
      e.preventDefault();
      guard.setPointerCapture(e.pointerId);
      holdGuard(true);
    };
    guard.onpointerup = guard.onpointercancel = guard.onlostpointercapture = () => holdGuard(false);
    guard.onclick = e => { if (e.detail === 0) holdGuard(guard.getAttribute('aria-pressed') !== 'true'); };
    const dodge = button('Dodge', () => controls.dodge(), 'dodge-touch');
    const location = el('div', 'field-location');
    location.append(this.titleBar, this.leadButton);
    this.hud.append(location, nav, vitals, this.foePanel, this.slots, this.prompt, dodge, guard, attack);
    this.hud.hidden = true;
  }
  bind(valley: Valley, scene: Scene) {
    this.valley = valley;
    this.game = valley.game;
    this.scene = scene;
    this.slotSig = '';
    this.foeId = '';
    this.lastHealth = -1;
    this.lastMaxHealth = -1;
    this.selectedItem = undefined;
    for (const { timer } of this.notices.values()) window.clearTimeout(timer);
    this.notices.clear();
    this.notice.replaceChildren();
    this.notice.classList.remove('visible');
  }
  message(text: string, announce = true, item?: ItemId, milestone = false) {
    const existing = this.notices.get(text);
    if (existing) window.clearTimeout(existing.timer);
    else if (this.notices.size >= 3) {
      const [oldest, entry] = this.notices.entries().next().value!;
      entry.node.remove();
      window.clearTimeout(entry.timer);
      this.notices.delete(oldest);
    }
    const node = existing?.node ?? el('div', 'notice-line', text);
    if (milestone) node.classList.add('milestone');
    if (item && !node.querySelector('img')) node.prepend(icon(item));
    this.notices.delete(text);
    this.notice.append(node);
    this.noticeUntil = performance.now() + 3300;
    this.notice.classList.add('visible');
    const timer = window.setTimeout(() => {
      node.remove();
      this.notices.delete(text);
      if (!this.notices.size) this.notice.classList.remove('visible');
    }, 3300);
    this.notices.set(text, { node, timer });
    if (announce && !existing) this.controls.sound.readInterface([text]);
  }
  caption(text: string) {
    if (!text && this.passage && !this.controls.sound.mixer.speaking) {
      this.passage.playing = false;
      this.passage.button.textContent = 'Read aloud';
    }
    this.subtitle.textContent = text;
    const panel = this.layer.querySelector<HTMLElement>('section');
    panel?.querySelector('.voicing')?.classList.remove('voicing');
    panel?.querySelector('.heard-reply')?.remove();
    this.subtitle.hidden = !text;
    if (!text || !panel || (this.mode !== 'dialogue' && !panel.dataset.castPage)) return;
    this.subtitle.hidden = true;
    const words = text.includes(' · ') ? text.slice(text.indexOf(' · ') + 3) : text;
    const line = Array.from(panel.querySelectorAll<HTMLElement>('[data-story],[data-voice]')).find(
      (n) => n.textContent === words || n.textContent === text
    );
    if (line) line.classList.add('voicing');
    else panel.querySelector('header')?.after(el('p', 'heard-reply', text));
  }
  private readerFor(panel: HTMLElement, play: () => boolean, initial: (() => boolean) | null = play) {
    if (this.controls.sound.mode === 'off') return;
    const host = panel.querySelector('header,.menu-choices')!;
    const control = button('Read aloud', () => this.readAloud(), 'read-aloud');
    host.insertBefore(control, host.querySelector('.close'));
    this.passage = { play, button: control, playing: false };
    if (initial) this.startReading(initial);
  }
  private interfaceReader(panel: HTMLElement, announce = true) {
    if (this.controls.sound.mode !== 'interface') return;
    queueMicrotask(() => {
      if (!panel.isConnected || this.passage || this.controls.sound.mode !== 'interface') return;
      const sound = this.controls.sound;
      const play = () => sound.readInterface(pageText(panel));
      const focus = panel.querySelector<HTMLElement>('.item-detail');
      const initial =
        this.mode === 'journal'
          ? play
          : () =>
              sound.readInterface(
                focus ? pageText(focus) : [panel.querySelector('h1,h2')?.textContent ?? '']
              );
      this.readerFor(panel, play, announce ? initial : null);
    });
  }
  private readWorldPage(panel: HTMLElement, lines: string[]) {
    if (!this.controls.sound.worldNarration) return;
    this.readerFor(panel, () => this.controls.sound.narrate(lines, 5));
  }
  private startReading(play: () => boolean) {
    const passage = this.passage!;
    passage.playing = play();
    passage.button.textContent = passage.playing ? 'Stop reading' : 'Read aloud';
  }
  readAloud() {
    const sound = this.controls.sound;
    if (!this.passage) {
      if (sound.mode === 'interface' && this.mode === 'play') {
        sound.unlock();
        if (sound.readingInterface) sound.stopInterface();
        else
          sound.readInterface([
            this.place.textContent ?? '',
            this.valley.roomName(),
            this.clock.textContent ?? '',
            ...(this.valley.combatTarget ? [this.foeName.textContent + ', ' + this.foeLife.title, this.foeState.textContent || ''] : []),
            'Health ' + this.game.state.player.health + ' of ' + this.game.state.player.maxHealth,
            'Stamina ' + Math.round(this.valley.stamina) + '%',
            this.promptLabel() || 'No nearby interaction',
          ]);
      }
      return;
    }
    sound.unlock();
    if (this.passage.playing && sound.mixer.speaking) sound.endLine();
    else this.startReading(this.passage.play);
  }
  private closeReading() {
    const active = this.passage?.playing;
    this.passage = undefined;
    if (active) this.controls.sound.endLine();
    else this.controls.sound.stopInterface();
    window.clearTimeout(this.hoverTimer);
    this.nearbyPrompt = '';
  }
  private shell(title: string, wide = false) {
    this.closeReading();
    this.hud.hidden = true;
    this.layer.replaceChildren();
    this.layer.hidden = false;
    const panel = el('section', 'page plate' + (wide ? ' wide' : ''));
    if (['pause', 'saves', 'help', 'settings'].includes(this.mode)) panel.classList.add('menu-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    const header = el('header');
    header.append(
      el('h2', '', title),
      button('Close', () => this.back(), 'close')
    );
    panel.append(header);
    this.layer.append(panel);
    this.interfaceReader(panel);
    return panel;
  }
  private back() {
    if (this.mode === 'help' || this.mode === 'settings' || this.mode === 'saves') {
      this.open(this.backTo);
      return;
    }
    this.controls.resume();
  }
  title() {
    this.closeReading();
    this.mode = 'title';
    this.hud.hidden = true;
    this.layer.hidden = false;
    this.layer.replaceChildren();
    const screen = el('section', 'title-screen');
    const landscape = el('div', 'title-landscape');
    landscape.setAttribute('aria-hidden', 'true');
    const scene = el('img', 'title-art');
    scene.src = artUrl('title.png');
    scene.alt = '';
    const fire = el('div', 'title-fire');
    for (let i = 0; i < 4; i++) fire.append(el('i'));
    landscape.append(scene, fire, el('div', 'title-mist'));
    const content = el('div', 'title-content');
    const premise = 'The storm has wrecked your boat. Beyond the pines, Rillford has grain, an idle mill, and a bell that no one will ring.';
    content.append(
      icon('seal'),
      el('p', 'locale', 'Bellwether Vale'),
      el('h1', '', 'Tervain'),
      el('p', 'premise', premise)
    );
    const choices = el('div', 'menu-choices');
    if (this.store.latest())
      choices.append(button('Continue journey', () => this.controls.start(true), 'primary'));
    choices.append(
      button('New journey', () => this.controls.start(false), this.store.latest() ? '' : 'primary'),
      button('Controls', () => {
        this.backTo = 'title';
        this.open('help');
      })
    );
    choices.append(
      button('Settings', () => {
        this.backTo = 'title';
        this.open('settings');
      })
    );
    content.append(choices);
    screen.append(
      landscape,
      content,
      el('small', 'version', 'Grey Strand  /  v' + __GAME_VERSION__ + ' · ' + __SOURCE_REVISION__)
    );
    this.layer.append(screen);
    this.interfaceReader(screen);
  }
  play() {
    if (['inventory', 'journal', 'map', 'pause', 'saves', 'help', 'settings'].includes(this.mode))
      this.controls.sound.page('play');
    this.hud.querySelector('.guard-touch')?.setAttribute('aria-pressed', 'false');
    this.closeReading();
    this.mode = 'play';
    this.hud.hidden = false;
    this.layer.hidden = true;
    this.layer.replaceChildren();
    this.update(true);
  }
  open(screen: Screen) {
    if (screen === 'play') {
      this.controls.resume();
      return;
    }
    this.valley.cancelPose();
    if (screen === 'title') {
      this.title();
      return;
    }
    if (screen === 'help' || screen === 'saves' || screen === 'settings')
      this.backTo = this.mode === 'title' ? 'title' : 'pause';
    this.mode = screen;
    this.controls.sound.page(screen);
    if (screen === 'pause') {
      const panel = this.shell('Journey paused');
      const menu = el('div', 'menu-choices');
      menu.append(
        button('Return to the vale', () => this.controls.resume(), 'primary'),
        button('Save or load', () => this.open('saves')),
        button('Controls', () => this.open('help')),
        button('Settings', () => this.open('settings')),
        button('Title screen', () => this.controls.quit())
      );
      panel.append(menu);
    } else if (screen === 'help') {
      const panel = this.shell('Controls');
      const dl = el('dl', 'key-list');
      for (const [k, v] of [
        ['W A S D / arrows', 'Move relative to the screen'],
        ['Click ground', 'Walk to a point'],
        [this.interactKey(), 'Use the nearest door, object or person'],
        [
          'Gold lantern',
          'Gold lanterns mark building entrances, exits and stairs. Walk through or click a lantern to use the passage. A padlock marks a sealed entrance.',
        ],
        ['M indoors', 'See rooms, stairs and your position on this floor'],
        [
          (this.controls.settings.bindings.attack ?? 'Space').replace(/^Key/, '') + ' / right mouse',
          'Hold to draw. Strafe with WASD and aim with the pointer or arrow keys. Release when the sights meet for a focused shot.',
        ],
        ['Controller X / RT', 'Hold to draw, aim with the right stick and release to shoot.'],
        [this.interactKey() + ' / click', 'Pet a cat or dog, sit, gather or cook. Move to stop an activity.'],
        [
          (this.controls.settings.bindings.grab ?? 'KeyG').replace(/^Key/, '') + ' / controller Y',
          'Lift a loose object or drag heavy furniture. Press again to let go.',
        ],
        [
          (this.controls.settings.bindings.turn ?? 'KeyR').replace(/^Key/, '') + ' / wheel / RB',
          'Turn the object in your hands. Click a nearby surface to set it down.',
        ],
        ['While carrying', 'Use the attack control to toss a light object or shove heavy furniture.'],
        ['Shift', 'Run. On a controller, tilt the left stick slightly to walk slowly.'],
        [(this.controls.settings.bindings.guard ?? 'KeyQ').replace(/^Key/, '') + ' / LB / Guard',
          'Hold to guard. With the sword equipped, raise guard just before contact to parry. Attack while the counter bar is lit to riposte.'],
        [(this.controls.settings.bindings.dodge ?? 'KeyC').replace(/^Key/, '') + ' / B / Dodge',
          'Dodge in a movement direction. With your feet still, dodge away from your opponent. Costs 22 stamina.'],
        ['Sword', 'Press attack during recovery for a return cut, then again for a finishing thrust.'],
        [
          (this.controls.settings.bindings.jump ?? 'KeyX').replace(/^Key/, '') + ' / LT',
          'Jump. Tap again just before landing to jump on your next step.',
        ],
        ['I / J / M', 'Inventory / journal / map'],
        ['1–0', 'Use a belt slot'],
        ['F5 / F9', 'Quick save / quick load'],
        ['Esc', 'Close a page or pause'],
        [
          'V',
          this.controls.sound.mode === 'interface'
            ? 'Read or stop the current page or your surroundings'
            : 'Replay or stop the current conversation, open book or note',
        ],
        [
          'Controller',
          'Left stick moves, A interacts or selects, D-pad chooses, X attacks, B closes, Start pauses',
        ],
      ]) {
        dl.append(el('dt', '', k), el('dd', '', v));
      }
      panel.append(dl);
    } else if (screen === 'settings') {
      const panel = this.shell('Settings');
      const label = el('label', 'volume', 'Game volume');
      const slider = el('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '.05';
      slider.value = String(this.controls.settings.volume);
      slider.oninput = () => this.controls.setVolume(Number(slider.value));
      label.append(slider);
      panel.append(label);
      const voiceLabel = el('label', 'volume spoken-audio', 'Spoken audio'),
        voiceMode = el('select');
      voiceMode.setAttribute('aria-label', 'Spoken audio');
      for (const [value, name] of [
        ['full', 'Characters and world narration'],
        ['interface', 'Characters, world and interface narration'],
        ['characters', 'Characters only'],
        ['off', 'Off'],
      ] as const) {
        const option = el('option', '', name);
        option.value = value;
        voiceMode.append(option);
      }
      voiceMode.value = this.controls.settings.voiceMode;
      voiceMode.onchange = () => {
        this.controls.setVoiceMode(voiceMode.value as VoiceMode);
        this.closeReading();
        panel.querySelector('.read-aloud')?.remove();
        this.interfaceReader(panel, false);
      };
      voiceLabel.append(voiceMode);
      panel.append(voiceLabel);
      for (const [key, name] of [
        ['voice', 'Voice volume'],
        ['music', 'Music volume'],
        ['effects', 'Effects volume'],
      ] as const) {
        const row = el('label', 'volume', name),
          level = slider.cloneNode(false) as HTMLInputElement;
        level.value = String(this.controls.settings.mix[key]);
        level.oninput = () => this.controls.setMix(key, Number(level.value));
        row.append(level);
        panel.append(row);
      }
      panel.append(el('h3', '', 'Keyboard'));
      for (const [action, code] of Object.entries(this.controls.settings.bindings)) {
        const b = button(
          action + ' · ' + code.replace('Key', ''),
          () => {
            b.textContent = 'Press a key';
            const listener = (e: KeyboardEvent) => {
              e.preventDefault();
              e.stopImmediatePropagation();
              if (e.code !== 'Escape') this.controls.setBindings(action, e.code);
              this.open('settings');
            };
            window.addEventListener('keydown', listener, { capture: true, once: true });
          },
          'binding'
        );
        panel.append(b);
      }
    } else if (screen === 'saves') {
      const panel = this.shell('Save or load');
      for (const slot of ['auto', 'quick', ...HAND_SAVE_SLOTS] as const) {
        const saved = this.store.load(slot);
        const row = el('div', 'save-row');
        row.append(
          el('strong', '', slot.replace('slot-', 'Journey ')),
          el('span', '', saved.ok ? formatClock(saved.state.clock) : 'Empty')
        );
        if (slot !== 'auto')
          row.append(
            button('Save', () => {
              this.controls.save(slot);
              this.open('saves');
            })
          );
        if (saved.ok) row.append(button('Load', () => this.controls.load(slot)));
        panel.append(row);
      }
    } else if (screen === 'inventory') this.inventory();
    else if (screen === 'journal') this.journal();
    else if (screen === 'map') this.map();
    else if (screen === 'death') {
      const panel = this.shell('You fell in the vale');
      panel.querySelector('header .close')?.remove();
      panel.append(
        button('Return to last save', () => this.controls.start(true), 'primary'),
        button('Begin again', () => this.controls.start(false))
      );
    }
  }
  private journal() {
    const panel = this.shell('Field journal', true),
      journal = buildJournal(this.game.state);
    const guide = journeyLead(this.game.state);
    const track = button('', () => {
      this.valley.action({ t: 'setFact', key: 'hide_journey_lead', value: !this.game.state.facts.hide_journey_lead });
      label();
    });
    const label = () => {
      const on = !this.game.state.facts.hide_journey_lead;
      track.textContent = on ? 'Hide field guide' : 'Show field guide';
      track.setAttribute('aria-pressed', String(on));
    };
    label();
    const current = el('section', 'journal-current');
    current.append(el('small', '', guide.chapter), el('h3', '', guide.action), el('p', '', guide.reason), track);
    if (guide.at) current.append(button('Show on map', () => this.open('map')));
    panel.append(current);
    const state = this.game.state, patrol = fordPatrol(state);
    if (state.facts.read_wagon_tally || state.discovered.ford || patrol.cleared) {
      panel.append(el('h3', '', 'Carters’ work · The ford road'),
        el('p', 'entry', patrol.paid ? 'The crossing is open. Joss paid the road wage.'
          : patrol.complete ? 'The crossing is open. Sign the tally at Joss’s wagon for six coin and a loaf.'
          : 'The flour carts need the ford. Drive off the two raiders and their bow lookout. ' + patrol.cleared + ' of ' + patrol.total + ' posts cleared.'));
    }
    panel.append(el('h3', '', 'Mill, quarry and spring'), el('p', '', S(journal.statusKey)));
    if (journal.leadKey) panel.append(el('p', 'lead', S(journal.leadKey)));
    for (const [name, rows] of [
      ['Observations', journal.observed],
      ['Testimony', journal.reported],
      ['Deductions', journal.concluded],
      ['Open questions', journal.questions],
    ] as const) {
      if (!rows.length) continue;
      panel.append(el('h3', '', name));
      for (const row of rows) panel.append(el('p', 'entry', S(row.key, row.params)));
    }
    const books = Object.entries(households).filter(
      ([id]) => this.game.state.facts['room_read:' + id] === true
    );
    if (books.length) {
      panel.append(el('h3', '', 'Household readings'));
      for (const [, home] of books) panel.append(el('strong', '', home.book), el('p', 'entry', home.passage));
    }
    const met = journal.people.filter((p) => p.met);
    if (met.length) {
      panel.append(el('h3', '', 'People met'), el('p', '', met.map((p) => NPCS[p.npc].name).join(' · ')));
    }
  }
  private inventory() {
    const panel = this.shell('Inventory', true);
    const loadout = el('div', 'loadout');
    const items = el('div', 'items');
    const detail = el('div', 'item-detail');
    detail.setAttribute('aria-label', 'Selected item');
    const tabs = el('nav', 'pack-tabs');
    tabs.setAttribute('aria-label', 'Inventory categories');
    for (const name of filters) tabs.append(button(name, () => {
      this.packFilter = name;
      this.refreshPack();
    }));
    for (const id of ITEM_ORDER) {
      const b = button('', () => this.inspectItem(id), 'item');
      b.dataset.item = id;
      b.onfocus = () => this.inspectItem(id);
      b.onpointerenter = e => { if (e.pointerType === 'mouse') this.inspectItem(id); };
      b.append(icon(id), el('span', '', S(ITEMS[id].nameKey)), el('small'));
      items.append(b);
    }
    loadout.append(items, detail);
    panel.append(tabs, loadout);
    this.refreshPack();
  }
  private refreshPack() {
    const s = this.game.state;
    const visible: ItemId[] = [];
    for (const tab of this.layer.querySelectorAll('.pack-tabs button'))
      tab.setAttribute('aria-pressed', String(this.packFilter === tab.textContent));
    for (const tile of this.layer.querySelectorAll<HTMLButtonElement>('.items .item')) {
      const id = tile.dataset.item as ItemId, amount = s.inventory[id] ?? 0;
      tile.hidden = !amount || (this.packFilter !== 'All' && this.packFilter !== category(id));
      if (tile.hidden) continue;
      visible.push(id);
      tile.querySelector('small')!.textContent = s.equippedWeapon === id || s.facts.worn_charm === id ? 'Equipped' : '×' + amount;
    }
    const detail = this.layer.querySelector<HTMLElement>('.item-detail')!;
    delete detail.dataset.item;
    const next = this.selectedItem && visible.includes(this.selectedItem) ? this.selectedItem : visible[0];
    if (next) this.inspectItem(next, true);
    else { this.selectedItem = undefined; detail.replaceChildren(el('p', '', this.packFilter === 'All' ? 'Your pack is empty.' : 'Nothing in this category.')); }
  }
  private inspectItem(id: ItemId, initial = false) {
    const detail = this.layer.querySelector<HTMLElement>('.item-detail');
    if (!detail || detail.dataset.item === id) return;
    if (!initial) this.controls.sound.selection();
    detail.dataset.item = id;
    this.selectedItem = id;
    for (const b of this.layer.querySelectorAll<HTMLButtonElement>('.item'))
      b.setAttribute('aria-pressed', String(b.dataset.item === id));
    const image = icon(id);
    detail.replaceChildren(image, el('h3', '', S(ITEMS[id].nameKey)), el('p', '', S(ITEMS[id].descKey)));
    const state = this.game.state;
    const stat = ITEMS[id].healAmount ? 'Restores ' + ITEMS[id].healAmount + ' HP'
      : id === 'rusted_sword' ? (state.facts.blade_honed ? 'Honed · ' : '') + ['attack', 'thrust', 'counter'].map(k =>
        bladeDamage(state, k as 'attack' | 'thrust' | 'counter')).join(' / ') + ' damage · cut / thrust / counter'
      : id === 'hunting_bow' || id === 'arrow' ? '32 / 43 damage · loose / focused · ' + (state.inventory.arrow ?? 0) + ' / ' + quiverCapacity(state) + ' arrows' : charmText[id];
    if (stat) detail.append(el('p', 'item-stat', stat));
    if (charmText[id]) detail.append(button(state.facts.worn_charm === id ? 'Remove charm' : 'Wear charm', () => {
      if (this.valley.action({ t: 'wearCharm', item: state.facts.worn_charm === id ? null : id })) this.controls.sound.selection(true);
      this.refreshPack();
      this.layer.querySelector<HTMLButtonElement>('.item[aria-pressed="true"]')?.focus();
    }));
    const act = itemAction(id);
    if (act)
      detail.append(
        button(act === 'equip' ? (state.equippedWeapon === id ? 'Equipped' : 'Equip') : 'Consume', () => {
          if (this.valley.action(act === 'equip' ? { t: 'equipWeapon', item: id } : { t: 'useItem', item: id })) this.controls.sound.selection(true);
          this.refreshPack();
          this.layer.querySelector<HTMLButtonElement>('.item[aria-pressed="true"]')?.focus();
        })
      );
    if (hotbarEligible(id)) {
      const keys = el('div', 'belt-keys');
      keys.setAttribute('role', 'group');
      keys.setAttribute('aria-label', 'Assign belt slot');
      detail.append(el('small', 'belt-label', 'Bind to belt'), keys);
      for (let i = 0; i < 10; i++) {
        const label = String((i + 1) % 10);
        const key = button(label, () => this.bindBelt(i));
        key.setAttribute('aria-label', 'Assign to belt slot ' + label);
        key.setAttribute('aria-pressed', String(this.game.state.quickSlots[i] === id));
        keys.append(key);
      }
    }
  }
  private bindBelt(slot: number) {
    const id = this.selectedItem;
    if (!id || !hotbarEligible(id) || !this.valley.action({ t: 'assignQuickSlot', slot, item: id })) return;
    this.controls.sound.selection(true);
    this.layer.querySelectorAll('.belt-keys button').forEach((b, i) =>
      b.setAttribute('aria-pressed', String(this.game.state.quickSlots[i] === id)));
    this.message(S(ITEMS[id].nameKey) + ' · Belt ' + (slot + 1) % 10);
  }
  pageKey(code: string) {
    if (this.mode === 'inventory' && /^Digit\d$/.test(code) && this.selectedItem && hotbarEligible(this.selectedItem)) {
      this.bindBelt((Number(code.slice(-1)) + 9) % 10);
      return true;
    }
    if (this.mode !== 'dialogue') return false;
    if (code === 'Space' || code === this.controls.settings.bindings.interact) {
      const speech = this.layer.querySelector<HTMLElement>('.speech.revealing');
      if (speech && speech.getAnimations({ subtree: true }).some(a => a.playState !== 'finished')) {
        speech.classList.remove('revealing');
        return true;
      }
      if (document.activeElement instanceof HTMLButtonElement && this.layer.contains(document.activeElement)) {
        document.activeElement.click();
      } else this.layer.querySelector<HTMLButtonElement>('.dialogue-choice:enabled')?.click();
      return true;
    }
    if (code === 'ArrowDown' || code === 'ArrowUp') {
      this.padMenu(code === 'ArrowDown' ? 1 : -1, false);
      return true;
    }
    if (!/^Digit[1-9]$/.test(code)) return false;
    const replies = this.layer.querySelectorAll<HTMLButtonElement>('.dialogue-choice');
    const reply = replies[Number(code.slice(-1)) - 1];
    if (reply && !reply.disabled) reply.click();
    return !!reply;
  }
  get speaker() {
    const id = this.mode === 'dialogue' && getNode(this.currentDialog)?.speaker;
    if (!id || id === 'narrator') return;
    if (!this.valley.room) return this.valley.actors.find(a => a.npc === id);
    for (const resident of this.valley.roomResidents) if (resident.a.npc === id) return resident.at;
  }
  private map(world = false) {
    const room = !world && this.valley.room;
    const panel = this.shell(room ? this.valley.placeName() + ' · ' + room.name : 'Map of the vale', true);
    const canvas = el('canvas', 'map-canvas');
    canvas.width = 450;
    canvas.height = 264;
    if (room) {
      canvas.setAttribute(
        'aria-label',
        room.rooms.map((r) => r.name).join(', ') +
          '. ' +
          room.passages
            .map((p) => (p.kind === 'outside' ? 'Exit' : p.kind === 'up' ? 'Stairs up' : 'Stairs down'))
            .join(', ')
      );
      this.scene.drawFloorMap(canvas, this.valley);
      panel.append(
        canvas,
        el('p', 'map-note', '↑ Upstairs · ↓ Downstairs · ◆ Outside'),
        button('Map of the vale', () => this.map(true))
      );
      return;
    }
    canvas.setAttribute(
      'aria-label',
      'Map of the vale with roads, rivers, Hegemony standards and the player position'
    );
    this.scene.drawMap(canvas, this.valley);
    canvas.onclick = (e) => {
      const r = canvas.getBoundingClientRect();
      const at = chartMarker(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      this.valley.action({ t: 'setMapMarker', marker: at });
      this.scene.drawMap(canvas, this.valley);
    };
    panel.append(
      canvas,
      el('p', 'map-note', '◆ ' + journeyLead(this.game.state).action + ' · Click to set your own marker.')
    );
    const list = el('div', 'map-places');
    for (const place of buildJournal(this.game.state).places.filter((p) => p.status !== 'unknown')) {
      list.append(
        button(S('place.' + place.id), () => {
          const p = PLACES[place.id];
          this.valley.action({ t: 'setMapMarker', marker: { x: p.x, z: p.z } });
          this.scene.drawMap(canvas, this.valley);
        })
      );
    }
    panel.append(list);
  }
  dialogue(nodeId: string, answer?: string) {
    if (!this.game.showNode(nodeId).ok) {
      this.controls.resume();
      return;
    }
    this.showConversation(nodeId, answer);
  }
  private showConversation(nodeId: string, answer?: string) {
    const node = getNode(nodeId)!;
    this.currentDialog = nodeId;
    this.mode = 'dialogue';
    const panel = this.shell(node.speaker === 'narrator' ? 'Bellwether Vale' : NPCS[node.speaker].name);
    panel.classList.add('conversation');
    if (node.speaker !== 'narrator') {
      const mood = /accuse|deny|refus|demand|threat/.test(nodeId) ? 1 : /warn|dry|damage|worry|loss/.test(nodeId) ? 2
        : /consent|agree|thanks|after|teach/.test(nodeId) ? 3 : /reveal|proof/.test(nodeId) ? 4
        : ({ quarry_foreman: 1, spring_steward: 2, caravan_master: 3 } as Partial<Record<NpcId, number>>)[node.speaker] ?? 0;
      const portrait = castPortrait(node.speaker, mood);
      portrait.classList.add('speaker');
      panel.append(portrait, el('small', 'role', S(NPCS[node.speaker].titleKey)));
    }
    const speech = el('p', 'speech', S(node.text));
    speech.dataset.story = node.text;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && this.controls.sound.mode !== 'interface') {
      const words = speech.textContent!.match(/\S+\s*/g) ?? [];
      const step = Math.min(42, 1100 / Math.max(1, words.length));
      speech.replaceChildren(...words.map((word, i) => {
        const part = el('span', '', word);
        part.style.animationDelay = i * step + 'ms';
        return part;
      }));
      if (this.controls.sound.mode === 'off') speech.addEventListener('animationstart', (event) => {
        const word = (event.target as HTMLElement)?.previousElementSibling;
        if (!word || (word.textContent ?? '').length >= 8) this.controls.sound.dialogueTick();
      });
      speech.classList.add('revealing');
      speech.onclick = () => speech.classList.remove('revealing');
    }
    panel.append(speech);
    const replay = () => this.controls.sound.story([node.text]);
    this.readerFor(panel, replay, answer ? () => this.controls.sound.story([answer, node.text]) : replay);
    const replies = el('div', 'replies');
    const listener = el('div', 'listener');
    listener.append(castPortrait('wanderer', 0));
    panel.append(listener, replies);
    for (const { index, choice, locked } of this.game.choices(nodeId)) {
      const b = button(
        S(choice.text),
        () => {
          const res = this.game.choose(this.currentDialog, index);
          if (res.ok) {
            this.controls.sound.selection(choice.intent === 'train');
            if (res.next === 'end') {
              this.controls.resume();
              this.controls.sound.story([choice.text]);
            } else this.dialogue(res.next, choice.text);
          }
        },
        'reply dialogue-choice'
      );
      const number = replies.children.length + 1;
      const hint = el('small', 'choice-key', String(number));
      hint.setAttribute('aria-hidden', 'true');
      b.prepend(hint);
      if (choice.intent) b.append(el('small', 'choice-intent', choice.intent));
      b.disabled = locked;
      const react = () => {
        const mood = choice.intent === 'accuse' || choice.intent === 'warn' ? 1 : choice.intent === 'persuade' ? 2
          : choice.intent === 'agree' || choice.intent === 'offer' || choice.intent === 'train' ? 3 : choice.intent === 'ask' ? 4 : 0;
        if (listener.dataset.mood !== String(mood)) { listener.dataset.mood = String(mood); listener.replaceChildren(castPortrait('wanderer', mood)); }
      };
      b.onfocus = react;
      b.onpointerenter = react;
      replies.append(b);
    }
    const npc = node.speaker;
    if (npc !== 'narrator')
      panel.append(
        button(
          'Ask about the vale',
          () => {
            const ids = this.controls.sound.more(npc, this.valley);
            if (!ids) return;
            this.mode = 'actions';
            const page = this.shell(NPCS[npc].name);
            page.dataset.castPage = 'true';
            for (const id of ids) {
              const line = VOICE_LINES[id]!,
                p = el('p', 'speech', SPEAKER_NAMES[line.speaker] + ' · ' + shown(line.text));
              p.dataset.voice = id;
              page.append(p);
            }
            page.append(button('Back to conversation', () => this.showConversation(nodeId)));
            const play = () => this.controls.sound.tell(ids, 5);
            this.readerFor(page, play);
          },
          'reply'
        )
      );
  }
  actions(title: string, options: { text: string; run: () => void; detail?: string; disabled?: boolean }[], description = '') {
    this.mode = 'actions';
    const panel = this.shell(title);
    if (description) panel.append(el('p', '', description));
    for (const option of options) {
      const control = button(option.text, option.run, 'reply');
      control.disabled = !!option.disabled;
      if (option.detail) control.append(el('small', 'action-detail', option.detail));
      panel.append(control);
    }
    return panel;
  }
  private interactKey() {
    if (this.controls.controllerActive) return 'A';
    return (this.controls.settings.bindings.interact ?? 'KeyE').replace(/^Key/, '').replace(/^Digit/, '');
  }
  cooking(target: RoomTarget, title: string) {
    const v = this.valley,
      held = this.game.state.inventory;
    const cook = (pack: boolean) => {
      this.controls.resume();
      if (!(held.raw_meat || held.field_mushroom)) {
        this.message('Bring raw meat or a field mushroom.');
        return;
      }
      if (!pack && v.player.health >= v.player.maxHealth) {
        this.message('Already at full health. Pack a portion for later.');
        return;
      }
      v.perform('stir', target, 2.15, () => {
        if (v.action({ t: 'roomCraft', recipe: pack ? 'pack_stew' : 'cook' }))
          this.message(pack ? 'Trail stew packed × 1' : 'A hot meal restored your health');
      });
    };
    this.actions(
      title,
      [
        { text: 'Pack trail stew', run: () => cook(true) },
        { text: 'Cook and eat a hot meal', run: () => cook(false) },
      ],
      'Use one portion of raw meat or one field mushroom. A portion restores up to 30 health. In your pack · meat ' +
        (held.raw_meat ?? 0) +
        ' · mushrooms ' +
        (held.field_mushroom ?? 0)
    );
  }
  wagonTally(target: RoomTarget) {
    const v = this.valley;
    const paid = this.game.state.facts.wagon_iron_paid === true;
    if (!this.game.state.facts.read_wagon_tally)
      v.action({ t: 'setFact', key: 'read_wagon_tally', value: true });
    const close = () => this.controls.resume();
    const options = [];
    if (!paid && (this.game.state.inventory.iron_scrap ?? 0) > 0) {
      options.push({
        text: 'Leave one iron scrap for four coin',
        run: () => {
          close();
          v.perform('work', target, 1.3, () => {
            if (v.action({ t: 'deliverWagonIron' })) this.wagonTally(target);
          });
        },
      });
    }
    if (!this.game.state.facts.blade_honed && this.game.state.inventory.rusted_sword && this.game.state.inventory.iron_scrap) {
      options.push({ text: 'Hone the blade · 1 iron scrap · +4 damage', run: () => {
        close();
        v.perform('work', target, 1.3, () => {
          if (v.action({ t: 'sharpenBlade' })) { this.controls.sound.reward(); this.message('Blade honed · +4 damage', true, 'rusted_sword', true); }
        });
      } });
    }
    if (!this.game.state.facts.quiver_lined && this.game.state.inventory.hunting_bow && this.game.state.inventory.animal_hide) {
      options.push({ text: 'Line the quiver · 1 hide · 56 arrows', run: () => {
        close(); v.perform('work', target, 1.3, () => {
          if (v.action({ t: 'lineQuiver' })) { this.controls.sound.reward(); this.message('Quiver lined · 56 arrows', true, 'hunting_bow', true); }
        });
      } });
    }
    const patrol = fordPatrol(this.game.state);
    if (patrol.complete && !patrol.paid) options.push({ text: 'Collect the ford wage · 6 coin and a loaf', run: () => {
      if (v.action({ t: 'collectFordWage' })) { this.controls.sound.selection(true); this.wagonTally(target); }
    } });
    options.push({ text: 'Close the tally', run: close });
    const note = S(paid ? 'wagon.receipt' : 'wagon.order') + (patrol.paid ? ' The ford wage has been signed for.'
      : ' The flour carts also need the ford clear. Six coin and a loaf for the two raiders and their lookout.');
    const panel = this.actions(S('wagon.title'), options, note);
    this.readWorldPage(panel, [note]);
  }
  roomFixture(f: Fixture) {
    const v = this.valley,
      room = v.room;
    if (!room || !f.use) return;
    const target = v.targets().find((t) => t.fixture === f)!;
    const home = households[room.site.id]!,
      finish = () => this.controls.resume();
    const read = () => {
      finish();
      v.perform('read', target, 1.05, () => {
        v.action({ t: 'setFact', key: 'room_read:' + room.site.id, value: true });
        const page = this.actions(home.book, [{ text: 'Close the book', run: finish }], home.passage);
        this.readWorldPage(page, [home.book, home.passage]);
      });
    };
    if (f.use === 'book') {
      read();
      return;
    }
    if (f.use === 'trade' && room.site.id === 'house_a' && room.level === 'ground') {
      const key = 'room_indigo:' + room.site.id,
        dye = this.game.state.facts[key] !== true;
      this.actions(
        'The weaver’s loom',
        [
          {
            text: dye ? 'Weave an indigo runner' : 'Weave a madder-red runner',
            run: () => {
              finish();
              v.perform('work', target, 1.1, () => {
                v.action({ t: 'setFact', key, value: dye });
                this.message('The new runner is laid in the entry hall.');
              });
            },
          },
          { text: 'Read the pattern book', run: read },
        ],
        'Two shuttles hold indigo and madder wool. Choose the colour of the hall runner.'
      );
      return;
    }
    if (f.use === 'lamp') {
      const on = v.lightsOn;
      finish();
      v.perform('work', target, 0.58, () => {
        v.action({ t: 'setFact', key: 'room_dim:' + v.roomKey, value: on });
        this.message(on ? 'Lights lowered' : 'Lights kindled');
      });
      return;
    }
    if (f.use === 'chest') {
      v.openChest = f.id;
      const options = [];
      for (const id of ITEM_ORDER) {
        const held = this.game.state.inventory[id] ?? 0,
          stored = this.game.state.facts['room_store:' + room.site.id + ':' + id];
        const transfer = (direction: 'deposit' | 'withdraw') => {
          v.action({ t: 'roomStorage', item: id, direction });
          this.roomFixture(f);
        };
        if (held)
          options.push({
            text: 'Store ' + S(ITEMS[id].nameKey) + ' · carrying ' + held,
            run: () => transfer('deposit'),
          });
        if (typeof stored === 'number' && stored > 0)
          options.push({
            text: 'Take ' + S(ITEMS[id].nameKey) + ' · stored ' + stored,
            run: () => transfer('withdraw'),
          });
      }
      options.push({ text: 'Close the chest', run: finish });
      this.actions(
        home.name + ' · Storage',
        options,
        'Move one item at a time. The chests in this building share your stores.'
      );
      return;
    }
    if (f.use === 'supply' && f.item) {
      const item = f.item,
        name = S(ITEMS[item].nameKey),
        id = 'room_' + room.site.id + '_' + room.level + '_supplies';
      if (this.game.state.locationChanges['pickup:' + id] === 'taken') {
        this.actions('Cupboard', [{ text: 'Close', run: finish }], 'The shelves are empty.');
        return;
      }
      this.actions(
        'Household supplies',
        [
          {
            text: 'Take ' + name,
            run: () => {
              finish();
              v.perform('gather', target, 0.85, () => {
                if (v.action({ t: 'pickup', pickupId: id, item, qty: 1 })) this.message(name + ' × 1');
              });
            },
          },
        ],
        'On the shelf · ' + name
      );
      return;
    }
    if (f.use === 'bed') {
      const sleep = (mins: number) => {
        finish();
        v.perform('sit', target, 1.05, () => {
          v.action({ t: 'advanceClock', minutes: mins });
          v.action({ t: 'healPlayer', amount: Math.max(5, Math.round(mins / 3)) });
          v.stamina = 100;
          this.message('Rested · ' + formatClock(this.game.state.clock));
        });
      };
      this.actions(
        'Rest in the bed',
        [
          { text: 'Rest for one hour', run: () => sleep(60) },
          {
            text: 'Sleep until dawn',
            run: () => sleep((360 - (this.game.state.clock % 1440) + 1440) % 1440 || 1440),
          },
        ],
        'Rest restores health and stamina.'
      );
      return;
    }
    const task =
      f.use === 'hearth'
        ? 'cook'
        : room.level === 'cellar' && ['ledger', 'rite', 'read'].includes(home.task)
          ? 'herbs'
          : home.task;
    if (task === 'read') {
      read();
      return;
    }
    if (task === 'rite' || task === 'ledger') {
      this.actions(task === 'rite' ? 'Offering altar' : 'Water ledger', [
        {
          text: task === 'rite' ? 'Make the offering' : 'Examine the ledger',
          run: () => {
            v.action(task === 'rite' ? { t: 'performRite' } : { t: 'readLedger' });
            finish();
          },
        },
      ]);
      return;
    }
    if (task === 'cook') {
      this.cooking(target, f.use === 'hearth' ? 'The hearth' : home.workroom);
      return;
    }
    const recipe = task;
    const title = recipe === 'herbs' ? 'Bind a poultice' : 'Fletch four arrows';
    const detail =
      recipe === 'herbs'
        ? 'Wrap one healing herb into a poultice.'
        : 'Shape one iron scrap into four arrowheads.';
    this.actions(
      f.use === 'hearth' ? 'The hearth' : room.level === 'cellar' ? 'Cellar workbench' : home.workroom,
      [
        {
          text: title,
          run: () => {
            finish();
            v.perform('work', target, 1.45, () => {
              if (v.action({ t: 'roomCraft', recipe }))
                this.message(recipe === 'herbs' ? 'Poultice × 1' : 'Arrows × 4');
            });
          },
        },
      ],
      detail
    );
  }
  padMenu(move: number, confirm: boolean, horizontal = 0) {
    const focused = document.activeElement;
    if (horizontal && focused instanceof HTMLInputElement && focused.type === 'range') {
      if (horizontal > 0) focused.stepUp();
      else focused.stepDown();
      focused.dispatchEvent(new Event('input', { bubbles: true }));
      focused.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (horizontal && focused instanceof HTMLSelectElement) {
      focused.selectedIndex = Math.max(0, Math.min(focused.length - 1, focused.selectedIndex + horizontal));
      focused.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const controls = Array.from(
      this.layer.querySelectorAll<HTMLElement>('button:enabled,input:enabled,select:enabled')
    );
    if (!controls.length) return;
    const current = controls.indexOf(focused as HTMLElement);
    const next =
      current < 0
        ? Math.max(
            0,
            controls.findIndex((b) => !b.matches('.close,.read-aloud'))
          )
        : (current + move + controls.length) % controls.length;
    controls[next]!.focus();
    if (confirm) controls[next]!.click();
  }
  chooseOffers() {
    this.actions(
      'Within reach',
      this.valley.offers().map((o, i) => ({ text: o.label, run: () => this.controls.interactIndex(i) }))
    );
  }
  controlsAt(act: InteractableAct, onEntry?: () => void) {
    if (act.do === 'open_sluice') {
      const state = this.game.state, gate = state.quest.gate;
      const guide = journeyLead(state);
      if (state.quest.phase === 'settled' || state.quest.phase === 'committed') {
        this.actions('The sluice', [{ text: 'Read the field journal', run: () => this.open('journal') }], guide.reason);
      } else if (gate !== 'stabilized') {
        const need = stabilizePreconditions(state);
        const repair = need === 'need_brace' ? 'Find the iron brace in the quarry yard.'
          : need === 'need_wrench' ? 'Find the gate wrench beside the brace.'
          : need === 'need_understanding' ? 'Inspect the crack or ask Ila how to seat the brace.'
          : S(riteCalmActive(state) ? 'sluice.brace.safe.rite' : hasProcedure(state) ? 'sluice.brace.safe.procedure' : 'sluice.brace.unsafe');
        const options = [{ text: 'Brace the gate', detail: repair, disabled: !!need,
          run: () => { if (this.valley.action({ t: 'stabilizeGate' })) this.controlsAt(act); } }];
        if (gate === 'damaged') options.push({ text: 'Force the gate', detail: S('sluice.force.warn'), disabled: false,
          run: () => { if (this.valley.action({ t: 'forceGate' })) this.controlsAt(act); } });
        this.actions('The sluice', options, S('sluice.state.' + gate));
      } else {
        const names = { rillford: 'Send water to Rillford', quarry: 'Send water to the quarry', rotation: 'Agree a rotation' };
        const options = (['rillford','quarry','rotation'] as const).map(allocation => {
          const needed = allocation === 'rotation' ? rotationBlockers(state).map(b => S('sluice.alloc.rotation.need.' + b)) : [];
          return { text: names[allocation], detail: [S('sluice.alloc.' + allocation + '.gain'), S('sluice.alloc.' + allocation + '.cost'), ...needed].join(' '),
            disabled: !!commitPreconditions(state,allocation),
            run: () => { if (this.valley.action({ t: 'commitAllocation', allocation })) this.controls.resume(); } };
        });
        this.actions('The water hearing',options,'The brace is holding. Choose who will receive the spring water.');
      }
    } else if (act.do === 'hunting_notes') {
      const note = S('inspect.hunter_supplies');
      const page = this.actions(
        'Hunter’s table',
        [{ text: 'Return', run: () => this.controls.resume() }],
        'Take the bow, knife and arrows. Rowan trades fresh meat and hides at this table.'
      );
      page.querySelector('header')!.after(el('p', '', note));
      this.readWorldPage(page, [note]);
    } else if (act.do === 'try_archive_door') {
      this.actions('The archive', [
        {
          text: 'Ask for authorised entry',
          run: () => {
            if (this.valley.action({ t: 'archiveAccess', method: 'permission' })) onEntry?.();
            this.controls.resume();
          },
        },
        {
          text: 'Use the borrowed key',
          run: () => {
            if (this.valley.action({ t: 'archiveAccess', method: 'borrowed_key' })) onEntry?.();
            this.controls.resume();
          },
        },
      ]);
    }
  }
  private promptLabel() {
    return this.scene.hoverLabel || (this.prompt.hidden ? '' : (this.prompt.textContent ?? ''));
  }
  private announcePrompt(label: string) {
    const now = performance.now();
    if (label !== this.nearbyPrompt) {
      this.nearbyPrompt = label;
      this.promptSince = now;
    }
    if (
      label &&
      now - this.promptSince >= 700 &&
      !this.controls.sound.mixer.speaking &&
      this.controls.sound.readInterface([label])
    )
      this.promptSince = Infinity;
  }
  private updateEncounter() {
    const enemy = this.valley.combatTarget;
    if (!enemy) {
      if (!this.foePanel.hidden) this.foePanel.hidden = true;
      this.foeId = '';
      return;
    }
    const def = ENEMY_ARCHETYPES[enemy.enemyKind ?? 'bandit'];
    const changed = this.foeId !== enemy.id;
    const hp = String(Math.max(0, enemy.health));
    if (changed || this.foeHealth.getAttribute('aria-valuenow') !== hp) {
      const amount = Math.max(0, Math.min(1, enemy.health / def.hp));
      this.foeName.textContent = enemy.name;
      this.foeHealth.setAttribute('aria-label', enemy.name + ' health');
      this.foeHealth.setAttribute('aria-valuenow', hp);
      this.foeHealth.setAttribute('aria-valuemax', String(def.hp));
      this.foeLife.title = hp + ' of ' + def.hp + ' health';
      this.foeLife.style.transform = 'scaleX(' + amount + ')';
      this.foeLoss.style.transition = changed ? 'none' : '';
      this.foeLoss.style.transform = this.foeLife.style.transform;
    }
    const opening = Math.max(0, (enemy.openedUntil ?? 0) - this.valley.time);
    const melee = meleeWarning(enemy.attack, def.heavy, this.valley.parryWindow);
    const aiming = !!enemy.aimed;
    const winding = aiming || melee.visible;
    const mode = opening ? 'open' : winding ? 'incoming' : 'idle';
    if (this.foePanel.dataset.state !== mode) this.foePanel.dataset.state = mode;
    const label = opening ? 'Counter' : aiming ? 'Aiming · step off the sightline' : melee.ready ? (this.game.state.equippedWeapon === 'rusted_sword' ? 'Parry now' : 'Dodge now')
      : melee.visible ? (def.heavy ? 'Heavy strike' : 'Incoming')
      : enemy.enemyKind === 'deserter' ? 'Shield raised · flank or thrust' : '';
    if (this.foeState.textContent !== label) this.foeState.textContent = label;
    if (opening || winding) {
      const fill = opening ? opening / COUNTER_WINDOW : aiming ? 1 - enemy.attack / def.wind : melee.progress;
      this.foeTiming.style.transform = 'scaleX(' + Math.max(0, Math.min(1, fill)) + ')';
    }
    this.foeId = enemy.id;
    if (this.foePanel.hidden) this.foePanel.hidden = false;
  }
  update(force = false) {
    const now = performance.now();
    if (now > this.noticeUntil) this.notice.classList.remove('visible');
    if (this.mode !== 'play') return;
    const s = this.game.state;
    this.updateEncounter();
    const { health, maxHealth } = s.player;
    if (health !== this.lastHealth || maxHealth !== this.lastMaxHealth) {
      const damage = this.lastHealth >= 0 && health < this.lastHealth;
      if (damage) {
        const vitals = this.hud.querySelector('.vitals')!;
        vitals.classList.remove('just-hit');
        void vitals.getBoundingClientRect();
        vitals.classList.add('just-hit');
      }
      this.healthLoss.style.transition = damage ? '' : 'none';
      this.healthLoss.style.width = (health / maxHealth) * 100 + '%';
      this.hud.classList.toggle('low-health', health > 0 && health / maxHealth <= 0.25);
      this.lastHealth = health;
      this.lastMaxHealth = maxHealth;
      this.lifeNumber.textContent = String(health);
      this.health.style.width = (health / maxHealth) * 100 + '%';
      const meter = this.health.parentElement!;
      meter.title = 'Health ' + health + ' / ' + maxHealth;
      meter.setAttribute('aria-valuenow', String(health));
      meter.setAttribute('aria-valuemax', String(maxHealth));
    }
    this.hud.classList.toggle('winded', this.valley.time < this.valley.tiredUntil);
    if (!force && now - this.uiStamp < 125) return;
    this.uiStamp = now;
    const lead = journeyLead(s);
    this.leadButton.hidden = !!s.facts.hide_journey_lead || !!this.valley.combatTarget;
    this.leadButton.title = lead.reason + ' · Open field journal';
    this.leadTitle.textContent = lead.chapter;
    this.leadText.textContent = lead.action;
    const point = s.mapMarker ?? lead.at;
    if (point) {
      const dx = point.x - s.player.x, dz = point.z - s.player.z, dir = project(dx, dz);
      const arrow = ['→','↘','↓','↙','←','↖','↑','↗'][(Math.round(Math.atan2(dir.y, dir.x) * 4 / Math.PI) + 8) % 8];
      this.leadBearing.textContent = (s.mapMarker ? 'Pin ' : '') + (s.player.interior ? 'Outside' :
        Math.hypot(dx, dz) < 3 ? 'Here' : arrow + ' ' + Math.round(Math.hypot(dx, dz)) + ' m');
    } else this.leadBearing.textContent = '';
    this.place.textContent = this.valley.placeName();
    const chamber = this.valley.roomName();
    this.chamber.hidden = !chamber;
    if (this.chamber.textContent !== chamber) this.chamber.textContent = chamber;
    this.clock.textContent = formatClock(s.clock);
    this.vigor.style.width = this.valley.stamina + '%';
    this.vigor.parentElement!.setAttribute('aria-valuenow', String(Math.round(this.valley.stamina)));
    this.vigor.parentElement!.setAttribute('aria-valuemax', '100');
    const offers = this.valley.offers();
    const act = this.valley.activity,
      bow = this.valley.bow;
    const grip = this.valley.props?.grip,
      held = this.valley.props?.held;
    const grabKey = this.controls.controllerActive
      ? 'Y'
      : (this.controls.settings.bindings.grab ?? 'KeyG').replace(/^Key/, '');
    let prompt = act
      ? act.kind === 'sit'
        ? Number.isFinite(act.duration)
          ? 'Resting…'
          : this.interactKey() + '  ·  Stand up'
        : gestureLabels[act.kind] + '…'
      : bow
        ? bow.phase === 'hold'
          ? this.valley.bowFocus >= 1 ? 'Focused · Release to shoot' : 'Release to shoot'
          : bow.phase === 'draw'
            ? 'Drawing…'
            : ''
        : offers.length
          ? this.interactKey() +
            '  ·  ' +
            offers[0]!.label +
            (this.valley.chooseNearby(offers) ? '  +' + (offers.length - 1) : '')
          : '';
    if (grip && held) {
      const turn = this.controls.controllerActive
        ? 'RB'
        : (this.controls.settings.bindings.turn ?? 'KeyR').replace(/^Key/, '');
      const toss = this.controls.controllerActive
        ? 'X'
        : (this.controls.settings.bindings.attack ?? 'Space').replace(/^Key/, '');
      const portal = offers[0]?.target;
      prompt =
        portal?.door || portal?.passage
          ? this.interactKey() + ' · ' + portal.label + '   ' + grabKey + ' · Let go'
          : held.spec.name +
            '   ' +
            grabKey +
            ' · Let go   ' +
            turn +
            ' · Turn   ' +
            toss +
            ' · ' +
            (grip.drag ? 'Shove' : 'Toss');
    } else if (offers[0]?.target?.prop && offers[0].target.field === 'seat')
      prompt += '   ' + grabKey + ' · Move';
    this.prompt.hidden = !prompt;
    if (this.promptText !== prompt) {
      this.promptText = prompt;
      const binding = /^(\S+)\s+·\s+/.exec(prompt);
      if (binding) {
        this.prompt.replaceChildren(
          el('kbd', '', binding[1]),
          el('span', 'key-separator', ' · '),
          document.createTextNode(prompt.slice(binding[0].length))
        );
      } else this.prompt.textContent = prompt;
    }
    if (this.controls.sound.mode === 'interface') this.announcePrompt(act || bow ? '' : this.promptLabel());
    const signature = JSON.stringify([s.quickSlots, s.inventory, s.equippedWeapon]);
    if (this.slotSig !== signature) {
      this.slotSig = signature;
      this.slots.replaceChildren();
      s.quickSlots.forEach((id, i) => {
        const b = button(
          '',
          () => this.controls.slot(i),
          'slot' + (id ? ' filled' : ' empty') + (id && id === s.equippedWeapon ? ' equipped' : '')
        );
        b.setAttribute(
          'aria-label',
          'Belt slot ' + ((i + 1) % 10) + (id ? ' · ' + S(ITEMS[id].nameKey) : ' · empty')
        );
        b.append(el('span', '', String((i + 1) % 10)));
        if (id) b.append(icon(id));
        this.slots.append(b);
      });
    }
  }
  observation(point: string) {
    if (point === 'noticeboard') {
      const lines = worldView(this.game.state).noticeboard.map((key) => S(key));
      const board = this.actions('Rillford noticeboard', []);
      for (const line of lines) board.append(el('p', '', line));
      board.append(button('Step back', () => this.controls.resume(), 'reply'));
      this.readWorldPage(board, lines);
      return;
    }
    const lines = [S('inspect.' + point)];
    this.message(lines.join(' '), false);
    this.controls.sound.narrate(lines);
  }
  speakName(id: NpcId) {
    return NPCS[id].name;
  }
}
