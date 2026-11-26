"""Render Tervain's Bell Road score and environmental beds. All notes, noises and instruments are original."""
from pathlib import Path
import hashlib
import json
import subprocess
import numpy as np

RATE = 32000
BEAT = 2 / 3
BARS = 16
LENGTH = round(RATE * BEAT * 4 * BARS)
OUT = Path(__file__).resolve().parents[2] / "public/assets/audio/bell-road"
SCALE = (0, 2, 3, 5, 7, 9, 10)
# The delayed second note and falling final third return when the water starts flowing.
PHRASES = (
    ((0, 2, .85), (1.5, 4, .42), (2.5, 5, 1.15)),
    ((.5, 4, .8), (1.75, 2, .6), (3, 0, .8)),
    ((0, 1, 1.35), (2, 3, .5), (3.25, 2, .55)),
    ((.5, 0, 1.25), (2.5, -2, 1.25)),
)
# Melodic voice, octave, bass progression (scale degrees), percussion, seed.
SCORES = {
    "overture": ("viol", 0, (0,-2,3,-4), 1, 11),
    "strand": ("flute", 0, (0,-4,-2,-4), 0, 17),
    "pines": ("wood", 0, (0,-1,-4,-2), 1, 23),
    "market": ("wire", 0, (0,3,-2,-4), 2, 31),
    "water": ("glass", 0, (3,0,-2,-4), 0, 43),
    "lamplight": ("viol", -7, (0,-2,-5,-4), 0, 47),
    "hearth": ("lute", 0, (0,3,1,-4), 0, 53),
    "hymn": ("flute", 0, (3,1,0,-4), 0, 59),
    "undercroft": ("wood", -7, (0,-4,-5,-4), 0, 61),
    "ford": ("wire", -7, (0,-1,0,-4), 3, 67),
    "thorn": ("viol", -7, (0,-5,-1,-4), 4, 73),
    "homecoming": ("glass", 0, (0,3,-4,0), 2, 79),
}

def frequency(degree):
    octave, step = divmod(degree, 7)
    return 440 * 2 ** ((62 + 12 * octave + SCALE[step] - 69) / 12)

def voice(kind, degree, beats, rng):
    length = max(.12, beats * BEAT)
    t = np.arange(round(length * RATE)) / RATE
    hz = frequency(degree)
    phase = 2*np.pi*hz*t
    if kind in ("viol", "flute"):
        vibrato = .16*np.sin(2*np.pi*4.9*t) * np.minimum(1, 2*t)
        gains = (1,.31,.16,.10,.05) if kind == "viol" else (1,.06,.17,.025,.045)
        y = sum(g*np.sin((phase+vibrato)*n+.09*n) for n,g in enumerate(gains,1))
        breath = rng.normal(0,1,len(t))
        y += .04*(breath-np.roll(breath,1))*np.exp(-t*28)
        envelope = (1-np.exp(-t*13)) * np.minimum(1,(length-t)/.15)
        return y*envelope*(.87+.13*np.sin(2*np.pi*.85*t))
    ratios, strengths, damping = {
        "lute": ((1,2.002,3.001,4.008),(1,.46,.19,.08),3.6),
        "wire": ((1,2.004,3.007,5.02),(1,.47,.29,.12),2.3),
        "wood": ((1,2.75,4.11),(1,.32,.14),5.5),
        "glass": ((1,2.49,3.53,5.12),(1,.22,.17,.065),2.0),
        "bass": ((1,2,3),(1,.34,.07),2.4),
    }[kind]
    y = sum(g*np.cos(phase*r)*np.exp(-t*damping*(1+i*.58)) for i,(r,g) in enumerate(zip(ratios,strengths)))
    return y * (1-np.exp(-t*160)) * np.minimum(1,(length-t)/.075)

def place(mix, sample, seconds, gain, pan):
    # Wrap releases over the downbeat so the first sample follows the last in the loop.
    offset = round(seconds * RATE) % len(mix)
    stereo = sample[:,None] * (gain*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)]))
    first = min(len(sample),len(mix)-offset)
    mix[offset:offset+first] += stereo[:first]
    if first < len(sample):
        mix[:len(sample)-first] += stereo[first:]

def drum(high, rng):
    t=np.arange(round(RATE*(.13 if high else .35)))/RATE
    n=rng.normal(0,1,len(t))
    if high:
        return (n-np.roll(n,1))*.32*np.exp(-t*43)*(1-np.exp(-t*420))
    phase=2*np.pi*(56*t+1.8*(1-np.exp(-t*31)))
    return (np.sin(phase)+.16*n*np.exp(-t*35))*np.exp(-t*12)*(1-np.exp(-t*250))

