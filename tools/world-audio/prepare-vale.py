"""Master the verified cast takes, reader recordings and world sounds for online and offline play.

Usage: python3 tools/world-audio/prepare-vale.py RECORDING_CACHE
Banks use one common sample rate. Their offsets are measured in decoded PCM samples.
"""

import argparse
import array
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/audio/vale"
RATE = 24000


def read(file):
    return json.loads(file.read_text())


def put(file, data):
    file.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


def ff(args, pcm=None):
    return subprocess.run(
        ["ffmpeg", "-nostdin", "-threads", "1", "-hide_banner", "-loglevel", "error", "-y", *args],
        input=pcm,
        check=True,
        stdout=subprocess.PIPE,
    ).stdout


def decode(file, filter=None):
    opts = ["-af", filter] if filter else []
    return ff(["-i", str(file), *opts, "-ac", "1", "-ar", str(RATE), "-f", "s16le", "pipe:1"])


def encode(file, pcm):
    if not pcm:
        raise ValueError("Empty bank " + file.name)
    ff(
        [
            "-f",
            "s16le",
            "-ar",
            str(RATE),
            "-ac",
            "1",
            "-i",
            "pipe:0",
            "-map_metadata",
            "-1",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "64k",
            str(file),
        ],
        pcm,
    )


