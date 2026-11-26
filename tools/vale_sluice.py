"""Draw Rillford's two penstock leaves and the keeper's bank-side winch at playing size."""
from math import cos, pi, sin
from PIL import Image, ImageDraw

INK, DARK, OAK, TURN, SUN = '#403730', '#57493b', '#826648', '#9e8059', '#c2a377'
IRON, STEEL, GLINT = '#454c4c', '#727d76', '#a9ae98'
STONE, EDGE, MOSS = '#736e5b', '#a19b7e', '#66735a'
WET, DEEP = '#47564e', '#384744'


def post(g, x, y, height):
    # Anchors are the west abutment, central pier and east abutment, in screen-depth order.
    g.polygon([(x-5,y-2),(x,y-4),(x+6,y-1),(x+1,y+3),(x-5,y+1)], fill=DARK, outline=INK)
    g.polygon([(x-5,y-3),(x,y-5),(x+6,y-2),(x+1,y+1)], fill=STONE)
    g.line((x-4,y-3,x,y-5,x+4,y-3),fill=EDGE)
    g.line((x,y-2,x+3,y-2), fill=MOSS)
    top = y-height
    g.polygon([(x-3,top),(x,top-2),(x+3,top),(x+3,y-4),(x,y-2),(x-3,y-3)],fill=DARK,outline=INK)
    g.polygon([(x-2,top+1),(x,top+2),(x,y-3),(x-2,y-4)],fill=TURN)
    g.line((x+1,top+2,x+1,y-6),fill=OAK)
    g.polygon([(x-3,top),(x,top-2),(x+3,top),(x,top+1)],fill=SUN)
    for h in (5,height-7):
        g.line((x-2,top+h,x+1,top+h+1,x+3,top+h),fill=IRON,width=2)
        g.point((x-1,top+h),fill=GLINT)


def leaf(g, x0, x1, lift, broken=False):
    def sill(x): return 32 + round((x-10)*0.38)
    def level(x,k): return sill(x) - lift - k
    g.polygon([(x0,level(x0,19)),(x1,level(x1,19)),(x1,level(x1,0)),(x0,level(x0,0))], fill=INK)
    for band, material in enumerate((WET,OAK,TURN,OAK)):
        y=1+band*4
        g.polygon([(x0+1,level(x0,y+3)),(x1-1,level(x1,y+3)),(x1-1,level(x1,y)),(x0+1,level(x0,y))], fill=material)
        g.line((x0+2,level(x0,y+3),x1-2,level(x1,y+3)),fill=STEEL if band==0 else TURN)
        g.line((x0+5+band,level(x0+5+band,y+1),x0+9+band,level(x0+9+band,y+1)),fill=DARK)
    for x in (x0+3,x1-4):
        g.line((x,level(x,17),x,level(x,2)),fill=IRON,width=2)
        for h in (4,15): g.point((x-1,level(x,h)),fill=GLINT)
    if broken:
        x=x0+11
        g.line((x-3,level(x,18),x,level(x,13),x-2,level(x,10),x+1,level(x,6),x,level(x,0)),fill=INK,width=2)
        g.line((x-1,level(x,11),x+1,level(x,8)),fill=SUN)
    # Chain sections disappear behind the leaf as it lifts.
    c=(x0+x1)//2
    for y in range(sill(c)-32,level(c,19),3):
        g.rectangle((c-1,y,c+1,y+1),fill=IRON)
        g.point((c-1,y),fill=GLINT)


def gate(state, notch=6):
    im=Image.new('RGBA',(73,57))
    g=ImageDraw.Draw(im)
    west=3+max(0,6-notch)*1.5-max(0,notch-6)*0.5
    east=3+max(0,notch-6)*1.5-max(0,6-notch)*0.5
    if state in ('damaged','jammed'): west,east=(0,5) if state=='damaged' else (0,0)
    # Water visible between these leaves is the actual river drawn behind the structure.
    leaf(g,12,36,round(west),state in ('damaged','jammed'))
    leaf(g,36,61,round(east))
    for x,y,h in ((10,33,29),(36,43,31),(62,53,29)): post(g,x,y,h)
    g.polygon([(6,4),(10,1),(66,22),(66,26),(62,28),(6,8)],fill=DARK,outline=INK)
    g.polygon([(7,4),(10,2),(65,23),(61,25)],fill=TURN)
    g.line((8,4,60,24),fill=SUN)
    for x in (12,37,61):
        y=5+round((x-10)*0.38)
        g.line((x,y-2,x,y+3),fill=IRON,width=3)
        g.point((x,y-1),fill=GLINT)
    if state=='jammed':
        g.line((17,26,49,42),fill=INK,width=5)
        g.line((17,25,49,41),fill=TURN,width=3)
        g.line((25,30,24,24),fill=DARK,width=2)
    elif state!='damaged':
        # Forged fishplate installed with the quarry brace; its bolts stay above the splash line.
        g.line((22,14,51,25),fill=IRON,width=4)
        g.line((22,13,51,24),fill=STEEL,width=2)
        for x in (23,35,49): g.point((x,13+round((x-22)*0.38)),fill=GLINT)
    return im


