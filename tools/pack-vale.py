"""Repack the editable PNG sequences from assets/pixellab/sources.zip. Requires Pillow."""
import hashlib
import io
import json
import zipfile
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
art = root / 'assets/pixellab'
dest = root / 'public/vale'
dest.mkdir(parents=True, exist_ok=True)
width = 1024
x = y = row = 0
positions, sprites, mapping = {}, [], {}
with zipfile.ZipFile(art / 'sources.zip') as library:
    sequences = json.loads(library.read('sequences.json'))
    for key, files in sorted(sequences.items()):
        mapping[key] = []
        for file in files:
            with Image.open(io.BytesIO(library.read(file))) as source:
                im = source.convert('RGBA')
            identity = (im.size, hashlib.sha256(im.tobytes()).digest())
            if identity not in positions:
                if x + im.width > width:
                    x, y, row = 0, y + row + 1, 0
                positions[identity] = [x, y, im.width, im.height]
                sprites.append((x, y, im))
                x += im.width + 1
                row = max(row, im.height)
            mapping[key].append(positions[identity])
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
