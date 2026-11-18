"""Prepare Tervain's Alderweir recordings. Run with the original project's Music directory.

Uses Python's standard library and FFmpeg. The title streams the complete chamber
performance. Exploration pieces cut on changes of phrase, and river loops rotate
a short equal-power overlap into their centres so the playback seam is continuous.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/audio/world/alderweir"
RATE = 48000
# Seconds into the time-aligned master. The clean stem opens with 4.5 seconds
# of space for the film's water, so the interactive landing cue starts at the harp.
MOVEMENTS = {
    "landing": (4.40, 63.88, "vale", "The Landing"),
    "ash-trees": (63.82, 122.95, "wild", "Under the Ash Trees"),
    "bridge": (122.94, 159.86, "sacred", "The Road over the Bridge"),
    "coda": (159.82, 233.82, "night", "Evening on the Landing"),
}


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], check=True)


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def encode(src, name, channels, bitrate):
    outputs = []
    for suffix, codec in (("ogg", "libopus"), ("m4a", "aac")):
        file = OUTPUT / f"{name}.{suffix}"
        options = ["-movflags", "+faststart"] if suffix == "m4a" else []
        ffmpeg("-i", src, "-map", "0:a:0", "-map_metadata", "-1", "-ar", RATE, "-ac", channels,
               "-c:a", codec, "-b:a", f"{bitrate}k", "-fflags", "+bitexact", "-flags:a", "+bitexact", *options, file)
        outputs.append({"path": file.relative_to(ROOT).as_posix(), "bytes": file.stat().st_size, "sha256": digest(file)})
    return outputs


def river_loop(field, at, seconds, output):
    # The first and last sample of the result are neighbours in the source.
    overlap = 1.4
    chain = (
        f"[0:a]pan=mono|c0=0.5*c0+0.5*c1,volume=10dB,asplit=3[first][body][last];"
        f"[body]atrim=start={overlap}:end={seconds},asetpts=PTS-STARTPTS[middle];"
        f"[last]atrim=start={seconds}:end={seconds+overlap},asetpts=PTS-STARTPTS[tail];"
        f"[first]atrim=end={overlap},asetpts=PTS-STARTPTS[head];"
        f"[tail][head]acrossfade=d={overlap}:c1=qsin:c2=qsin[seam];[middle][seam]concat=n=2:v=0:a=1"
    )
    ffmpeg("-ss", at, "-i", field, "-filter_complex", chain, "-ar", RATE, "-c:a", "pcm_s24le", output)


def make_foley(output):
    """Modal board resonances, shallow heel splashes and the oak latch, with distinct takes."""
    rand = random.Random(417)
    pcm = array.array("h", [0] * 4800)
    clips = {}
    for cue, duration in (("step.plank", 0.46), ("step.shallows", 0.57), ("door.latch", 0.32)):
        variants = []
        for _ in range(4):
            variants.append([round(len(pcm) / RATE, 4), duration])
            pitch = rand.uniform(0.90, 1.12)
            drops = [(rand.uniform(.042, .19), rand.uniform(550, 1600)) for _ in range(7)]
            slow = fast = 0
            for i in range(round(duration * RATE)):
                t = i / RATE
                noise = rand.uniform(-1, 1)
                slow += .042 * (noise - slow)
                fast += .32 * (noise - fast)
                if cue == "step.shallows":
                    slap = (1 - math.exp(-t * 95)) * math.exp(-t * 17)
                    sound = (slow * .64 + (fast - slow) * .14) * slap
                    for on, hz in drops:
                        a = t - on
                        if a >= 0:
                            sound += .024 * math.exp(-a * 69) * math.sin(math.tau * hz * (a + .96 * a * a))
                else:
                    # A heel excites a relatively broad, long hollow board. A latch
                    # has brighter partials, and a second dull tap as it seats.
                    plank = cue == "step.plank"
                    frequencies = (95, 204, 353, 681) if plank else (235, 628, 1120, 2160)
                    sound = 0
                    for onset, weight in ((0, 1), (.048 if plank else .099, .26 if plank else .62)):
                        a = t - onset
                        if a < 0:
                            continue
                        excitation = 1 - math.exp(-a * (950 if plank else 1550))
                        partials = sum((.13 / (j + 1)) * math.exp(-a * (14 + 11 * j))
                                       * math.sin(math.tau * f * pitch * a) for j, f in enumerate(frequencies))
                        sound += weight * excitation * (partials + fast * .23 * math.exp(-a * 90))
                tail = min(1, (duration - t) / .016)
                pcm.append(round(32767 * max(-1, min(1, sound * tail))))
            pcm.extend([0] * 4800)
        clips[cue] = variants
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(output), "wb") as writer:
        writer.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        writer.writeframes(pcm.tobytes())
    return {"file": "alderweir/foley", "clips": clips, "duration": len(pcm) / RATE}


def write_constants(path, name, value):
    text = json.dumps(value, indent=2, ensure_ascii=False)
    path.write_text(f"// Generated by tools/world-audio/prepare-alderweir.py.\nexport const {name} = {text} as const;\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("music", type=Path, help="Original Music folder with the two lossless stems and Alderweir.mid")
    stems = parser.parse_args().music
    chamber, field = stems / "Chamber ensemble.flac", stems / "River and woodland.flac"
    sources = {p.name: digest(p) for p in (chamber, field)}
    title_duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", chamber,
    ]))
    midi = ROOT / "tools/world-audio/alderweir.mid"
    shutil.copyfile(stems / "Alderweir.mid", midi)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    files = {"title": encode(chamber, "title", 2, 128)}
    music, loops, catalog = {}, {}, {}
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "cut.wav"
        for name, (start, end, mood, title) in MOVEMENTS.items():
            duration = round(end - start, 2)
            ffmpeg("-ss", start, "-i", chamber, "-t", duration, "-af",
                   f"volume=1.5dB,afade=t=in:d=0.16,afade=t=out:st={duration-1.8}:d=1.8",
                   "-ar", RATE, "-c:a", "pcm_s24le", wav)
            files[name] = encode(wav, name, 2, 112)
            key = "alder_" + name.replace("-", "_")
            catalog[key] = {"kind": "piece", "mood": mood, "origin": "composed", "title": title, "duration": duration}
            music[key] = {**catalog[key], "file": f"alderweir/{name}", "channels": 2}
        for name, at, duration in (("riverbank", 28.3, 19), ("low-weir", 119.3, 13)):
            river_loop(field, at, duration, wav)
            files[name] = encode(wav, name, 1, 64)
            loops[name.replace("-", "_")] = {"file": f"alderweir/{name}", "channels": 1, "duration": duration}
        bank = make_foley(wav)
        files["foley"] = encode(wav, "foley", 1, 64)
    write_constants(ROOT / "src/core/content/alderweirMusic.ts", "ALDERWEIR_MUSIC", catalog)
    write_constants(ROOT / "src/presentation/sound/alderweirAudio.ts", "ALDERWEIR_AUDIO",
                    {"music": music, "loops": loops, "banks": {"alderweir": bank}})
    record = {"title": "Alderweir", "titleDurationSeconds": title_duration, "sourceStemSha256": sources,
              "editableScore": {"path": midi.relative_to(ROOT).as_posix(), "sha256": digest(midi)},
              "instrumentSamples": "Versilian Studios Community Orchestra 2, Community Edition (CC0 1.0)",
              "sampleSource": "https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e",
              "authorship": "Original chamber score, synthesized river and woodland, and procedural interaction sounds.",
              "preparation": "tools/world-audio/prepare-alderweir.py", "derivatives": files}
    (ROOT / "docs/engineering/alderweir-audio.json").write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()
