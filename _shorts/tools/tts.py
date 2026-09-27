"""台本を1文ずつ音声にする。

  python3 tools/tts.py episodes/ep01                 # 仮ナレーション（Open JTalk、ローカル）
  python3 tools/tts.py episodes/ep01 --engine fal    # ためひろさんのクローン声（fal / MiniMax）

出力: <ep>/audio/line_XX.wav（48kHz mono）と <ep>/audio/timing.json
timing.json には各文の長さと、テロップを切り替える区切り（／）の時刻が入る。
"""
import argparse
import sys
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))

SR = 48000
ROOT = Path(__file__).resolve().parent.parent
OJT_DIC = "/var/lib/mecab/dic/open-jtalk/naist-jdic"
OJT_VOICE = "/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice"


def plain(s: str) -> str:
    return s.replace("【", "").replace("】", "")


def tts_chunks(line: dict) -> list[str]:
    """読み上げ用テキストを／で区切った配列。tts が無ければ表示テキストを使う"""
    src = line.get("tts") or line["text"]
    return [plain(c) for c in src.split("／")]


# ---------- Open JTalk ----------
def openjtalk(text: str, cfg: dict) -> np.ndarray:
    with tempfile.TemporaryDirectory() as d:
        txt, wav = Path(d) / "t.txt", Path(d) / "t.wav"
        txt.write_text(text, encoding="utf-8")
        subprocess.run(["open_jtalk", "-x", OJT_DIC, "-m", OJT_VOICE, "-s", str(SR),
                        "-r", str(cfg.get("speed", 1.2)), "-fm", str(cfg.get("pitch", 2.5)),
                        "-jf", str(cfg.get("intonation", 1.4)), "-a", "0.55",
                        "-ow", str(wav), str(txt)], check=True)
        x, sr = sf.read(wav, dtype="float32")
    assert sr == SR
    return x


# ---------- fal (MiniMax voice clone) ----------
# キーの読み込みと API 呼び出しは tools/fal_api.py（キーは assets/.fal_key）
def fal_voice_id(ep: Path, cfg: dict) -> str:
    import fal_api

    if fal_api.VOICE_CACHE.exists():
        return fal_api.read_voice()["custom_voice_id"]
    # VOICE_REF_URL があれば、ファイルをリポジトリに置かずにそのURLから取り込ませる
    src = os.environ.get("VOICE_REF_URL")
    if not src:
        refs = sorted(p for p in (ROOT / "voice_ref").glob("*") if p.suffix.lower() in (".wav", ".mp3", ".m4a"))
        if not refs:
            raise SystemExit("voice_ref/ に ためひろさんの声（10秒〜3分、1人で話している音声）を置いてください")
        src = str(refs[0])
    # 長い収録は、VOICE_REF_START 秒目から VOICE_REF_SECONDS 秒（既定 90 秒）だけ切り出して使う
    return fal_api.clone_voice(src, float(os.environ.get("VOICE_REF_START", 0)),
                               float(os.environ.get("VOICE_REF_SECONDS", 90)))


# クローン声は「エーアイ」をカナのまま渡すと「え〜〜あい」と間延びするので、英字で渡す
FAL_READ = {"エーアイ": "AI", "エイアイ": "AI"}


def fal_text(text: str) -> str:
    for k, v in FAL_READ.items():
        text = text.replace(k, v)
    return text


def fal_tts(text: str, cfg: dict, voice_id: str) -> np.ndarray:
    import fal_api

    text = fal_text(text)

    with tempfile.TemporaryDirectory() as d:
        wav = fal_api.tts(text, voice_id, Path(d) / "a.wav", model=cfg.get("fal_model", fal_api.TTS_MODEL),
                          speed=cfg.get("fal_speed", 1.15), pitch=cfg.get("fal_pitch", 0),
                          emotion=cfg.get("emotion", "happy"), sample_rate=SR)
        x, _ = sf.read(wav, dtype="float32")
    return x


