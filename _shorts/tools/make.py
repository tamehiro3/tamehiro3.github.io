"""複数のエピソードを、指定した順番で「音声 → 動画 → 点検」まで一気に作る。

  python tools/make.py ep04 ep07 ep05 --engine fal     # クローン声（Windows PC で）
  python tools/make.py ep04 --engine openjtalk          # 仮の声（Linux）
  python tools/make.py ep12 ep10 ep14 --engine fal --discord   # できたら Discord に送る
  python tools/make.py ep07 --engine fal --lines 18    # 18文目の音声も作り直して、動画と点検をやり直す
  python tools/make.py ep07 --engine fal --all         # 全部の文の音声を作り直す

2回目からは、前に作った音声のうち読みが変わっていない文をそのまま使い、
読みが変わった文・新しい文・音声が無い文だけを作る（台本を直したあとも、このコマンドだけでよい）。
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
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sync_audio  # noqa: E402


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


def check_audio(d: Path):
    """動画を書き出す前に、全部の文の音声がそろっているか確かめる"""
    n = len(json.loads((d / "script.json").read_text(encoding="utf-8"))["lines"])
    tp = d / "audio" / "timing.json"
    timing = json.loads(tp.read_text(encoding="utf-8")) if tp.exists() else {}
    lack = [i for i in range(1, n + 1) if f"{i:02d}" not in timing or not (d / "audio" / f"line_{i:02d}.wav").exists()]
    if lack:
        raise SystemExit(f"止まりました: 文 {' '.join(map(str, lack))} の音声がありません。"
                         f"同じコマンドをもう一度実行すると、足りない文だけ作ります")


# 本番の声（クローン声）の話す長さ ÷ 仮の声（openjtalk）の話す長さ。文によって大きく変わる。
# ep30・ep32 は約1.03〜1.06倍と長く出たが、ep39 と ep41 は短く出た
# （ep41 は約0.87倍。尺合わせで0.94倍まで遅くしても54.9秒で、55秒に届かなかった）
FAL_RATIO = (0.87, 1.06)
FIT_MIN, FIT_MAX = 55.5, 59.5          # tools/tts.py の尺合わせと同じ


def fitted(fixed: float, speech: float) -> float:
    """tools/tts.py の尺合わせ（話す速さ 0.94〜1.10 倍）をしたあとの尺"""
    total = fixed + speech
    tempo = 1.0
    if total > FIT_MAX:
        tempo = min(1.10, speech / (speech - (total - (FIT_MAX - 0.3))))
    elif total < FIT_MIN:
        tempo = max(0.94, speech / (speech + ((FIT_MIN + 0.3) - total)))
    return fixed + speech / tempo


def estimate_real(d: Path):
    """仮の声（openjtalk）の長さから、本番の声での尺を見積もる。
    戻り値は（本番の声が短く出たとき, 長く出たとき）の尺。どちらも尺合わせのあと"""
    t = json.loads((d / "audio" / "timing.json").read_text(encoding="utf-8"))
    tl = json.loads((d / "out" / "timeline.json").read_text(encoding="utf-8"))
    fixed = tl["total"] - sum(v["dur"] for v in t.values())          # 間・見出し・前後の余白
    raw = sum(v.get("raw_dur", v["dur"]) for v in t.values())
    return tuple(fitted(fixed, raw * r) for r in FAL_RATIO)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episodes", nargs="+", help="ep04 ep07 ep05 のように順番に")
    ap.add_argument("--engine", choices=["fal", "openjtalk"], default="fal")
    ap.add_argument("--lines", type=int, nargs="*", help="読みが同じでも作り直したい文の番号（例 --lines 18）")
    ap.add_argument("--all", action="store_true", help="前の音声を使わず、全部の文を作り直す")
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
            if a.fit_only:
                only = ["--fit-only"]
            elif a.all:
                only = []
            else:
                # 前に作った音声を今の台本の文番号に付け直し、作り直しが要る文だけを作る
                r = sync_audio.sync(d, a.engine)
                todo = sorted(set(a.lines or []) | set(r["missing"]))
                if r["reused"]:
                    print(f"  - 前の音声を {r['reused']}文 使い回します"
                          + (f"（番号を付け直し: {'、'.join(r['moved'])}）" if r["moved"] else ""), flush=True)
                if todo and len(todo) < r["lines"]:
                    print(f"  - 音声を作る文: {' '.join(map(str, todo))}", flush=True)
                only = ["--only", *map(str, todo)] if todo and len(todo) < r["lines"] else ([] if todo else ["--fit-only"])
            step("音声（1文ずつ）", ["tools/tts.py", f"episodes/{ep}", "--engine", a.engine, *only])
            check_audio(d)
            out = step("動画の書き出し", ["tools/render.py", f"episodes/{ep}"])
            dur = next((l for l in out.splitlines() if l.startswith("尺")), "")
        qa = step("点検", ["tools/qa.py", f"episodes/{ep}"])
        verdict = next((l.strip("* ") for l in qa.splitlines() if "判定" in l), "判定なし")
        issues = [l for l in qa.splitlines() if l.startswith("- ") and "指摘なし" not in l
                  and not l.startswith(("- 尺:", "- ラウドネス", "- 文ごと", "- 音ズレ", "- 効果音"))]
        if a.engine == "openjtalk" and not a.qa_only:
            lo, hi = estimate_real(d)
            if hi > 60.3:
                issues.insert(0, f"- 本番の声が長く出ると約{hi:.1f}秒（60.5秒を超えるおそれ。文を短くするか1文減らす）")
            if lo < 55.3:
                issues.insert(0, f"- 本番の声が短く出ると約{lo:.1f}秒（55秒を切るおそれ。文に少し言葉を足す）")
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
