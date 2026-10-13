# 从 Steam 官方 Screeps World 客户端图标的 1024 重绘母版（scripts/make-official-icon.py）生成：
#   安卓启动图标（各密度 legacy 方形/圆形 + 自适应前景/单色，背景色 #2F2F2F）、游戏内 logo、favicon、启动页 splash、icon-512
import os, glob, importlib.util
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location('moi', os.path.join(os.path.dirname(__file__), 'make-official-icon.py')); moi = importlib.util.module_from_spec(spec); spec.loader.exec_module(moi)
R = 'android-res'; BG = (47, 47, 47)
full = moi.make(True); glyph = moi.make(False); full.save('assets-art/icon-official.png')
def rs(im, n): return im.resize((n, n), Image.LANCZOS)
def masked(im, shape, rad=0.18):
    n = im.width; m = Image.new('L', (n * 4, n * 4), 0); dr = ImageDraw.Draw(m); b = (0, 0, n * 4 - 1, n * 4 - 1)
    dr.ellipse(b, fill=255) if shape == 'round' else dr.rounded_rectangle(b, radius=n * 4 * rad, fill=255)
    im = im.copy(); im.putalpha(m.resize((n, n), Image.LANCZOS)); return im
def centered(src, size, frac):
    im = Image.new('RGBA', (size, size)); d = round(size * frac); im.alpha_composite(rs(src, d), ((size - d) // 2, (size - d) // 2)); return im
D = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in D.items():
    p = f'{R}/mipmap-{d}'; os.makedirs(p, exist_ok=True); n = round(48 * k)
    masked(rs(full, n), 'square').save(f'{p}/ic_launcher.png')
    masked(rs(full, n), 'round').save(f'{p}/ic_launcher_round.png')
    # 自适应：108dp 画布，安全区为中间直径 66dp 的圆；">_" 最远点距中心 0.35 图宽 → 图宽 88dp 时字形落在安全区内
    centered(glyph, round(108 * k), 88 / 108).save(f'{p}/ic_launcher_foreground.png')
open(f'{R}/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2F2F2F</color>\n</resources>\n')
rs(full, 512).convert('RGB').save('assets-art/icon-512.png')
masked(rs(full, 256), 'square', 0.12).save('www/art/logo.png')   # 游戏内 logo：官方方形图标（小圆角）
rs(full, 64).convert('RGB').save('www/favicon.png')
for f in glob.glob(f'{R}/drawable*/splash.png'):                # 启动页：纯色底 + 居中 ">_"
    w, h = Image.open(f).size; im = Image.new('RGBA', (w, h), BG + (255,)); dd = round(min(w, h) * 0.5)
    im.alpha_composite(rs(glyph, dd), ((w - dd) // 2, (h - dd) // 2)); im.convert('RGB').save(f)
print('ok')
