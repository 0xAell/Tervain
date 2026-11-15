import { reviveState } from '../core/game/revive';
import { SAVE_SLOTS, type SaveSlot } from '../core/rules/session';
import { CONTENT_REVISION, SAVE_FORMAT_VERSION, type WorldState } from '../core/game/types';
import { GAME_BUILD } from '../version';

// What a saved journey is revived as is the core's (core/game/revive.ts); here is where it is kept.
export { reviveState };

/**
 * Local saves behind a narrow adapter (architecture.md, "Saves and progression continuity").
 * Browser storage backs the web build; a desktop shell would swap in file access behind the
 * same KeyValueStore. Nothing here depends on a UI framework, a server, or a Steam session.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  get(key: string) {
    return this.m.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.m.set(key, value);
  }
  remove(key: string) {
    this.m.delete(key);
  }
  keys() {
    return [...this.m.keys()];
  }
}

export class BrowserStore implements KeyValueStore {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string) {
    localStorage.setItem(key, value);
  }
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
  keys() {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out.push(k);
      }
    } catch {
      /* storage unavailable */
    }
    return out;
  }
}

/** The slots are the core's (core/rules/session.ts): which are written by hand, which by the game. */
export const SLOT_IDS = SAVE_SLOTS;
export type SlotId = SaveSlot;

/** Upper bound for a save payload; larger values are rejected as corrupt. */
export const MAX_SAVE_BYTES = 512 * 1024;
const MAGIC = 'tervain-save';
const PREFIX = 'tervain:save:';

export interface SaveSummary {
  slot: SlotId;
  savedAt: number;
  playSeconds: number;
  clock: number;
  phase: WorldState['quest']['phase'];
  allocation: WorldState['quest']['allocation'];
  gameBuild: string;
  contentRevision: string;
}

interface Envelope {
  magic: typeof MAGIC;
  saveFormatVersion: number;
  gameBuild: string;
  contentRevision: string;
  slotId: string;
  savedAt: number;
  playSeconds: number;
  summary: Omit<SaveSummary, 'slot' | 'savedAt' | 'playSeconds' | 'gameBuild' | 'contentRevision'>;
  checksum: string;
  state: WorldState;
}

export type LoadResult =
  | { ok: true; state: WorldState; summary: SaveSummary; recovered: null | 'previous' | 'temporary' }
  | { ok: false; kind: 'missing' | 'corrupt' | 'incompatible'; message: string };

