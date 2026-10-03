# 原型の公式3Dフィギュア（全身・CC0）を、キャラクターシート用に用意する（開発用・課金なし）
#   python ninja-aibou-dojo/tools/extract_official_figures.py            # 39体すべて
#   python ninja-aibou-dojo/tools/extract_official_figures.py jin shiba  # 指定だけ
# 元：tamehiro3/ninsai-kakurenbo の img/sheets/<id>.jpg（1536×1024）。
#     ninja-dao.com/characters の公式2Dイラストと公式3Dフィギュアを並べた参照シートで、
#     3Dフィギュアは左の「まえ」（白い背景・幅225×高さ400以内）に入っている。そこを切り出す
# 先：ninja-aibou-dojo/img/official/fig/<id>.jpg（高さ800・JPEG）
# 拡大は Real-ESRGAN の一般用モデル（realesrgan-x4plus・BSD-3-Clause）を ncnn で CPU 実行して4倍にし、縮めて保存する。
# 3Dの立体感を残すため、アニメ絵用のモデルは使わない（輪郭線が足されてしまう）。
# ninja-dao.com から元の大きな画像を取れるときは、そちらを OFFICIAL_FIG に置いて build_sheets.mjs を動かすほうがよい。
# 必要：pip install ncnn numpy opencv-python-headless
#   NINSAI_SHEETS     … ninsai-kakurenbo の img/sheets の場所
#   REALESRGAN_MODELS … realesrgan-x4plus.param / .bin の置き場所
#                       （https://github.com/xinntao/Real-ESRGAN/releases の realesrgan-ncnn-vulkan-*.zip の models/）
import os
import sys

import cv2
import ncnn
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'img', 'official', 'fig')
HEIGHT = 800
PAD = 8
PAPER = np.array([229, 241, 247], dtype=np.int16)  # 参照シートの紙の色 #F7F1E5（BGR）
EDGE = 20  # 4倍の絵で、ふちから何pxまでのにじみを白へもどすか


def crop_figure(sheet):
    """参照シートから、左の3Dフィギュア（紙の色でない長方形）を切り出す"""
    x0, y0, x1, y1 = 470, 168, 726, 584
    sub = sheet[y0:y1, x0:x1].astype(np.int16)
    diff = np.abs(sub - PAPER).max(axis=2) > 7
    rows = np.where(diff.mean(axis=1) > 0.35)[0]
    cols = np.where(diff.mean(axis=0) > 0.35)[0]
    return sheet[y0 + rows[0]:y0 + rows[-1] + 1, x0 + cols[0]:x0 + cols[-1] + 1]


def load_net():
    models = os.environ.get('REALESRGAN_MODELS')
    if not models:
        sys.exit('REALESRGAN_MODELS に realesrgan-x4plus のモデルの置き場所を入れてください')
    net = ncnn.Net()
    net.opt.use_vulkan_compute = False
    net.opt.num_threads = os.cpu_count() or 4
    net.load_param(os.path.join(models, 'realesrgan-x4plus.param'))
    net.load_model(os.path.join(models, 'realesrgan-x4plus.bin'))
    return net


def upscale4(net, bgr):
    img = cv2.copyMakeBorder(bgr, PAD, PAD, PAD, PAD, cv2.BORDER_REPLICATE)
    h, w = img.shape[:2]
    mat = ncnn.Mat.from_pixels(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), ncnn.Mat.PixelType.PIXEL_RGB, w, h)
    mat.substract_mean_normalize([0, 0, 0], [1 / 255.0] * 3)
    ex = net.create_extractor()
    ex.input('data', mat)
    _, out = ex.extract('output')
    rgb = np.clip(np.array(out).transpose(1, 2, 0) * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)[PAD * 4:-PAD * 4, PAD * 4:-PAD * 4]


def clean_edges(big):
    """切り出したふちに少しにじんだ紙の色を、白へもどす（白に近い色だけ。フィギュアの色は変えない）。
    シートの白い枠の中に置いたとき、うすい四角が見えないようにする"""
    h, w = big.shape[:2]
    y, x = np.arange(h)[:, None], np.arange(w)[None, :]
    d = np.minimum(np.minimum(y, h - 1 - y), np.minimum(x, w - 1 - x)).astype(np.float32)
    k = np.clip((EDGE - d) / (EDGE - 8), 0, 1)  # ふちから8pxまでは白、20pxで元のまま
    k = (k * (big.min(axis=2) >= 215))[..., None]
    return np.round(big + (255 - big.astype(np.float32)) * k).astype(np.uint8)


def finish(big):
    """4倍の絵のふちを整えて、高さ800へ縮める"""
    big = clean_edges(big)
    h, w = big.shape[:2]
    return cv2.resize(big, (round(w * HEIGHT / h), HEIGHT), interpolation=cv2.INTER_AREA)


def main():
    src = os.environ.get('NINSAI_SHEETS')
    if not src:
        sys.exit('NINSAI_SHEETS に ninsai-kakurenbo の img/sheets の場所を入れてください')
    ids = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(src) if f.endswith('.jpg') and '_' not in f)
    os.makedirs(OUT, exist_ok=True)
    net = load_net()
    for i in ids:
        sheet = cv2.imread(os.path.join(src, i + '.jpg'))
        if sheet is None:
            print('ありません:', i)
            continue
        cv2.imwrite(os.path.join(OUT, i + '.jpg'), finish(upscale4(net, crop_figure(sheet))), [cv2.IMWRITE_JPEG_QUALITY, 90])
        print(i)


if __name__ == '__main__':
    main()
