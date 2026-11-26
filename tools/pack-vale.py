"""Repack the editable PNG sequences from assets/pixellab/sources.zip. Requires Pillow."""
import hashlib
import io
import json
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw
from vale_palette import prepare
from vale_poses import equipped, dash, fall, regional_coat

root = Path(__file__).resolve().parent.parent
art = root / 'assets/pixellab'
dest = root / 'public/vale'
dest.mkdir(parents=True, exist_ok=True)
width = 1024
x = y = row = 0
positions, sprites, mapping = {}, [], {}

# Retain each piece's authored feet. These cropped source cels included a square of
# garden ground or a green display wall, which travelled with the furniture indoors.
def indoor_piece(key, im):
    if key in ('furniture_bunk', 'furniture_loom', 'furniture_shelf'):
        start = {'furniture_bunk': 28, 'furniture_loom': 29, 'furniture_shelf': 0}[key]
        for py in range(start, im.height):
            for px in range(im.width):
                r, g, b, a = im.getpixel((px, py))
                if a and g >= r * 0.86 and g > b * 1.18:
                    im.putpixel((px, py), (0, 0, 0, 0))
        if key == 'furniture_shelf':
            braces = Image.new('RGBA', im.size)
            ink = ImageDraw.Draw(braces)
            for px, py in ((7, 30), (32, 22)):
                ink.polygon(((px, py), (px + 4, py - 1), (px + 1, py + 6), (px, py + 6)), fill='#5e4431')
                ink.line((px, py, px, py + 5), fill='#a17c50')
            braces.alpha_composite(im)
            return braces
    elif key in ('furniture_bookshelf', 'furniture_workbench', 'furniture_pots'):
        outlines = {
            'furniture_bookshelf': ((7,0),(38,0),(38,10),(36,12),(36,32),(26,39),(9,32),(9,10),(7,8)),
            'furniture_workbench': ((0,0),(45,0),(45,24),(41,25),(41,30),(37,32),(35,28),(33,30),(32,36),(28,37),(26,35),(26,27),(16,24),(14,22),(11,26),(8,27),(6,25),(6,18),(0,17)),
            'furniture_pots': ((4,9),(10,7),(10,5),(15,5),(19,10),(18,6),(21,5),(21,3),(26,0),(31,1),(33,5),(38,6),(37,9),(35,10),(35,13),(32,16),(29,18),(24,17),(21,15),(19,14),(18,17),(16,19),(13,21),(10,20),(8,18),(6,16),(6,12),(4,11)),
        }
        mask = Image.new('L', im.size)
        ImageDraw.Draw(mask).polygon(outlines[key], fill=255)
        clean = Image.new('RGBA', im.size)
        clean.paste(im, mask=mask)
        return clean
    elif key == 'furniture_cupboard':
        for py in range(im.height):
            for px in range(im.width):
                r, g, b, a = im.getpixel((px, py))
                if a and g > r and g > b * 1.22:
                    im.putpixel((px, py), (min(255, g + 12), int(g * 0.88), int(g * 0.71), a))
    return im

def append_cel(key, im):
    global x, y, row
    identity = (im.size, hashlib.sha256(im.tobytes()).digest())
    if identity not in positions:
        if x + im.width > width:
            x, y, row = 0, y + row + 1, 0
        positions[identity] = [x, y, im.width, im.height]
        sprites.append((x, y, im))
        x += im.width + 1
        row = max(row, im.height)
    mapping[key].append(positions[identity])

with zipfile.ZipFile(art / 'sources.zip') as library:
    sequences = json.loads(library.read('sequences.json'))
    for key, files in sorted(sequences.items()):
        mapping[key] = []
        for file in files:
            with Image.open(io.BytesIO(library.read(file))) as source:
                im = source.convert('RGBA')
            if key.startswith('furniture_'):
                im = indoor_piece(key, im)
                if key in ('furniture_bunk', 'furniture_loom', 'furniture_shelf', 'furniture_bookshelf',
                           'furniture_workbench', 'furniture_pots'):
                    bounds = im.getchannel('A').getbbox()
                    if bounds and bounds[3] < im.height:
                        grounded = Image.new('RGBA', im.size)
                        grounded.paste(im, (0, im.height - bounds[3]))
                        im = grounded
            im = prepare(key, im)
            base = key.split('--')[0]
            if base in ('wolf','boar'):
                local = 'highland_wolf' if base == 'wolf' else 'hill_boar'
                seq = key.replace(base,local,1)
                mapping.setdefault(seq,[])
                animal = regional_coat(im, base == 'wolf')
                append_cel(seq,animal)
                if key == base and len(mapping[seq]) == 1:
                    mapping[local+'--down'] = []
                    for pose in fall(animal): append_cel(local+'--down',pose)
            append_cel(key, im)
            if key == 'bandit' or key.startswith('bandit--'):
                for kind in ('skirmisher','deserter'):
                    seq = key.replace('bandit',kind,1)
                    mapping.setdefault(seq, [])
                    armed = equipped(im,kind,len(mapping[seq]))
                    append_cel(seq,armed)
                    if key == 'bandit':
                        mapping[kind+'--down'] = []
                        for pose in fall(armed): append_cel(kind+'--down',pose)
            if key in ('bandit','thornback'):
                mapping[key+'--down'] = []
                for pose in fall(im): append_cel(key+'--down',pose)
            if key.startswith('hero-') and key.endswith('--walk') and len(mapping[key]) == 3:
                seq = key.replace('--walk','--dash')
                mapping[seq] = []
                for pose in dash(im, key): append_cel(seq,pose)
    for name in library.namelist():
        if name.startswith('ui/') and not name.endswith('/'):
            file = Path(name).relative_to('ui')
            if '..' in file.parts or file.is_absolute():
                raise ValueError('Invalid interface asset path')
            (dest / file).parent.mkdir(parents=True, exist_ok=True)
            (dest / file).write_bytes(library.read(name))
atlas = Image.new('RGBA', (width, y + row))
for x, y, im in sprites:
    atlas.paste(im, (x, y))
atlas.save(dest / 'sprites.png', optimize=True)
(dest / 'sprites.json').write_text(json.dumps({'frames': mapping}, separators=(',', ':')) + '\n')
ledger = json.loads((art / 'provenance.json').read_text())
ledger['runtimeFilesSha256'] = {p.relative_to(dest).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in sorted(dest.rglob('*')) if p.is_file()}
(art / 'provenance.json').write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + '\n')
print(f'{len(mapping)} sequences, {sum(map(len, mapping.values()))} frames')
