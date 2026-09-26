#!/usr/bin/env bash
# Linux 用: 仮の声（Open JTalk）と ffmpeg を apt で入れてから、共通の setup.py を実行する
set -euo pipefail
cd "$(dirname "$0")/.."
sudo=""; [ "$(id -u)" -ne 0 ] && sudo="sudo"
$sudo apt-get update -qq
$sudo apt-get install -y -qq ffmpeg open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001
python3 tools/setup.py
