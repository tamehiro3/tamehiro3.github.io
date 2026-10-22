"""台本の文を消したり並べ替えたりしたあと、今ある音声（line_XX.wav）を新しい文の番号に付け直す。

  python tools/sync_audio.py ep30

読み（tts）が同じ文の音声はそのまま使い回す（お金はかからない）。
読みが変わった文・新しい文は、最後に番号を表示するので、その文だけ作り直す：
  python tools/make.py ep30 --engine fal --lines 9
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


def main():
    if len(sys.argv) != 2:
        raise SystemExit("使い方: python tools/sync_audio.py ep30")
    arg = Path(sys.argv[1])
    ep = arg if (arg / "script.json").exists() else ROOT / "episodes" / sys.argv[1]
    script = json.loads((ep / "script.json").read_text(encoding="utf-8"))
    audio = ep / "audio"
    timing_path = audio / "timing.json"
    if not timing_path.exists():
        raise SystemExit(f"{timing_path} がありません（まだ音声を作っていない回です）")
    timing = json.loads(timing_path.read_text(encoding="utf-8"))

    # 今ある音声を、読みの文字列ごとにまとめる（同じ読みが2つあれば前から順に使う）
    pool = {}
    for k in sorted(timing):
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

    print(f"{ep.name}: {len(script['lines'])}文のうち {len(plan)}文の音声をそのまま使います")
    if moved:
        print("  番号を付け直した文: " + "、".join(moved))
    if missing:
        nums = " ".join(map(str, missing))
        print(f"  作り直しが要る文: {nums}")
        print(f"  → python tools/make.py {ep.name} --engine fal --lines {nums}")
    else:
        print(f"  作り直しが要る文はありません → python tools/make.py {ep.name} --engine fal --fit-only")


if __name__ == "__main__":
    main()
