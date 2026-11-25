import { artUrl } from './atlas';
import { S } from '../core/content/strings';
import { ITEMS, ITEM_ORDER, itemAction, hotbarEligible } from '../core/content/items';
import { NPCS } from '../core/content/npcs';
import { getNode } from '../core/game/dialogue';
import { buildJournal } from '../core/game/journal';
import { formatClock } from '../core/game/state';
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
  line(id: string): void;
  start(load: boolean): void;
  resume(): void;
  save(slot: SlotId): void;
  load(slot: SlotId): void;
  interact(): void;
  interactIndex(i: number): void;
  attack(): void;
  quit(): void;
  setVolume(value: number): void;
  slot(i: number): void;
  setBindings(action: string, key: string): void;
  readonly settings: { volume: number; bindings: Record<string, string> };
}

export class Interface {
  mode: Screen = 'title';
  private layer = el('div', 'modal-layer');
  private hud = el('div', 'hud');
  private titleBar = el('div', 'region');
  private clock = el('span', 'clock');
  private place = el('strong');
  private health = el('span');
  private vigor = el('span');
  private prompt = el('button', 'prompt');
  private slots = el('div', 'belt');
  private notice = el('div', 'notice');
  private noticeUntil = 0;
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
    this.root.append(this.hud, this.layer, this.notice);
    this.prompt.onclick = () => controls.interact();
    this.titleBar.append(this.place, this.clock);
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
      track.append(value);
      row.append(track);
      bars.append(row);
    }
    vitals.append(icon('seal'), bars);
    this.hud.append(
      this.titleBar,
      nav,
      vitals,
      this.slots,
      this.prompt,
      button('Attack', () => controls.attack(), 'attack-touch')
    );
    this.hud.hidden = true;
  }
  bind(valley: Valley, scene: Scene) {
    this.valley = valley;
    this.game = valley.game;
    this.scene = scene;
    this.slotSig = '';
  }
  message(text: string) {
    this.notice.textContent = text;
    this.noticeUntil = performance.now() + 3300;
    this.notice.classList.add('visible');
  }
  private shell(title: string, wide = false) {
    this.hud.hidden = true;
    this.layer.replaceChildren();
    this.layer.hidden = false;
    const panel = el('section', 'page plate' + (wide ? ' wide' : ''));
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    const header = el('header');
    header.append(
      el('h2', '', title),
      button('Close', () => this.back(), 'close')
    );
    panel.append(header);
    this.layer.append(panel);
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
    content.append(choices);
    screen.append(
      scene,
      content,
      el('small', 'version', 'Grey Strand  /  v' + __GAME_VERSION__ + ' · ' + __SOURCE_REVISION__)
    );
    this.layer.append(screen);
  }
  play() {
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
    if (screen === 'title') {
      this.title();
      return;
    }
    if (screen === 'help' || screen === 'saves' || screen === 'settings')
      this.backTo = this.mode === 'title' ? 'title' : 'pause';
    this.mode = screen;
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
        ['E', 'Interact with a person or object'],
        ['Space / right-click', 'Attack with the equipped weapon'],
        ['Shift / Q / X', 'Run / guard / jump'],
        ['I / J / M', 'Inventory / journal / map'],
        ['1–0', 'Use a belt slot'],
        ['F5 / F9', 'Quick save / quick load'],
        ['Esc', 'Close a page or pause'],
        ['Controller', 'Left stick moves, A interacts, X attacks, B closes, Start pauses'],
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
  private map() {
    const panel = this.shell('Map of the vale', true);
    const canvas = el('canvas', 'map-canvas');
    canvas.width = 450;
    canvas.height = 264;
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
  dialogue(nodeId: string) {
    if (!this.game.showNode(nodeId).ok) {
      this.controls.resume();
      return;
    }
    const node = getNode(nodeId)!;
    this.controls.line(node.text);
    this.currentDialog = nodeId;
    this.mode = 'dialogue';
    const panel = this.shell(node.speaker === 'narrator' ? 'Bellwether Vale' : NPCS[node.speaker].name);
    if (node.speaker !== 'narrator') {
      const portrait = icon(node.speaker);
      portrait.className = 'speaker';
      panel.append(portrait, el('small', 'role', S(NPCS[node.speaker].titleKey)));
    }
    panel.append(el('p', 'speech', S(node.text)));
    for (const { index, choice, locked } of this.game.choices(nodeId)) {
      const b = button(
        S(choice.text),
        () => {
          const res = this.game.choose(this.currentDialog, index);
          if (res.ok) {
            if (res.next === 'end') this.controls.resume();
            else this.dialogue(res.next);
          }
        },
        'reply'
      );
      b.disabled = locked;
      panel.append(b);
    }
  }
  actions(title: string, options: { text: string; run: () => void }[], description = '') {
    this.mode = 'actions';
    const panel = this.shell(title);
    if (description) panel.append(el('p', '', description));
    for (const option of options) panel.append(button(option.text, option.run, 'reply'));
  }
  chooseOffers() {
    this.actions(
      'Within reach',
      this.valley.offers().map((o, i) => ({ text: o.label, run: () => this.controls.interactIndex(i) }))
    );
  }
  controlsAt(act: InteractableAct) {
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
            this.valley.action({ t: 'archiveAccess', method: 'permission' });
            this.controls.resume();
          },
        },
        {
          text: 'Use the borrowed key',
          run: () => {
            this.valley.action({ t: 'archiveAccess', method: 'borrowed_key' });
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
    this.clock.textContent = formatClock(s.clock);
    this.health.style.width = (s.player.health / s.player.maxHealth) * 100 + '%';
    this.vigor.style.width = this.valley.stamina + '%';
    this.health.parentElement!.title = 'Health ' + s.player.health + ' / ' + s.player.maxHealth;
    const offers = this.valley.offers();
    this.prompt.hidden = !offers.length;
    this.prompt.textContent = offers.length
      ? 'E  ·  ' + offers[0]!.label + (offers.length > 1 ? '  +' + (offers.length - 1) : '')
      : '';
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