def verified(source):
    file = ROOT / source["path"]
    if hashlib.sha256(file.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError("Source changed: " + str(source["path"]))
    return file


class Banks:
    def __init__(self):
        self.catalog = {
            "files": [],
            "story": {},
            "lines": {},
            "reader": {},
            "effects": {},
            "beds": {},
            "music": {},
            "encounters": {},
        }
        self.prefix = ""
        self.data = bytearray()
        self.part = 0

    def close(self):
        if self.data:
            file = self.catalog["files"][-1]
            encode(OUT / file, self.data)
            self.data = bytearray()

    def cue(self, group, pcm):
        if not pcm:
            raise ValueError("Empty recording in " + group)
        if group != self.prefix or not self.data or len(self.data) + len(pcm) > RATE * 2 * 53:
            self.close()
            self.part = self.part + 1 if group == self.prefix else 1
            self.prefix = group
            self.catalog["files"].append(f"{group}-{self.part:02}.mp3")
        head = len(self.data) // 2
        self.data.extend(pcm)
        self.data.extend(b"\0\0" * round(RATE * 0.12))
        return [len(self.catalog["files"]) - 1, head, len(pcm) // 2]


def prepare(cache):
    OUT.mkdir(parents=True, exist_ok=True)
    banks = Banks()
    out = banks.catalog
    recorded = read(ROOT / "docs/engineering/voice-assets.json")["lines"]
    plan = read(ROOT / "tools/world-audio/voices.json")
    by_text = {}
    for actor in sorted(recorded, key=lambda item: (item["speaker"], item["set"], item["id"])):
        gain = max(-7, min(7, -18 - actor["levelDb"]))
        pcm = decode(
            verified(actor["source"]),
            f"volume={gain:.2f}dB,alimiter=limit=0.88:level=false:latency=true",
        )
        by_text[actor["speaker"], actor["text"]] = banks.cue(
            "cast-" + actor["speaker"].replace("_", "-"), pcm
        )
    for group in ("lines", "story"):
        for key, line in plan[group].items():
            out[group][key] = by_text[line["speaker"], line["text"]]
    script = json.loads(subprocess.check_output(["node", "tools/world-audio/vale-copy.mjs"], cwd=ROOT))
    for f in sorted(cache.glob("reader-*.json")):
        batch = read(f)
        pcm = decode(
            cache / batch["file"],
            "highpass=f=60,volume=-1.4dB,alimiter=limit=0.88:level=false:latency=true",
        )
        for item in batch["items"]:
            key = item["key"]
            if script.get(key) != item["say"] or key in out["reader"]:
                continue
            start, end = (round(item[x] * RATE) * 2 for x in ("start", "end"))
            clip = pcm[start:end]
            if len(clip) < RATE * 0.09 or max(abs(n) for n in array.array("h", clip)) < 64:
                raise ValueError("Silent or empty reader segment: " + key)
            out["reader"][key] = banks.cue("reader", clip)
    missing = script.keys() - out["reader"].keys()
    if missing:
        raise ValueError(f"Missing {len(missing)} reader takes, including {sorted(missing)[:5]}")
    effects = read(ROOT / "tools/world-audio/vale-sounds.json")
    for id, spec in effects.items():
        matches = [read(f) for f in sorted(cache.glob("effect-" + id + "-*.json"))]
        source = next((s for s in matches if all(s.get(k) == v for k, v in spec.items())), None)
        if not source:
            raise ValueError("Missing effect: " + id)
        if spec["loop"]:
            file = "bed-" + id + ".mp3"
            ff(
                [
                    "-i",
                    str(cache / source["file"]),
                    "-map_metadata",
                    "-1",
                    "-af",
                    "highpass=f=38,alimiter=limit=0.88:level=false:latency=true",
                    "-ac",
                    "2",
                    "-ar",
                    "44100",
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "112k",
                    str(OUT / file),
                ]
            )
            out["beds"][id] = file
        else:
            pcm = decode(cache / source["file"], "alimiter=limit=0.85:level=false:latency=true")
            out["effects"][id] = [banks.cue("foley", pcm)]
    world = read(ROOT / "docs/engineering/world-audio-assets.json")["assets"]
    for sound in world:
        use = sound["use"]
        if not sound["id"].startswith("f_") or "spans" not in use:
            continue
        pcm = decode(verified(sound["source"]))
        out["effects"][use["name"]] = [
            banks.cue("footsteps", pcm[round(a * RATE) * 2 : round(b * RATE) * 2])
            for a, b in use["spans"]
        ]
    extra_world = {
        "e_growl": "thornback",
        "c_block": "block",
        "c_hit": "hit",
        "i_coins": "coins",
        "i_satchel": "bag",
        "i_map": "map",
        "i_page": "page",
        "i_eat": "eat",
        "i_sword": "equip",
        "w_rite": "rite",
        "w_gate": "gate",
    }
    for take in world:
        key = extra_world.get(take["id"])
        if key:
            out["effects"][key] = [banks.cue("world", decode(verified(take["source"])))]
    for name, spec in read(ROOT / "tools/world-audio/vale-encounters.json").items():
        matches = [read(f) for f in cache.glob("encounter-" + name + "-*.json")]
        take = next((s for s in matches if all(s.get(k) == v for k, v in spec.items())), None)
        if not take:
            raise ValueError("Missing character: " + name)
        pcm = decode(cache / take["file"], "volume=-1dB,alimiter=limit=0.88:level=false:latency=true")
        out["encounters"][name] = {
            "cue": banks.cue("ford-voices", pcm),
            "text": spec["text"],
            "speaker": spec["speaker"],
        }
    animals = read(ROOT / "docs/engineering/animal-audio-assets.json")
    for sound in animals["assets"]:
        id = sound["species"]
        out["effects"].setdefault("call." + id, []).append(
            banks.cue("wildlife", decode(verified(sound["source"])))
        )
    for name, spec in read(ROOT / "tools/world-audio/vale-score.json").items():
        matches = [read(f) for f in sorted(cache.glob("score-" + name + "-*.json"))]
        source = next((s for s in matches if all(s.get(k) == v for k, v in spec.items())), None)
        if not source:
            raise ValueError("Missing score: " + name)
        file = "score-" + name + ".mp3"
        # Blend the ending into the first beat, then rotate the loop to the end of the splice.
        duration = float(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "csv=p=0",
                    str(cache / source["file"]),
                ]
            )
        )
        edge = 0.9
        graph = (
            f"[0:a]aresample=44100,asplit=3[h][m][t];[h]atrim=0:{edge},asetpts=PTS-STARTPTS[head];"
            f"[m]atrim={edge}:{duration - edge},asetpts=PTS-STARTPTS[mid];"
            f"[t]atrim=start={duration - edge},asetpts=PTS-STARTPTS[tail];"
            f"[tail][head]acrossfade=d={edge}:c1=tri:c2=tri[seam];[mid][seam]concat=n=2:v=0:a=1,"
            "loudnorm=I=-19:TP=-2:LRA=9,aresample=44100[out]"
        )
        ff(
            [
                "-i",
                str(cache / source["file"]),
                "-filter_complex",
                graph,
                "-map",
                "[out]",
                "-map_metadata",
                "-1",
                "-ac",
                "2",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "128k",
                str(OUT / file),
            ]
        )
        out["music"][name] = file
    banks.close()
    put(ROOT / "src/isometric/spokenCatalogue.json", out)
    files = out["files"] + list(out["beds"].values()) + list(out["music"].values())
    sources = []
    for file in sorted(cache.glob("*.json")):
        take = read(file)
        if "file" not in take:
            continue
        source = cache / take["file"]
        sources.append(
            {
                "take": source.stem,
                "model": take["model"],
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            }
        )
    ledger = {
        "edition": "0.1.7",
        "provider": "ElevenLabs",
        "generationLicence": "paid at time of generation",
        "speech": "The original Tervain cast is credited in docs/engineering/voice-assets.json. George reads the English interface.",
        "effects": "Original wildlife and footstep sources are credited in animal-audio-assets.json and world-audio-assets.json. New field briefs are in tools/world-audio/vale-sounds.json.",
        "music": "Three instrumental commissions from the briefs in tools/world-audio/vale-score.json. Eleven Music terms apply.",
        "sources": sources,
        "deliveries": [
            {"file": f, "sha256": hashlib.sha256((OUT / f).read_bytes()).hexdigest()}
            for f in sorted(files)
        ],
    }
    (ROOT / "docs/engineering/spoken-vale.json").write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        f"{len(out['files'])} seekable banks, {len(out['story'])} dialogue and reply IDs, {len(out['lines'])} world lines, {len(out['reader'])} reader phrases, {len(out['effects'])} effects, {len(out['beds'])} environments"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    prepare(parser.parse_args().cache)
