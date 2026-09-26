"""複数のエピソードを、指定した順番で「音声 → 動画 → 点検」まで一気に作る。

  python tools/make.py ep04 ep07 ep05 --engine fal     # クローン声（Windows PC で）
  python tools/make.py ep04 --engine openjtalk          # 仮の声（Linux）

途中でエラーが出たらそこで止まり、どのエピソードのどの工程かを表示する。
最後に、各エピソードの尺・点検の判定・動画の場所をまとめて表示する。
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable


def step(name, args):
    print(f"  - {name} ...", flush=True)
    r = subprocess.run([PY, *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stdout[-2000:])
        print(r.stderr[-3000:])
        raise SystemExit(f"止まりました: {args[1] if len(args) > 1 else ''} の「{name}」。上のエラーを貼ってください")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episodes", nargs="+", help="ep04 ep07 ep05 のように順番に")
    ap.add_argument("--engine", choices=["fal", "openjtalk"], default="fal")
    a = ap.parse_args()
    summary = []
    for ep in a.episodes:
        d = ROOT / "episodes" / ep
        if not (d / "script.json").exists():
            raise SystemExit(f"episodes/{ep}/script.json がありません（git pull を忘れていませんか）")
        theme = json.loads((d / "script.json").read_text(encoding="utf-8")).get("theme", "")
        print(f"\n=== {ep}  {theme}", flush=True)
        step("音声（1文ずつ）", ["tools/tts.py", f"episodes/{ep}", "--engine", a.engine])
        out = step("動画の書き出し", ["tools/render.py", f"episodes/{ep}"])
        dur = next((l for l in out.splitlines() if l.startswith("尺")), "")
        qa = step("点検", ["tools/qa.py", f"episodes/{ep}"])
        verdict = next((l.strip("* ") for l in qa.splitlines() if "判定" in l), "判定なし")
        issues = [l for l in qa.splitlines() if l.startswith("- ") and "指摘なし" not in l
                  and not l.startswith(("- 尺:", "- ラウドネス", "- 文ごと", "- 音ズレ", "- 効果音"))]
        summary.append((ep, dur, verdict, issues))
        print(f"  {dur} / {verdict}", flush=True)
    print("\n=== まとめ")
    for ep, dur, verdict, issues in summary:
        print(f"{ep}: {dur} / {verdict}")
        for i in issues[:8]:
            print("    " + i)
        print(f"    動画: {ROOT / 'episodes' / ep / 'out' / (ep + '.mp4')}")


if __name__ == "__main__":
    main()
