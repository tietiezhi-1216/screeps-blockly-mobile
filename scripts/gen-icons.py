# 从 assets-art/icon.png 生成安卓启动图标（legacy/round/adaptive 前景）
from PIL import Image, ImageDraw, ImageChops
import os
R='android-res'; BG=(28,37,51)
src=Image.open('assets-art/icon.png').convert('RGB').crop((24,24,1000,1000))
diff=ImageChops.difference(src,Image.new('RGB',src.size,BG)).convert('L').point(lambda v:255 if v>60 else 0)
fg=src.copy(); fg.putalpha(diff); bbox=diff.point(lambda v:255 if v>128 else 0).getbbox()
art=fg.crop(bbox)
def compose(size,frac,bg=None):
    im=Image.new('RGBA',(size,size),bg+(255,) if bg else (0,0,0,0))
    s=size*frac/max(art.size); a=art.resize((max(1,round(art.width*s)),max(1,round(art.height*s))),Image.LANCZOS)
    im.alpha_composite(a,((size-a.width)//2,(size-a.height)//2)); return im
D={'mdpi':1,'hdpi':1.5,'xhdpi':2,'xxhdpi':3,'xxxhdpi':4}
for d,k in D.items():
    p=f'{R}/mipmap-{d}'; os.makedirs(p,exist_ok=True)
    n=round(48*k); sq=compose(n,0.72,BG)
    m=Image.new('L',(n*4,n*4),0); ImageDraw.Draw(m).rounded_rectangle((0,0,n*4-1,n*4-1),radius=n*4*0.18,fill=255)
    sq.putalpha(m.resize((n,n),Image.LANCZOS)); sq.save(f'{p}/ic_launcher.png')
    rd=compose(n,0.66,BG); m=Image.new('L',(n*4,n*4),0); ImageDraw.Draw(m).ellipse((0,0,n*4-1,n*4-1),fill=255)
    rd.putalpha(m.resize((n,n),Image.LANCZOS)); rd.save(f'{p}/ic_launcher_round.png')
    compose(round(108*k),0.56).save(f'{p}/ic_launcher_foreground.png')
compose(512,0.72,BG).save('assets-art/icon-512.png')
