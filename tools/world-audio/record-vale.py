"""Record the vale's English reader and field sounds with an ElevenLabs production key.

python3 tools/world-audio/record-vale.py CACHE [--kind speech|effects|all]
The cache holds source takes and character timings. Completed takes survive restarts.
"""

import argparse
import base64
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from urllib import error, request

ROOT = Path(__file__).resolve().parents[2]
NARRATOR = "JBFqnCBsd6RMkjVDRZzb"  # George, the project's established storyteller
MODEL = "eleven_multilingual_v2"
SFX_MODEL = "eleven_text_to_sound_v3"


def api(route, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = request.Request(
        "https://api.elevenlabs.io" + route,
        data=data,
        headers={
            "xi-api-key": os.environ["ELEVENLABS_API_KEY"],
            "Content-Type": "application/json",
            "User-Agent": "Tervain-Audio-Production/1.0",
        },
    )
    for delay in (2, 6, 15, 30, None):
        try:
            with request.urlopen(req, timeout=160) as response:
                return response.read()
        except error.HTTPError as exc:
            detail = json.loads(exc.read()).get("detail", {})
            status = detail.get("status", "") if isinstance(detail, dict) else str(detail)
            if exc.code == 429 and delay and status not in ("quota_exceeded", "insufficient_credits"):
                time.sleep(delay)
                continue
            message = detail.get("message", "") if isinstance(detail, dict) else ""
            raise RuntimeError(f"ElevenLabs {exc.code} {status}: {message[:170]}") from None


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[
        :18
    ]


def save(file, data):
    temp = file.with_suffix(file.suffix + ".part")
    temp.write_bytes(data)
    temp.replace(file)


def record_speech(target, group):
    tag = "reader-" + digest([MODEL, NARRATOR, group])
    meta = target / (tag + ".json")
    if meta.exists():
        return
    text = "\n\n".join(v for k, v in group)
    take = json.loads(
        api(
            f"/v1/text-to-speech/{NARRATOR}/with-timestamps?output_format=mp3_44100_128",
            {
                "text": text,
                "model_id": MODEL,
                "voice_settings": {"stability": 0.68, "similarity_boost": 0.78, "style": 0.13},
            },
        )
    )
    audio = base64.b64decode(take["audio_base64"])
    save(target / (tag + ".mp3"), audio)
    alignment = take["alignment"]
    save(target / (tag + ".timing"), json.dumps(alignment).encode())
    given = "".join(alignment["characters"])
    # Alignment offsets address original input characters; some versions add a trailing newline.
    if given.strip() != text.strip():
        raise ValueError(f"Unexpected alignment for {tag}; raw audio and timings have been saved")
    lead = given.index(text[0])
    start = alignment["character_start_times_seconds"]
    end = alignment["character_end_times_seconds"]
    items, pos = [], lead
    for key, phrase in group:
        begin = pos
        pos += len(phrase)
        # Give each take the whitespace before/after it, split exactly at its midpoint.
        left = 0 if begin == lead else (end[begin - 3] + start[begin]) / 2
        right = (
            (end[pos - 1] + start[pos + 2]) / 2 if pos + 2 < len(text) + lead else end[pos - 1] + 0.08
        )
        items.append({"key": key, "say": phrase, "start": round(left, 5), "end": round(right, 5)})
        pos += 2
    save(
        meta,
        json.dumps(
            {"file": tag + ".mp3", "model": MODEL, "voice": NARRATOR, "items": items},
            ensure_ascii=False,
        ).encode(),
    )
    print(f"Recorded {tag}: {len(group)} phrases", flush=True)


def record_effect(target, pair):
    name, spec = pair
    tag = "effect-" + name + "-" + digest([SFX_MODEL, spec])
    meta = target / (tag + ".json")
    if meta.exists():
        return
    take = api(
        "/v1/sound-generation?output_format=mp3_44100_128",
        {
            "model_id": SFX_MODEL,
            "text": spec["prompt"],
            "duration_seconds": spec["duration"],
            "loop": spec["loop"],
            "prompt_influence": 0.47,
        },
    )
    save(target / (tag + ".mp3"), take)
    save(meta, json.dumps({"file": tag + ".mp3", "id": name, "model": SFX_MODEL, **spec}).encode())
    print("Recorded field sound " + name, flush=True)


def record_encounter(target, pair):
    name, spec = pair
    tag = "encounter-" + name + "-" + digest([MODEL, spec])
    meta = target / (tag + ".json")
    if meta.exists():
        return
    audio = api(
        "/v1/text-to-speech/" + spec["voice"] + "?output_format=mp3_44100_128",
        {
            "model_id": MODEL,
            "text": spec["text"],
            "voice_settings": {"stability": 0.48, "similarity_boost": 0.76},
        },
    )
    save(target / (tag + ".mp3"), audio)
    save(meta, json.dumps({"file": tag + ".mp3", "id": name, "model": MODEL, **spec}).encode())
    print("Recorded encounter " + name, flush=True)


def record_music(target, pair):
    name, spec = pair
    tag = "score-" + name + "-" + digest(["music_v1", spec])
    meta = target / (tag + ".json")
    if meta.exists():
        return
    take = api(
        "/v1/music?output_format=mp3_44100_128",
        {
            "model_id": "music_v1",
            "prompt": spec["prompt"],
            "music_length_ms": spec["seconds"] * 1000,
            "force_instrumental": True,
        },
    )
    save(target / (tag + ".mp3"), take)
    save(meta, json.dumps({"file": tag + ".mp3", "id": name, "model": "music_v1", **spec}).encode())
    print("Recorded score " + name, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    parser.add_argument(
        "--kind", choices=["speech", "effects", "music", "encounters", "all"], default="all"
    )
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    target = args.cache
    target.mkdir(parents=True, exist_ok=True)
    copy = json.loads(subprocess.check_output(["node", "tools/world-audio/vale-copy.mjs"], cwd=ROOT))
    seen = {
        item["key"]: item["say"]
        for f in target.glob("reader-*.json")
        for item in json.loads(f.read_text())["items"]
    }
    groups = []
    group = []
    for key, line in copy.items():
        if seen.get(key) == line:
            continue
        if group and (sum(len(s) + 2 for _, s in group) + len(line) > 930 or len(group) >= 17):
            groups.append(group)
            group = []
        group.append((key, line))
    if group:
        groups.append(group)
    jobs = []
    if args.kind in ("speech", "all"):
        jobs.extend((record_speech, g) for g in groups)
    if args.kind in ("effects", "all"):
        sounds = json.loads((ROOT / "tools/world-audio/vale-sounds.json").read_text())
        jobs.extend(
            (record_effect, (k, v))
            for k, v in sounds.items()
            if not (target / ("effect-" + k + "-" + digest([SFX_MODEL, v]) + ".json")).exists()
        )
    if args.kind in ("music", "all"):
        score = json.loads((ROOT / "tools/world-audio/vale-score.json").read_text())
        jobs.extend(
            (record_music, (k, v))
            for k, v in score.items()
            if not (target / ("score-" + k + "-" + digest(["music_v1", v]) + ".json")).exists()
        )
    if args.kind in ("encounters", "all"):
        cast = json.loads((ROOT / "tools/world-audio/vale-encounters.json").read_text())
        jobs.extend(
            (record_encounter, (k, v))
            for k, v in cast.items()
            if not (target / ("encounter-" + k + "-" + digest([MODEL, v]) + ".json")).exists()
        )
    if args.limit:
        jobs = jobs[: args.limit]
    if not jobs:
        print("All requested takes are present.")
        return
    plan = json.loads(api("/v1/user/subscription"))
    characters = sum(sum(len(v) + 2 for k, v in job) for func, job in jobs if func == record_speech)
    characters += sum(len(job[1]["text"]) for func, job in jobs if func == record_encounter)
    effect_seconds = sum(job[1]["duration"] for func, job in jobs if func == record_effect)
    music_seconds = sum(job[1]["seconds"] for func, job in jobs if func == record_music)
    if plan["tier"] in (None, "free") or plan["status"] != "active":
        raise RuntimeError("An active paid output licence is required for these assets.")
    if (
        plan["character_limit"] - plan["character_count"]
        < characters + 100 * effect_seconds + 100 * music_seconds
    ):
        raise RuntimeError("The included balance does not cover the estimated remaining recordings.")
    print(
        f"Recording {len(jobs)} batches with {characters} characters and {effect_seconds:g} seconds of field sound and {music_seconds:g} seconds of music.",
        flush=True,
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for _ in pool.map(lambda job: job[0](target, job[1]), jobs):
            pass


if __name__ == "__main__":
    main()
