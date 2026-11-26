#!/usr/bin/env python3
"""Render the playable original Tervain score, ambience, effects and dialogue gestures.

Requirements: Python 3, NumPy, FFmpeg and Node with TypeScript type stripping.
All input is authored notation, synthesis code, line text and game cue timings.
The older Tervain code-composed pieces remain byte-for-byte verified against their original receipts.
"""
import hashlib
import json
from pathlib import Path
import subprocess
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from ford_score import HERE, SR, TITLE_LENGTH, music
from ford_foley import ambience, call, conversation, foley, seed_for

ROOT = HERE.parents[1]
WORLD = ROOT / "public/assets/audio/world"
VOICE = ROOT / "public/assets/audio/voice"
ANIMALS = ROOT / "public/audio/animals"
HUNT = ROOT / "public/assets/audio/hunting"
DOCS = ROOT / "docs/engineering"
HUNTING = {"arrow_flesh":.80, "arrow_ground":.80, "bow_draw":1.50,
           "bow_release":.65, "skinning":3.0, "skinning_complete":1.0}


def receipt(file):
    raw = file.read_bytes()
    return {"path":file.relative_to(ROOT).as_posix(), "bytes":len(raw), "sha256":hashlib.sha256(raw).hexdigest()}


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def runtime(module, name):
    script = f"import {{{name}}} from './src/presentation/sound/{module}.ts';console.log(JSON.stringify({name}))"
    return json.loads(subprocess.check_output(["node","--input-type=module","-e",script], cwd=ROOT))


def encode(base, pcm, peak, formats=("ogg","m4a")):
    channels = 1 if pcm.ndim == 1 else pcm.shape[1]
    pcm = np.ascontiguousarray(pcm, dtype="<f4")
    maximum = np.max(np.abs(pcm))
    if not np.isfinite(maximum) or maximum <= .001:
        raise ValueError(f"Invalid signal for {base}")
    pcm *= peak / maximum
    frames = pcm.tobytes()
    base.parent.mkdir(parents=True, exist_ok=True)
    files = []
    for ext in formats:
        file = base.with_suffix("."+ext)
        codec = {"ogg":["-c:a","libopus","-ar","48000","-b:a","72k" if channels==2 else "38k",
                        "-vbr","on","-fflags","+bitexact","-serial_offset","0"],
                 "m4a":["-c:a","aac","-b:a","96k" if channels==2 else "48k","-movflags","+faststart"],
                 "mp3":["-c:a","libmp3lame","-ar","44100","-b:a","96k"]}[ext]
        subprocess.run(["ffmpeg","-v","error","-nostdin","-y","-f","f32le","-ar",str(SR),"-ac",str(channels),
                        "-i","pipe:0","-map_metadata","-1","-flags:a","+bitexact","-threads","1",*codec,str(file)],
                       input=frames,check=True)
        files.append(receipt(file))
    return files


