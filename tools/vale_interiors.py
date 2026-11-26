"""Original repeatable floor tiles and wall fittings for the six Rillford trades."""
from PIL import Image, ImageDraw


def floorboards(colors, rows, turn=False):
    seam, edge, face, grain, light = colors
    tile = Image.new('RGBA', (64, 64), seam)
    ink = ImageDraw.Draw(tile)
    height = 64 // rows
    for row in range(rows):
        y = row * height
        shift = (row * 19) % 32
        for x in range(shift - 64, 64, 32):
            ink.rectangle((x + 1, y + 1, x + 31, y + height - 1), fill=face)
            ink.line((x + 2, y + 1, x + 29, y + 1), fill=edge)
            mid = y + height // 2
            ink.line([(x + 4, mid + 1), (x + 9, mid + 1), (x + 12, mid),
                      (x + 18, mid), (x + 21, mid + 1)], fill=grain)
            ink.line((x + 8, mid - 1, x + 13, mid - 1), fill=light)
            ink.point((x + 3, y + 3), fill=seam)
            ink.point((x + 29, y + height - 3), fill=grain)
    return tile.transpose(Image.Transpose.ROTATE_90) if turn else tile


def pavers(colors, height, widths, drain=False):
    grout, shadow, face, stone, edge = colors
    tile = Image.new('RGBA', (64, 64), grout)
    ink = ImageDraw.Draw(tile)
    for row, y in enumerate(range(0, 64, height)):
        x = -64 + (row % 2) * 11
        n = 0
        while x < 64:
            width = widths[n % len(widths)]
            end, base = x + width - 1, y + height - 1
            ink.polygon([(x+2,y+1),(end-2,y+1),(end,y+3),(end-1,base-1),
                         (x+2,base),(x+1,base-2)], fill=stone if (n+row)%3 else face)
            ink.line((x+3,y+1,end-3,y+1), fill=edge)
            ink.line((x+3,base-1,end-2,base-1), fill=shadow)
            if (n + row) % 3 == 0:
                ink.line([(x+4,y+3),(x+7,y+3),(x+8,y+4)], fill=face)
            x += width
            n += 1
    if drain:
        ink.rectangle((28, 0, 35, 63), fill=shadow)
        ink.rectangle((30, 0, 34, 63), fill=grout)
        for y in range(0, 64, 4):
            ink.line((29, y, 34, y), fill=face)
    return tile


