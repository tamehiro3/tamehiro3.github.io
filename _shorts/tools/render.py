"""台本 + 1文ごとの音声 + キャラ素材 から 1080x1920 / 30fps のショート動画を組み立てる。

  python3 tools/render.py episodes/ep01               # 書き出し（out/ep01.mp4）
  python3 tools/render.py episodes/ep01 --stills 0 3.5 # 指定秒のコマだけ PNG で確認

画面構成（TikTok / リール / ショートの UI に隠れない範囲を基準）
  上   : 図解・画面パネル（y 150-890）
  中   : テロップ（中心 y 1010）
  下   : キャラクター（顔は y 1100-1450 に来るように配置）
"""
import argparse
import json
import math
import re
import subprocess
import tempfile
from functools import lru_cache
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / "build" / "parts"
SFX = ROOT / "build" / "sfx"
W, H, FPS, SR = 1080, 1920, 30, 48000

F_TELOP = str(ROOT / "assets" / "fonts" / "MPLUSRounded1c-Black.ttf")
F_BLACK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
F_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
F_EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"

NAVY = (20, 26, 58)
INK = (34, 40, 72)
SKY = (206, 238, 250)
SKY2 = (158, 216, 238)
YELLOW = (255, 223, 58)
RED = (255, 84, 64)
BLUE = (47, 128, 237)
GREEN = (38, 176, 110)
GRAY = (120, 128, 150)

PANEL = (40, 150, 1040, 890)
HEAD_H = 100
CONTENT = (62, 262, 1018, 872)            # 956 x 610
CW, CH = CONTENT[2] - CONTENT[0], CONTENT[3] - CONTENT[1]
TELOP_CX, TELOP_CY, TELOP_MAXW = 507, 1010, 840
TELOP_IMG_MAXW = 896                      # 縁取り・影こみの最大幅（x 59〜955 に収める）
SAFE = (50, 150, 965, 1440)               # テロップ・見出しはこの中に収める

LEAD, GAP, SECTION_GAP, TAIL = 0.12, 0.10, 0.28, 0.20


# ======================================================================
# 共通の描画ヘルパ
# ======================================================================
@lru_cache(None)
def font(path, size):
    return ImageFont.truetype(path, size, index=0)


@lru_cache(None)
def emoji(ch, size):
    f = ImageFont.truetype(F_EMOJI, 109)
    im = Image.new("RGBA", (160, 140), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4, 4), ch, font=f, embedded_color=True)
    im = im.crop(im.getbbox())
    s = size / max(im.size)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def ease_out_back(x):
    x = min(max(x, 0.0), 1.0)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def scaled(im, s):
    if abs(s - 1) < 1e-3:
        return im
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.BICUBIC)


def with_alpha(im, a):
    if a >= 0.999:
        return im
    im = im.copy()
    im.putalpha(im.getchannel("A").point(lambda v: int(v * max(a, 0))))
    return im


def paste_center(dst, im, cx, cy):
    dst.alpha_composite(im, (int(round(cx - im.width / 2)), int(round(cy - im.height / 2))))


def rounded(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)


def parse_emph(s):
    out = []
    for p in re.split(r"(【[^】]*】)", s):
        if p:
            out.append((p[1:-1], True) if p.startswith("【") else (p, False))
    return out


def shadowed(layer, offset=(0, 10), blur=7, color=(0, 0, 25), opacity=0.8, pad=0):
    """濃い影つきの RGBA を返す（layer は RGBA）"""
    a = layer.getchannel("A").filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * opacity))
    sh = Image.new("RGBA", layer.size, color + (0,))
    sh.putalpha(a)
    out = Image.new("RGBA", (layer.width + abs(offset[0]), layer.height + abs(offset[1])), (0, 0, 0, 0))
    out.alpha_composite(sh, (max(offset[0], 0), max(offset[1], 0)))
    out.alpha_composite(layer, (max(-offset[0], 0), max(-offset[1], 0)))
    return out


def rich_text(draw_to, xy, text, size, color, emph_color, fontpath=F_BOLD, emph_scale=1.0):
    """【】を強調色で描く（1行）。幅を返す"""
    x, y = xy
    for seg, em in parse_emph(text):
        f = font(fontpath, int(size * (emph_scale if em else 1)))
        draw_to.text((x, y), seg, font=f, fill=emph_color if em else color, anchor="ls")
        x += f.getlength(seg)
    return x - xy[0]


def rich_width(text, size, fontpath=F_BOLD, emph_scale=1.0):
    return sum(font(fontpath, int(size * (emph_scale if em else 1))).getlength(seg) for seg, em in parse_emph(text))


# ======================================================================
# テロップ
# ======================================================================
TELOP_SIZE, TELOP_EMPH = 88, 1.3
BREAK_AFTER = set("はがをにでとものへやかね、。！？!?」）…")


_TAGGER = None


def tagger():
    """MeCab（IPA辞書）。入っていなければ None（文字ベースの改行にフォールバック）"""
    global _TAGGER
    if _TAGGER is None:
        try:
            import fugashi
            _TAGGER = fugashi.GenericTagger("-r /etc/mecabrc -d /var/lib/mecab/dic/ipadic-utf8")
        except Exception:
            _TAGGER = False
    return _TAGGER or None


INDEP = {"名詞", "動詞", "形容詞", "副詞", "連体詞", "接続詞", "感動詞", "接頭詞"}