def main():
    world = runtime("worldAudioManifest","WORLD_AUDIO")
    voices = runtime("voiceManifest","VOICE_AUDIO")
    # The dialogue is authored game text; the legacy source recording and actor IDs are never read.
    lines = json.loads((ROOT/"data/game/voice.json").read_text())["lines"]
    story = json.loads((ROOT/"data/game/strings.en.json").read_text())["dialogue"]
    tasks = []

    def queue(id, base, make, peak, formats=("ogg","m4a")):
        tasks.append((id,base,make,peak,formats))

    queue("title",WORLD/"ford/title",lambda: music("title","vale",TITLE_LENGTH,0,title=True),.74)
    for bank, data in world["banks"].items():
        def sprite(data=data):
            y = np.zeros(round(data["duration"]*SR),dtype=np.float32)
            for cue, spans in data["clips"].items():
                for i,(at,duration) in enumerate(spans):
                    offset = round(at*SR)
                    sound = foley(cue,duration,seed_for(cue+str(i)))
                    sound *= (.76+.04*(i%4)) / max(.001,np.max(np.abs(sound)))
                    y[offset:offset+len(sound)] = sound
            return y
        queue("bank/"+bank,WORLD/data["file"],sprite,.61)
    for id, data in world["loops"].items():
        queue("loop/"+id,WORLD/data["file"],lambda id=id,d=data: ambience(id,d["duration"],d["channels"]),.45)
    # Preserve the previously authored Tervain suite, verified individually. All other arrangements are new.
    original = json.loads((DOCS/"world-audio-assets.json").read_text())
    earlier = {piece["id"]:piece for piece in original["composed"]}
    retained = {}
    for kind in ("music","songs"):
        for id, d in world[kind].items():
            archived = earlier.get(id)
            if archived:
                actual = [receipt(ROOT/r["path"]) for r in archived["derivatives"]]
                if [f["sha256"] for f in actual] != [f["sha256"] for f in archived["derivatives"]]:
                    raise ValueError(f"Original code-composed recording changed: {id}")
                retained[kind+"/"+id]=actual
                continue
            def score(id=id,d=d):
                y = music(id,d.get("mood","song"),d["duration"],seed_for(id))
                return y.mean(axis=1) if d["channels"]==1 else y
            queue(kind+"/"+id,WORLD/d["file"],score,.68)
    spoken = {}
    for collection in ("lines","story"):
        for id,(bank,at,duration,speaker) in voices[collection].items():
            words = lines[id]["text"] if collection == "lines" else story[id]
            spoken.setdefault(bank,{})[at] = (duration,speaker,words)
    for bank,data in voices["banks"].items():
        def dialogue(bank=bank,d=data):
            y = np.zeros(round(d["duration"]*SR),dtype=np.float32)
            for at,(duration,speaker,words) in spoken[bank].items():
                offset = round(at*SR)
                gesture = conversation(speaker,words,duration)
                y[offset:offset+len(gesture)] = gesture
            return y
        queue("voice/"+bank,VOICE/data["file"],dialogue,.39)
    for species in ("highland_wolf","hill_boar","bear","wolf","cat","dog","boar","deer"):
        for variant in (1,2):
            id=f"{species}-{variant}"
            def animal(species=species,variant=variant,id=id):
                duration = {"wolf":2.1,"highland_wolf":2.45,"hill_boar":1.25,"bear":1.5,"dog":.79,"cat":.65,"deer":1.1}.get(species,1.4)*(.88+.09*variant)
                return call(species,np.arange(round(duration*SR))/SR,np.random.default_rng(seed_for(id)))
            queue("animal/"+id,ANIMALS/id,animal,.55)
    for id,duration in HUNTING.items():
        queue("hunt/"+id,HUNT/id,lambda id=id,duration=duration: foley(id,duration,seed_for(id)),.42,("mp3",))

    def render(task):
        id,base,make,peak,formats = task
        return id,encode(base,make(),peak,formats)
    with ThreadPoolExecutor(max_workers=2) as pool:
        files = dict(pool.map(render,tasks))
    files.update(retained)
    record = {"title":"The Ford at First Light","titleDurationSeconds":TITLE_LENGTH,
              "editableScore":receipt(HERE/"ford-score.json"),
              "renderSources":[receipt(HERE/f) for f in ("ford_score.py","ford_foley.py","render-ford.py")],
              "originalTervainSuite":sorted(retained),
              "licence":"Original Tervain game content; see LICENSE and world-audio-licenses.html.",
              "derivatives":dict(sorted(files.items()))}
    write_json(DOCS/"tervain-audio.json",record)
    hunt = {"schemaVersion":2,"status":"complete","renderer":"ford_foley.py","assets":[]}
    for id,duration in HUNTING.items():
        f=files["hunt/"+id][0]
        raw=subprocess.check_output(["ffmpeg","-v","error","-i",str(ROOT/f["path"]),"-f","f32le","pipe:1"])
        dec=np.frombuffer(raw,dtype="<f4")
        hunt["assets"].append({"id":id,**f,"durationSeconds":round(len(dec)/44100,5),
                               "peakDbfs":round(float(20*np.log10(np.max(np.abs(dec)))),3),
                               "sampleRate":44100,"channels":1,"loop":id=="skinning"})
    write_json(HUNT/"manifest.json",hunt)
    write_json(DOCS/"hunting-sounds.json",hunt)
    print(f"{len(record['derivatives'])} cues. Title {TITLE_LENGTH}s.")

if __name__ == "__main__":
    main()
