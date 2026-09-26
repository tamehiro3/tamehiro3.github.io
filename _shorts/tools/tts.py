"""台本を1文ずつ音声にする。

  python3 tools/tts.py episodes/ep01                 # 仮ナレーション（Open JTalk、ローカル）
  python3 tools/tts.py episodes/ep01 --engine fal    # ためひろさんのクローン声（fal / MiniMax）

出力: <ep>/audio/line_XX.wav（48kHz mono）と <ep>/audio/timing.json
timing.json には各文の長さと、テロップを切り替える区切り（／）の時刻が入る。
"""
import argparse
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

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
def fal_voice_id(ep: Path, cfg: dict) -> str:
    import fal_client

    cache = ROOT / "voice_ref" / "voice_id.json"
    if cache.exists():
        return json.loads(cache.read_text())["custom_voice_id"]
    # VOICE_REF_URL があれば、ファイルをリポジトリに置かずにそのURLから fal に取り込ませる
    url, source = os.environ.get("VOICE_REF_URL"), "VOICE_REF_URL"
    if not url:
        refs = sorted(p for p in (ROOT / "voice_ref").glob("*") if p.suffix.lower() in (".wav", ".mp3", ".m4a"))
        if not refs:
            raise SystemExit("voice_ref/ に ためひろさんの声（10秒〜3分、1人で話している音声）を置いてください")
        source = refs[0].name
        # 長い収録は、VOICE_REF_START 秒目から VOICE_REF_SECONDS 秒（既定 90 秒）だけ切り出して使う
        start = os.environ.get("VOICE_REF_START", "0")
        secs = os.environ.get("VOICE_REF_SECONDS", "90")
        with tempfile.TemporaryDirectory() as d:
            clip = Path(d) / "ref.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", start, "-t", secs, "-i", str(refs[0]),
                            "-ac", "1", "-ar", "44100", str(clip)], check=True)
            url = fal_client.upload_file(str(clip))
    res = fal_client.subscribe(cfg.get("clone_model", "fal-ai/minimax/voice-clone"), arguments={
        "audio_url": url, "noise_reduction": True, "need_volume_normalization": True})
    vid = res["custom_voice_id"]
    cache.write_text(json.dumps({"custom_voice_id": vid, "source": source}, ensure_ascii=False))
    return vid


def fal_tts(text: str, cfg: dict, voice_id: str) -> np.ndarray:
    import fal_client
    import urllib.request

    model = cfg.get("fal_model", "fal-ai/minimax/speech-02-hd")
    args = {"voice_setting": {"voice_id": voice_id, "speed": cfg.get("fal_speed", 1.15), "vol": 1.0,
                              "pitch": cfg.get("fal_pitch", 0), "emotion": cfg.get("emotion", "happy")},
            "language_boost": "Japanese", "output_format": "url"}
    try:
        res = fal_client.subscribe(model, arguments={"text": text, **args})
    except Exception as e:  # 新しいモデルは text ではなく prompt のことがある
        if "422" not in str(e) and "text" not in str(e):
            raise
        res = fal_client.subscribe(model, arguments={"prompt": text, **args})
    with tempfile.TemporaryDirectory() as d:
        src, wav = Path(d) / "a.mp3", Path(d) / "a.wav"
        urllib.request.urlretrieve(res["audio"]["url"], src)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", str(SR), str(wav)], check=True)
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
    lens = [len(trim(openjtalk(c, cfg))) for c in chunks]
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
    timing = json.loads(timing_path.read_text()) if timing_path.exists() else {}
    if engine == "fal" and not os.environ.get("FAL_KEY"):
        raise SystemExit("FAL_KEY が環境変数にありません")
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
    timing_path.write_text(json.dumps(timing, ensure_ascii=False, indent=1))
    total = sum(v["dur"] for v in timing.values())
    print(f"音声合計 {total:.1f}s（{len(timing)}文）")


if __name__ == "__main__":
    main()
