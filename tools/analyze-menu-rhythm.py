#!/usr/bin/env python3
"""Prepare the original MIDI tempo map, rendered accents and six-band spectrum for the grove.

Requires existing Python 3, NumPy, Mido and FFmpeg; this script never installs packages.
Run from any directory:  python3 tools/analyze-menu-rhythm.py [--check]
The editable MIDI and primary title encoding are verified against the Alderweir source record.
No audio samples, lyrics, timed text, metadata prompts or artwork enter the generated module; runtime never runs an FFT.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import pathlib
import shutil
import subprocess
import textwrap

import mido
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/presentation/menu/menuScoreRhythmData.ts"
_spec = importlib.util.spec_from_file_location("analyze_menu_score", ROOT / "tools/analyze-menu-score.py")
score = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(score)  # type: ignore[union-attr]

# Onset envelope for the beat grid and accents: 100 Hz frames from 24 kHz stereo, 2,048-sample (85 ms) Hann windows.
ONSET_SR = 24000
ONSET_RATE = 100
ONSET_WINDOW = 2048
# Spectrum for the visualiser: the same 20 Hz convention as the existing controls (12 kHz stereo, 2,048-sample window).
BAND_SR = 12000
BAND_RATE = 20
BAND_WINDOW = 2048
BANDS = ((40, 90), (90, 200), (200, 500), (500, 1200), (1200, 2800), (2800, 5800))
BAND_NAMES = ("sub", "bass", "lowMid", "mid", "highMid", "presence")
BAND_ATTACK = 0.04
BAND_RELEASE = 0.16
BEATS_PER_BAR = 2
BARS_PER_PHRASE = 8


def decode(path: pathlib.Path, rate: int, duration: float, ffmpeg: str) -> np.ndarray:
    data = subprocess.run([
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(path), "-map", "0:a:0",
        "-vn", "-sn", "-dn", "-ac", "2", "-ar", str(rate), "-t", str(duration), "-f", "f32le", "pipe:1",
    ], check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(data, dtype="<f4").reshape(-1, 2).astype(np.float64)


def stereo_power(block: np.ndarray, window: np.ndarray) -> np.ndarray:
    # Average left/right power: an inverted channel cannot cancel the measurement as a mono mix would.
    spectrum = np.fft.rfft(block * window[:, None], axis=0)
    return np.mean(np.abs(spectrum) ** 2, axis=1)


def onset_envelopes(pcm: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Positive log-spectral flux over 40 log bands (all and below 200 Hz), and frame RMS, at ONSET_RATE."""
    hop = ONSET_SR // ONSET_RATE
    frames = int(np.ceil(len(pcm) / hop))
    padded = np.pad(pcm, ((ONSET_WINDOW // 2, ONSET_WINDOW // 2 + hop), (0, 0)))
    window = np.hanning(ONSET_WINDOW)
    bins = np.fft.rfftfreq(ONSET_WINDOW, 1 / ONSET_SR)
    edges = np.geomspace(30, 10000, 41)
    band_of = np.digitize(bins, edges) - 1
    valid = (band_of >= 0) & (band_of < 40)
    low_bands = int(np.searchsorted(edges, 200) - 1)
    flux = np.zeros(frames)
    low = np.zeros(frames)
    rms = np.zeros(frames)
    previous = None
    for frame in range(frames):
        block = padded[frame * hop:frame * hop + ONSET_WINDOW]
        rms[frame] = np.sqrt(np.mean(block * block))
        power = stereo_power(block, window)
        level = np.log1p(1000 * np.bincount(band_of[valid], weights=power[valid], minlength=40))
        if previous is not None:
            rise = np.maximum(level - previous, 0)
            flux[frame] = rise.sum()
            low[frame] = rise[:low_bands].sum()
        previous = level

    def detrend(envelope: np.ndarray) -> np.ndarray:
        # Remove the slow loudness trend (one-second moving mean) and normalise; only the rises remain.
        k = ONSET_RATE // 2
        kernel = np.ones(2 * k + 1) / (2 * k + 1)
        local = np.convolve(np.pad(envelope, k, mode="edge"), kernel, mode="valid")
        out = np.maximum(envelope - local, 0)
        return out / (out.std() + 1e-9)

    return detrend(flux), detrend(low), rms


def authored_beats(duration: float) -> list[float]:
    """Dotted-quarter pulses from Alderweir's 6/8 conductor track, including its rubato."""
    record = json.loads((ROOT / "docs/engineering/alderweir-audio.json").read_text(encoding="utf-8"))["editableScore"]
    midi_path = ROOT / record["path"]
    if score.sha256(midi_path) != record["sha256"]:
        raise SystemExit("Editable score differs from the Alderweir source record.")
    midi = mido.MidiFile(midi_path)
    tick = 0
    seconds = 0.0
    tempo = 500000
    tempos = [(tick, seconds, tempo)]
    first = None
    for event in midi.tracks[0]:
        seconds += mido.tick2second(event.time, midi.ticks_per_beat, tempo)
        tick += event.time
        if event.type == "set_tempo":
            tempo = event.tempo
            tempos.append((tick, seconds, tempo))
        elif event.type == "marker" and event.text == "The landing":
            first = tick
        elif event.type == "time_signature" and (event.numerator, event.denominator) != (6, 8):
            raise ValueError("Alderweir's grove expects compound duple metre")
    if first is None:
        raise ValueError("Opening downbeat missing from the MIDI conductor track")
    times = []
    target = first
    index = 0
    while not times or times[-1] < duration:
        while index + 1 < len(tempos) and tempos[index + 1][0] <= target:
            index += 1
        at, start, tempo = tempos[index]
        times.append(round(start + mido.tick2second(target - at, midi.ticks_per_beat, tempo), 6))
        target += midi.ticks_per_beat * 3 // 2
    return times


def bar_levels(beats: list[float], rms: np.ndarray, duration: float) -> np.ndarray:
    starts = [round(t * ONSET_RATE) for t in beats[::BEATS_PER_BAR] if t < duration]
    return np.array([np.mean(rms[start:end] ** 2) ** 0.5 for start, end in zip(starts, starts[1:] + [len(rms)])])


def accent_events(envelope: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    """Strong transients: local maxima clearly above a two-second running level, at least 150 ms apart."""
    k = ONSET_RATE
    kernel = np.ones(2 * k + 1) / (2 * k + 1)
    level = np.convolve(np.pad(envelope, k, mode="edge"), kernel, mode="valid")
    spread = np.sqrt(np.convolve(np.pad((envelope - level) ** 2, k, mode="edge"), kernel, mode="valid"))
    threshold = level + 1.25 * spread + 0.25
    peaks = [i for i in range(1, len(envelope) - 1)
             if envelope[i] >= envelope[i - 1] and envelope[i] > envelope[i + 1] and envelope[i] > threshold[i]]
    spacing = int(0.15 * ONSET_RATE)
    kept: list[int] = []
    for i in sorted(peaks, key=lambda p: -envelope[p]):
        if all(abs(i - j) >= spacing for j in kept):
            kept.append(i)
    kept.sort()
    reference = float(np.percentile(envelope[kept], 90)) if kept else 1.0
    strength = np.clip(envelope[kept] / reference, 0, 1)
    times = np.array(kept) / ONSET_RATE
    return times, strength, {"threshold": "running mean + 1.25 x running deviation + 0.25 (two-second window)",
                             "minimumSpacingSeconds": 0.15, "strengthReference": "90th percentile of kept peaks"}


def spectrum_bands(path: pathlib.Path, duration: float, ffmpeg: str) -> tuple[np.ndarray, list[float]]:
    pcm = decode(path, BAND_SR, duration, ffmpeg)
    count = round(duration * BAND_RATE) + 1
    hop = BAND_SR // BAND_RATE
    padded = np.pad(pcm, ((BAND_WINDOW // 2, BAND_WINDOW // 2 + hop), (0, 0)))
    window = np.hanning(BAND_WINDOW)
    bins = np.fft.rfftfreq(BAND_WINDOW, 1 / BAND_SR)
    weights = np.full(len(bins), 2.0 / (BAND_WINDOW * BAND_WINDOW * np.mean(window * window)))
    weights[[0, -1]] *= 0.5
    masks = [(bins >= lo) & (bins < hi) for lo, hi in BANDS]
    raw = np.zeros((count, len(BANDS)))
    for frame in range(count):
        block = padded[frame * hop:frame * hop + BAND_WINDOW]
        power = stereo_power(block, window) * weights
        for band, mask in enumerate(masks):
            raw[frame, band] = np.sqrt(np.sum(power[mask]))
    floor = 10 ** (-65 / 20)
    references = np.maximum(np.percentile(raw, 95, axis=0), floor * 2)
    normalized = np.sqrt(np.clip((raw - floor) / (references - floor), 0, 1))
    smoothed = np.zeros_like(normalized)
    for frame in range(count):
        previous = smoothed[frame - 1] if frame else np.zeros(len(BANDS))
        tau = np.where(normalized[frame] > previous, BAND_ATTACK, BAND_RELEASE)
        smoothed[frame] = previous + (1 - np.exp(-1 / (BAND_RATE * tau))) * (normalized[frame] - previous)
    return np.rint(np.clip(smoothed, 0, 1) * 255).astype(np.uint8), [round(float(r), 10) for r in references]


def b64(data: bytes) -> str:
    encoded = base64.b64encode(data).decode("ascii")
    return " +\n".join(f"  '{line}'" for line in textwrap.wrap(encoded, 112))


def module(source: dict, runtime: dict, beats: list[float], bars: np.ndarray, accents: tuple, bands: np.ndarray, references: list[float]) -> str:
    times, strength, accent_settings = accents
    accent_bytes = bytearray()
    for t, s in zip(times, strength):
        centis = int(round(t * 100))
        accent_bytes += bytes((centis & 255, centis >> 8, int(round(s * 255))))
    bar_energy = bars / max(float(np.percentile(bars, 95)), 1e-9)
    bar_bytes = bytes(np.rint(np.clip(bar_energy, 0, 1) * 255).astype(np.uint8))
    band_bytes = bands.tobytes()
    payload = hashlib.sha256(band_bytes + bytes(accent_bytes) + bar_bytes).hexdigest()
    info = {
        "sourceArchive": source["archivePath"], "sourceSha256": source["sha256"],
        "runtimeReference": runtime["path"], "runtimeSha256": runtime["sha256"],
        "duration": source["durationSeconds"],
        "beat": {"times": beats, "beatsPerBar": BEATS_PER_BAR, "barsPerPhrase": BARS_PER_PHRASE,
                 "meter": "6/8", "scoreSha256": score.sha256(ROOT / "tools/world-audio/alderweir.mid")},
        "bands": {"rate": BAND_RATE, "frames": int(len(bands)), "names": list(BAND_NAMES), "hz": [list(b) for b in BANDS],
                  "referenceAmplitudes": references, "attackSeconds": BAND_ATTACK, "releaseSeconds": BAND_RELEASE},
        "accents": {"count": int(len(times)), **accent_settings},
        "bars": int(len(bar_bytes)),
        "payloadSha256": payload,
        "analysis": {
            "onset": {"sampleRate": ONSET_SR, "channels": 2, "windowSamples": ONSET_WINDOW, "frameHz": ONSET_RATE,
                      "bands": "40 log-spaced, 30 Hz-10 kHz", "flux": "positive log-power difference; one-second detrend",
                      "tempo": "Dotted-quarter beats from the original MIDI tempo map and first movement marker."},
            "spectrum": {"sampleRate": BAND_SR, "channels": 2, "windowSamples": BAND_WINDOW, "window": "symmetric Hann",
                         "timeAlignment": "window centered on source time; zero-padding at ends; not calibrated display/audio latency",
                         "noiseFloorDbfs": -65, "referencePercentile": 95, "compression": "square root"},
            "quantization": "bands: unsigned 8-bit interleaved; accents: uint16 centiseconds little-endian + uint8 strength; "
                            "bars: uint8 bar RMS relative to the 95th percentile",
            "numpyVersion": np.__version__,
        },
        "credit": "Alderweir. Original chamber score performed with VSCO 2 Community Edition samples (CC0).",
    }
    return f'''// Generated by tools/analyze-menu-rhythm.py; do not hand-edit the payloads.
// The original 6/8 pulse and measured spectrum drive the grove’s dance.
// Source authority/provenance: docs/engineering/alderweir-audio.json. No audio samples are embedded here.
export const MENU_SCORE_RHYTHM_INFO = {json.dumps(info, indent=2)} as const;

/** Six bands per 20 Hz frame (sub, bass, low-mid, mid, high-mid, presence), unsigned 8-bit. */
export const MENU_SCORE_BANDS_BASE64 =
{b64(band_bytes)};

/** Accents: per event uint16 centiseconds (little-endian) and uint8 strength. */
export const MENU_SCORE_ACCENTS_BASE64 =
{b64(bytes(accent_bytes))};

/** Bar loudness (RMS relative to the 95th percentile), one byte per bar from the first downbeat. */
export const MENU_SCORE_BARS_BASE64 =
{b64(bar_bytes)};
'''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare with the checked-in module without writing it")
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("FFmpeg is required; no packages will be installed by this script.")
    source, runtime, path = score.checked_audio()
    duration = source["durationSeconds"]
    onset, _, rms = onset_envelopes(decode(path, ONSET_SR, duration, ffmpeg))
    beats = authored_beats(duration)
    bars = bar_levels(beats, rms, duration)
    accents = accent_events(onset)
    bands, references = spectrum_bands(path, duration, ffmpeg)
    result = module(source, runtime, beats, bars, accents, bands, references)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != result:
            raise SystemExit("Rhythm module differs; run the script without --check to regenerate it.")
    else:
        OUTPUT.write_text(result, encoding="utf-8", newline="\n")
    summary = {
        "output": str(OUTPUT.relative_to(ROOT)), "moduleBytes": len(result.encode("utf-8")),
        "firstDownbeat": beats[0], "pulses": len(beats), "bars": len(bars),
        "accents": len(accents[0]), "bandFrames": len(bands), "check": args.check,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