def bunsetsu_breaks(plain_text):
    """文節の頭になれる位置（plain_text の文字位置）と、そこが助詞・読点の直後かどうか"""
    tg = tagger()
    if not tg:
        return None
    out, pos, prev = {}, 0, None
    for w in tg(plain_text):
        f0, f1 = w.feature[0], w.feature[1]
        starts = (f0 in INDEP and f1 not in ("接尾", "非自立")) or (f0 == "記号" and f1 == "括弧開")
        if prev is not None and starts:
            p0, p1 = prev.feature[0], prev.feature[1]
            joined = (p0 == "名詞" and f0 == "名詞") or p0 == "接頭詞" or (p0 == "記号" and p1 == "括弧開")
            if not joined:
                out[pos] = p0 in ("助詞", "助動詞") or (p0 == "記号" and p1 in ("読点", "句点", "括弧閉"))
        pos += len(w.surface)
        prev = w
    return out


def split_two(text):
    """強調や単語を割らずに、文節の切れ目で左右の幅が近くなる位置で2行に分ける"""
    plain_idx = [i for i, ch in enumerate(text) if ch not in "【】"]
    plain_text = "".join(text[i] for i in plain_idx)
    br = bunsetsu_breaks(plain_text)
    cands = []
    if br is not None:
        for p, good in br.items():
            i = plain_idx[p]
            while i > 0 and text[i - 1] == "【":
                i -= 1
            cands.append((i, good))
    else:
        depth = 0
        for i, ch in enumerate(text):
            depth += (ch == "【") - (ch == "】")
            if depth == 0 and 0 < i < len(text) - 1:
                nxt = text[i + 1]
                if not (ch.isascii() and ch.isalnum() and nxt.isascii() and nxt.isalnum()) and nxt not in "ー、。！？」）":
                    cands.append((i + 1, ch in BREAK_AFTER))
    best, score = None, 1e9
    for c, good in cands:
        l, r = text[:c], text[c:]
        if l.count("【") != l.count("】"):   # 強調の途中で割るときは、両側で【】を閉じ直す
            l, r = l + "】", "【" + r
        wl, wr = rich_width(l, TELOP_SIZE, F_TELOP, TELOP_EMPH), rich_width(r, TELOP_SIZE, F_TELOP, TELOP_EMPH)
        in_quote = l.count("「") > l.count("」")
        sc = abs(wl - wr) + (0 if good else 90) + (110 if in_quote else 0)
        if sc < score:
            best, score = c, sc
    if not best:
        return [text]
    l, r = text[:best], text[best:]
    if l.count("【") != l.count("】"):
        l, r = l + "】", "【" + r
    return [l, r]


