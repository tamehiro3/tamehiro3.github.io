# 原型（公式イラスト・CC0）を高画質化して、キャラクターシート用に保存する（開発用・課金なし）
#   python ninja-aibou-dojo/tools/upscale_official.py            # 39体すべて
#   python ninja-aibou-dojo/tools/upscale_official.py jin sakuya # 指定だけ
# 元：ninja-sato-life/img/art/<id>.jpg（360×360）
# 先：ninja-aibou-dojo/img/official/<id>.jpg（1080×1080・JPEG）
# 拡大は Real-ESRGAN（アニメ絵用 realesrgan-x4plus-anime・BSD-3-Clause）を ncnn で CPU 実行して4倍にし、3倍の大きさへ縮める。
# 絵は描き足さず、輪郭と色の境目をくっきりさせるだけ（構図・色・形は元の絵のまま）。
# 必要：pip install ncnn numpy opencv-python-headless
#   REALESRGAN_MODELS … realesrgan-x4plus-anime.param / .bin の置き場所
#                       （https://github.com/xinntao/Real-ESRGAN/releases の realesrgan-ncnn-vulkan-*.zip の models/）
import os
import sys

import cv2
import ncnn
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, '..', 'ninja-sato-life', 'img', 'art')
OUT = os.path.join(ROOT, 'img', 'official')
SIZE = 1080
PAD = 8  # 端がにじまないよう、少し余白をつけてから拡大する


def load_net():
    models = os.environ.get('REALESRGAN_MODELS')
    if not models:
        sys.exit('REALESRGAN_MODELS に realesrgan-x4plus-anime のモデルの置き場所を入れてください')
    net = ncnn.Net()
    net.opt.use_vulkan_compute = False
    net.opt.num_threads = os.cpu_count() or 4
    net.load_param(os.path.join(models, 'realesrgan-x4plus-anime.param'))
    net.load_model(os.path.join(models, 'realesrgan-x4plus-anime.bin'))
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


def finish(big):
    """4倍の絵を、シートで使う大きさ（1080）へ縮めて保存用にする"""
    return cv2.resize(big, (SIZE, SIZE), interpolation=cv2.INTER_AREA)


def main():
    ids = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.jpg'))
    os.makedirs(OUT, exist_ok=True)
    net = load_net()
    for i in ids:
        src = cv2.imread(os.path.join(SRC, i + '.jpg'))
        if src is None:
            print('ありません:', i)
            continue
        cv2.imwrite(os.path.join(OUT, i + '.jpg'), finish(upscale4(net, src)), [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(i)


if __name__ == '__main__':
    main()
