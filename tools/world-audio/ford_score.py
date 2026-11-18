"""Tervain's editable three-beat score and its instrumentalists. No sampled instruments."""
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
SCORE = json.loads((HERE / "ford-score.json").read_text())
SR = 32000
TAU = 2 * np.pi
SECTIONS = SCORE["sections"]
SCALE = SCORE["scale"]


def title_beats():
    """One exact grid is shared by the player, analyser and the score renderer."""
    beats = [SCORE["openingSeconds"]]
    for _, bpm, _ in SECTIONS:
        for bar in range(8):
            # Choreographed slight easing on the last two beats of each phrase.
            for index in range(3):
                beats.append(beats[-1] + (60 / bpm) * (1.055 if bar == 7 and index > 0 else 1))
    return beats


TITLE_LENGTH = round((title_beats()[-1] + 3.2) * 20) / 20
ARRANGEMENTS = {
    "vale": ("reed", "wire", 0, .74),
    "wild": ("wood", "bow", -5, .64),
    "sacred": ("glass", "reed", 5, .52),
    "night": ("bow", "wood", -7, .46),
    "danger": ("wood", "wire", -9, .64),
    "combat": ("wire", "wood", -2, .9),
    "sting": ("reed", "wire", 0, .76),
    "place": ("wood", "reed", 2, .59),
    "song": ("wire", "wood", 0, .72),
}


def frequency(degree, transpose=0):
    octave, note = divmod(degree, len(SCALE))
    return 440 * 2 ** ((SCORE["tonicMidi"] + 12 * octave + SCALE[note] + transpose - 69) / 12)


def sound(voice, hz, duration):
    t = np.arange(max(2, round(duration * SR))) / SR
    phase = TAU * hz * t
    if voice in ("wire", "glass", "wood"):
        ratios, gains, decay = {
            "wire": ((1, 2.003, 3.009, 4.019, 6.04), (1, .42, .19, .10, .045), 2.5),
            "glass": ((1, 2.49, 3.51, 5.92), (1, .30, .13, .06), 1.1),
            "wood": ((1, 2.74, 4.18, 7.14), (1, .29, .11, .04), 3.6),
        }[voice]
        y = sum(g * np.sin(phase * r) * np.exp(-t * decay * (1 + .38 * i)) for i, (r, g) in enumerate(zip(ratios, gains)))
        attack, release = .005, .12
    else:
        vibrato = .0025 * hz / 4.8 * np.sin(TAU * 4.8 * t) * np.minimum(1, t * 2)
        p = phase + vibrato
        gains = (1, .14, .25, .03, .06) if voice == "reed" else (1, .48, .26, .15, .07)
        y = sum(g * np.sin(p * n + .03 * n) for n, g in enumerate(gains, 1))
        y *= .90 + .10 * np.sin(TAU * 1.4 * t + .5)
        attack, release = (.06, .10) if voice == "reed" else (.14, .16)
    return (y * np.minimum(1, t / attack) * np.minimum(1, (duration - t) / release)).astype(np.float32)


def place(buffer, time, note, level, pan):
    start = max(0, round(time * SR))
    limit = min(len(note), len(buffer) - start)
    if limit <= 0:
        return
    for ch, pos in enumerate((1-pan, pan)):
        buffer[start:start + limit, ch] += note[:limit] * level * np.sqrt(pos)


def music(cue, mood, length, seed, title=False):
    lead, answer, transpose, dynamic = ARRANGEMENTS[mood]
    grid = title_beats()
    y = np.zeros((round(length * SR), 2), dtype=np.float32)
    bar_count = 48 if title else max(2, round(length / (1.75 if mood == "combat" else 2.42)))
    variant = 0 if title else seed % len(SECTIONS)
    offset = 0 if title else seed % 4
    for bar in range(bar_count):
        phrase = bar // 8
        motif, _, roots = SECTIONS[(variant + phrase) % len(SECTIONS)]
        row = (bar + offset) % 4
        harmony = roots[row]
        when = grid[bar*3] if title else bar * length / bar_count
        beat = (grid[bar*3+3] - when) / 3 if title else length / (bar_count * 3)
        if title:
            # The opening is a solo travelling reed. The bridge gives the answering tune to the bowed strings.
            lead = ("reed", "reed", "bow", "wood", "reed", "bow")[phrase]
        strength = dynamic * (.79 + .13 * np.sin(bar * .73))
        for onset, degree, span in SCORE["melodies"][motif][row]:
            place(y, when + onset * beat, sound(lead, frequency(degree, transpose), span * beat + .12), .22*strength, .41)
        place(y, when, sound("bow", frequency(harmony - 14, transpose), 2.75*beat), .122*strength, .52)
        if not title or bar >= 4:
            for n, (onset, degree) in enumerate(((.05, harmony-7), (1.51, harmony-3), (2.12, harmony-5))):
                place(y, when + onset*beat, sound("wire", frequency(degree, transpose), 1.12*beat), (.105-.012*n)*strength, .66)
        if row in (1, 3) and (not title or 8 <= bar < 44):
            place(y, when+1.4*beat, sound(answer, frequency(harmony - 4 + (phrase % 2), transpose), 1.38*beat), .105*strength, .74)
        if mood in ("combat", "danger") or (title and 16 <= bar < 32):
            for step in ((0, .85, 1.55, 2.48) if mood == "combat" else (0, 1.75)):
                place(y, when+step*beat, sound("wood", frequency(-16, transpose), .32), .15*strength, .34)
    # A pair of early reflections ties the instruments to the ford; no external impulse response.
    for latency, wet in ((.052, .12), (.109, .07), (.178, .045)):
        delta = round(latency * SR)
        y[delta:] += y[:-delta, ::-1] * wet
    fade = min(len(y)//4, round((1.8 if title else .40)*SR))
    y[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
    return y
