"""Pixel accessories and held, airborne and grounded poses from the shared native cels."""
from PIL import Image, ImageDraw

def equipped(cel, kind, frame):
    result = cel.copy()
    g = ImageDraw.Draw(result)
    # Both figures are drawn facing right. The renderer mirrors the entire armed silhouette.
    y = (frame % 3) // 2
    if kind == 'deserter':
        points = [(21,15+y),(26,13+y),(30,16+y),(29,24+y),(25,29+y),(20,24+y)]
        g.polygon(points,fill='#414c50',outline='#302f31')
        g.line([(21,16+y),(26,15+y),(29,17+y)],fill='#d1b380',width=2)
        g.line([(25,17+y),(24,26+y)],fill='#9d916d',width=2)
        g.rectangle((23,19+y,26,22+y),fill='#656e69')
        g.point((24,20+y),fill='#ead7a6')
    else:
        g.line([(25,10+y),(29,14+y),(30,20+y),(28,26+y),(24,29+y)],fill='#382f2d',width=2)
        g.line([(26,11+y),(29,16+y),(29,21+y),(27,26+y)],fill='#d1ac77')
        g.line([(25,10+y),(24,29+y)],fill='#b6b29a')
        g.line([(12,19+y),(17,11+y)],fill='#675241',width=3)
        g.line([(13,15+y),(16,10+y)],fill='#d3c4a0')
        g.line([(11,10+y),(18,9+y),(22,13+y)],fill='#688077',width=2)
    return result

def dash(source, direction):
    w,h = source.size
    for phase in range(4):
        out = Image.new('RGBA',(w,h))
        body = source.resize((w,round(h*(.76 + phase*.045))),Image.Resampling.NEAREST)
        sign = -1 if 'west' in direction else 1 if 'east' in direction else 0
        for y in range(body.height):
            lean = round(sign * (1-y/body.height)*(5-phase))
            out.paste(body.crop((0,y,w,y+1)),(lean,h-body.height+y))
        yield out

def fall(source):
    w,h = source.size
    for angle, width, height in [(12,.94,.89),(36,.99,.72),(68,.96,.48),(85,.94,.36),(83,.9,.32)]:
        out = Image.new('RGBA',(w,h))
        rotated = source.rotate(-angle,Image.Resampling.NEAREST,expand=True)
        bounds = rotated.getbbox()
        if bounds:
            body = rotated.crop(bounds).resize((round(w*width),round(h*height)),Image.Resampling.NEAREST)
            out.alpha_composite(body,((w-body.width)//2,h-body.height))
        yield out

def regional_coat(cel, wolf):
    # The mane grows from the animated shoulder line so the idle and stride share their silhouette.
    size = 32 if wolf else 35
    out = cel.resize((size, round(cel.height * size / cel.width)), Image.Resampling.NEAREST)
    bounds = out.getbbox()
    if not bounds:
        return out
    x0,y0,x1,y1 = bounds
    w,h = x1-x0,y1-y0
    ink = ImageDraw.Draw(out)
    for y in range(y0,y1):
        for x in range(x0,x1):
            r,g,b,a = out.getpixel((x,y))
            if a:
                light=(3*r+6*g+b)//10
                if wolf:
                    color=(min(232,light+13),min(230,light+19),min(218,light+20))
                    if y<y0+h*.45 and x>x0+w*.32: color=tuple(min(244,c+18) for c in color)
                else:
                    color=(min(206,round(light*.85+18)),min(179,round(light*.75+15)),min(151,round(light*.6+18)))
                ink.point((x,y),fill=color+(255,))
    ruff=range(round(x0+w*.25),round(x0+w*.58)) if wolf else range(round(x0+w*.35),round(x0+w*.75))
    for x in ruff:
        surface=next((y for y in range(y0,y1) if out.getpixel((x,y))[3]),None)
        if surface is None: continue
        height=1+((x-x0)%3==0)
        ink.line((x,surface-height,x,surface+1),fill='#839496' if wolf else '#463735')
        if (x-x0)%3==0: ink.point((x,surface-height),fill='#c5c3ad' if wolf else '#977350')
    if not wolf:
        nose=x1-2
        mouth=max((y for y in range(y0,y1) if out.getpixel((nose,y))[3]),default=y0+h//2)
        ink.line([(nose-2,mouth+1),(nose,mouth),(nose+1,mouth-2)],fill='#dcc99e')
    return out
