# 从用户选定的原图裁出居中的圆形 creep 图标：去掉火花/暗角/阴影，换成纯色深底，输出正方形母版
# 用法：python3 scripts/make-icon-master.py <原图> <输出目录>
#   输出 final-world.png（母版，1024 方形）、final-arena.png（红色 Arena 版）、icon-circle*.png（透明圆）、预览 512/96
import sys, os, colorsys
from PIL import Image, ImageDraw
import numpy as np
SRC, OUT = sys.argv[1], sys.argv[2]
CX, CY, R = 509.5, 478.5, 383.0   # 原图里圆的实测中心/半径（外圈灰色边缘，留 3px 去掉外侧阴影）
BG = (28, 37, 51)                  # 与游戏深色底 #1C2533 一致
FILL = 0.88                        # 母版里圆的直径占画布比例
src = Image.open(SRC).convert('RGB')
def circle(img):
    S = 4; n = int(2 * R)
    crop = img.crop((round(CX - R), round(CY - R), round(CX - R) + n, round(CY - R) + n)).convert('RGBA')
    m = Image.new('L', (n * S, n * S), 0); ImageDraw.Draw(m).ellipse((0, 0, n * S - 1, n * S - 1), fill=255)
    crop.putalpha(m.resize((n, n), Image.LANCZOS)); return crop
def master(circ, size=1024, fill=FILL, bg=BG):
    im = Image.new('RGBA', (size, size), bg + (255,)); d = round(size * fill); c = circ.resize((d, d), Image.LANCZOS)
    im.alpha_composite(c, ((size - d) // 2, (size - d) // 2)); return im.convert('RGB')
def arena(img):
    a = np.asarray(img).astype(float) / 255; h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]; rr = np.hypot(xx - CX, yy - CY)
    mx, mn = a.max(2), a.min(2); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hsv = np.vectorize(colorsys.rgb_to_hsv)
    H, S, V = hsv(a[..., 0], a[..., 1], a[..., 2])
    deg = H * 360
    core = (rr < 110) & (sat > 0.25)                                  # 能量核心：黄 → 红
    blue = (deg > 190) & (deg < 250) & (sat > 0.3) & (rr > 200)        # 远程（蓝）→ 红色攻击
    H2 = H.copy(); S2 = S.copy()
    H2[core] = (358 + (deg[core] - 50) * 0.25) % 360 / 360; S2[core] = np.clip(S[core] * 1.05, 0, 1)
    H2[blue] = 357 / 360; S2[blue] = np.clip(S[blue] * 1.0, 0, 1)
    rgb = np.vectorize(colorsys.hsv_to_rgb)(H2, S2, V)
    out = np.stack(rgb, -1); return Image.fromarray((np.clip(out, 0, 1) * 255).astype('uint8'))
os.makedirs(OUT, exist_ok=True)
for name, img in (('world', src), ('arena', arena(src))):
    circ = circle(img); circ.save(f'{OUT}/icon-circle-{name}.png')
    m = master(circ); m.save(f'{OUT}/final-{name}.png')
    m.resize((512, 512), Image.LANCZOS).save(f'{OUT}/preview-{name}-512.png'); m.resize((96, 96), Image.LANCZOS).save(f'{OUT}/preview-{name}-96.png')
print('ok')
