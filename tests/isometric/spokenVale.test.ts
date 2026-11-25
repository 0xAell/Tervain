import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { catalogue, readingKeys, readKey, savedVoiceMode, type Cue } from '../../src/isometric/reading';
import { DIALOGUE_NODES } from '../../src/core/content/dialogue';
import { VOICE_LINES } from '../../src/core/content/voice';
import { households } from '../../src/isometric/households';
import { ITEMS } from '../../src/core/content/items';
import { S } from '../../src/core/content/strings';
import { sites } from '../../src/isometric/doorways';
import { floorPlan } from '../../src/isometric/roomPlans';
import { Sound } from '../../src/isometric/audio';
import { Game } from '../../src/core/game/game';
import { Valley } from '../../src/isometric/simulation';

describe('the English voice recordings in the playable vale', () => {
  it('keeps authored narration, chosen dialogue and world effects on their own routes', () => {
    vi.stubGlobal(
      'Audio',
      class {
        canPlayType() {
          return '';
        }
      }
    );
    try {
      const sound = new Sound(1);
      sound.enabled = true;
      const say = vi.spyOn(sound.mixer, 'say').mockReturnValue(true);
      const effect = vi.spyOn(sound.mixer, 'effect').mockResolvedValue(undefined);
      const passage = households.house_a!.passage;
      expect(sound.narrate([passage])).toBe(true);
      expect(say.mock.lastCall?.[0]).toEqual([{ cue: catalogue.reader[readKey(passage)] }]);

      sound.mode = 'characters';
      expect(sound.narrate([passage])).toBe(false);
      const answer = DIALOGUE_NODES.joss_intro!.choices[0]!.text;
      const reply = DIALOGUE_NODES.joss_work!.text;
      expect(sound.story([answer, reply])).toBe(true);
      expect(say.mock.lastCall?.[0].map(({ cue, inWorld }) => [cue, inWorld])).toEqual([
        [catalogue.story[answer], true],
        [catalogue.story[reply], true],
      ]);

      sound.mode = 'off';
      expect(sound.narrate([passage])).toBe(false);
      expect(sound.story([reply])).toBe(false);
      expect(say).toHaveBeenCalledTimes(2);
      sound.page('journal');
      sound.field('block');
      expect(effect.mock.calls.map(([cue, , , inWorld]) => [cue[0], inWorld])).toEqual([
        [catalogue.effects.page![0]![0], false],
        [catalogue.effects.block![0]![0], true],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('requires an explicit saved preference to read the interface and keeps world speech in that mode', () => {
    for (const value of [undefined, null, 'full', 'unknown', true])
      expect(savedVoiceMode(value)).toBe('full');
    vi.stubGlobal(
      'Audio',
      class {
        canPlayType() {
          return '';
        }
      }
    );
    try {
      const sound = new Sound(1);
      const say = vi.spyOn(sound.mixer, 'say').mockReturnValue(true);
      const prompt = 'E · Pet the dog';
      for (const mode of ['full', 'characters', 'off'] as const) {
        sound.mode = savedVoiceMode(mode);
        expect(sound.readInterface([prompt])).toBe(false);
      }
      expect(say).not.toHaveBeenCalled();
      sound.mode = savedVoiceMode('interface');
      expect(sound.readInterface([prompt])).toBe(true);
      const [parts, priority] = say.mock.lastCall!;
      expect(parts.map((p) => p.cue)).toEqual([catalogue.reader.e, catalogue.reader['pet the dog']]);
      expect(sound.narrate([households.house_a!.passage])).toBe(true);
      expect(say.mock.lastCall![1]).toBeGreaterThan(priority);
      const line = DIALOGUE_NODES.joss_intro!.text;
      expect(sound.story([line])).toBe(true);
      expect(say.mock.lastCall![0][0]?.cue).toBe(catalogue.story[line]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lets both toll-jumpers finish their challenge while combat prompts continue', () => {
    vi.stubGlobal(
      'Audio',
      class {
        canPlayType() {
          return '';
        }
      }
    );
    try {
      const sound = new Sound(1),
        game = new Game(),
        valley = new Valley(game);
      game.setPlayerTransform(87, 0, 34, 0);
      sound.enabled = true;
      let priority = 2;
      vi.spyOn(sound.mixer, 'speechPriority', 'get').mockImplementation(() => priority);
      vi.spyOn(sound.mixer, 'speaking', 'get').mockReturnValue(true);
      const say = vi.spyOn(sound.mixer, 'say').mockImplementation((_parts, level) => {
        priority = level;
        return true;
      });
      sound.update(valley);
      sound.update(valley);
      expect(say).toHaveBeenCalledTimes(1);
      priority = 1;
      sound.update(valley);
      expect(say.mock.calls.map(([parts]) => parts[0]?.cue)).toEqual([
        catalogue.encounters.ford_bandit_a!.cue,
        catalogue.encounters.ford_bandit_b!.cue,
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('gives every resident node, player choice and field line a mastered recording', () => {
    const story = Object.values(DIALOGUE_NODES).flatMap((node) => [
      node.text,
      ...node.choices.map((c) => c.text),
    ]);
    expect(Object.keys(catalogue.story).sort()).toEqual(story.sort());
    expect(Object.keys(catalogue.lines).sort()).toEqual(Object.keys(VOICE_LINES).sort());
    const party = new Set(Object.values(VOICE_LINES).map((v) => v.speaker));
    expect(party.size).toBe(13);
    expect(Object.keys(catalogue.encounters).sort()).toEqual(['ford_bandit_a', 'ford_bandit_b']);
    for (const node of Object.values(DIALOGUE_NODES)) {
      expect(catalogue.files[catalogue.story[node.text]![0]]).toContain(
        'cast-' + node.speaker.replaceAll('_', '-') + '-'
      );
      for (const choice of node.choices)
        expect(catalogue.files[catalogue.story[choice.text]![0]]).toContain('cast-hero-');
    }
  });
  it('reads every household book, named floor and item description as a complete phrase', () => {
    for (const h of Object.values(households))
      for (const text of [
        h.name,
        h.book,
        h.passage,
        h.workroom,
        h.loft,
        h.cellar,
        'Enter ' + h.name,
        'Leave ' + h.name,
      ])
        expect(readingKeys(text), text).toEqual([readKey(text)]);
    for (const item of Object.values(ITEMS))
      for (const key of [item.nameKey, item.descKey])
        expect(readingKeys(S(key)), key).toEqual([readKey(S(key))]);
    for (const site of sites)
      for (const level of ['ground', 'loft', 'cellar'] as const) {
        const floor = floorPlan(site, level);
        for (const text of floor.fixtures.map((f) => f.label).filter((v): v is string => !!v))
          expect(readingKeys(text).length, text).toBeGreaterThan(0);
      }
  });
  it('reads changed quantities, times, bindings and vitals from the same offline recordings', () => {
    expect(readingKeys('101')).toEqual(['1', 'hundred', '1']);
    expect(readingKeys('07:03')).toEqual(['7', 'oh', '3']);
    expect(readingKeys('17 / 100')).toEqual(['17', 'of', '1', 'hundred']);
    expect(readingKeys('KeyX · Stand up')).toEqual(['x', 'stand up']);
    expect(readingKeys('Stamina 45%')).toEqual(['stamina', '45', 'percent']);
    expect(readingKeys('1,234').length).toBeGreaterThan(0);
    const result = readingKeys('Store Iron scrap · carrying 103');
    expect(result).toEqual(['store', 'iron scrap', 'carrying', '1', 'hundred', '3']);
    expect(readingKeys('')).toEqual([]);
  });
  it('ships every spoken cue, field sound and music file in the self-contained asset folder', () => {
    const cues: Cue[] = [
      ...Object.values(catalogue.story),
      ...Object.values(catalogue.lines),
      ...Object.values(catalogue.reader),
      ...Object.values(catalogue.encounters).map((v) => v.cue),
      ...Object.values(catalogue.effects).flat(),
    ];
    const indexes = new Set<number>();
    for (const [bank, start, frames] of cues) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(frames).toBeGreaterThan(0);
      indexes.add(bank);
    }
    expect([...indexes].sort((a, b) => a - b)).toEqual(catalogue.files.map((_, i) => i));
    const dir = path.resolve('public/assets/audio/vale');
    expect(fs.readdirSync(dir).sort()).toEqual(
      [...catalogue.files, ...Object.values(catalogue.beds), ...Object.values(catalogue.music)].sort()
    );
    for (const f of catalogue.files) expect(fs.statSync(path.join(dir, f)).size).toBeGreaterThan(1000);
  });
});
