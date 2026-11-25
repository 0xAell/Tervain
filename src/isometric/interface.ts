import { artUrl } from './atlas';
import { catalogue, readText, type SpokenPart, type VoiceMode } from './reading';
import type { Sound, MixLevels } from './audio';
import { SPEAKER_NAMES, VOICE_LINES, shown } from '../core/content/voice';
import { S } from '../core/content/strings';
import { ITEMS, ITEM_ORDER, itemAction, hotbarEligible } from '../core/content/items';
import { NPCS } from '../core/content/npcs';
import { getNode } from '../core/game/dialogue';
import { buildJournal } from '../core/game/journal';
import { formatClock } from '../core/game/state';
import { gestureLabels } from './fieldcraft';
import type { RoomTarget } from './roomTargets';
import { households } from './households';
import type { Fixture } from './roomPlans';
import type { Game } from '../core/game/game';
import type { ItemId, NpcId } from '../core/game/types';
import { PLACES } from '../core/world/layout';
import { worldView } from '../core/game/worldView';
import { HAND_SAVE_SLOTS } from '../core/rules/session';
import { type SaveStore, type SlotId } from '../platform/storage';
import type { Valley } from './simulation';
import type { Scene } from './scene';
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
function icon(key: string) {
  const i = el('img');
  i.src = artUrl('icons/' + key + '.png');
  i.alt = '';
  i.draggable = false;
  return i;
}
function iconButton(label: string, key: string, action: () => void) {
  const b = button('', action, 'tool');
  b.title = label;
  b.setAttribute('aria-label', label);
  b.append(icon(key));
  return b;
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
  pressAttack(): void;
  releaseAttack(): void;
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
  private titleBar = el('div', 'region');
  private chamber = el('span', 'room-name');
  private clock = el('span', 'clock');
  private place = el('strong');
  private health = el('span');
  private vigor = el('span');
  private prompt = el('button', 'prompt');
  private slots = el('div', 'belt');
  private notice = el('div', 'notice');
  private noticeUntil = 0;
  private subtitle = el('div', 'spoken-caption plate');
  private hoverTimer = 0;
  private manualRead = false;
  private seenPrompt = '';
  private announcedPrompt = '';
  private promptSince = 0;
  private slotSig = '';
  private currentDialog = '';
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
    const target = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('button,select,input,[data-voice],p.entry')
        : null;
    this.root.addEventListener('focusin', (e) => {
      const t = target(e);
      if (t && (this.controls.controllerActive || t.matches(':focus-visible'))) this.preview(t);
    });
    this.root.addEventListener('pointerover', (e) => {
      window.clearTimeout(this.hoverTimer);
      const t = target(e);
      if (t && e.pointerType !== 'touch')
        this.hoverTimer = window.setTimeout(() => {
          if (t.isConnected && !this.controls.sound.mixer.speaking) this.preview(t);
        }, 480);
    });
    this.root.addEventListener('pointerout', () => window.clearTimeout(this.hoverTimer));
    this.root.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        this.preview(event.target);
    });
    this.prompt.onclick = () => controls.interact();
    this.chamber.hidden = true;
    this.chamber.setAttribute('aria-live', 'polite');
    this.titleBar.append(this.place, this.chamber, this.clock);
    const nav = el('nav', 'tools');
    nav.setAttribute('aria-label', 'Journey tools');
    nav.append(
      iconButton('Journal (J)', 'journal_icon', () => this.open('journal')),
      iconButton('Map (M)', 'map_icon', () => this.open('map')),
      iconButton('Inventory (I)', 'bag_icon', () => this.open('inventory')),
      iconButton('Pause (Esc)', 'seal', () => this.open('pause')),
      this.readerButton()
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
      track.append(value);
      row.append(track);
      bars.append(row);
    }
    vitals.append(icon('seal'), bars);
    const attack = el('button', 'attack-touch', 'Attack');
    attack.type = 'button';
    attack.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      attack.setPointerCapture(e.pointerId);
      controls.pressAttack();
    };
    attack.onpointerup = (e) => {
      if (e.button === 0) controls.releaseAttack();
    };
    attack.onpointercancel = () => this.valley.cancelPose();
    attack.onclick = (e) => {
      if (e.detail === 0) controls.attack();
    };
    this.hud.append(this.titleBar, nav, vitals, this.slots, this.prompt, attack);
    this.hud.hidden = true;
  }
  bind(valley: Valley, scene: Scene) {
    this.valley = valley;
    this.game = valley.game;
    this.scene = scene;
    this.slotSig = '';
    this.seenPrompt = this.announcedPrompt = '';
  }
  message(text: string) {
    const repeated = text === this.notice.textContent && performance.now() < this.noticeUntil;
    this.notice.textContent = text;
    this.noticeUntil = performance.now() + 3300;
    this.notice.classList.add('visible');
    if (!repeated) this.controls.sound.read([text], 2);
  }
  caption(text: string) {
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
  private readerButton() {
    const b = button('Read aloud', () => this.readAloud(), 'read-aloud');
    b.title = 'Read this page or your surroundings aloud';
    return b;
  }
  private textFor(node: HTMLElement): string {
    if (node instanceof HTMLInputElement) {
      return (
        (node.labels?.[0]?.firstChild?.textContent ?? 'Volume') +
        ' ' +
        Math.round(Number(node.value) * 100) +
        ' percent'
      );
    }
    if (node instanceof HTMLSelectElement)
      return (node.getAttribute('aria-label') ?? '') + ' ' + (node.selectedOptions[0]?.text ?? '');
    if (node.classList.contains('item'))
      return Array.from(node.querySelectorAll('span,small'), (n) => n.textContent).join(' times ');
    return node.getAttribute('aria-label') ?? node.textContent ?? '';
  }
  private preview(node: HTMLElement) {
    if (!this.controls.sound.enabled && !navigator.userActivation?.hasBeenActive) return;
    if (node.dataset.story) {
      this.controls.sound.story([node.dataset.story], 5);
      return;
    }
    if (node.dataset.voice) {
      this.controls.sound.tell([node.dataset.voice], 5);
      return;
    }
    this.controls.sound.read([this.textFor(node)], 5);
  }
  private panelParts(panel: HTMLElement): SpokenPart[] {
    const parts: SpokenPart[] = [];
    for (const n of panel.querySelectorAll<HTMLElement>(
      'h1,h2,h3,p,dt,dd,strong,small,span,button,select,input,canvas'
    )) {
      if (n.closest('[hidden]') || n.matches('.read-aloud,.close') || n.parentElement?.closest('button'))
        continue;
      const id = n.dataset.story ?? n.dataset.voice;
      if (id) {
        const cue = n.dataset.story ? catalogue.story[id] : catalogue.lines[id];
        if (cue) parts.push({ cue, caption: this.textFor(n) });
      } else parts.push(...readText(this.textFor(n)));
    }
    return parts;
  }
  readAloud() {
    const sound = this.controls.sound;
    sound.unlock();
    if (this.manualRead && sound.mixer.speaking) {
      sound.endLine();
      this.manualRead = false;
      return;
    }
    this.manualRead = true;
    if (this.mode === 'play') {
      const p = this.valley.player;
      sound.read(
        [
          this.place.textContent ?? '',
          this.chamber.textContent ?? '',
          this.clock.textContent ?? '',
          'Health ' + p.health + ' of ' + p.maxHealth,
          'Stamina ' + Math.round(this.valley.stamina) + ' percent',
          this.scene.hoverLabel ||
            (this.prompt.hidden ? 'No nearby interaction' : (this.prompt.textContent ?? '')),
          this.notice.classList.contains('visible') ? (this.notice.textContent ?? '') : '',
          ...Array.from(this.slots.querySelectorAll('button'), (b) => this.textFor(b)),
        ],
        5
      );
    } else {
      const panel = this.layer.querySelector<HTMLElement>('section');
      if (panel) sound.readPage(this.panelParts(panel));
    }
  }
  private shell(title: string, wide = false) {
    this.manualRead = false;
    this.controls.sound.endLine();
    this.hud.hidden = true;
    this.layer.replaceChildren();
    this.layer.hidden = false;
    const panel = el('section', 'page plate' + (wide ? ' wide' : ''));
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    const header = el('header');
    header.append(
      el('h2', '', title),
      this.readerButton(),
      button('Close', () => this.back(), 'close')
    );
    panel.append(header);
    this.layer.append(panel);
    queueMicrotask(() => {
      if (panel.isConnected && this.mode !== 'dialogue' && !panel.dataset.castPage)
        this.controls.sound.readPage(this.panelParts(panel));
    });
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
    this.manualRead = false;
    this.controls.sound.endLine();
    this.mode = 'title';
    this.hud.hidden = true;
    this.layer.hidden = false;
    this.layer.replaceChildren();
    const screen = el('section', 'title-screen');
    const scene = el('img', 'title-art');
    scene.src = artUrl('title.png');
    scene.alt = '';
    const content = el('div', 'title-content');
    content.append(
      icon('seal'),
      el('p', 'locale', 'Bellwether Vale'),
      el('h1', '', 'Tervain'),
      el('p', 'premise', 'The tide left you a blade. Inland, a village is running dry.')
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
      }),
      this.readerButton()
    );
    content.append(choices);
    screen.append(
      scene,
      content,
      el('small', 'version', 'Grey Strand  /  v' + __GAME_VERSION__ + ' · ' + __SOURCE_REVISION__)
    );
    this.layer.append(screen);
    if (navigator.userActivation?.hasBeenActive) this.controls.sound.readPage(this.panelParts(screen));
  }
  play() {
    this.manualRead = false;
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
          'Walk through a lit threshold or click it. Arches join rooms and stairs change floors. A padlock marks a sealed entrance.',
        ],
        ['M indoors', 'See rooms, stairs and your position on this floor'],
        [
          (this.controls.settings.bindings.attack ?? 'Space').replace(/^Key/, '') + ' / right mouse',
          'Hold to draw the bow, release to shoot. Aim with the pointer or movement keys. Tap for a quick shot.',
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
        ['Shift / Q / X', 'Run / guard / jump'],
        ['I / J / M', 'Inventory / journal / map'],
        ['1–0', 'Use a belt slot'],
        ['F5 / F9', 'Quick save / quick load'],
        ['Esc', 'Close a page or pause'],
        ['V', 'Read this page or your surroundings aloud'],
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
      const voiceLabel = el('label', 'volume', 'Spoken audio'),
        voiceMode = el('select');
      voiceMode.setAttribute('aria-label', 'Spoken audio');
      for (const [value, name] of [
        ['full', 'Full narration'],
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
      panel.querySelector('header button')?.remove();
      panel.append(
        button('Return to last save', () => this.controls.start(true), 'primary'),
        button('Begin again', () => this.controls.start(false))
      );
    }
  }
  private journal() {
    const panel = this.shell('Field journal', true),
      journal = buildJournal(this.game.state);
    panel.append(el('h3', '', 'The water of Bellwether Vale'), el('p', '', S(journal.statusKey)));
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
    const items = el('div', 'items');
    for (const id of ITEM_ORDER) {
      const amount = this.game.state.inventory[id] ?? 0;
      if (amount <= 0) continue;
      const b = button('', () => this.inspectItem(id), 'item');
      b.append(icon(id), el('span', '', S(ITEMS[id].nameKey)), el('small', '', String(amount)));
      items.append(b);
    }
    panel.append(items);
  }
  private inspectItem(id: ItemId) {
    this.inventory();
    const panel = this.layer.querySelector('section')!;
    const detail = el('div', 'item-detail');
    detail.append(el('h3', '', S(ITEMS[id].nameKey)), el('p', '', S(ITEMS[id].descKey)));
    const act = itemAction(id);
    if (act)
      detail.append(
        button(act === 'equip' ? 'Equip' : 'Consume', () => {
          this.valley.action(act === 'equip' ? { t: 'equipWeapon', item: id } : { t: 'useItem', item: id });
          this.inventory();
        })
      );
    if (hotbarEligible(id)) {
      const choose = el('select');
      choose.setAttribute('aria-label', 'Belt slot');
      for (let i = 0; i < 10; i++) {
        const o = el('option', '', 'Slot ' + ((i + 1) % 10));
        o.value = String(i);
        choose.append(o);
      }
      detail.append(
        choose,
        button('Assign to belt', () => {
          this.valley.action({ t: 'assignQuickSlot', slot: Number(choose.value), item: id });
          this.message('Belt updated');
        })
      );
    }
    panel.append(detail);
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
            .filter((p) => p.kind !== 'arch')
            .map((p) => (p.kind === 'outside' ? 'Exit' : p.kind === 'up' ? 'Stairs up' : 'Stairs down'))
            .join(', ')
      );
      this.scene.drawFloorMap(canvas, this.valley);
      panel.append(
        canvas,
        el('p', 'map-note', 'Gold marks passages. ↑ upstairs · ↓ downstairs · ◆ outside'),
        button('Map of the vale', () => this.map(true))
      );
      return;
    }
    this.scene.drawMap(canvas, this.valley);
    canvas.onclick = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.max(-352, Math.min(198, ((e.clientX - r.left) / r.width) * 580 - 380)),
        z = Math.max(-162, Math.min(168, ((e.clientY - r.top) / r.height) * 340 - 170));
      this.valley.action({ t: 'setMapMarker', marker: { x, z } });
      this.scene.drawMap(canvas, this.valley);
    };
    panel.append(canvas, el('p', 'map-note', 'Click the chart to mark a destination.'));
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
    if (node.speaker !== 'narrator') {
      const portrait = icon(node.speaker);
      portrait.className = 'speaker';
      panel.append(portrait, el('small', 'role', S(NPCS[node.speaker].titleKey)));
    }
    const speech = el('p', 'speech', S(node.text));
    speech.dataset.story = node.text;
    panel.append(speech);
    this.controls.sound.story(answer ? [answer, node.text] : [node.text]);
    for (const { index, choice, locked } of this.game.choices(nodeId)) {
      const b = button(
        S(choice.text),
        () => {
          const res = this.game.choose(this.currentDialog, index);
          if (res.ok) {
            if (res.next === 'end') {
              this.controls.resume();
              this.controls.sound.story([choice.text]);
            } else this.dialogue(res.next, choice.text);
          }
        },
        'reply'
      );
      b.dataset.story = choice.text;
      b.disabled = locked;
      panel.append(b);
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
            this.controls.sound.tell(ids, 5);
          },
          'reply'
        )
      );
  }
  actions(title: string, options: { text: string; run: () => void }[], description = '') {
    this.mode = 'actions';
    const panel = this.shell(title);
    if (description) panel.append(el('p', '', description));
    for (const option of options) panel.append(button(option.text, option.run, 'reply'));
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
        this.actions(home.book, [{ text: 'Close the book', run: finish }], home.passage);
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
      const options = [
        ['Brace the gate', 'stabilizeGate'],
        ['Force the gate', 'forceGate'],
      ] as const;
      this.actions(
        'The sluice',
        [
          ...options.map(([text, t]) => ({
            text,
            run: () => {
              this.valley.action({ t });
              this.controls.resume();
            },
          })),
          ...(['rillford', 'quarry', 'rotation'] as const).map((a) => ({
            text: {
              rillford: 'Send water to Rillford',
              quarry: 'Send water to the quarry',
              rotation: 'Agree a rotation',
            }[a],
            run: () => {
              this.valley.action({ t: 'commitAllocation', allocation: a });
              this.controls.resume();
            },
          })),
        ],
        'Gate condition · ' + this.game.state.quest.gate
      );
    } else if (act.do === 'hunting_notes') {
      this.actions(
        'Hunter’s table',
        [{ text: 'Return', run: () => this.controls.resume() }],
        'Take the bow, knife and arrows. Rowan trades fresh meat and hides at this table.'
      );
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
  update(force = false) {
    if (performance.now() > this.noticeUntil) this.notice.classList.remove('visible');
    if (this.mode !== 'play' || (!force && performance.now() - this.uiStamp < 125)) return;
    this.uiStamp = performance.now();
    const s = this.game.state;
    this.place.textContent = this.valley.placeName();
    const chamber = this.valley.roomName();
    this.chamber.hidden = !chamber;
    if (this.chamber.textContent !== chamber) this.chamber.textContent = chamber;
    this.clock.textContent = formatClock(s.clock);
    this.health.style.width = (s.player.health / s.player.maxHealth) * 100 + '%';
    this.vigor.style.width = this.valley.stamina + '%';
    this.health.parentElement!.title = 'Health ' + s.player.health + ' / ' + s.player.maxHealth;
    const offers = this.valley.offers();
    const act = this.valley.activity,
      bow = this.valley.bow;
    const grip = this.valley.props?.grip,
      held = this.valley.props?.held;
    const grabKey = this.controls.controllerActive
      ? 'Y'
      : (this.controls.settings.bindings.grab ?? 'KeyG').replace(/^Key/, '');
    this.prompt.hidden = !offers.length && !act && !bow && !held;
    this.prompt.textContent = act
      ? act.kind === 'sit'
        ? Number.isFinite(act.duration)
          ? 'Resting…'
          : this.interactKey() + '  ·  Stand up'
        : gestureLabels[act.kind] + '…'
      : bow
        ? bow.phase === 'hold'
          ? 'Release to shoot'
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
      this.prompt.textContent =
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
      this.prompt.textContent += '   ' + grabKey + ' · Move';
    const prompt = this.scene.hoverLabel || (this.prompt.hidden ? '' : (this.prompt.textContent ?? ''));
    if (prompt !== this.seenPrompt) {
      this.seenPrompt = prompt;
      this.promptSince = performance.now();
      if (!prompt) this.announcedPrompt = '';
    }
    if (
      prompt &&
      !act &&
      !bow &&
      prompt !== this.announcedPrompt &&
      performance.now() - this.promptSince > 700 &&
      !this.controls.sound.mixer.speaking
    ) {
      this.announcedPrompt = prompt;
      this.controls.sound.read([prompt], 1);
    }
    const signature = JSON.stringify([s.quickSlots, s.inventory, s.equippedWeapon]);
    if (this.slotSig !== signature) {
      this.slotSig = signature;
      this.slots.replaceChildren();
      s.quickSlots.forEach((id, i) => {
        const b = button(
          '',
          () => this.controls.slot(i),
          'slot' + (id && id === s.equippedWeapon ? ' equipped' : '')
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
  describeNoticeboard() {
    return worldView(this.game.state)
      .noticeboard.map((k) => S(k))
      .join(' ');
  }
  speakName(id: NpcId) {
    return NPCS[id].name;
  }
}
