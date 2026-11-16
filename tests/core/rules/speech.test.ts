import { describe, expect, it } from 'vitest';
import { HERO_LINES, SCENE_REACH, SCENES, TALKS, VOICE_LINES, type HeroCue, type Speaker } from '../../../src/core/content/voice';
import { createInitialState, evalAll } from '../../../src/core/game/state';
import type { NpcId } from '../../../src/core/game/types';
import { OVERHEAR_REACH, WOUNDED_BELOW } from '../../../src/core/rules/journey';
import { VOICE_LINE_SECONDS } from '../../../src/core/content/voiceLengths';
import {
  BUBBLE, bubbleMs, CLEARING_FOE, dayPartCue, defeatRemark, eventRemarks, HERO_CUE_AGAIN, HERO_CUE_DELAY, itemCue, placeRemarked, SCENE_CHECK_SECONDS, scenesInEarshot, SPEECH,
  SpeechDirector, stopsToTalk, trespassOutcry, UNNOTED_LOSSES, warCry, woundedNow, type SceneResident,
} from '../../../src/core/rules/speech';

// Who says what and when is decided in the core: these run the director with nothing to play a sound or draw a word.

/** A director whose listeners only record, with every line unvoiced unless given a length. */
function director(recorded: Record<string, number> = {}) {
  const said: Array<{ line: string; at: number }> = [], captions: Array<{ speaker: Speaker; seconds: number }> = [], hushed: Speaker[] = [];
  let clock = 0;
  class Recorded extends SpeechDirector {
    protected override recorded(line: string): number | undefined { return recorded[line]; }
  }
  const speech = new Recorded({
    say: (line) => { said.push({ line, at: clock }); return recorded[line] ?? SPEECH.unvoiced.least + VOICE_LINES[line]!.text.length / SPEECH.unvoiced.charactersPerSecond; },
    caption: (speaker, _text, seconds) => { captions.push({ speaker, seconds }); },
    hush: (speaker) => { hushed.push(speaker); },
  });
  const pass = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) { clock += 0.05; speech.update(0.05); } };
  return { speech, said, captions, hushed, pass };
}
const here = () => ({ x: 0, y: 1.6, z: 0 });

