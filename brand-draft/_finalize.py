# -*- coding: utf-8 -*-
"""统一处理：白底黑标 -> 真透明 PNG，含深/浅两色版；并修正线条稿灰边。"""
import os
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "_raw")


def key_white(path, normalize=False):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    lum = im.convert("L")
    alpha = lum.point(lambda v: 255 - v)
    if normalize:
        mx = alpha.getextrema()[1]
        if mx and mx < 255:
            alpha = alpha.point(lambda v: min(255, int(v * 255.0 / mx)))
    out = Image.new("RGBA", (w, h), (18, 18, 19, 0))
    out.putalpha(alpha)
    return out


def key_lighton_dark(path, ink=(245, 243, 239), bg_cut=120, hi=220, clear_br=(245, 135)):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    lum = im.convert("L")

    def ramp(v):
        if v <= bg_cut:
            return 0
        if v >= hi:
            return 255
        return int((v - bg_cut) * 255.0 / (hi - bg_cut))

    alpha = lum.point(ramp)
    cw, ch = clear_br
    px = alpha.load()
    for y in range(h - ch, h):
        for x in range(w - cw, w):
            px[x, y] = 0
    out = Image.new("RGBA", (w, h), ink + (0,))
    out.putalpha(alpha)
    return out


def recolor(img, rgb):
    a = img.split()[-1]
    solid = Image.new("RGBA", img.size, rgb + (0,))
    solid.putalpha(a)
    return solid


def trim_pad(img, pad=40):
    bbox = img.split()[-1].getbbox()
    if not bbox:
        return img
    c = img.crop(bbox)
    w, h = c.size
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    canvas.paste(c, (pad, pad), c)
    return canvas


def emit(base, prefix, pad=40):
    base = trim_pad(base, pad)
    recolor(base, (18, 18, 19)).save(os.path.join(BASE, prefix + "-dark.png"))
    recolor(base, (245, 243, 239)).save(os.path.join(BASE, prefix + "-light.png"))
    print("ok", prefix, base.size)


# 1) 面板球衣（深灰棋盘底）
emit(key_lighton_dark(os.path.join(RAW, "A_minimalist_premium_logo_mark_2026-10-19T09-30-43.png")), "logo-panel")
# 2) 线条球衣（白底，归一化去灰）
emit(key_white(os.path.join(RAW, "A_minimalist_premium_logo_mark_2026-10-19T09-30-41.png"), normalize=True), "logo-line")
# 3) 盾徽
emit(key_white(os.path.join(RAW, "A_premium_minimal_emblem_logo__2026-10-19T09-32-26.png")), "logo-emblem")
# 4) 球衣剪影+球徽
emit(key_white(os.path.join(RAW, "A_premium_minimal_logo_for_a_f_2026-10-19T09-32-39.png")), "logo-jersey")
print("DONE")