def score(name, recipe):
    lead, octave, roots, pulse, seed = recipe
    rng=np.random.default_rng(seed); mix=np.zeros((LENGTH,2))
    battle=pulse>=3
    for bar in range(BARS):
        root=roots[(bar//2)%4]; origin=bar*4
        def note(instrument, degree, start, duration, level, pan):
            place(mix,voice(instrument,degree,duration,rng),(origin+start)*BEAT,level*rng.uniform(.90,1.05),pan)
        note("bass",root-14,0,3.35,.26,0)
        if pulse:
            note("bass",root-10,2.5,.85,.14,0)
        pattern=(0,.75,1.5,2.25,3,3.5) if battle else (.5,1.25,2.5,3.25)
        for j,beat in enumerate(pattern):
            note("wood" if name=="pines" else "lute",root-7+(0,4,2,4,0,2)[j],beat,1.6,.13 if battle else .105,(-.5,.36)[j%2])
        # Leave a bar of air in the sparse arrangements, with a quieter answering instrument every fourth bar.
        if pulse>=2 or bar%4!=2:
            for beat,degree,duration in PHRASES[bar%4]:
                note(lead,degree+octave+(2 if bar in (9,10,11) else 0),beat,duration+(.75 if lead in ("wire","glass") else 0),.23,-.18)
        if bar%4==3:
            note("glass" if lead!="glass" else "flute",4+(bar//4)%2,3,1.65,.13,.46)
        if pulse:
            for beat in ((0,2,3.25) if battle else (0,2)):
                place(mix,drum(False,rng),(origin+beat)*BEAT,.26 if battle else .09,-.08)
            for beat in ((.5,1,1.75,2.5,3,3.5) if battle else (1.5,3.5)):
                place(mix,drum(True,rng),(origin+beat)*BEAT,.11 if battle else .047,.43)
        if pulse==4:
            note("wood",root-11,1.25,.36,.32,-.42)
            note("wood",root-10,1.75,.36,.29,.42)
    wet=.15 if name in ("hymn","undercroft","water") else .065
    mix += np.roll(mix[:,::-1],round(.22*RATE),axis=0)*wet + np.roll(mix,round(.38*RATE),axis=0)*wet*.5
    return mix

def bed(name, seed):
    rng=np.random.default_rng(seed); size=RATE*18
    frequencies=np.fft.rfftfreq(size,1/RATE)
    def band(lo,hi):
        spectrum=rng.normal(size=len(frequencies))+1j*rng.normal(size=len(frequencies))
        curve=np.minimum(1,frequencies/lo)**2 / (1+(frequencies/hi)**3)
        signal=np.fft.irfft(spectrum*curve,n=size);return signal/max(1e-8,np.std(signal))
    mix=np.zeros((size,2)); phase=np.arange(size)*2*np.pi/size
    for channel in range(2):
        surf=name=="tideline"; inside=name in ("rafters","vault"); river=name=="millrace"
        swell=.56+.22*np.sin(phase*(3 if surf else 2)+channel*.52)+.14*np.sin(phase*5+.7)
        mix[:,channel]=band(62 if inside else 120,320 if inside else 880)*swell*.11
        mix[:,channel]+=band(700,4600 if river else 2800)*swell**(3 if surf else 2)*(.18 if not inside else .02)
    for i in range({"tideline":8,"canopy":15,"millrace":37,"square":12,"rafters":11,"vault":5,"night":24}[name]):
        t=np.arange(round(RATE*rng.uniform(.09,.34)))/RATE
        hz=rng.uniform(540,1450) if name not in ("canopy","night") else rng.uniform(1500,2850)
        if name in ("rafters","square","tideline"):
            signal=rng.normal(size=len(t))*np.exp(-t*48)+.35*np.sin(2*np.pi*hz*t)*np.exp(-t*29)
        else:
            signal=np.sin(2*np.pi*(hz*t+hz*.36*t*t))*np.sin(np.pi*t/(t[-1]+1/RATE))**2
        place(mix,signal,rng.uniform(0,18),.09 if name=="vault" else .045,rng.uniform(-.8,.8))
    return mix

def save(name, mix, rms):
    mix-=np.mean(mix,axis=0)
    mix*=min(rms/np.sqrt(np.mean(mix**2)),.81/np.max(np.abs(mix)))
    subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-f","f32le","-ar",str(RATE),"-ac","2","-i","pipe:0",
                    "-c:a","libmp3lame","-b:a","112k","-map_metadata","-1",str(OUT/(name+".mp3"))],
                   input=mix.astype("<f4").tobytes(),check=True)
def ledger():
    root = OUT.parents[3]
    def receipt(p):
        data = p.read_bytes()
        return {"path": p.relative_to(root).as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    record = {"title": "The Bell Road", "beatsPerMinute": 90, "bars": BARS, "sampleRate": RATE,
              "source": receipt(Path(__file__).resolve()), "deliveries": [receipt(p) for p in sorted(OUT.glob("*.mp3"))]}
    (root/"docs/engineering/bell-road-audio.json").write_text(json.dumps(record,indent=2)+"\n")
if __name__=="__main__":
    OUT.mkdir(parents=True,exist_ok=True)
    for name,recipe in SCORES.items():
        save(name,score(name,recipe),.146 if name in ("ford","thorn") else .125)
    for seed,name in enumerate(("tideline","canopy","millrace","square","rafters","vault","night"),311):
        save("air-"+name,bed(name,seed),.107)

    ledger()
