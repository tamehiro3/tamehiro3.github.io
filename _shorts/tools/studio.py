"""「スタジオ」スタイル用の部品（夜の配信スタジオ風の背景、手前のマイク、明朝体のテロップ、見出しの帯）。

ゴールイメージ（全画面のキャラ＋必要なときだけ浮かぶカード＋胸元の明朝テロップ）に合わせた見た目。
背景は画像生成を使わず、図形とぼかしで描く（毎回同じ絵になる）。
"""
import math
import random
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1080, 1920
F_SERIF = str(ROOT / "assets" / "fonts" / "ZenOldMincho-Black.ttf")


def _grad(top, mid, bot):
    y = np.linspace(0, 1, H)[:, None]
    t, m, b = (np.array(c, float) for c in (top, mid, bot))
    col = np.where(y < 0.55, t + (m - t) * (y / 0.55), m + (b - m) * ((y - 0.55) / 0.45))
    arr = np.repeat(col[:, None, :], W, axis=1).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


@lru_cache(None)
def background():
    rng = random.Random(3)
    bg = _grad((92, 62, 150), (58, 70, 150), (20, 26, 58))
    far = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(far)
    # 奥の窓（夜の街の青い光）
    for x0 in (560, 760):
        d.rectangle((x0, 380, x0 + 170, 1100), fill=(70, 110, 190, 150))
        for k in range(6):
            d.rectangle((x0, 380 + k * 120, x0 + 170, 386 + k * 120), fill=(30, 40, 90, 200))
    # 棚と小物
    for (x0, y0) in ((40, 820), (40, 1060), (840, 1250)):
        d.rectangle((x0, y0, x0 + 220, y0 + 14), fill=(40, 30, 60, 230))
        for k in range(4):
            h = rng.randint(40, 90)
            d.rectangle((x0 + 20 + k * 50, y0 - h, x0 + 50 + k * 50, y0), fill=(60 + rng.randint(0, 40), 50, 90, 220))
    far = far.filter(ImageFilter.GaussianBlur(10))
    bg.alpha_composite(far)
    # 天井のスポットライトと暖色のボケ
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for x in (180, 470, 760, 1000):
        g.ellipse((x - 14, 40, x + 14, 68), fill=(255, 220, 170, 255))
        g.polygon([(x - 20, 60), (x + 20, 60), (x + 150, 700), (x - 150, 700)], fill=(255, 200, 150, 16))
    for _ in range(26):
        x, y, r = rng.randint(0, W), rng.randint(250, 1500), rng.randint(14, 46)
        warm = rng.random() < 0.6
        g.ellipse((x - r, y - r, x + r, y + r), fill=(255, 180, 110, 70) if warm else (140, 170, 255, 60))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(14)))
    # 両端の観葉植物（手前なので大きくぼかす）。葉はなめらかな楕円を回転させて重ねる
    plant = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for side in (0, 1):
        stem_x = -20 if side == 0 else W + 20
        for _ in range(22):
            L, Wd = rng.randint(170, 280), rng.randint(60, 105)
            leaf = Image.new("RGBA", (L, Wd), (0, 0, 0, 0))
            ld = ImageDraw.Draw(leaf)
            shade = rng.randint(0, 25)
            ld.ellipse((0, 0, L - 1, Wd - 1), fill=(24 + shade, 70 + shade, 64 + shade, 235))
            ld.line([(8, Wd // 2), (L - 10, Wd // 2)], fill=(14, 40, 38, 200), width=4)
            ang = rng.uniform(-60, 60) + (0 if side == 0 else 180)
            leaf = leaf.rotate(ang, expand=True, resample=Image.BICUBIC)
            cy = rng.randint(560, 1560)
            cx = stem_x + (rng.randint(20, 190) if side == 0 else -rng.randint(20, 190))
            plant.alpha_composite(leaf, (int(cx - leaf.width / 2), int(cy - leaf.height / 2)))
    bg.alpha_composite(plant.filter(ImageFilter.GaussianBlur(9)))
    # 周辺減光
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse((-300, -200, W + 300, H + 200), fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(160))
    dark = Image.new("RGBA", (W, H), (8, 8, 24, 255))
    dark.putalpha(vig.point(lambda v: int((255 - v) * 0.75)))
    bg.alpha_composite(dark)
    return bg


@lru_cache(None)
def mic(parts_dir: str, height=640):
    im = Image.open(Path(parts_dir) / "mic.png").convert("RGBA")
    s = height / im.height
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS).rotate(-8, expand=True, resample=Image.BICUBIC)
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(12)).point(lambda v: int(v * 0.5)))
    out = Image.new("RGBA", (im.width + 30, im.height + 30), (0, 0, 0, 0))
    out.alpha_composite(sh, (24, 24))
    out.alpha_composite(im, (0, 0))
    return out


