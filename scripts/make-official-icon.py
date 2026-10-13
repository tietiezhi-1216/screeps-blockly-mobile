# 按 Steam 官方 Screeps 图标（32px「< ■ >」）1:1 比例重绘高清母版：World = 白 < + 蓝 > 和蓝方块；Arena = 橙红 < + 蓝 > 和蓝方块
# 坐标单位为原图 32px 网格（像素边缘坐标），以 4 倍超采样绘制后缩小，得到清晰的矢量边缘
import sys
from PIL import Image, ImageDraw
V = {'world': dict(bg=(26, 27, 33), left=(235, 237, 252), right=(90, 112, 250)),
     'arena': dict(bg=(29, 32, 39), left=(255, 109, 88), right=(90, 111, 248))}
def L(): return [(13, 6.9), (13, 11.9), (8.9, 16), (13, 20.1), (13, 25.1), (3.9, 16)]
def make(variant='world', size=1024, bg=True, ss=4):
    c = V[variant]; S = size * ss; k = S / 32
    im = Image.new('RGBA', (S, S), c['bg'] + (255,) if bg else (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    d.polygon(P(L()), fill=c['left'] + (255,))
    d.polygon(P([(32 - x, y) for x, y in L()]), fill=c['right'] + (255,))
    d.rectangle(P([(14, 14), (18, 18)]), fill=c['right'] + (255,))
    return im.resize((size, size), Image.LANCZOS)
if __name__ == '__main__':
    make(sys.argv[1] if len(sys.argv) > 1 else 'world').save(sys.argv[2] if len(sys.argv) > 2 else 'official.png')
