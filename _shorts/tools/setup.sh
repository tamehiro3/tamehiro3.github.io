#!/usr/bin/env bash
# ショート動画パイプラインの環境構築（Ubuntu / Debian 系）
set -euo pipefail
cd "$(dirname "$0")/.."

sudo=""; [ "$(id -u)" -ne 0 ] && sudo="sudo"
$sudo apt-get update -qq
$sudo apt-get install -y -qq ffmpeg fonts-noto-cjk fonts-noto-cjk-extra fonts-noto-color-emoji \
  open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001

pip install -q pillow numpy scipy opencv-python-headless ncnn soundfile fonttools fal-client

# テロップ用フォント（SIL OFL 1.1）
mkdir -p assets/fonts assets/models
[ -f assets/fonts/MPLUSRounded1c-Black.ttf ] || curl -fsSL -o assets/fonts/MPLUSRounded1c-Black.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/mplusrounded1c/MPLUSRounded1c-Black.ttf
# 素材の高画質化モデル（waifu2x cunet / MIT）
for f in noise1_scale2.0x_model.param noise1_scale2.0x_model.bin; do
  [ -f assets/models/$f ] || curl -fsSL -o assets/models/$f \
    https://raw.githubusercontent.com/nihui/waifu2x-ncnn-vulkan/master/models/models-cunet/$f
done

# キャラ素材の準備（2倍 → ポーズは4倍）と効果音
python3 tools/upscale.py assets/src/face_grid.webp build/up/face_grid.png
python3 tools/upscale.py assets/src/poses10.webp build/up/poses10.png
python3 tools/upscale.py assets/src/character_sheet.webp build/up/character_sheet.png
python3 tools/upscale.py build/up/poses10.png build/up4/poses10.png
python3 tools/extract_assets.py
python3 tools/sfx.py
echo "setup done"