describe('the director', () => {
  const state = createInitialState();
  const first = TALKS.findIndex((t) => evalAll(state, t.when) && t.ask);
  const talk = TALKS[first]!;

  it('has a resident answer the hero’s question after a breath, holds them for the exchange, and marks it heard', () => {
    const d = director();
    expect(d.speech.nextTalk(talk.npc, state)).toBe(first);
    expect(d.speech.talk(talk.npc, here, state)).toBe(true);
    expect(d.said.map((s) => s.line)).toEqual([talk.ask]);
    expect(d.speech.heldFor(talk.npc)).toBeGreaterThan(0);
    expect(d.speech.talk(talk.npc, here, state)).toBe(false); // one exchange at a time
    const question = SPEECH.unvoiced.least + VOICE_LINES[talk.ask!]!.text.length / SPEECH.unvoiced.charactersPerSecond;
    d.pass(question + SPEECH.answerGap + 0.2);
    expect(d.said.map((s) => s.line)).toEqual([talk.ask, talk.reply]);
    expect(d.said[1]!.at).toBeGreaterThanOrEqual(question + SPEECH.answerGap - 0.051);
    expect(d.captions.map((c) => c.speaker)).toEqual(['hero', talk.npc]);
    d.pass(30);
    expect([d.speech.heldFor(talk.npc), d.speech.busyFor(talk.npc)]).toEqual([0, 0]);
    // Heard, it does not come first again: something new, or the repeatable ones in turn.
    const next = d.speech.nextTalk(talk.npc, state);
    if (!talk.again) expect(next).not.toBe(first);
  });

  it('uses a recording’s own length where there is one, and the words’ length where there is none', () => {
    const d = director({ [talk.reply]: 9 });
    d.speech.talk(talk.npc, here, state);
    d.pass(20);
    const reply = d.captions.find((c) => c.speaker === talk.npc)!;
    expect(reply.seconds).toBe(9);
    expect(d.captions[0]!.seconds).toBeCloseTo(SPEECH.unvoiced.least + VOICE_LINES[talk.ask!]!.text.length / SPEECH.unvoiced.charactersPerSecond, 9);
  });

  it('lets no passing remark fall over a conversation, nor over another resident', () => {
    const d = director();
    const bystander = (Object.keys(state.npcs) as NpcId[]).find((id) => id !== talk.npc)!;
    const line = Object.keys(VOICE_LINES).find((id) => VOICE_LINES[id]!.speaker === bystander)!;
    d.speech.talk(talk.npc, here, state);
    expect(d.speech.remark(bystander, line, here())).toBe(0);
    d.pass(40);
    expect(d.speech.remark(bystander, line, here())).toBeGreaterThan(0);
    expect(d.speech.remark(bystander, line, here())).toBe(0); // already speaking
    expect(d.speech.remark(bystander, 'no.such.line', here())).toBe(0);
  });

  it('has the hero remark on a thing once, and again only where that is allowed, after a while', () => {
    const d = director();
    const cue = (Object.keys(HERO_LINES) as HeroCue[]).find((c) => HERO_LINES[c]!.length > 0)!;
    expect(d.speech.hero(cue)).toBe(true);
    d.pass(30);
    expect(d.speech.hero(cue)).toBe(false);
    expect(d.speech.hero(cue, { again: 5 })).toBe(true);
    d.pass(3);
    expect(d.speech.hero(cue, { again: 5 })).toBe(false);
    d.pass(30);
    expect(d.speech.hero(cue, { again: 5 })).toBe(true);
    d.speech.forget();
    d.pass(1);
    expect(d.speech.hero(cue)).toBe(true); // a new journey hears it afresh
  });

  it('lets two residents’ scene be overheard once a game day', () => {
    const d = director(), scene = SCENES[0]!;
    expect(d.speech.sceneDue(scene, 3)).toBe(true);
    expect(d.speech.scene(scene, 3, here)).toBe(true);
    d.pass(SPEECH.sceneLead + 0.1);
    expect(d.said[0]!.line).toBe(scene.lines[0]);
    for (const npc of scene.cast) expect(d.speech.heldFor(npc)).toBeGreaterThan(0);
    d.pass(120);
    expect(d.said.map((s) => s.line)).toEqual([...scene.lines]);
    expect(d.speech.scene(scene, 3, here)).toBe(false);
    expect(d.speech.scene(scene, 4, here)).toBe(true);
  });
});

