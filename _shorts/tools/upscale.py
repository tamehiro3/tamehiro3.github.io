"""waifu2x (cunet, noise1, x2) を ncnn の CPU 推論で回して素材を2倍にする。

使い方: python3 tools/upscale.py assets/src/poses10.webp build/up/poses10.png
"""
import sys
from pathlib import Path

import ncnn
import numpy as np
from PIL import Image

MODEL_DIR = Path(__file__).resolve().parent.parent / "assets" / "models"
PAD = 18  # cunet x2 の prepadding。入力 W+36 -> 出力 2W
TILE = 200


def load_net():
    net = ncnn.Net()
    net.opt.use_vulkan_compute = False
    net.opt.num_threads = 4
    net.load_param(str(MODEL_DIR / "noise1_scale2.0x_model.param"))
    net.load_model(str(MODEL_DIR / "noise1_scale2.0x_model.bin"))
    return net


def upscale(img: Image.Image, net=None) -> Image.Image:
    net = net or load_net()
    src = np.asarray(img.convert("RGB"), dtype=np.float32).transpose(2, 0, 1) / 255.0
    _, h, w = src.shape
    padded = np.pad(src, ((0, 0), (PAD, PAD), (PAD, PAD)), mode="edge")
    out = np.zeros((3, h * 2, w * 2), dtype=np.float32)
    for y in range(0, h, TILE):
        for x in range(0, w, TILE):
            th, tw = min(TILE, h - y), min(TILE, w - x)
            tile = np.ascontiguousarray(padded[:, y:y + th + 2 * PAD, x:x + tw + 2 * PAD])
            ex = net.create_extractor()
            ex.input("Input1", ncnn.Mat(tile))
            _, res = ex.extract("Eltwise4")
            out[:, y * 2:(y + th) * 2, x * 2:(x + tw) * 2] = np.array(res)
    out = np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8).transpose(1, 2, 0)
    return Image.fromarray(out)


if __name__ == "__main__":
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.parent.mkdir(parents=True, exist_ok=True)
    upscale(Image.open(src)).save(dst)
    print("saved", dst)