def wall_piece(trade):
    art = Image.new('RGBA', (32, 30))
    g = ImageDraw.Draw(art)
    iron, oak, brass = '#33383b', '#68503c', '#d0ad70'
    g.rectangle((2, 2, 29, 4), fill=oak)
    g.line((3, 2, 28, 2), fill='#b39a72')
    for x in (3, 28):
        g.point((x, 3), fill=iron)
    if trade == 'weave':
        for x, drop, base, fold in [(4,25,'#43566b','#71828a'),(12,18,'#8e584a','#be8170'),(20,23,'#59655b','#889181')]:
            g.rectangle((x, 4, x+6, drop), fill=base)
            g.line((x+1, 5, x+1, drop-1), fill=fold)
            g.line((x, drop-4, x+6, drop-4), fill=brass)
            for a in range(x, x+7, 2):
                g.line((a, drop, a, drop+2), fill=fold)
    elif trade == 'timber':
        g.line((7, 5, 9, 10), fill=brass, width=2)
        g.line((24, 5, 25, 10), fill=brass, width=2)
        g.polygon([(3,11),(26,8),(26,12),(6,22)],fill='#899497',outline=iron)
        for x in range(7, 25, 3):
            y = 21 - (x-6)//2
            g.polygon([(x,y-1),(x+2,y-2),(x,y+1)],fill='#bdc0b2')
        g.rectangle((24,7,30,13),fill=oak,outline=iron)
        g.rectangle((26,9,28,11),fill=brass)
    elif trade == 'garden' or trade == 'grain':
        leaf = trade == 'garden'
        for x, length in [(6,23),(15,18),(24,25)]:
            g.line((x, 4, x, length), fill=brass)
            for y in range(10, length+1, 3):
                colors = ('#4a674b','#91a875') if leaf else ('#9b7845','#ddbd74')
                g.polygon([(x,y),(x-4,y+1),(x-3,y+4),(x-1,y+3)],fill=colors[0])
                g.polygon([(x,y+1),(x+3,y+1),(x+4,y+3),(x+2,y+4)],fill=colors[1])
            g.line((x-2,8,x+2,8),fill='#c7ab85')
    elif trade == 'hunt':
        g.polygon([(8,6),(12,8),(16,7),(21,5),(25,9),(21,14),(22,19),(24,24),
                   (19,22),(16,27),(13,23),(7,24),(10,18),(9,13),(5,10)],fill='#815b43',outline=iron)
        g.polygon([(12,10),(16,11),(19,8),(18,15),(16,22),(14,18)],fill='#b48b63')
    else:
        for x, y, w, h in [(2,7,16,18),(15,9,14,16),(10,5,12,15)]:
            g.ellipse((x,y,x+w,y+h),outline=iron,width=3)
            g.arc((x,y,x+w,y+h),145,295,fill='#b89b72',width=1)
            g.line((x+w//2,4,x+w//2,y),fill=oak)
    return art


def stillroom_fixtures():
    # A drying trestle seen side-on, with lashed corners and cut stems tied to the rail.
    rack = Image.new('RGBA', (51, 37))
    g = ImageDraw.Draw(rack)
    outline, shadow, oak, light = '#433a36', '#624b3a', '#88684a', '#b4976b'
    for x, y in ((6,13),(33,19),(43,9)):
        g.line((x, y, x, y+16), fill=outline, width=3)
        g.line((x, y, x, y+14), fill=oak)
    g.polygon([(4,11),(17,5),(46,12),(33,20)], fill=oak, outline=outline)
    g.polygon([(6,11),(17,7),(42,13),(32,17)], fill='#a89069')
    g.line((5,12,33,19,44,14), fill=light)
    for x, y in ((8,11),(34,17)):
        g.line((x,y,x, y-9),fill=shadow,width=3)
        g.line((x-1,y-1,x-1,y-9),fill=light)
    g.line((7,2,35,9),fill=outline,width=3)
    g.line((7,1,35,8),fill=oak)
    for j, x in enumerate(range(11,32,5)):
        y = 3 + j
        g.line((x,y,x,y+7),fill='#b9ae82')
        g.polygon([(x,y+3),(x-3,y+7),(x-2,y+10),(x,y+8),(x+2,y+10),(x+3,y+7)],fill='#4e674c')
        g.line((x-1,y+8,x+1,y+5),fill='#91aa76')
    # Wicker pannier on a low three-legged worktable. Its base is also the collision anchor.
    table = Image.new('RGBA', (40, 33))
    g = ImageDraw.Draw(table)
    for x, y, h in ((5,18,9),(21,23,9),(33,17,8)):
        g.rectangle((x,y,x+2,y+h),fill=shadow)
        g.line((x,y+2,x,y+h-1),fill=light)
    g.polygon([(1,17),(17,9),(38,16),(21,25)],fill=shadow,outline=outline)
    g.polygon([(2,15),(17,8),(38,15),(21,22)],fill=oak,outline=outline)
    g.line((3,15,21,21,36,15),fill=light)
    g.polygon([(11,12),(22,7),(31,10),(28,16),(19,19),(12,16)],fill='#967446',outline=outline)
    g.line((12,13,20,16,29,12),fill='#c4a06b')
    g.line((14,15,20,17,27,14),fill='#69563e')
    for x,y in ((13,11),(17,9),(20,11),(24,9),(27,10)):
        g.line((x,y+2,x-1,y-3),fill='#647f52')
        g.line((x-1,y,x-3,y-1),fill='#abb588')
    return rack, table


def workshop_art():
    floors = {
        'weave': floorboards(('#5b5854','#a39481','#8d8377','#7b7269','#a69a88'), 4),
        'timber': floorboards(('#644a38','#bd9967','#a08054','#866647','#b59266'), 4),
        'garden': pavers(('#73786a','#848977','#979b84','#a4a58c','#b1af98'), 16, (23,19,22)),
        'hunt': floorboards(('#493e39','#90745b','#796151','#69554a','#947b62'), 8, True),
        'grain': pavers(('#776154','#966a50','#b1815f','#b78c6b','#c49c79'), 8, (16,16,16,16)),
        'cask': pavers(('#51595a','#5f6969','#758080','#6c7776','#899291'), 16, (32,32), True),
    }
    rack, table = stillroom_fixtures()
    yield 'room_herb_dryer', rack
    yield 'room_herbal_table', table
    for name, floor in floors.items():
        yield 'room_floor_' + name, floor
        yield 'room_wall_' + name, wall_piece(name)
