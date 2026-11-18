"""Material resonances, air, water, animal calls and conversational gestures for Tervain."""
import hashlib

import numpy as np

from ford_score import SR, TAU


def seed_for(name):
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], "big")


def grains(t, rng, hz):
    # Interpolating noise over pressure samples behaves as a cheap low-pass.
    count = max(3, round(len(t) * hz / SR) + 2)
    return np.interp(t * hz, np.arange(count), rng.uniform(-1, 1, count))


def shaped(t, attack, decay):
    return np.minimum(1, t / attack) * np.exp(-decay * t)


def strike(t, base, ratios, decay):
    return sum(np.sin(TAU * base * r * t) * np.exp(-decay*(1 + i*.55)*t) / (1 + i*1.6)
               for i, r in enumerate(ratios)) * np.minimum(1, t / .004)


def call(name, t, rng):
    # Fundamental, end/start pitch ratio, vibrato rate, number of articulated calls and roughness.
    types = {
        "tiger": (92, .59, 7, 2, .45), "lion": (83, .68, 10, 1, .53), "bear": (97, .55, 16, 2, .62),
        "wolf": (320, 1.22, 3, 1, .10), "cat": (515, .67, 5, 1, .07), "dog": (182, .61, 8, 2, .35),
        "boar": (118, .75, 17, 3, .47), "deer": (475, 1.12, 7, 2, .24),
        "owl": (390, .84, 3, 2, .04), "gull": (1060, .58, 9, 2, .12), "crow": (670, .75, 28, 2, .37),
        "songbird": (2230, 1.34, 12, 4, .025), "smallbird": (2870, .79, 14, 3, .022),
        "frog": (195, .58, 29, 3, .20), "chicken": (690, .7, 8, 3, .18), "rooster": (740, 1.12, 8, 2, .22),
        "horse": (520, .50, 7, 1, .23), "beast": (118, .64, 17, 2, .44),
    }
    base, slope, vibrato, pulses, rough = types[name]
    x = t / max(.001, t[-1])
    pos = x * pulses
    local = np.mod(pos, 1)
    pitch = base*rng.uniform(.91, 1.1)*(1+(slope-1)*local+.13*np.sin(np.pi*local)+.018*np.sin(TAU*vibrato*t))
    p = TAU*np.cumsum(pitch)/SR
    envelope = np.sin(np.pi * np.minimum(1, local/.86))**1.35
    voiced = np.sin(p) + .32*np.sin(2*p) + rough*np.sin(3*p)
    return envelope*(voiced*(1-rough+.22*np.sin(TAU*(vibrato*1.8)*t)) + rough*grains(t,rng,1700))


