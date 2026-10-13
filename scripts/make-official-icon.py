# 按 Steam 官方 Screeps World 客户端图标（32px，灰色 ">_" 终端提示符 + 深灰方底）1:1 比例重绘 1024 高清母版
import sys
from PIL import Image, ImageDraw, ImageFilter
S = 1024; k = S / 32
def poly(pts): return [(x * k, y * k) for x, y in pts]
def glyph():
    m = Image.new('L', (S, S), 0); d = ImageDraw.Draw(m)
    d.polygon(poly([(6.2, 11.5), (9.8, 11.5), (14.0, 16.6), (9.7, 21.8), (6.0, 21.8), (10.3, 16.6)]), fill=255)
    d.rectangle(poly([(16.2, 19.0), (25.8, 21.75)]), fill=255); return m
def make(bg=True):
    g = glyph(); im = Image.new('RGBA', (S, S))
    if bg:
        top, bot = (52, 52, 52), (42, 42, 42)
        for y in range(S):
            t = y / (S - 1); c = tuple(round(a + (b - a) * t) for a, b in zip(top, bot)); im.paste(c + (255,), (0, y, S, y + 1))
    r = round(3.8 * k)
    base = g.filter(ImageFilter.GaussianBlur(r * 0.55)).point(lambda v: 255 if v > 8 else 0).filter(ImageFilter.GaussianBlur(k * 0.6))
    soft = g.filter(ImageFilter.GaussianBlur(r * 0.9)).point(lambda v: min(255, v * 2))
    im.alpha_composite(Image.merge('RGBA', (*[Image.new('L', (S, S), 44)] * 3, soft.point(lambda v: v * 120 // 255))))
    im.alpha_composite(Image.merge('RGBA', (*[Image.new('L', (S, S), 38)] * 3, base)))
    im.alpha_composite(Image.merge('RGBA', (*[Image.new('L', (S, S), 149)] * 3, g.filter(ImageFilter.GaussianBlur(k * 0.12)))))
    return im
if __name__ == '__main__':
    im = make(); im.save(sys.argv[1] if len(sys.argv) > 1 else 'official-world.png')
