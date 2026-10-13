# 从 assets-art/icon-circle.png（透明底圆形 creep，由 scripts/make-icon-master.py 生成）生成：
#   安卓启动图标（各密度 legacy 方形/圆形 + 自适应前景，背景色 #1C2533）、游戏内 logo、favicon、启动页 splash、icon-512
from PIL import Image, ImageDraw
import os, glob
R = 'android-res'; BG = (28, 37, 51)
art = Image.open('assets-art/icon-circle.png').convert('RGBA')
def compose(size, frac, bg=None):
    im = Image.new('RGBA', (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    d = round(size * frac); a = art.resize((d, d), Image.LANCZOS)
    im.alpha_composite(a, ((size - d) // 2, (size - d) // 2)); return im
def masked(im, shape):
    n = im.width; m = Image.new('L', (n * 4, n * 4), 0); dr = ImageDraw.Draw(m)
    (dr.ellipse if shape == 'round' else lambda b, fill: dr.rounded_rectangle(b, radius=n * 4 * 0.18, fill=fill))((0, 0, n * 4 - 1, n * 4 - 1), fill=255)
    im.putalpha(m.resize((n, n), Image.LANCZOS)); return im
D = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in D.items():
    p = f'{R}/mipmap-{d}'; os.makedirs(p, exist_ok=True); n = round(48 * k)
    masked(compose(n, 0.86, BG), 'square').save(f'{p}/ic_launcher.png')
    masked(compose(n, 0.92, BG), 'round').save(f'{p}/ic_launcher_round.png')
    # 自适应图标：108dp 画布，安全区是中间直径 66dp 的圆 → 圆直径 64/108，落在安全区内且尽量填满
    compose(round(108 * k), 64 / 108).save(f'{p}/ic_launcher_foreground.png')
compose(512, 0.88, BG).save('assets-art/icon-512.png')
compose(256, 1.0).save('www/art/logo.png')          # 游戏内 logo：透明底圆形
compose(64, 1.0).save('www/favicon.png')
for f in glob.glob(f'{R}/drawable*/splash.png'):     # 启动页：纯色底 + 居中图标
    w, h = Image.open(f).size; im = Image.new('RGBA', (w, h), BG + (255,)); d = round(min(w, h) * 0.42)
    a = art.resize((d, d), Image.LANCZOS); im.alpha_composite(a, ((w - d) // 2, (h - d) // 2)); im.convert('RGB').save(f)
print('ok')