# ---------- 後処理 ----------
def trim(x: np.ndarray, thr_db=-42, pad=0.03) -> np.ndarray:
    win = int(0.01 * SR)
    n = len(x) // win
    rms = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms / (rms.max() + 1e-12))
    idx = np.where(db > thr_db)[0]
    s = max(0, idx[0] * win - int(pad * SR))
    e = min(len(x), (idx[-1] + 1) * win + int(pad * SR))
    y = x[s:e].copy()
    f = int(0.008 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def normalize(x: np.ndarray, target_rms_db=-18.0) -> np.ndarray:
    """文ごとの声量をそろえる（話している部分の RMS 基準）"""
    win = int(0.02 * SR)
    n = len(x) // win
    rms = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(1) + 1e-12)
    voiced = rms[rms > rms.max() * 0.1]
    cur = 20 * np.log10(np.sqrt((voiced ** 2).mean()) + 1e-12)
    y = x * 10 ** ((target_rms_db - cur) / 20)
    peak = np.abs(y).max()
    return y / peak * 0.95 if peak > 0.95 else y


def chunk_bounds(x: np.ndarray, chunks: list[str], cfg: dict) -> list[float]:
    """／区切りの境目の時刻（秒）。Open JTalk の各チャンク単体の長さを比率に使い、近くの無音に吸着させる"""
    if len(chunks) == 1:
        return []
    if shutil.which("open_jtalk"):
        lens = [len(trim(openjtalk(c, cfg))) for c in chunks]
    else:  # Windows など Open JTalk がない環境では文字数の比率で近似（このあと無音に吸着させる）
        lens = [max(1, len(c)) for c in chunks]
    total = len(x) / SR
    cum = np.cumsum(lens)[:-1] / sum(lens) * total
    win = int(0.01 * SR)
    n = len(x) // win
    rms = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(1))
    rms = np.convolve(rms, np.ones(3) / 3, mode="same")
    out = []
    for t in cum:
        c = int(t / 0.01)
        lo, hi = max(1, c - 18), min(n - 1, c + 18)
        k = lo + int(np.argmin(rms[lo:hi]))
        out.append(round(k * 0.01, 3))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--engine", choices=["openjtalk", "fal"], default=None)
    ap.add_argument("--only", type=int, nargs="*", help="作り直す文の番号（1始まり）")
    a = ap.parse_args()
    ep = Path(a.episode).resolve()
    script = json.loads((ep / "script.json").read_text(encoding="utf-8"))
    cfg = script.get("voice", {})
    engine = a.engine or cfg.get("engine", "openjtalk")
    out = ep / "audio"
    out.mkdir(exist_ok=True)
    timing_path = out / "timing.json"
    timing = json.loads(timing_path.read_text(encoding="utf-8")) if timing_path.exists() else {}
    if engine == "fal":
        import fal_api
        fal_api.load_key()   # キーが無ければここで止まる
        # 承認ゲート（fail closed）：本人が試聴して approve するまで、全文の生成はしない
        if not fal_api.is_approved():
            raise SystemExit("クローン声がまだ承認されていません。\n"
                             "  python tools/fal_api.py clone <音声> --start <秒> --seconds 90\n"
                             "  python tools/fal_api.py tts \"試しの一文\" test.wav  → 聞いて本人の声か確認\n"
                             "  python tools/fal_api.py approve")
    voice_id = fal_voice_id(ep, cfg) if engine == "fal" else None

    for i, line in enumerate(script["lines"], 1):
        if a.only and i not in a.only:
            continue
        chunks = tts_chunks(line)
        text = "".join(chunks)
        x = openjtalk(text, cfg) if engine == "openjtalk" else fal_tts(text, cfg, voice_id)
        x = normalize(trim(x))
        sf.write(out / f"line_{i:02d}.wav", x, SR)
        timing[f"{i:02d}"] = {"engine": engine, "tts": text, "dur": round(len(x) / SR, 3),
                              "bounds": chunk_bounds(x, chunks, cfg)}
        print(f"{i:02d} {len(x) / SR:5.2f}s {text}")
    timing_path.write_text(encoding="utf-8", data=json.dumps(timing, ensure_ascii=False, indent=1))
    total = sum(v["dur"] for v in timing.values())
    print(f"音声合計 {total:.1f}s（{len(timing)}文）")


if __name__ == "__main__":
    main()
