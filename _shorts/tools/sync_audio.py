"""台本の文を消したり並べ替えたりしたあと、今ある音声（line_XX.wav）を新しい文の番号に付け直す。

  python tools/sync_audio.py ep30

読み（tts）が同じ文の音声はそのまま使い回す（お金はかからない）。
読みが変わった文・新しい文は、最後に番号を表示する。
tools/make.py は、音声を作る前にこれを自動で行うので、ふだんは手で実行しなくてよい。
何度実行しても同じ結果になる。
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts import tts_chunks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def sync(ep: Path, engine: str | None = None) -> dict:
    """ep の音声を今の台本の文番号に付け直す。engine を指定すると、その声で作った音声だけを使い回す。
    戻り値: {"lines": 文の数, "reused": 使い回した文の数, "moved": ["08→07", ...], "missing": [作り直しが要る文の番号]}"""
    script = json.loads((ep / "script.json").read_text(encoding="utf-8"))
    n = len(script["lines"])
    audio = ep / "audio"
    timing_path = audio / "timing.json"
    if not timing_path.exists():
        return {"lines": n, "reused": 0, "moved": [], "missing": list(range(1, n + 1))}
    timing = json.loads(timing_path.read_text(encoding="utf-8"))

    # 今ある音声を、読みの文字列ごとにまとめる（同じ読みが2つあれば前から順に使う）
    pool = {}
    for k in sorted(timing):
        if engine and timing[k].get("engine") != engine:
            continue
        if (audio / f"line_{k}.wav").exists():
            pool.setdefault(timing[k]["tts"], []).append(k)

    plan, missing = {}, []
    for i, line in enumerate(script["lines"], 1):
        text = "".join(tts_chunks(line))
        if pool.get(text):
            plan[f"{i:02d}"] = pool[text].pop(0)
        else:
            missing.append(i)

    moved = [f"{old}→{new}" for new, old in plan.items() if old != new]
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        for new, old in plan.items():
            for suffix in ("", "_raw"):
                src = audio / f"line_{old}{suffix}.wav"
                if src.exists():
                    shutil.copy2(src, tmp / f"line_{new}{suffix}.wav")
        for f in audio.glob("line_*.wav"):
            f.unlink()
        for f in tmp.glob("line_*.wav"):
            shutil.move(str(f), audio / f.name)
    new_timing = {new: timing[old] for new, old in sorted(plan.items())}
    timing_path.write_text(json.dumps(new_timing, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"lines": n, "reused": len(plan), "moved": moved, "missing": missing}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("使い方: python tools/sync_audio.py ep30")
    arg = Path(sys.argv[1])
    ep = arg if (arg / "script.json").exists() else ROOT / "episodes" / sys.argv[1]
    if not (ep / "audio" / "timing.json").exists():
        raise SystemExit(f"{ep / 'audio' / 'timing.json'} がありません（まだ音声を作っていない回です）")
    r = sync(ep)
    print(f"{ep.name}: {r['lines']}文のうち {r['reused']}文の音声をそのまま使います")
    if r["moved"]:
        print("  番号を付け直した文: " + "、".join(r["moved"]))
    if r["missing"]:
        print(f"  作り直しが要る文: {' '.join(map(str, r['missing']))}")
    print(f"  → python tools/make.py {ep.name} --engine fal（作り直しが要る文だけ自動で作ります）")


if __name__ == "__main__":
    main()
