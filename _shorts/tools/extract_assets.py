"""キャラ素材（2倍に拡大済み）から動画用パーツを切り出す。

出力: build/parts/
  face_e{0,1,2}_m{0,1,2}.png  寄り用バストアップ（e=目 開/半/閉, m=口 閉/半/開）
  pose01..10_m{0,1,2}.png    引き用全身（口だけ3状態に差し替え）
  view_*.png, expr_*.png, mic.png  キャラシートのパーツ
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
UP = ROOT / "build" / "up"
OUT = ROOT / "build" / "parts"


# ---------- 背景抜き ----------
def bg_mask(rgb: np.ndarray) -> np.ndarray:
    """白〜薄い水色で、枠から地続きの画素を背景とみなす。"""
    a = rgb.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mn, mx = a.min(-1), a.max(-1)
    whiteish = (mn > 226) & (mx - mn < 34)
    bluish = (b > 196) & (b - r > 6) & (mn > 160)
    cand = whiteish | bluish
    lab, _ = ndimage.label(cand)
    edge = np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    ids = np.unique(edge[edge > 0])
    return np.isin(lab, ids)


def cutout(rgb: np.ndarray, keep_small=0, bottom_open=False) -> Image.Image:
    bg = bg_mask(rgb)
    fg = ~bg
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    keep = lab == main
    if keep_small:
        for i, s in enumerate(sizes, 1):
            if i != main and s >= keep_small:
                keep |= lab == i
    keep = ndimage.binary_fill_holes(keep) if not bottom_open else keep
    alpha = cv2.GaussianBlur(keep.astype(np.float32), (3, 3), 0.8)
    rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    img = Image.fromarray(rgba, "RGBA")
    return img.crop(img.getbbox())


# ---------- 位置合わせ ----------
def gradmag(rgb):
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    m = cv2.magnitude(gx, gy)
    return cv2.GaussianBlur(m, (0, 0), 2)


def align_affine(base_rgb, src_rgb, win):
    """src を base に重ねるアフィン行列（src->base）を ECC で推定。win=(x0,y0,x1,y1)"""
    x0, y0, x1, y1 = win
    b = gradmag(base_rgb)[y0:y1, x0:x1]
    s = gradmag(src_rgb)[y0:y1, x0:x1]
    (dx, dy), _ = cv2.phaseCorrelate(b, s)
    warp = np.array([[1, 0, dx], [0, 1, dy]], dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(b / (b.max() + 1e-6), s / (s.max() + 1e-6), warp,
                                       cv2.MOTION_AFFINE,
                                       (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5),
                                       None, 5)
    except cv2.error:
        pass
    # ECC は base 座標 -> src 座標の写像。窓オフセットを全体座標に直す
    T = np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1]], np.float32)
    W = np.vstack([warp, [0, 0, 1]]).astype(np.float32)
    full = T @ W @ np.linalg.inv(T)
    return full[:2]


def warp_to_base(src_rgb, M, shape):
    h, w = shape[:2]
    return cv2.warpAffine(src_rgb, M, (w, h), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_REPLICATE)


def ellipse_mask(shape, cx, cy, rx, ry, feather):
    h, w = shape[:2]
    m = np.zeros((h, w), np.float32)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 1.0, -1)
    return cv2.GaussianBlur(m, (0, 0), feather)


def blend(base, patch, mask):
    m = mask[..., None]
    return (base.astype(np.float32) * (1 - m) + patch.astype(np.float32) * m).clip(0, 255).astype(np.uint8)


# ---------- 顔（口パク・まばたき） ----------
FACE_COLS = [(96, 482), (487, 867), (871, 1254)]
FACE_ROWS = [(149, 506), (511, 866), (873, 1236)]
CW, CH = 760, 710
FACE_WIN = (150, 280, 620, 600)          # 顔の輪郭〜目元（髪を除く）
MOUTH = dict(cx=378, cy=522, rx=84, ry=56, feather=6)
EYES = [dict(cx=272, cy=392, rx=84, ry=62, feather=6), dict(cx=470, cy=392, rx=84, ry=62, feather=6)]


def face_cells():
    u = np.asarray(Image.open(UP / "face_grid.png").convert("RGB"))
    cells = {}
    for ei, (y0, _) in enumerate(FACE_ROWS):
        for mi, (x0, _) in enumerate(FACE_COLS):
            cells[(ei, mi)] = u[y0 * 2:y0 * 2 + CH, x0 * 2:x0 * 2 + CW].copy()
    return cells


def build_faces(meta):
    cells = face_cells()
    base = cells[(0, 0)]
    mouth_src = {m: warp_to_base(cells[(0, m)], align_affine(base, cells[(0, m)], FACE_WIN), base.shape)
                 for m in (1, 2)}
    eye_src = {e: warp_to_base(cells[(e, 0)], align_affine(base, cells[(e, 0)], FACE_WIN), base.shape)
               for e in (1, 2)}
    mmask = ellipse_mask(base.shape, **MOUTH)
    emask = sum(ellipse_mask(base.shape, **e) for e in EYES).clip(0, 1)
    bgm = bg_mask(base)
    bbox = None
    for e in range(3):
        for m in range(3):
            img = base.copy()
            if e:
                img = blend(img, eye_src[e], emask)
            if m:
                img = blend(img, mouth_src[m], mmask)
            fg = ~bgm
            lab, n = ndimage.label(fg)
            sizes = ndimage.sum(fg, lab, range(1, n + 1))
            keep = lab == int(np.argmax(sizes)) + 1
            alpha = cv2.GaussianBlur(keep.astype(np.float32), (3, 3), 0.8)
            rgba = Image.fromarray(np.dstack([img, (alpha * 255).astype(np.uint8)]), "RGBA")
            bbox = bbox or rgba.getbbox()
            rgba.crop(bbox).save(OUT / f"face_e{e}_m{m}.png")
    meta["face"] = {"bbox": bbox, "mouth": MOUTH, "eyes": EYES}
    return cells, mouth_src


# ---------- 全身ポーズ ----------
POSE_COLS = [(0, 313), (315, 614), (616, 922), (924, 1223), (1224, 1536)]
POSE_ROWS = [(74, 468), (549, 906)]
LIP_SKIP = {5, 7}  # 手や前髪が口に重なるポーズは元の絵のまま
POSE_NAMES = ["基本", "あいさつ", "説明", "ポイント", "考える", "いいね", "おじぎ", "歓迎", "あるく", "ジャンプ"]


def find_mouth(rgb):
    """頭部の赤〜ピンクの口を探す（開いた口）。見つからなければ None"""
    a = rgb.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = (r > 170) & (g < 150) & (b < 150) & (r - g > 60)
    h = rgb.shape[0]
    red[int(h * 0.6):] = False  # 頭は上6割
    red = ndimage.binary_opening(red, iterations=max(1, h // 700))
    lab, n = ndimage.label(red)
    if not n:
        return None
    sizes = ndimage.sum(red, lab, range(1, n + 1))
    i = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lab == i)
    return xs.min(), ys.min(), xs.max(), ys.max()


def build_poses(meta, face_cells_, mouth_src):
    # 寄りでも粗くならないよう、ポーズは 4 倍（waifu2x を2回）を使う
    up4 = UP.parent / "up4" / "poses10.png"
    K = 4 if up4.exists() else 2
    u = np.asarray(Image.open(up4 if K == 4 else UP / "poses10.png").convert("RGB"))
    base = face_cells_[(0, 0)]
    # 顔グリッドの口（開）の外接矩形
    open_box = find_mouth(mouth_src[2][420:620, 250:510])
    ox0, oy0, ox1, oy1 = open_box
    open_w = ox1 - ox0
    states = {0: base, 1: mouth_src[1], 2: mouth_src[2]}
    meta["poses"] = []
    k = 0
    for (y0, y1) in POSE_ROWS:
        for (x0, x1) in POSE_COLS:
            k += 1
            crop = u[y0 * K:y1 * K, x0 * K:x1 * K].copy()
            info = {"id": k, "name": POSE_NAMES[k - 1], "scale": K}
            mb = None if k in LIP_SKIP else find_mouth(crop)
            for m in range(3):
                img = crop.copy()
                if mb is not None:
                    mx0, my0, mx1, my1 = mb
                    s = (mx1 - mx0) / open_w * 1.05
                    # 顔グリッドの口まわりパッチを縮小し、口の上端をそろえて貼る
                    px0, py0, px1, py1 = 250, 440, 510, 610
                    patch = states[m][py0:py1, px0:px1]
                    pm = ellipse_mask(states[m].shape, **MOUTH)[py0:py1, px0:px1]
                    pw, ph = int(patch.shape[1] * s), int(patch.shape[0] * s)
                    patch = cv2.resize(patch, (pw, ph), interpolation=cv2.INTER_AREA)
                    pm = cv2.resize(pm, (pw, ph), interpolation=cv2.INTER_AREA)
                    # 顔グリッドでの口（開）上端 = (ox0+250, oy0+420) を pose の口上端に合わせる
                    ax = int(mx0 - (ox0 + 250 - px0) * s)
                    ay = int(my0 - (oy0 + 420 - py0) * s)
                    # 肌色を合わせる
                    ring = (pm > 0.05) & (pm < 0.5)
                    region = img[ay:ay + ph, ax:ax + pw]
                    if region.shape[:2] == (ph, pw) and ring.any():
                        diff = region[ring].mean(0) - patch[ring].mean(0)
                        patch = (patch.astype(np.float32) + diff * 0.9).clip(0, 255).astype(np.uint8)
                        img[ay:ay + ph, ax:ax + pw] = blend(region, patch, pm)
                    info["mouth"] = [int(v) for v in mb]
                cut = cutout(img, keep_small=0)
                cut.save(OUT / f"pose{k:02d}_m{m}.png")
            info["lip"] = mb is not None
            meta["poses"].append(info)


# ---------- キャラシート ----------
SHEET = {
    "view_front": (150, 85, 400, 530), "view_diag": (440, 85, 705, 530),
    "view_side": (745, 85, 1005, 530), "view_back": (1040, 85, 1310, 530),
    "expr_normal": (22, 650, 218, 900), "expr_happy": (222, 650, 422, 900),
    "expr_angry": (426, 650, 624, 900), "expr_sleepy": (626, 650, 832, 900),
    "mic": (1350, 655, 1512, 855),
}


def build_sheet(meta):
    u = np.asarray(Image.open(UP / "character_sheet.png").convert("RGB"))
    meta["sheet"] = {}
    for name, (x0, y0, x1, y1) in SHEET.items():
        crop = u[y0 * 2:y1 * 2, x0 * 2:x1 * 2].copy()
        cut = cutout(crop, keep_small=400 if name.startswith("expr") else 0,
                     bottom_open=name.startswith("expr"))
        cut.save(OUT / f"{name}.png")
        meta["sheet"][name] = cut.size


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    cells, mouth_src = build_faces(meta)
    build_poses(meta, cells, mouth_src)
    build_sheet(meta)
    (OUT / "parts.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, default=int))
    print(json.dumps(meta["poses"], ensure_ascii=False))
