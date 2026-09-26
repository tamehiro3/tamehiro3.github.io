"""一時的な疎通確認: GitHub の実行環境から Canva の書き出しを取得し、形式判定・OCR・照合まで通す。"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "tool"))
import media  # noqa: E402
from lint import lint_image_text, lint_ocr_text, ocr_coverage  # noqa: E402

url = (HERE / "url.txt").read_text(encoding="utf-8").strip()
rules = json.loads((HERE.parents[1] / "rules.json").read_text(encoding="utf-8"))
declared = "今日の謎。ひらがな3文字の生き物で、夜になると光るものはなんでしょう？答えはあした。しのびのゲーム工房"
print("source:", media.source_of(url), "/ expiry:", media.canva_expiry(url))
data = media.download(url, 1_000_000)
info = media.describe(data)
print("describe:", {k: info[k] for k in ("mime", "width", "height", "bytes", "exif", "gps")})
status, text = media.ocr(data)
print("ocr status:", status)
print(text)
print("coverage:", ocr_coverage(text, declared))
for f in lint_image_text(declared, rules) + lint_ocr_text(text, declared, rules):
    print(f.level, f.message)
ok = status == "ok" and info["mime"] == "image/jpeg" and not info["gps"]
print("RESULT:", "OK" if ok else "NG")
sys.exit(0 if ok else 1)