/** FNV-1a 32-bit: catches truncation and accidental edits, not tampering. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class SaveStore {
  constructor(private store: KeyValueStore, private now: () => number = () => Date.now()) {}

  private key(slot: string, part: 'cur' | 'prev' | 'tmp') {
    return `${PREFIX}${slot}:${part}`;
  }

  private encode(slot: SlotId, state: WorldState): string {
    const stateJson = JSON.stringify(state);
    const env: Envelope = {
      magic: MAGIC,
      saveFormatVersion: SAVE_FORMAT_VERSION,
      gameBuild: GAME_BUILD,
      contentRevision: CONTENT_REVISION,
      slotId: slot,
      savedAt: this.now(),
      playSeconds: state.playSeconds,
      summary: { clock: state.clock, phase: state.quest.phase, allocation: state.quest.allocation },
      checksum: checksum(stateJson),
      state,
    };
    return JSON.stringify(env);
  }

  private decode(text: string | null): LoadResult {
    if (text === null) return { ok: false, kind: 'missing', message: 'No save in this slot.' };
    if (text.length > MAX_SAVE_BYTES) return { ok: false, kind: 'corrupt', message: 'The save is larger than any valid save.' };
    let env: unknown;
    try {
      env = JSON.parse(text);
    } catch {
      return { ok: false, kind: 'corrupt', message: 'The save file could not be read.' };
    }
    if (!isObj(env) || env.magic !== MAGIC || !isNum(env.saveFormatVersion)) {
      return { ok: false, kind: 'corrupt', message: 'This is not a Tervain save.' };
    }
    if (env.saveFormatVersion > SAVE_FORMAT_VERSION) {
      return { ok: false, kind: 'incompatible', message: 'This save was written by a newer version of the game.' };
    }
    if (typeof env.checksum !== 'string' || JSON.stringify(env.state) === undefined || checksum(JSON.stringify(env.state)) !== env.checksum) {
      return { ok: false, kind: 'corrupt', message: 'The save failed its integrity check.' };
    }
    const state = reviveState(env.state);
    if (!state) return { ok: false, kind: 'corrupt', message: 'The save is missing required data.' };
    const summary: SaveSummary = {
      slot: (typeof env.slotId === 'string' ? env.slotId : 'slot-1') as SlotId,
      savedAt: isNum(env.savedAt) ? env.savedAt : 0,
      playSeconds: state.playSeconds,
      clock: state.clock,
      phase: state.quest.phase,
      allocation: state.quest.allocation,
      gameBuild: typeof env.gameBuild === 'string' ? env.gameBuild : 'unknown',
      contentRevision: typeof env.contentRevision === 'string' ? env.contentRevision : 'unknown',
    };
    return { ok: true, state, summary, recovered: null };
  }

  /**
   * Write to a temporary key, validate it by reading it back, retain the previous save, then
   * replace the selected save. An interrupted write leaves either the old save or a recoverable copy.
   */
  save(slot: SlotId, state: WorldState): { ok: true } | { ok: false; message: string } {
    try {
      // A save from a newer version of the game is never overwritten by this one, which cannot read it (A71).
      const existing = this.store.get(this.key(slot, 'cur'));
      if (existing !== null) {
        const found = this.decode(existing);
        if (!found.ok && found.kind === 'incompatible') return { ok: false, message: 'This slot holds a save from a newer version of the game; it was kept.' };
      }
      const text = this.encode(slot, state);
      if (text.length > MAX_SAVE_BYTES) return { ok: false, message: 'Save is too large.' };
      this.store.set(this.key(slot, 'tmp'), text);
      const check = this.decode(this.store.get(this.key(slot, 'tmp')));
      if (!check.ok) {
        this.store.remove(this.key(slot, 'tmp'));
        return { ok: false, message: 'The written save did not verify; the previous save was kept.' };
      }
      const current = this.store.get(this.key(slot, 'cur'));
      // Keep the previous save only if the current one is itself intact; otherwise leave the older good copy alone.
      if (current !== null && this.decode(current).ok) this.store.set(this.key(slot, 'prev'), current);
      this.store.set(this.key(slot, 'cur'), text);
      this.store.remove(this.key(slot, 'tmp'));
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Storage is unavailable.' };
    }
  }

  load(slot: SlotId): LoadResult {
    const cur = this.decode(this.store.get(this.key(slot, 'cur')));
    if (cur.ok) return cur;
    if (cur.kind === 'incompatible') return cur;
    const prev = this.decode(this.store.get(this.key(slot, 'prev')));
    const tmp = this.decode(this.store.get(this.key(slot, 'tmp')));
    // A temporary copy survives only a write interrupted after it was verified: it is then the newer save, and the
    // previous one the older (A102 scout: recovery handed back the older save).
    if (tmp.ok && (!prev.ok || tmp.summary.savedAt >= prev.summary.savedAt)) return { ...tmp, recovered: 'temporary' };
    if (prev.ok) return { ...prev, recovered: 'previous' };
    // Report the most informative failure: a damaged save beats an empty slot.
    for (const r of [cur, prev, tmp]) if (!r.ok && r.kind === 'corrupt') return r;
    return cur;
  }

  summary(slot: SlotId): SaveSummary | null {
    const r = this.load(slot);
    return r.ok ? r.summary : null;
  }

  list(): { slot: SlotId; result: LoadResult }[] {
    return SLOT_IDS.map((slot) => ({ slot, result: this.load(slot) }));
  }

  hasAny(): boolean {
    return SLOT_IDS.some((s) => this.load(s).ok);
  }

  /** The most recently written valid slot, for "Continue". */
  latest(): { slot: SlotId; state: WorldState; summary: SaveSummary } | null {
    let best: { slot: SlotId; state: WorldState; summary: SaveSummary } | null = null;
    for (const slot of SLOT_IDS) {
      const r = this.load(slot);
      if (r.ok && (!best || r.summary.savedAt > best.summary.savedAt)) best = { slot, state: r.state, summary: r.summary };
    }
    return best;
  }

  delete(slot: SlotId) {
    for (const part of ['cur', 'prev', 'tmp'] as const) this.store.remove(this.key(slot, part));
  }
}