def foley(cue, duration, seed):
    rng = np.random.default_rng(seed)
    t = np.arange(max(2, round(SR*duration))) / SR
    x = t / duration
    names = cue.split(".")
    salt = seed_for(cue)
    jitter = rng.uniform(.88, 1.12)
    dry = grains(t, rng, 4100)
    mellow = grains(t, rng, 740)
    if cue.startswith("step.") or cue == "land":
        base, grit, body = {"grass":(90,2300,.31),"dirt":(110,1320,.28),"stone":(300,4800,.55),
            "wood":(181,1250,.64),"plank":(126,1380,.74),"sand":(96,2950,.15),"water":(100,3300,.18),
            "shallows":(128,3800,.27),"gravel":(141,6200,.36),"run":(82,1950,.55),"land":(73,1090,.67)}[names[-1]]
        heel = strike(t, base*jitter, [1,2.72,4.15], 17)*body
        toe = np.maximum(0, t-min(.077,duration*.34))
        y = heel + .42*grains(t,rng,grit)*(shaped(t,.004,23)+.65*shaped(toe,.014,16))
        if names[-1] in ("shallows","water"):
            y += .18*np.sin(TAU*(590*t+1900*t*t))*shaped(toe,.016,18)
    elif cue in ("gull","songbird","smallbird","crow","owl","frog","dog","chicken","rooster","horse") or names[0] == "beast":
        y = call(names[0], t, rng)
    elif "bell" in names or cue in ("chime","rite","rite.bowl","item.coins","item.coin","hit.parry","item.metal","work.chisel","hit.block"):
        base = {"bell.big":184,"bell.town":227,"bell.small":597,"bell.peal":311,"rite.bowl":244,"chime":850,
                "item.coins":1570,"item.coin":1760,"work.chisel":930,"hit.block":408,"hit.parry":1270}.get(cue,475)
        y = strike(t, base*jitter,[1,2.39,3.02,4.17],max(.75,3/duration))
        if cue == "item.coins":
            for offset in (.07,.13,.195):
                y += .52*strike(np.maximum(0,t-offset),base*rng.uniform(.8,1.2),[1,2.76,4.2],13)
    elif names[0] == "water" or cue in ("bubble","sluice"):
        y = (mellow*.6+dry*.25)*np.sin(np.pi*np.minimum(1,x*1.15))**1.35
        for offset in rng.uniform(.015,max(.017,duration*.77),max(2,round(duration*7))):
            tt = np.maximum(0,t-offset)
            y += .27*np.sin(TAU*(rng.uniform(225,910)*tt+1400*tt*tt))*shaped(tt,.005,16)
    elif names[0] in ("hero","voice","bandit") or cue in ("cricket","creak","door.open","door.close","bow_draw"):
        if cue == "cricket":
            y = np.sin(TAU*3540*jitter*t)*np.maximum(0,np.sin(TAU*31*t))**3 * (.2+.8*np.maximum(0,np.sin(TAU*3.3*t)))
        elif cue in ("creak","door.open","door.close","bow_draw"):
            p = TAU*np.cumsum((123+73*x+14*np.sin(TAU*5*t))*jitter)/SR
            y = (.17*np.sin(p)+.16*np.sin(3*p)+.26*mellow)*(.14+.86*np.maximum(0,np.sin(TAU*(11*t+4*t*t))))*np.sin(np.pi*x)
        else:
            pitch = (96 + salt%36) * jitter
            p = TAU*np.cumsum(pitch * (1.08-.28*x+.035*np.sin(TAU*6*t)))/SR
            vowel = np.sin(p)+.25*np.sin(3*p)+.14*np.sin(6*p)
            breath = .85 if "breath" in cue or "cough" in cue else .39
            y = ((1-breath)*vowel+breath*mellow)*np.sin(np.pi*x)**1.4
    elif cue in ("swing","swing.heavy","item.sword.draw","item.sword.sheathe","work.saw","work.sweep","skinning","work.quill","item.page","item.map","item.cloth","item.herb","item.eat","item.poultice"):
        pulse = 1 if "swing" in cue else max(1,round(duration*(3 if cue in ("work.saw","skinning") else 1.65)))
        slip = .10+.90*np.sin(np.pi*np.mod(x*pulse,1))**2
        y = (dry-mellow*.28)*slip*np.sin(np.pi*x)**.65
        if "sword" in cue:
            y += .18*np.sin(TAU*(780*t+470*t*t))*slip
    else:
        # Timber gates, tool heads, loose packs, bow limbs and blunt impacts have distinct modes and decay.
        base = {"arrow_flesh":78,"arrow_ground":135,"bow_release":234,"door.latch":390,"shutter.break":157,
                "wood.impact":138,"wood.lift":133,"work.hammer":348,"woodpecker":750,
                "hit.flesh":96,"hit.punch":78,"heart":49,"gate":106,"lever":242}.get(cue,115+salt%167)
        repeat = min(5,max(1,round(duration*2))) if cue in ("work.hammer","woodpecker","heart","skinning_complete") else 1
        y = np.zeros_like(t)
        for i in range(repeat):
            tt = np.maximum(0, t-i*duration/(repeat+.28))
            y += .72*strike(tt,base*jitter,[1,2.71,4.22],15 if cue!="bow_release" else 8)+.38*dry*shaped(tt,.003,23)
    return boundary(y, .004, .035)