@lru_cache(None)
def serif(size):
    return ImageFont.truetype(F_SERIF, size)


def _glow(layer, spread=9, blur=11, opacity=0.9, color=(10, 10, 30)):
    a = layer.getchannel("A").filter(ImageFilter.MaxFilter(spread)).filter(ImageFilter.GaussianBlur(blur))
    sh = Image.new("RGBA", layer.size, color + (0,))
    sh.putalpha(a.point(lambda v: int(min(255, v * opacity * 1.3))))
    out = sh
    out.alpha_composite(layer)
    return out


@lru_cache(maxsize=512)
def telop(chunk, size=92, emph=1.32, maxw=800):
    """胸元に出す明朝体の白テロップ。【】は色を変えず大きさだけで強調。\\n で改行"""
    import render as R  # 分割ロジックは共通
    lines = chunk.split("\n")
    width = lambda t: sum(serif(int(size * (emph if em else 1))).getlength(s) for s, em in R.parse_emph(t))
    if len(lines) == 1 and width(chunk) > maxw * 1.1:
        lines = R.split_two(chunk)
    imgs = []
    for ln in lines:
        segs = R.parse_emph(ln)
        big = any(em for _, em in segs)
        asc = serif(int(size * (emph if big else 1))).getmetrics()[0]
        w = int(width(ln)) + 60
        h = int(asc * 1.25) + 40
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        x = 30
        for s, em in segs:
            f = serif(int(size * (emph if em else 1)))
            d.text((x, 20 + asc), s, font=f, anchor="ls", fill=(255, 255, 255), stroke_width=3, stroke_fill=(24, 22, 48))
            x += f.getlength(s)
        imgs.append(im)
    w = max(i.width for i in imgs)
    h = sum(i.height for i in imgs) - 36 * (len(imgs) - 1)
    block = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    y = 20
    for im in imgs:
        block.alpha_composite(im, ((block.width - im.width) // 2, y))
        y += im.height - 36
    out = _glow(block)
    s = 1.0
    if out.width > maxw + 80:
        s = (maxw + 80) / out.width
        out = out.resize((int(out.width * s), int(out.height * s)), Image.LANCZOS)
    out.info["scale"] = round(s, 2)   # 実際に縮めた倍率（点検で使う）
    return out


@lru_cache(None)
def heading_bar(text, width=900):
    f = serif(62)
    h = 118
    bar = Image.new("RGBA", (width, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(bar)
    d.rectangle((0, 0, width, h), fill=(18, 22, 44, 215))
    d.line([(0, 3), (width, 3)], fill=(255, 255, 255, 60), width=2)
    d.text((width / 2, h / 2 + 4), text, font=f, fill=(255, 255, 255), anchor="mm")
    return bar


@lru_cache(None)
def sticker(ch, size=220, ring=False):
    import render as R
    em = R.emoji(ch, size)
    if not ring:
        sh = Image.new("RGBA", (em.width + 40, em.height + 40), (0, 0, 0, 0))
        a = Image.new("L", sh.size, 0)
        a.paste(em.getchannel("A"), (20, 28))
        s2 = Image.new("RGBA", sh.size, (0, 0, 20, 0))
        s2.putalpha(a.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * 0.45)))
        s2.alpha_composite(em, (20, 20))
        return s2
    d = int(size * 1.25)
    out = Image.new("RGBA", (d + 20, d + 20), (0, 0, 0, 0))
    ImageDraw.Draw(out).ellipse((10, 10, d + 10, d + 10), fill=(255, 255, 255, 245))
    out.alpha_composite(em, ((out.width - em.width) // 2, (out.height - em.height) // 2))
    return out


@lru_cache(None)
def card_base(w, h):
    card = Image.new("RGBA", (w + 60, h + 60), (0, 0, 0, 0))
    sh = Image.new("L", card.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((30, 42, w + 30, h + 42), 34, fill=150)
    shadow = Image.new("RGBA", card.size, (0, 0, 20, 0))
    shadow.putalpha(sh.filter(ImageFilter.GaussianBlur(16)))
    card.alpha_composite(shadow)
    ImageDraw.Draw(card).rounded_rectangle((30, 30, w + 30, h + 30), 34, fill=(255, 255, 255, 250))
    return card