describe('when the occasions for speech come', () => {
  it('remarks on nightfall and dawn as the day turns, never on the first look at the sky', () => {
    expect([dayPartCue(null, true), dayPartCue(false, true), dayPartCue(true, false), dayPartCue(true, true), dayPartCue(false, false)]).toEqual([null, 'night', 'dawn', null, null]);
  });

  it('remarks on his wounds as his health falls through the mark, while he lives', () => {
    expect(woundedNow(WOUNDED_BELOW - 0.01, WOUNDED_BELOW, true)).toBe(true);
    expect(woundedNow(WOUNDED_BELOW - 0.01, WOUNDED_BELOW - 0.005, true)).toBe(false); // already below
    expect(woundedNow(WOUNDED_BELOW, 1, true)).toBe(false);
    expect(woundedNow(0, 1, false)).toBe(false);
    expect(HERO_CUE_AGAIN.wounded).toBeGreaterThan(HERO_CUE_AGAIN.respawn);
  });

  it('gives the first blade words of its own, and the archive its remark only once it stands open', () => {
    expect(itemCue('rusted_sword')).toBe('blade');
    expect(itemCue('archive_key')).toBe('item.archive_key');
    expect([placeRemarked('archive', false), placeRemarked('archive', true), placeRemarked('rillford', false)]).toEqual([false, true, true]);
  });

  it('keeps a remark’s words up while it is heard and a little after, and never too briefly to read', () => {
    expect(bubbleMs(0.5)).toBe(BUBBLE.leastMs);
    expect(bubbleMs(5)).toBe(5000 + BUBBLE.tailMs);
    expect(SCENE_CHECK_SECONDS).toBeLessThan(1);
    for (const delay of Object.values(HERO_CUE_DELAY)) { expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(15); }
    expect(HERO_CUE_DELAY.arrivalBell).toBeGreaterThan(HERO_CUE_DELAY.arrival);
  });

  it('offers a scene only when both are at their places, awake, in calling distance, and the listener is near', () => {
    const state = createInitialState();
    const scene = SCENES.find((s) => evalAll(state, s.when))!, hour = scene.hours[0];
    const [one, two] = scene.cast;
    const at = (id: NpcId, x: number, over: Partial<SceneResident> = {}): SceneResident => ({ id, x, z: 0, hidden: false, asleep: false, underway: false, ...over });
    const offered = (a: SceneResident | undefined, b: SceneResident | undefined, listener = { x: 1, z: 0 }, when = hour) =>
      [...scenesInEarshot(state, when, (id) => (id === one ? a : id === two ? b : undefined), listener)].map((found) => found.scene.id);
    expect(offered(at(one!, 0), at(two!, 2))).toContain(scene.id);
    expect(offered(at(one!, 0), undefined)).not.toContain(scene.id);
    for (const change of [{ hidden: true }, { asleep: true }, { underway: true }]) expect(offered(at(one!, 0, change), at(two!, 2)), JSON.stringify(change)).not.toContain(scene.id);
    expect(offered(at(one!, 0), at(two!, SCENE_REACH + 0.5))).not.toContain(scene.id);
    expect(offered(at(one!, 0), at(two!, 2), { x: 1 + OVERHEAR_REACH + 0.5, z: 0 })).not.toContain(scene.id);
    state.npcs[one!].available = false;
    expect(offered(at(one!, 0), at(two!, 2))).not.toContain(scene.id);
  });
});

describe('a trespass seen', () => {
  it('makes the warden shout his voiced line, and anyone else show the cry in a bubble', () => {
    expect(trespassOutcry('shrine_warden')).toEqual({ voiced: true, line: 'tolan.bark.hey' });
    expect(trespassOutcry('spring_steward')).toEqual({ voiced: false, text: 'toast.warden.hey' });
  });
});