@lru_cache(maxsize=512)
def telop_image(chunk):
    lines = chunk.split("\n")
    # 少しはみ出すだけなら1行のまま縮める（変な位置で割るより読みやすい）
    if len(lines) == 1 and rich_width(chunk, TELOP_SIZE, F_TELOP, TELOP_EMPH) > TELOP_MAXW * 1.15:
        lines = split_two(chunk)
    stroke = 14
    line_imgs = []
    for ln in lines:
        segs = parse_emph(ln)
        big = any(em for _, em in segs)
        asc = font(F_TELOP, int(TELOP_SIZE * (TELOP_EMPH if big else 1))).getmetrics()[0]
        w = int(rich_width(ln, TELOP_SIZE, F_TELOP, TELOP_EMPH)) + stroke * 2 + 8
        h = int(asc * 1.22) + stroke * 2
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        x, base = stroke + 4, stroke + asc
        for seg, em in segs:
            f = font(F_TELOP, int(TELOP_SIZE * (TELOP_EMPH if em else 1)))
            d.text((x, base), seg, font=f, anchor="ls", fill=YELLOW if em else (255, 255, 255),
                   stroke_width=stroke + (2 if em else 0), stroke_fill=NAVY)
            x += f.getlength(seg)
        line_imgs.append(im)
    w = max(i.width for i in line_imgs)
    h = sum(i.height for i in line_imgs) - 10 * (len(line_imgs) - 1)
    block = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = 0
    for im in line_imgs:
        block.alpha_composite(im, ((w - im.width) // 2, y))
        y += im.height - 10
    out = shadowed(block, offset=(0, 11), blur=5, opacity=0.9)
    if out.width > TELOP_IMG_MAXW:
        out = scaled(out, TELOP_IMG_MAXW / out.width)
    return out


# ======================================================================
# 見出し
# ======================================================================
@lru_cache(None)
def heading_badge(text, size):
    f = font(F_BLACK, size)
    tw = f.getlength(text)
    pad_x, pad_y = int(size * 0.55), int(size * 0.28)
    w, h = int(tw + pad_x * 2), int(size * 1.2 + pad_y * 2)
    im = Image.new("RGBA", (w + 12, h + 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rounded(d, (6, 6, w + 6, h + 6), h // 2, fill=NAVY)
    rounded(d, (0, 0, w, h), h // 2, fill=YELLOW, outline=NAVY, width=max(4, size // 12))
    d.text((w / 2, h / 2 + size * 0.04), text, font=f, fill=NAVY, anchor="mm")
    return im


# ======================================================================
# 背景・パネル
# ======================================================================
def build_background(series):
    bg = Image.new("RGBA", (W, H))
    top, bot = np.array((232, 247, 253), float), np.array((196, 232, 247), float)
    grad = (top[None, :] * (1 - np.linspace(0, 1, H))[:, None] + bot[None, :] * np.linspace(0, 1, H)[:, None])
    arr = np.repeat(grad[:, None, :], W, axis=1).astype(np.uint8)
    bg = Image.fromarray(np.dstack([arr, np.full((H, W), 255, np.uint8)]), "RGBA")
    d = ImageDraw.Draw(bg)
    # キャラシートの ////// モチーフ
    for i in range(7):
        x = 820 + i * 34
        d.line([(x, 1020), (x - 60, 1110)], fill=(255, 255, 255, 190), width=12)
    for i in range(5):
        x = 70 + i * 34
        d.line([(x, 1560), (x - 60, 1650)], fill=(255, 255, 255, 170), width=12)
    # 下半分にやわらかい光
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((140, 1080, 940, 1880), fill=(255, 255, 255, 120))
    bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(80)))
    # パネル
    x0, y0, x1, y1 = PANEL
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + 14, x1, y1 + 14), 44, fill=(30, 80, 120, 70))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(bg)
    rounded(d, PANEL, 44, fill=(255, 255, 255), outline=SKY2, width=6)
    d.rounded_rectangle((x0 + 3, y0 + 3, x1 - 3, y0 + HEAD_H), 41, fill=SKY, corners=(True, True, False, False))
    d.line([(x0 + 3, y0 + HEAD_H), (x1 - 3, y0 + HEAD_H)], fill=SKY2, width=4)
    f = font(F_BLACK, 34)
    d.text((x1 - 34, y0 + HEAD_H / 2 + 2), series, font=f, fill=NAVY, anchor="rm")
    return bg


# ======================================================================
# 図解テンプレート（CONTENT 956x610 に描く）
# ======================================================================
NO_HEAD = set("、。，．！？!?」』）ー…っゃゅょぁぃぅぇぉッャュョ")


def wrap(text, fpath, size, maxw):
    out, cur = [], ""
    for ch in text:
        if ch == "\n":
            out.append(cur)
            cur = ""
            continue
        if font(fpath, size).getlength(cur + ch) > maxw and cur and ch not in NO_HEAD:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        out.append(cur)
    return out


def v_title(v, t, enter):
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    e = emoji(v.get("emoji", "🤔"), 230)
    s = ease_out_back(t / 0.35) if enter else 1
    paste_center(im, scaled(e, max(s, 0.01)), CW / 2, 150)
    lines = v["text"].split("\n")
    y = 360
    for i, ln in enumerate(lines):
        a = ease_out((t - 0.1 - i * 0.12) / 0.25) if enter else 1
        size = v.get("size", 84)
        w = rich_width(ln, size, F_BLACK)
        layer = Image.new("RGBA", (CW, 130), (0, 0, 0, 0))
        rich_text(ImageDraw.Draw(layer), ((CW - w) / 2, 100), ln, size, NAVY, RED, F_BLACK)
        im.alpha_composite(with_alpha(layer, a), (0, int(y + (1 - a) * 30) - 100 + 20))
        y += size + 34
    return im


def v_big(v, t, enter):
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if v.get("emoji"):
        bob = math.sin(t * 5) * 6 if v.get("bounce") else 0
        s = ease_out_back(t / 0.35) if enter else 1
        paste_center(im, scaled(emoji(v["emoji"], 200), max(s, 0.01)), CW / 2, 140 + bob)
    size = v.get("size", 120)
    a = ease_out((t - 0.12) / 0.3) if enter else 1
    lines = v["text"].split("\n")
    y = 330 if v.get("emoji") else 200
    for ln in lines:
        w = rich_width(ln, size, F_BLACK)
        layer = Image.new("RGBA", (CW, int(size * 1.4)), (0, 0, 0, 0))
        rich_text(ImageDraw.Draw(layer), ((CW - w) / 2, size * 1.1), ln, size, NAVY, RED, F_BLACK)
        im.alpha_composite(with_alpha(layer, a), (0, int(y + (1 - a) * 30 - size * 0.3)))
        y += int(size * 1.15)
    if v.get("sub"):
        a2 = ease_out((t - 0.35) / 0.3) if enter else 1
        f = font(F_BOLD, 48)
        layer = Image.new("RGBA", (CW, 80), (0, 0, 0, 0))
        w = rich_width(v["sub"], 48)
        rich_text(ImageDraw.Draw(layer), ((CW - w) / 2, 60), v["sub"], 48, GRAY, RED)
        im.alpha_composite(with_alpha(layer, a2), (0, min(y + 10, CH - 90)))
    return im


def bubble(text, me, maxw=720, size=48, hl=False, color=None):
    lines = wrap(text, F_BOLD, size, maxw - 60)
    f = font(F_BOLD, size)
    tw = max(f.getlength(l) for l in lines)
    w, h = int(tw + 60), int(len(lines) * size * 1.35 + 40)
    im = Image.new("RGBA", (w + 16, h + 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if hl:
        rounded(d, (0, 0, w + 16, h + 16), 36, fill=YELLOW)
    rounded(d, (8, 8, w + 8, h + 8), 30, fill=color or (BLUE if me else (238, 241, 246)))
    y = 8 + 20 + size
    for l in lines:
        d.text((8 + 30, y), l, font=f, fill=(255, 255, 255) if me else INK, anchor="ls")
        y += size * 1.35
    return im


def v_chat(v, t, enter, prev=None):
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    msgs = v["msgs"]
    # enter=False: 前の文と同じ画面（または1コマ目）なら全部表示、_from があればそこから先だけ演出
    start_new = v.get("_from", len(msgs)) if not enter else 0
    items, y = [], 120
    for k, m in enumerate(msgs):
        appear = 0.0 if k < start_new else (k - start_new) * 0.55
        if t < appear:
            break
        text = m["text"]
        if m.get("from") in ("ai", "them") and k >= start_new:
            n = int(len(text) * min(1, (t - appear) / max(0.6, len(text) * 0.035)))
            text = text[:max(n, 1)]
        them = m.get("from") == "them"
        b = bubble(text, m.get("from") == "me", hl=(v.get("hl") == k), color=(255, 232, 204) if them else None)
        s = ease_out_back((t - appear) / 0.25) if k >= start_new else 1
        items.append((b, m.get("from") == "me", s, m.get("emoji", "👷" if them else "✨")))
    total = sum(b.height + 16 for b, _, _, _ in items)
    y = 120 - max(0, total - (CH - 130))           # はみ出す分は上にスクロール
    for b, me, s, av in items:
        bb = scaled(b, max(0.05, s))
        if me:
            x = CW - 24 - bb.width
        else:
            x = 100
            if y + 10 > 110:
                im.alpha_composite(emoji(av, 60), (24, int(y + 16)))
        if y + bb.height > 100:
            im.alpha_composite(bb, (int(x), int(y)))
        y += b.height + 16
    d.rectangle((0, 0, CW, 108), fill=(255, 255, 255, 255))
    rounded(d, (20, 10, CW - 20, 100), 26, fill=(243, 246, 250))
    d.text((96, 55), v.get("title", "AIチャット"), font=font(F_BLACK, 44), fill=INK, anchor="lm")
    im.alpha_composite(emoji(v.get("icon", "🤖"), 52), (34, 29))
    if v.get("stamp") and t > v.get("stamp_at", 0.9):
        st = t - v.get("stamp_at", 0.9)
        f = font(F_BLACK, 56)
        tw = f.getlength(v["stamp"])
        stamp = Image.new("RGBA", (int(tw + 80), 120), (0, 0, 0, 0))
        sd = ImageDraw.Draw(stamp)
        rounded(sd, (4, 4, stamp.width - 4, 116), 20, fill=(255, 255, 255, 230), outline=RED, width=8)
        sd.text((stamp.width / 2, 62), v["stamp"], font=f, fill=RED, anchor="mm")
        stamp = stamp.rotate(-10, expand=True, resample=Image.BICUBIC)
        sc = 1.6 - 0.6 * ease_out(st / 0.18)
        paste_center(im, with_alpha(scaled(stamp, sc), min(1, st / 0.1)), CW * 0.6, CH - 170)
    return im


def v_settings(v, t, enter):
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = 30
    for i, p in enumerate(v.get("path", [])):
        last = i == len(v["path"]) - 1
        f = font(F_BLACK if last else F_BOLD, 44)
        if last:
            w = f.getlength(p)
            rounded(d, (x - 14, 18, x + w + 14, 92), 20, fill=YELLOW)
        d.text((x, 55), p, font=f, fill=NAVY if last else GRAY, anchor="lm")
        x += f.getlength(p) + 18
        if not last:
            d.text((x, 54), "›", font=font(F_BLACK, 44), fill=GRAY, anchor="lm")
            x += 40
    y = 120
    for k, fld in enumerate(v.get("fields", [])):
        hl = v.get("hl") == k
        d.text((34, y + 26), fld["label"], font=font(F_BLACK, 36), fill=INK, anchor="lm")
        y += 58
        val = fld.get("value", "")
        if hl and v.get("typing", True):
            n = int(len(val) * min(1, t / max(0.8, len(val) * 0.06)))
            val = val[:n]
        lines = wrap(val, F_BOLD, 38, CW - 120) or [""]
        bh = max(96, len(lines) * 52 + 40)
        if hl:
            pulse = 0.5 + 0.5 * math.sin(t * 8)
            rounded(d, (18, y - 8, CW - 18, y + bh + 8), 26, fill=(255, 236, 140 + int(60 * pulse)))
        rounded(d, (26, y, CW - 26, y + bh), 22, fill=(250, 251, 253), outline=NAVY if hl else (203, 213, 225), width=5 if hl else 3)
        yy = y + 20 + 38
        for ln in lines:
            d.text((56, yy), ln, font=font(F_BOLD, 38), fill=INK, anchor="ls")
            yy += 52
        if hl and int(t * 3) % 2 == 0:
            cx = 56 + font(F_BOLD, 38).getlength(lines[-1]) + 4
            d.rectangle((cx, yy - 52 - 34, cx + 5, yy - 52 + 8), fill=BLUE)
        y += bh + 34
    if v.get("toggle"):
        big = not v.get("fields")
        fs, sw, sh_ = (54, 210, 104) if big else (42, 170, 84)
        ty = 190 if big else y
        box_h = 250 if big else 176
        if v.get("hl_toggle"):
            pulse = 0.5 + 0.5 * math.sin(t * 8)
            rounded(d, (12, ty - 16, CW - 12, ty + box_h + 16), 30, fill=(255, 236, 140 + int(60 * pulse)))
        rounded(d, (24, ty, CW - 24, ty + box_h), 26, fill=(250, 251, 253), outline=(203, 213, 225), width=3)
        lab = wrap(v["toggle"], F_BLACK, fs, CW - sw - 150)
        ly = ty + box_h / 2 - (len(lab) - 1) * fs * 0.62
        for k, l in enumerate(lab):
            d.text((56, ly + k * fs * 1.24), l, font=font(F_BLACK, fs), fill=INK, anchor="lm")
        on = v.get("on", True)
        if "switch_to" in v:
            k = ease_out((t - v.get("switch_at", 0.4)) / 0.15)
            pos = (1 - k) * (1 if on else 0) + k * (1 if v["switch_to"] else 0)
        else:
            pos = 1.0 if on else 0.0
        col = tuple(int(GREEN[i] * pos + (196, 201, 212)[i] * (1 - pos)) for i in range(3))
        sx0, sy0 = CW - sw - 60, ty + box_h / 2 - sh_ / 2 - 18
        rounded(d, (sx0, sy0, sx0 + sw, sy0 + sh_), sh_ // 2, fill=col)
        kd = sh_ - 12
        kx = sx0 + 6 + pos * (sw - kd - 12)
        d.ellipse((kx, sy0 + 6, kx + kd, sy0 + 6 + kd), fill="white")
        d.text((sx0 + sw / 2, sy0 + sh_ + 34), "オン" if pos > 0.5 else "オフ", font=font(F_BLACK, 42 if big else 36),
               fill=GREEN if pos > 0.5 else RED, anchor="mm")
        y = ty + box_h + 40
    if v.get("note"):
        a = ease_out((t - v.get("switch_at", 0) - 0.2) / 0.3) if "switch_to" in v else 1
        layer = Image.new("RGBA", (CW, 90), (0, 0, 0, 0))
        w = rich_width(v["note"], 44, F_BLACK)
        rich_text(ImageDraw.Draw(layer), ((CW - w) / 2, 62), v["note"], 44, NAVY, RED, F_BLACK)
        im.alpha_composite(with_alpha(layer, a), (0, int(y)))
    return im


def v_menu(v, t, enter):
    """設定メニューの一覧。hl の行を黄色くして指でタップ"""
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((34, 48), v.get("title", "メニュー"), font=font(F_BLACK, 50), fill=NAVY, anchor="lm")
    rows = v["items"]
    rh = min(100, (CH - 110) // max(1, len(rows)))
    y = 100
    for k, it in enumerate(rows):
        a = ease_out((t - k * 0.06) / 0.2) if enter else 1
        hl = v.get("hl") == k
        row = Image.new("RGBA", (CW, rh), (0, 0, 0, 0))
        rd = ImageDraw.Draw(row)
        if hl:
            rounded(rd, (14, 4, CW - 14, rh - 4), 22, fill=YELLOW, outline=NAVY, width=4)
        else:
            rd.line([(34, rh - 2), (CW - 34, rh - 2)], fill=(226, 232, 240), width=3)
        ic = v.get("icons", {}).get(it) if isinstance(v.get("icons"), dict) else None
        x = 44
        if ic:
            row.alpha_composite(emoji(ic, 50), (x, (rh - 50) // 2))
            x += 70
        rd.text((x, rh / 2), it, font=font(F_BLACK if hl else F_BOLD, 44), fill=NAVY if hl else INK, anchor="lm")
        rd.text((CW - 60, rh / 2), "›", font=font(F_BLACK, 50), fill=NAVY if hl else GRAY, anchor="mm")
        im.alpha_composite(with_alpha(row, a), (0, y))
        if hl and t > 0.25:
            tap = abs(math.sin((t - 0.25) * 6)) * 14
            im.alpha_composite(emoji("👆", 84), (CW - 190, int(y + rh * 0.35 + tap)))
        y += rh
    return im


def v_list(v, t, enter):
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    size_t = v.get("title_size", 60)
    w = rich_width(v["title"], size_t, F_BLACK)
    rich_text(d, ((CW - w) / 2, 20 + size_t), v["title"], size_t, NAVY, RED, F_BLACK)
    items = v["items"][: v.get("show", len(v["items"]))]
    start_new = 0 if enter else v.get("_from", len(items))
    n = len(v["items"])
    gap = min(170, (CH - 140) // max(1, n))
    size = v.get("size", 58 if n <= 3 else 50)
    y = 130 + (CH - 130 - n * gap) // 2        # 項目が少ないときは縦中央に（増えても位置はずれない）
    for k, it in enumerate(items):
        appear = 0.15 + (k - start_new) * 0.3 if k >= start_new else -1
        if t < appear:
            break
        a = ease_out((t - appear) / 0.3) if appear >= 0 else 1
        row = Image.new("RGBA", (CW, gap), (0, 0, 0, 0))
        rd = ImageDraw.Draw(row)
        if v.get("hl") == k:
            rounded(rd, (14, 8, CW - 14, gap - 8), 28, fill=(255, 240, 150))
        color = [BLUE, GREEN, RED, (160, 90, 220)][k % 4]
        r_ = 50 if n <= 3 else 44
        rd.ellipse((34, gap / 2 - r_, 34 + 2 * r_, gap / 2 + r_), fill=color)
        rd.text((34 + r_, gap / 2), str(k + 1), font=font(F_BLACK, 58 if n <= 3 else 54), fill="white", anchor="mm")
        rich_text(rd, (34 + 2 * r_ + 34, gap / 2 + size * 0.36), it, size, INK, RED, F_BLACK)
        im.alpha_composite(with_alpha(row, a), (int((1 - a) * 80), y))
        y += gap
    return im


def v_compare(v, t, enter):
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    for side, (key, col, mark) in enumerate([("left", (236, 98, 88), "×"), ("right", GREEN, "○")]):
        c = v[key]
        appear = 0.0 if side == 0 else 0.45
        if enter and t < appear:
            continue
        a = ease_out((t - appear) / 0.3) if enter else 1
        card = Image.new("RGBA", (440, 580), (0, 0, 0, 0))
        d = ImageDraw.Draw(card)
        rounded(d, (0, 0, 440, 580), 34, fill=(255, 255, 255), outline=col, width=8)
        d.rounded_rectangle((4, 4, 436, 110), 30, fill=col, corners=(True, True, False, False))
        d.text((220, 58), f"{mark} {c['title']}", font=font(F_BLACK, 48), fill="white", anchor="mm")
        if c.get("emoji"):
            paste_center(card, emoji(c["emoji"], 150), 220, 210)
        yy = 380
        for ln in c["text"].split("\n"):
            w = rich_width(ln, 58, F_BLACK)
            rich_text(d, ((440 - w) / 2, yy), ln, 58, INK, RED, F_BLACK)
            yy += 82
        im.alpha_composite(with_alpha(card, a), (24 + side * 468, 14 + int((1 - a) * 40)))
    if not enter or t > 0.45:
        paste_center(im, emoji("👉", 70), CW / 2, 300)
    return im


VISUALS = {"title": v_title, "big": v_big, "chat": v_chat, "settings": v_settings,
           "list": v_list, "compare": v_compare, "cta": v_big, "menu": v_menu}
MOCK_TYPES = {"chat", "settings", "menu"}


# ======================================================================
# キャラクター
# ======================================================================
@lru_cache(maxsize=256)
def char_image(name, scale, crop_top_ratio=None):
    """白フチ＋影つきのキャラ画像。crop_top_ratio があれば上から指定割合だけ（寄り用）"""
    im = Image.open(PARTS / f"{name}.png").convert("RGBA")
    if crop_top_ratio:
        im = im.crop((0, 0, im.width, int(im.height * crop_top_ratio)))
    im = scaled(im, scale) if abs(scale - 1) > 1e-3 else im
    pad = 16
    canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    a = canvas.getchannel("A")
    a.paste(im.getchannel("A"), (pad, pad))
    edge = a.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(1.2))
    white = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
    white.putalpha(edge)
    out = shadowed(white, offset=(0, 12), blur=10, color=(20, 60, 100), opacity=0.35)
    out.alpha_composite(im, (pad, pad))
    return out


def pose_scale_wide(name):
    im = Image.open(PARTS / f"{name}_m0.png")
    return 760 / im.height


def pose_scale_close(name):
    im = Image.open(PARTS / f"{name}_m0.png")
    return 700 / im.width if "pose10" not in name else 640 / im.width


# ======================================================================
# タイムライン
# ======================================================================
def build_timeline(ep):
    script = json.loads((ep / "script.json").read_text(encoding="utf-8"))
    timing = json.loads((ep / "audio" / "timing.json").read_text(encoding="utf-8"))
    lines, t = [], LEAD
    prev_vis, shot_toggle = None, 0
    for i, ln in enumerate(script["lines"], 1):
        if ln.get("heading") and i > 1:
            t += SECTION_GAP
        dur = timing[f"{i:02d}"]["dur"]
        chunks = ln["text"].split("／")
        bounds = timing[f"{i:02d}"]["bounds"]
        if len(bounds) != len(chunks) - 1:
            bounds = list(np.cumsum([len(c) for c in chunks])[:-1] / sum(len(c) for c in chunks) * dur)
        cstarts = [t] + [t + b for b in bounds]
        shot = ln.get("shot") or ("close" if shot_toggle % 2 == 0 else "wide")
        shot_toggle += 1
        vis = ln.get("visual") or prev_vis
        vis = dict(vis) if vis else None
        enter = True
        if vis and prev_vis and vis.get("type") == prev_vis.get("type"):
            if vis == prev_vis:
                enter = False
            elif vis["type"] == "list" and vis.get("title") == prev_vis.get("title"):
                enter, vis["_from"] = False, prev_vis.get("show", len(prev_vis["items"]))
            elif vis["type"] == "chat" and vis.get("title") == prev_vis.get("title") and \
                    vis["msgs"][:len(prev_vis["msgs"])] == prev_vis["msgs"]:
                enter, vis["_from"] = False, len(prev_vis["msgs"])
        lines.append({"i": i, "start": round(t, 3), "end": round(t + dur, 3), "text": ln["text"],
                      "chunks": [{"text": c, "t": round(s, 3)} for c, s in zip(chunks, cstarts)],
                      "shot": shot, "pose": ln.get("pose", "face" if shot == "close" else "pose01"),
                      "heading": ln.get("heading"), "visual": vis, "enter": enter,
                      "se": ln.get("se"), "se_at": ln.get("se_at", 0.0)})
        prev_vis = {k: v for k, v in (vis or {}).items() if not k.startswith("_")} or None
        t += dur + GAP
    if lines:
        lines[0]["enter"] = False  # 1コマ目（サムネ・ループのつなぎ目）から図解を見せる
    total = t - GAP + TAIL
    # 見出しの区間
    cur = None
    for ln in lines:
        if ln["heading"]:
            cur = {"text": ln["heading"], "t": ln["start"] - (SECTION_GAP if ln["i"] > 1 else 0)}
        ln["section"] = cur
    return script, lines, total


def build_audio(ep, lines, total):
    n = int(math.ceil(total * SR))
    voice = np.zeros(n, np.float32)
    for ln in lines:
        x, _ = sf.read(ep / "audio" / f"line_{ln['i']:02d}.wav", dtype="float32")
        s = int(ln["start"] * SR)
        voice[s:s + len(x)] += x[: n - s]
    events = [(0.0, "hook", -8.0)]
    for ln in lines:
        if ln["heading"] and ln["i"] > 1:
            events.append((ln["section"]["t"] + 0.02, "pop", -17.5))
        if ln.get("se"):
            gain = {"ding": -15.0, "kira": -16.0, "whoosh": -18.0, "pop": -17.5, "hook": -8.0}[ln["se"]]
            events.append((ln["start"] + ln["se_at"], ln["se"], gain))
    fx = np.zeros(n, np.float32)
    for t, name, g in events:
        x, _ = sf.read(SFX / f"{name}.wav", dtype="float32")
        s = int(t * SR)
        seg = x[: n - s] * 10 ** (g / 20)
        fx[s:s + len(seg)] += seg
    return voice, fx, events


def mouth_track(voice, lines, nframes):
    hop = SR // FPS
    rms = np.zeros(nframes)
    for f in range(nframes):
        c = int((f + 0.5) * hop)
        seg = voice[max(0, c - 960):c + 960]
        rms[f] = np.sqrt((seg ** 2).mean()) if len(seg) else 0
    state = np.zeros(nframes, int)
    level = np.zeros(nframes)
    for ln in lines:
        a, b = int(ln["start"] * FPS), int(ln["end"] * FPS) + 1
        seg = rms[a:b]
        p90 = np.percentile(seg[seg > 0], 90) if (seg > 0).any() else 1
        for f in range(a, min(b, nframes)):
            r = rms[f] / (p90 + 1e-9)
            level[f] = min(1.0, r)
            state[f] = 2 if r > 0.55 else 1 if r > 0.2 else 0
    # 1コマだけの変化はならす
    for f in range(1, nframes - 1):
        if state[f - 1] == state[f + 1] != state[f]:
            state[f] = state[f - 1]
    return state, level


def blink_track(nframes, seed=7):
    rng = np.random.default_rng(seed)
    eye = np.zeros(nframes, int)
    f = int(1.4 * FPS)
    while f < nframes:
        for k, e in enumerate([1, 2, 2, 1]):
            if f + k < nframes:
                eye[f + k] = e
        f += int(rng.uniform(2.2, 4.2) * FPS)
    return eye


# ======================================================================
# 1コマ描画
# ======================================================================
class Renderer:
    def __init__(self, ep):
        self.ep = ep
        self.script, self.lines, self.total = build_timeline(ep)
        self.nframes = int(round(self.total * FPS))
        self.voice, self.fx, self.events = build_audio(ep, self.lines, self.total)
        self.mouth, self.level = mouth_track(self.voice, self.lines, self.nframes)
        self.eye = blink_track(self.nframes)
        self.bg = None

    def line_at(self, t):
        cur = self.lines[0]
        for ln in self.lines:
            if t >= ln["start"] - (SECTION_GAP if ln["heading"] and ln["i"] > 1 else GAP) + 1e-6:
                cur = ln
        return cur

    def frame(self, f, log=None):
        if self.bg is None:
            self.bg = build_background(self.script.get("series", ""))
        t = f / FPS
        ln = self.line_at(t)
        img = self.bg.copy()
        lt = t - ln["start"]

        # ---- 図解パネル ----
        v = ln["visual"]
        if v:
            fn = VISUALS[v["type"]]
            enter = ln["enter"]
            layer = fn(v, max(0.0, lt), enter)
            if enter and lt < 0.2:
                layer = with_alpha(layer, ease_out(max(lt, 0) / 0.2))
            img.alpha_composite(layer, (CONTENT[0], CONTENT[1]))
            if v["type"] in MOCK_TYPES:
                ImageDraw.Draw(img).text((PANEL[2] - 30, PANEL[3] - 22), "※画面はイメージです",
                                         font=font(F_BOLD, 26), fill=GRAY, anchor="rs")

        # ---- 見出し（区切りで中央に大きく → 左上のタブへ） ----
        sec = ln["section"]
        if sec:
            st = t - sec["t"]
            small = heading_badge(sec["text"], 50)
            tab = (PANEL[0] + 26, PANEL[1] + (HEAD_H - small.height) // 2 + 4)
            if st < 0.9 and sec["t"] > 0.05:
                big = heading_badge(sec["text"], 110)
                if st < 0.6:
                    s = ease_out_back(st / 0.22)
                    veil = Image.new("RGBA", (CW, CH), (255, 255, 255, int(200 * min(1, st / 0.1))))
                    img.alpha_composite(veil, (CONTENT[0], CONTENT[1]))
                    paste_center(img, scaled(big, max(0.05, s)), W / 2, (CONTENT[1] + CONTENT[3]) / 2)
                else:
                    k = ease_out((st - 0.6) / 0.3)
                    s = (1 - k) * 1 + k * (small.width / big.width)
                    cx = (1 - k) * W / 2 + k * (tab[0] + small.width / 2)
                    cy = (1 - k) * (CONTENT[1] + CONTENT[3]) / 2 + k * (tab[1] + small.height / 2)
                    paste_center(img, scaled(big, s), cx, cy)
            else:
                img.alpha_composite(small, tab)
            if log is not None:
                log["heading"] = sec["text"]

        # ---- キャラクター ----
        m = int(self.mouth[f]) if f < len(self.mouth) else 0
        if not (ln["start"] <= t <= ln["end"]):
            m = 0
        pose, shot = ln["pose"], ln["shot"]
        pop = ease_out_back(min(1, max(lt, 0) / 0.18)) if lt < 0.18 and f > 0 else 1
        breathe = math.sin(t * 2 * math.pi * 0.45) * 5
        bob = -self.level[f] * 7 if f < len(self.level) else 0
        if pose == "face":
            e = int(self.eye[f])
            ci = char_image(f"face_e{e}_m{m}", 1.02)
            zoom = 1 + 0.03 * min(1, max(lt, 0) / 4)
            ci = scaled(ci, zoom * (0.94 + 0.06 * pop))
            cx, top = 540, 1068 + breathe + bob
        elif pose.startswith("expr_"):
            ci = char_image(pose, 1.45)
            ci = scaled(ci, 0.94 + 0.06 * pop)
            cx, top = 540, 1080 + breathe
        elif shot == "close":
            ci = char_image(f"{pose}_m{m}", round(pose_scale_close(pose), 4), 0.55)
            zoom = 1 + 0.03 * min(1, max(lt, 0) / 4)
            ci = scaled(ci, zoom * (0.94 + 0.06 * pop))
            cx, top = 540, 1060 + breathe + bob
        else:
            ci = char_image(f"{pose}_m{m}", round(pose_scale_wide(pose), 4))
            ci = scaled(ci, 0.94 + 0.06 * pop)
            cx, top = 540, 1085 + breathe * 0.6 + bob
        img.alpha_composite(ci, (int(cx - ci.width / 2), int(top)))

        # ---- テロップ（声の区切りで切り替え） ----
        chunk = ln["chunks"][0]
        for c in ln["chunks"]:
            if t >= c["t"] - 0.03:
                chunk = c
        ti = telop_image(chunk["text"])
        ct = t - chunk["t"]
        s = 0.86 + 0.14 * ease_out_back(ct / 0.14) if 0 <= ct < 0.14 and f > 0 else 1
        tim = scaled(ti, s)
        paste_center(img, tim, TELOP_CX, TELOP_CY)
        if log is not None:
            log.update({"t": round(t, 3), "line": ln["i"], "chunk": chunk["text"],
                        "telop_box": [int(TELOP_CX - ti.width / 2), int(TELOP_CY - ti.height / 2),
                                      int(TELOP_CX + ti.width / 2), int(TELOP_CY + ti.height / 2)]})

        out = img.convert("RGB")
        # 冒頭のはっとさせる寄り（0.25秒）
        if t < 0.25:
            k = 1 + 0.05 * (1 - ease_out(t / 0.25))
            big = out.resize((int(W * k), int(H * k)), Image.BICUBIC)
            out = big.crop(((big.width - W) // 2, (big.height - H) // 2, (big.width - W) // 2 + W, (big.height - H) // 2 + H))
        return out


# ======================================================================
# 書き出し
# ======================================================================
_R = None


def _init(ep):
    global _R
    _R = Renderer(Path(ep))


def _render_segment(args):
    a, b, path = args
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                            "-crf", "17", "-pix_fmt", "yuv420p", "-g", "30", str(path)], stdin=subprocess.PIPE)
    for f in range(a, b):
        enc.stdin.write(_R.frame(f).tobytes())
    enc.stdin.close()
    enc.wait()
    return path


def loudnorm(src, dst, target=-14.0):
    """2パスで -14 LUFS / TP -1.5 に合わせる（TikTok・リール・ショート共通の目安）"""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af",
                        f"loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    js = json.loads(r.stderr[r.stderr.rfind("{"):])
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af",
                    f"loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
                    f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true",
                    "-ar", str(SR), str(dst)], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--stills", type=float, nargs="*")
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    ep = Path(a.episode).resolve()
    out = ep / "out"
    out.mkdir(exist_ok=True)
    R = Renderer(ep)
    print(f"尺 {R.total:.2f}s / {R.nframes}コマ / {len(R.lines)}文")
    if a.stills is not None:
        for s in a.stills:
            p = out / f"still_{s:05.2f}.png"
            R.frame(int(round(s * FPS))).save(p)
            print("still", p)
        return

    # タイムラインを QA 用に保存（テロップの外接矩形つき）
    for ln in R.lines:
        for c in ln["chunks"]:
            ti = telop_image(c["text"])
            c["box"] = [int(TELOP_CX - ti.width / 2), int(TELOP_CY - ti.height / 2),
                        int(TELOP_CX + ti.width / 2), int(TELOP_CY + ti.height / 2)]
    tl = {"total": R.total, "fps": FPS, "safe": SAFE, "lines": R.lines, "events": R.events}
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1))

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        mix = R.voice + R.fx
        sf.write(tmp / "mix.wav", mix, SR)
        loudnorm(tmp / "mix.wav", tmp / "mix_norm.wav")
        n = R.nframes
        step = math.ceil(n / (a.jobs * 3))
        segs = [(s, min(n, s + step), tmp / f"seg{k:03d}.mp4") for k, s in enumerate(range(0, n, step))]
        with Pool(a.jobs, initializer=_init, initargs=(str(ep),)) as pool:
            for k, p in enumerate(pool.imap(_render_segment, segs)):
                print(f"  segment {k + 1}/{len(segs)}", flush=True)
        (tmp / "list.txt").write_text("".join(f"file '{p}'\n" for _, _, p in segs))
        final = out / f"{ep.name}.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
                        "-i", str(tmp / "mix_norm.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                        "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-shortest", "-movflags", "+faststart",
                        str(final)], check=True)
        sf.write(out / "voice_only.wav", R.voice, SR)
        sf.write(out / "sfx_only.wav", R.fx, SR)
    print("書き出し完了", final)


if __name__ == "__main__":
    main()
