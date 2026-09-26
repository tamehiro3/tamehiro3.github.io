"""環境構築（Windows / Mac / Linux 共通）。何度実行しても安全（できているものは飛ばす）。

  python tools/setup.py

必要なもの: Python 3.10 以上と ffmpeg（Windows は「winget install Gyan.FFmpeg」）
仮の声（Open JTalk）は Linux のみ。クローン声（fal）はどの OS でも使える。
"""
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable
DOWNLOADS = {
    "assets/fonts/MPLUSRounded1c-Black.ttf":
        "https://raw.githubusercontent.com/google/fonts/main/ofl/mplusrounded1c/MPLUSRounded1c-Black.ttf",
    "assets/fonts/MPLUSRounded1c-Bold.ttf":
        "https://raw.githubusercontent.com/google/fonts/main/ofl/mplusrounded1c/MPLUSRounded1c-Bold.ttf",
    "assets/fonts/ZenOldMincho-Black.ttf":
        "https://raw.githubusercontent.com/google/fonts/main/ofl/zenoldmincho/ZenOldMincho-Black.ttf",
    "assets/models/noise1_scale2.0x_model.param":
        "https://raw.githubusercontent.com/nihui/waifu2x-ncnn-vulkan/master/models/models-cunet/noise1_scale2.0x_model.param",
    "assets/models/noise1_scale2.0x_model.bin":
        "https://raw.githubusercontent.com/nihui/waifu2x-ncnn-vulkan/master/models/models-cunet/noise1_scale2.0x_model.bin",
}


def step(msg):
    print(f"\n=== {msg} ===", flush=True)


def run(*args):
    subprocess.run([PY, *args], cwd=ROOT, check=True)


def main():
    if sys.version_info < (3, 10):
        sys.exit("Python 3.10 以上が必要です")
    step("1/5 Python パッケージ")
    subprocess.run([PY, "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")], check=True)

    step("2/5 ffmpeg")
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        hint = "winget install Gyan.FFmpeg（入れたら PowerShell を開き直す）" if sys.platform == "win32" \
            else "brew install ffmpeg" if sys.platform == "darwin" else "sudo apt-get install ffmpeg"
        sys.exit(f"ffmpeg が見つかりません: {hint}")
    print("ok")

    step("3/5 フォント・モデルの取得")
    for rel, url in DOWNLOADS.items():
        dst = ROOT / rel
        if dst.exists() and dst.stat().st_size > 1000:
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        print("download", rel)
        urllib.request.urlretrieve(url, dst)

    step("4/5 キャラ素材（初回は数分かかります）")
    b = ROOT / "build"
    for src, dst in [("assets/src/face_grid.webp", "build/up/face_grid.png"),
                     ("assets/src/poses10.webp", "build/up/poses10.png"),
                     ("assets/src/character_sheet.webp", "build/up/character_sheet.png"),
                     ("build/up/poses10.png", "build/up4/poses10.png")]:
        if not (ROOT / dst).exists():
            print("upscale", src)
            run("tools/upscale.py", src, dst)
    if not (b / "parts" / "parts.json").exists():
        run("tools/extract_assets.py")

    step("5/5 効果音")
    if not (b / "sfx" / "hook.wav").exists():
        run("tools/sfx.py")
    print("\nsetup done")


if __name__ == "__main__":
    main()
