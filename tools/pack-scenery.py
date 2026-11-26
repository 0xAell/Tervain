"""Rebuild the independent scenery sheet from the editable original with the Vale palette."""
import json
from pathlib import Path
from PIL import Image
from vale_palette import prepare

root = Path(__file__).resolve().parent.parent
src = root / 'assets' / 'vale-scenery'
dst = root / 'public' / 'valley'
original = Image.open(src / 'scenery.png').convert('RGBA')
frames = json.loads((src / 'scenery.json').read_text())['frames']
output = Image.new('RGBA', (1024, original.height * 3))
cache = {}
x = y = row = 0
for key, sequence in frames.items():
    for n, rect in enumerate(sequence):
        source = tuple(rect)
        if source not in cache:
            sx, sy, w, h = rect
            cel = prepare(key, original.crop((sx, sy, sx+w, sy+h)))
            if x + cel.width > output.width: x, y, row = 0, y+row+1, 0
            output.paste(cel,(x,y))
            cache[source] = [x,y,cel.width,cel.height]
            x += cel.width + 1
            row = max(row,cel.height)
        sequence[n] = cache[source]
output.crop((0,0,output.width,y+row)).save(dst / 'scenery.png', optimize=True)
(dst / 'scenery.json').write_text(json.dumps({'frames':frames},separators=(',',':'))+'\n')