def boundary(y, attack, release):
    y = np.asarray(y, dtype=np.float32)
    for edge, sec in ((True,attack),(False,release)):
        n = min(len(y)//2, round(sec*SR))
        if n:
            ramp = np.linspace(0,1,n,dtype=np.float32)
            if edge: y[:n] *= ramp
            else: y[-n:] *= ramp[::-1]
    return y


def ambience(cue, duration, channels):
    """Periodic Fourier noise, gusts in whole cycles and wrapped events make the loop seam continuous."""
    rng = np.random.default_rng(seed_for(cue))
    n = round(duration*SR)
    t = np.arange(n)/SR
    hz = np.fft.rfftfreq(n, 1/SR)
    water = cue in ("sea","brook","spring","marsh","surf","surf_rocks","sea_far","lap","rapids","underwater","riverbank","low_weir")
    high = {"underwater":360,"sea_far":780,"interior":520,"hall_drone":280,"fire":5100,"spring":4900,"rapids":5300,"forest_night":1440}.get(cue,3200 if water else 2100)
    def bed():
        s = (rng.normal(size=len(hz)) + 1j*rng.normal(size=len(hz))) / np.sqrt(1+hz/140)
        s *= np.exp(-hz/high)*(hz/(hz+52))
        y = np.fft.irfft(s, n)
        return y/(.0001 + np.std(y))
    common = bed()
    result = []
    for ch in range(channels):
        swell = .72 + .17*np.sin(TAU*3*t/duration+ch*.11) + .11*np.cos(TAU*5*t/duration)
        y = (.72*common+.50*bed())*swell*.11
        event = {"forest_day":"songbird","forest_night":"owl","meadow_day":"cricket","marsh":"frog",
                 "village_day":"work.hammer","village_night":"creak","mill":"wood.impact","quarry":"work.chisel",
                 "fire":"item.herb","riverbank":"water.bubbles","brook":"bubble","spring":"bubble","low_weir":"water.rock"}.get(cue)
        if event:
            density = 12 if cue in ("fire","spring","brook") else 3
            for j in range(density):
                clip = foley(event,rng.uniform(.15,1.0),seed_for(cue)+j)
                offset = (rng.integers(n) + (ch*SR//80)) % n
                np.add.at(y,(offset+np.arange(len(clip)))%n,.11*clip)
        result.append(y.astype(np.float32))
    return np.column_stack(result) if channels>1 else result[0]


def conversation(speaker, text, duration):
    """Word lengths and punctuation score a few soft, nonverbal gestures; the HUD supplies the actual dialogue."""
    rng = np.random.default_rng(seed_for(speaker+text))
    base = 110 + seed_for(speaker)%110
    words = text.split()
    y = np.zeros(round(duration*SR), dtype=np.float32)
    # Leave time to read after the initial phrase instead of chattering over the next line.
    at = .035
    for idx, word in enumerate(words[:9]):
        span = .065+min(len(word),9)*.013
        t = np.arange(round(span*SR))/SR
        pitch = base*(1 + .055*np.sin(idx*1.8))*(1+.12*np.sin(np.pi*t/span)-.08*t/span)
        phase = TAU*np.cumsum(pitch)/SR
        harmonics = .63*np.sin(phase)+.30*np.sin(2*phase)+.15*np.sin(3*phase)+.10*np.sin(5*phase)
        voice = (harmonics+.12*grains(t,rng,1550))*np.sin(np.pi*t/span)**1.7
        offset = round(SR*at)
        if offset+len(t)>len(y): break
        y[offset:offset+len(t)] += voice*.28
        at += span + (.13 if word[-1] in ",.!?;" else .028)
    return y
