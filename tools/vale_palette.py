"""Shared palette, selective outlines and logical dimensions for Tervain's two sprite sheets."""
from PIL import Image, ImageFilter
from functools import lru_cache

WIDTHS = dict(cat=16, dog=23, wolf=29, boar=32, deer=39, bear=48, mount=39, bandit=34,
              thornback=50, shore_apple=7, field_caps=10, iron_scrap=9, field_herbs=16,
              bread=14, sluice_brace=14, gate_wrench=14, arrow=14, hunting_bow=14,
              skinning_knife=14, coin=14, rusted_sword=24, healing_herb=14, field_mushroom=10)
PEOPLE = set('ash_recorder caravan_master estate_steward maintenance_worker mill_hand quarry_foreman quarry_hand rillford_reeve shrine_warden spring_steward trail_hunter village_baker'.split())
TREES = set('pine fir oak birch rill_willow rill_alder brush'.split())

@lru_cache(maxsize=65536)
def tone(r, g, b):
    if max(r, g, b) < 39:
        return (31 + r // 4, 33 + g // 5, 40 + b // 7)
    y = (r * 3 + g * 6 + b) / 10
    chroma = .80 if g > 1.3 * b and g > r or r > 1.6 * g else .90
    return tuple(max(0, min(255, round((y + (c - y) * chroma) / 4) * 4 + k))
                 for c, k in zip((r, g, b), (2, 1, 0)))

def prepare(key, image):
    name = key.split('--')[0]
    # A bow, tool or outstretched arm has a 72-pixel source frame around the same 48-pixel body.
    # Preserve that padding when converting the art to the 38-pixel traveller.
    width = round(image.width * 38 / 48) if name.startswith('hero-') else 33 if name in PEOPLE else WIDTHS.get(name)
    if width and image.width != width:
        image = image.resize((width, max(1, round(width * image.height / image.width))), Image.Resampling.NEAREST)
    image = image.convert('RGBA')
    out = []
    matte = image.getchannel('A').point(lambda a: 255 if a >= 104 else 0)
    inside = matte.filter(ImageFilter.MinFilter(3))
    size = image.width
    for i, (r, g, b, a) in enumerate(image.getdata()):
        if a < 104:
            out.append((0, 0, 0, 0)); continue
        rgb = tone(r, g, b)
        if name == 'birch' and min(rgb) > 140:
            rgb = tuple((c * 3 + k) // 4 for c, k in zip(rgb, (141,148,129)))
        x, y = i % size, i // size
        if (name in TREES or name in PEOPLE or name.startswith('furniture')) and not inside.getpixel((x, y)) and y > image.height // 3:
            rgb = tuple((c * 3 + k) // 4 for c, k in zip(rgb, (38,42,44)))
        out.append((*rgb,255))
    image.putdata(out)
    return image
