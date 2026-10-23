# -*- coding: utf-8 -*-
"""把生图结果处理成真透明 PNG：去底、补水印、裁边、生成深浅两色版。"""
import os
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, "_raw")
os.makedirs(RAW, exist_ok=True)


def key_dark_on_white(path, ink=(18, 18, 19)):
    """白底黑标 -> 透明底黑标；alpha = 255 - luminance（数学上等价于黑墨覆盖率）。"""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    lum = im.convert("L")
    alpha = lum.point(lambda v: 255 - v)  # 白->0, 黑->255
    out = Image.new("RGBA", (w, h), ink + (0,))
    out.putalpha(alpha)
    return out


def key_light_on_dark(path, ink=(245, 243, 239), bg_cut=120, hi=220,
                     clear_br=(245, 135)):
    """深灰棋盘底 -> 透明底米白标；亮度阈值抠图，并清除右下角水印。"""
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
    # 清除右下角水印区域
    cw, ch = clear_br
    px = alpha.load()
    for y in range(h - ch, h):
        for x in range(w - cw, w):
            px[x, y] = 0
    out = Image.new("RGBA", (w, h), ink + (0,))
    out.putalpha(alpha)
    return out


def recolor(img, rgb):
    r, g, b, a = img.split()
    solid = Image.new("RGBA", img.size, rgb + (0,))
    solid.putalpha(a)
    return solid


def trim_pad(img, pad=40):
    a = img.split()[-1]
    bbox = a.getbbox()
    if not bbox:
        return img
    cropped = img.crop(bbox)
    w, h = cropped.size
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    canvas.paste(cropped, (pad, pad), cropped)
    return canvas


jobs = [
    # (源文件, 输出前缀, 抠图函数, 浅色墨/深色墨)
    ("A_minimalist_premium_logo_mark_2026-10-19T09-30-43.png", "logo-panel", "light", None),
    ("A_minimalist_premium_logo_mark_2026-10-19T09-30-41.png", "logo-line", "white", None),
]

for src, prefix, mode, _ in jobs:
    src_path = os.path.join(BASE, src)
    if not os.path.exists(src_path):
        print("MISSING", src)
        continue
    if mode == "light":
        base = key_light_on_dark(src_path)
    else:
        base = key_dark_on_white(src_path)
    base = trim_pad(base, 40)
    # 深色版（浅背景用）
    dark = recolor(base, (18, 18, 19))
    # 浅色版（深背景用）
    light = recolor(base, (245, 243, 239))
    p_dark = os.path.join(BASE, prefix + "-dark.png")
    p_light = os.path.join(BASE, prefix + "-light.png")
    dark.save(p_dark)
    light.save(p_light)
    print("saved", os.path.basename(p_dark), dark.size, "|", os.path.basename(p_light), light.size)
    # 原始图归档
    dst_raw = os.path.join(RAW, src)
    if os.path.abspath(src_path) != os.path.abspath(dst_raw):
        os.replace(src_path, dst_raw)
        print("  raw ->", os.path.relpath(dst_raw, BASE))

print("DONE")
