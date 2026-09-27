"""複数のエピソードを、指定した順番で「音声 → 動画 → 点検」まで一気に作る。

  python tools/make.py ep04 ep07 ep05 --engine fal     # クローン声（Windows PC で）
  python tools/make.py ep04 --engine openjtalk          # 仮の声（Linux）
  python tools/make.py ep12 ep10 ep14 --engine fal --discord   # できたら Discord に送る
  python tools/make.py ep07 --engine fal --lines 18    # 18文目の音声だけ作り直して、動画と点検をやり直す
  python tools/make.py ep10 --fit-only                  # 尺が 55〜60 秒から外れたとき：声はそのまま速さだけ整える
  python tools/make.py ep12 ep14 --qa-only              # 点検だけやり直す（お金はかからない）

途中でエラーが出たらそこで止まり、どのエピソードのどの工程かを表示する。
最後に、各エピソードの尺・点検の判定・動画の場所をまとめて表示する。
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable


def step(name, args):
    print(f"  - {name} ...", flush=True)
    # 子のプロセスにも UTF-8 で出力させる（Windows は既定が cp932 なので、そのままだと文字化けして判定が読めない）
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    r = subprocess.run([PY, *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    if r.returncode != 0:
        print(r.stdout[-2000:])
        print(r.stderr[-3000:])
        raise SystemExit(f"止まりました: {args[1] if len(args) > 1 else ''} の「{name}」。上のエラーを貼ってください")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episodes", nargs="+", help="ep04 ep07 ep05 のように順番に")
    ap.add_argument("--engine", choices=["fal", "openjtalk"], default="fal")
    ap.add_argument("--lines", type=int, nargs="*", help="音声を作り直す文の番号（例 --lines 18）。ほかの文はそのまま")
    ap.add_argument("--fit-only", action="store_true", help="音声は作り直さず、尺合わせ→動画→点検だけやる（お金はかからない）")
    ap.add_argument("--qa-only", action="store_true", help="音声と動画は作り直さず、点検だけやり直す")
    ap.add_argument("--discord", action="store_true", help="できた動画を Discord に送る（tools/discord_send.py）")
    ap.add_argument("--limit-mb", type=float, default=10.0, help="Discord の1ファイルの上限（無料は 10MB）")
    a = ap.parse_args()
    if a.discord:
        import discord_send
        discord_send.load_url()          # URL が無ければ、作り始める前に止める
    summary = []
    for ep in a.episodes:
        d = ROOT / "episodes" / ep
        if not (d / "script.json").exists():
            raise SystemExit(f"episodes/{ep}/script.json がありません（git pull を忘れていませんか）")
        theme = json.loads((d / "script.json").read_text(encoding="utf-8")).get("theme", "")
        print(f"\n=== {ep}  {theme}", flush=True)
        dur = ""
        if not a.qa_only:
            only = ["--only", *map(str, a.lines)] if a.lines else (["--fit-only"] if a.fit_only else [])
            step("音声（1文ずつ）", ["tools/tts.py", f"episodes/{ep}", "--engine", a.engine, *only])
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
    if a.discord:
        print("\n=== Discord に送る")
        note = "（仮の声・確認用）" if a.engine == "openjtalk" else ""
        discord_send.send([ep for ep, *_ in summary], a.limit_mb, note)


if __name__ == "__main__":
    main()