def wheel(state, notch=6):
    im=Image.new('RGBA',(29,32));g=ImageDraw.Draw(im)
    g.polygon([(1,27),(12,22),(27,26),(17,31),(2,29)],fill=DARK,outline=INK)
    g.polygon([(2,26),(12,22),(26,26),(16,29)],fill=STONE)
    g.line((3,26,12,22,23,25),fill=EDGE)
    g.polygon([(4,12),(8,10),(11,12),(11,25),(7,27),(4,25)],fill=OAK,outline=INK)
    g.line((6,13,6,24),fill=TURN)
    g.polygon([(18,9),(21,7),(24,9),(24,24),(21,26),(18,24)],fill=DARK,outline=INK)
    g.line((20,10,20,23),fill=TURN)
    g.line((7,12,21,8),fill=IRON,width=4);g.line((7,11,21,7),fill=STEEL)
    # A bronze handwheel stands upright on the near cheek of the winch.
    cx,cy,rx,ry=10,13,8,10
    g.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),outline=INK,width=3)
    g.ellipse((cx-rx+1,cy-ry+1,cx+rx-1,cy+ry-1),outline='#bc9d64')
    angle=(notch-6)*pi/13+(0.30 if state=='jammed' else 0)
    for i in range(5):
        a=angle+i*2*pi/5; ex=cx+round((rx-2)*cos(a));ey=cy+round((ry-2)*sin(a))
        g.line((cx,cy,ex,ey),fill='#8c754f',width=2)
        g.point((ex,ey-1),fill='#d6bd84')
    g.ellipse((cx-2,cy-2,cx+2,cy+2),fill=IRON,outline=INK);g.point((cx,cy-1),fill=GLINT)
    if state=='jammed': g.line((5,7,18,22),fill=DARK,width=2)
    if state=='rota':
        # The keeper hangs a reversible shift tablet beside the winding drum.
        g.line((21,5,23,3,26,6),fill=INK)
        g.rectangle((20,6,28,15),fill=INK)
        g.rectangle((21,7,27,14),fill='#a08c69')
        if notch < 6:
            g.line((22,11,26,11),fill='#e1cd8c');g.line((24,9,24,13),fill='#e1cd8c')
        else:
            g.ellipse((22,8,26,13),fill='#e6dbc0');g.ellipse((24,7,27,11),fill='#a08c69')
    return im


def gauge(level):
    im=Image.new('RGBA',(15,32));g=ImageDraw.Draw(im)
    g.polygon([(1,28),(7,25),(14,27),(10,31),(2,30)],fill=WET,outline=DEEP)
    g.polygon([(4,3),(9,1),(11,3),(11,27),(7,29),(4,27)],fill=DARK,outline=INK)
    g.polygon([(5,4),(8,3),(8,27),(5,26)],fill=TURN)
    g.line((6,5,6,26),fill=SUN)
    for i in range(5):
        y=7+i*4
        g.line((7,y,10 if i%2==0 else 9,y-1),fill=IRON)
    y=25-round(level*1.7)
    g.line((5,y+1,9,y+2,11,y+1),fill=DEEP,width=2)
    g.polygon([(3,y),(6,y-2),(12,y-1),(13,y+1),(9,y+3),(3,y+2)],fill='#968053',outline=INK)
    g.line((4,y,7,y-1,11,y),fill='#dabe80')
    return im


def sluice_art():
    yield 'mill_gauge',[gauge(level) for level in range(11)]
    for base,draw in (('sluice',gate),('sluice_winch',wheel)):
        for state,suffix in (('damaged',''),('jammed','--jammed'),('set','--set'),('rota','--rota')):
            yield base+suffix,[draw(state,n) for n in (range(13) if state in ('set','rota') else (6,))]