describe('what the hero says of what happens', () => {
  const shut = { archiveOpen: false }, open = { archiveOpen: true };
  it('remarks on the story\u2019s turns, each after its own delay, and lets the rest pass', () => {
    expect(eventRemarks({ t: 'phase', phase: 'settled' }, shut)).toEqual([{ cue: 'settled', delay: HERO_CUE_DELAY.settled }]);
    expect(eventRemarks({ t: 'phase', phase: 'committed' }, shut)).toEqual([]);
    expect(eventRemarks({ t: 'shortcut' }, shut)).toEqual([{ cue: 'shortcut', delay: HERO_CUE_DELAY.shortcut }]);
    expect(eventRemarks({ t: 'rite' }, shut)).toEqual([{ cue: 'rite', delay: HERO_CUE_DELAY.rite }]);
    expect(eventRemarks({ t: 'gate', gate: 'jammed' }, shut)).toEqual([{ cue: 'gate.jammed', delay: HERO_CUE_DELAY.gate }]);
    expect(eventRemarks({ t: 'gate', gate: 'stabilized' }, shut)).toEqual([{ cue: 'gate.stabilized', delay: HERO_CUE_DELAY.gate }]);
    expect(eventRemarks({ t: 'worker_rescued', method: 'shortcut' }, shut)).toEqual([{ cue: 'rescued', delay: HERO_CUE_DELAY.rescued }]);
    expect(eventRemarks({ t: 'skill', id: 'steady_guard' }, shut)).toEqual([]);
  });

  it('names each thing a reward brings, and a find but not a loss', () => {
    expect(eventRemarks({ t: 'grant', id: 'reward', items: { coin: 20, poultice: 1 } }, shut).map((r) => r.cue)).toEqual(['item.coin', 'item.poultice']);
    expect(eventRemarks({ t: 'item', id: 'rusted_sword', delta: 1 }, shut)).toEqual([{ cue: itemCue('rusted_sword'), delay: HERO_CUE_DELAY.item }]);
    expect(eventRemarks({ t: 'item', id: 'arrow', delta: -1 }, shut)).toEqual([]);
  });

  it('remarks on a place found, and on the archive only once it stands open', () => {
    expect(eventRemarks({ t: 'place', id: 'ford' }, shut)).toEqual([{ cue: 'place.ford', delay: HERO_CUE_DELAY.place }]);
    expect(eventRemarks({ t: 'place', id: 'archive' }, shut)).toEqual([]);
    expect(eventRemarks({ t: 'place', id: 'archive' }, open)).toEqual([{ cue: 'place.archive', delay: HERO_CUE_DELAY.place }]);
  });

  it('gives up the brace, the reed and arrows without a note', () => {
    expect([...UNNOTED_LOSSES].sort()).toEqual(['arrow', 'sluice_brace', 'votive_reed']);
  });

  it('hears the Thornback growl and names the beast; a toll-jumper only shouts', () => {
    expect(warCry('thornback')).toEqual({ cry: 'growl', remark: { cue: 'beast', delay: HERO_CUE_DELAY.beast } });
    expect(warCry('bandit')).toEqual({ cry: 'shout', remark: null });
  });

  it('marks the fall of the cut\u2019s creature as a victory, and no other', () => {
    expect(CLEARING_FOE).toBe('cut_creature');
    expect(defeatRemark(CLEARING_FOE)).toEqual({ cue: 'victory', delay: HERO_CUE_DELAY.victory });
    expect(defeatRemark('ford_bandit_a')).toBeNull();
  });
});

describe('how long a line lasts', () => {
  it('is its recording\u2019s length from the core\u2019s table, and unvoiced lines have none', () => {
    class Open extends SpeechDirector { lengthOf(line: string) { return this.recorded(line); } }
    const open = new Open({ say: () => 1, caption: () => {} });
    expect(Object.keys(VOICE_LINE_SECONDS)).toHaveLength(245);
    expect(open.lengthOf('hero.arrival')).toBe(VOICE_LINE_SECONDS['hero.arrival']);
    expect(open.lengthOf('a line nobody recorded')).toBeUndefined();
  });

  it('is the time its words take to read when the sound says it has no recording', () => {
    class Unrecorded extends SpeechDirector { protected override recorded(): number | undefined { return undefined; } }
    const line = 'hero.arrival', reading = SPEECH.unvoiced.least + VOICE_LINES[line]!.text.length / SPEECH.unvoiced.charactersPerSecond;
    const speech = new Unrecorded({ say: () => undefined, caption: () => {} });
    expect(speech.remark('rillford_reeve', line, here)).toBeCloseTo(reading, 9);
    expect(speech.busyFor('rillford_reeve')).toBeCloseTo(reading, 9);
  });
});

describe('a resident who talks', () => {
  it('stops for an exchange or a scene, and for a remark only if already standing', () => {
    expect(stopsToTalk({ held: true, speaking: false, underway: true })).toBe(true);
    expect(stopsToTalk({ held: false, speaking: true, underway: false })).toBe(true);
    expect(stopsToTalk({ held: false, speaking: true, underway: true }), 'a remark is made on the move').toBe(false);
    expect(stopsToTalk({ held: false, speaking: false, underway: false })).toBe(false);
  });
});
