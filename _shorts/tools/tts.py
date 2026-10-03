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
FAL_READ = {"エーアイ": "AI", "エイアイ": "AI", "税引き": "ぜいびき", "元本": "がんぽん"}   # 読み違えやすい語もここで直す


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


# ---------- フィラー（「えー」「えーっと」）対策 ----------
# クローン元の収録にある口ぐせを MiniMax がまねて、文の頭に「えー」を足すことがある。
# 2つの方法で見つける:
#  1) 音の形: 文の最初の言葉が長いはずなのに、頭に短い声のかたまり → 間 → 本文、になっている
#  2) Whisper で文字起こしして、台本に無い「えー」「えっと」「あの」で始まっている
# 見つけたら、1) はそのかたまりを切り落とす。2) だけのときは作り直す（最大 FILLER_RETRY 回）。
# 「えーっと」「うーん」などはそれだけで口ぐせ。「えー」「あの」「まあ」は、すぐ後ろに読点・空白があるときだけ
FILLER_RE = re.compile(r"^(?:(?:え[ーぇ〜~]*っと|ええと|えーと|あの[ーぉ〜~]+|う[ーぅ〜~]+ん|ん[ーっ〜~]+)"
                       r"|(?:え[ーぇ〜~]*|あの|ま[あー]+)(?=[、。,.!！?？…\s]))[、。,.!！?？…\s]*")
FILLER_RETRY = 3


def islands(x: np.ndarray, thr_db=-32, merge=0.12) -> list[tuple[float, float]]:
    """声が出ている区間（秒）。merge 秒より短いすき間はつなぐ"""
    win = int(0.01 * SR)
    n = len(x) // win
    rms = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(1) + 1e-12)
    on = 20 * np.log10(rms / (rms.max() + 1e-12)) > thr_db
    out = []
    for i, v in enumerate(on):
        t = i * 0.01
        if v and (not out or t - out[-1][1] > merge):
            out.append([t, t + 0.01])
        elif v:
            out[-1][1] = t + 0.01
    return [(a, b) for a, b in out]


def filler_cut_by_gap(x: np.ndarray, text: str) -> float:
    """頭の短いかたまり（えー）の後ろの切り位置（秒）。見つからなければ 0"""
    head = re.split(r"[、。？?！!…]", text)[0]
    body = re.sub(r"[、。？?！!…「」『』\s]", "", text)
    if FILLER_RE.match(text) or len(head) < 5:     # 台本自体が「えー」／最初の言葉が短い文は判定しない
        return 0.0
    isl = islands(x)
    if len(isl) < 2:
        return 0.0
    # 最初の「0.2秒以上の間」までを頭のかたまりとみなす（「えーっ|と」のように途中で切れても一つにする）
    j = next((k for k in range(len(isl) - 1) if isl[k + 1][0] - isl[k][1] >= 0.2), None)
    if j is None:
        return 0.0
    (s0, e0), (s1, _) = (isl[0][0], isl[j][1]), isl[j + 1]
    voiced = sum(b - a for a, b in isl)
    expect_head = voiced * len(head) / max(1, len(body))   # 最初の言葉にかかるはずの時間（話す速さから見積もる）
    # 頭のかたまりが、最初の言葉の半分にも満たない長さで、そのあと間が空いている → 「えー」
    if 0.12 <= e0 - s0 <= 0.9 and e0 - s0 < 0.5 * expect_head and s1 - e0 >= 0.2:
        return max(e0, s1 - 0.04)
    return 0.0


def filler_by_whisper(x: np.ndarray, text: str) -> bool:
    import fal_api
    if FILLER_RE.match(text):
        return False
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "a.wav"
        sf.write(wav, x, SR)
        try:
            heard = fal_api.transcribe(wav).get("text", "").strip()
        except Exception as e:  # 文字起こしが失敗しても、読み上げ自体は止めない
            print(f"   （文字起こしできず、フィラーの確認を飛ばします: {str(e)[:80]}）", flush=True)
            return False
    return bool(FILLER_RE.match(heard))


def fal_line(text: str, cfg: dict, voice_id: str, check=True) -> tuple[np.ndarray, str]:
    """クローン声で1文を作り、頭のフィラーを取り除く。戻り値は (音声, 処理のメモ)"""
    note = ""
    for attempt in range(1, FILLER_RETRY + 1):
        x = trim(fal_tts(text, cfg, voice_id))
        if not check:
            return x, ""
        cut = filler_cut_by_gap(x, text)
        if cut:
            return trim(x[int(cut * SR):]), f"頭の「えー」を {cut:.2f}秒 切りました"
        if not filler_by_whisper(x, text):
            return x, (f"作り直し {attempt - 1} 回でフィラーなし" if attempt > 1 else "")
        note = f"頭に「えー」が聞こえるため作り直し（{attempt}/{FILLER_RETRY}）"
        print("   " + note, flush=True)
    return x, "要確認: 作り直しても頭に「えー」が残っているかも"


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


# ---------- 尺合わせ ----------
# クローン声は毎回少しずつ長さが変わる（「えー」を切ったかどうかでも数秒動く）。
# 全文を作り終えたら動画の尺を見積もり、55.5〜59.5秒から外れていれば、全文の話す速さを
# 同じ割合で少しだけ変えて収める（音の高さは変えない。変える幅は 0.94〜1.10 倍まで）。
FIT_MIN, FIT_MAX = 55.5, 59.5


def predicted_total(script: dict, timing: dict) -> float:
    import render as R
    n = len(script["lines"])
    heads = sum(1 for i, ln in enumerate(script["lines"], 1) if ln.get("heading") and i > 1)
    speech = sum(timing[f"{i:02d}"]["dur"] for i in range(1, n + 1))
    return R.LEAD + speech + R.GAP * (n - 1) + R.SECTION_GAP * heads + R.TAIL


def stretch(src: Path, dst: Path, tempo: float) -> np.ndarray:
    if abs(tempo - 1) < 0.002:
        x, _ = sf.read(src, dtype="float32")
    else:
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "s.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter:a", f"atempo={tempo:.4f}",
                            "-ac", "1", "-ar", str(SR), str(out)], check=True)
            x, _ = sf.read(out, dtype="float32")
    sf.write(dst, x, SR)
    return x


def fit_length(script: dict, timing: dict, out: Path) -> float:
    """元の音声（line_XX_raw.wav）から、尺が収まる速さで line_XX.wav を作り直す。戻り値は速さの倍率"""
    n = len(script["lines"])
    for i in range(1, n + 1):
        k = f"{i:02d}"
        raw = out / f"line_{k}_raw.wav"
        if not raw.exists():                      # 以前の版で作った文は、今の音声を元として扱う
            shutil.copy(out / f"line_{k}.wav", raw)
            timing[k]["raw_dur"], timing[k]["raw_bounds"] = timing[k]["dur"], timing[k]["bounds"]
        timing[k]["dur"], timing[k]["bounds"] = timing[k]["raw_dur"], timing[k]["raw_bounds"]
    total = predicted_total(script, timing)
    speech = sum(timing[f"{i:02d}"]["dur"] for i in range(1, n + 1))
    tempo = 1.0
    if total > FIT_MAX:
        tempo = min(1.10, speech / (speech - (total - (FIT_MAX - 0.3))))
    elif total < FIT_MIN:
        tempo = max(0.94, speech / (speech + ((FIT_MIN + 0.3) - total)))
    for i in range(1, n + 1):
        k = f"{i:02d}"
        x = stretch(out / f"line_{k}_raw.wav", out / f"line_{k}.wav", tempo)
        timing[k]["dur"] = round(len(x) / SR, 3)
        timing[k]["bounds"] = [round(b / tempo, 3) for b in timing[k]["raw_bounds"]]
        timing[k]["tempo"] = round(tempo, 4)
    return tempo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode")
    ap.add_argument("--engine", choices=["openjtalk", "fal"], default=None)
    ap.add_argument("--only", type=int, nargs="*", help="作り直す文の番号（1始まり）")
    ap.add_argument("--no-filler-check", action="store_true", help="頭の「えー」の確認をしない（速いが、残ることがある）")
    ap.add_argument("--no-fit", action="store_true", help="尺合わせ（話す速さの微調整）をしない")
    ap.add_argument("--fit-only", action="store_true", help="音声は作らず、今ある音声で尺合わせだけやる（お金はかからない）")
    a = ap.parse_args()
    ep = Path(a.episode).resolve()
    script = json.loads((ep / "script.json").read_text(encoding="utf-8"))
    cfg = script.get("voice", {})
    engine = a.engine or cfg.get("engine", "openjtalk")
    out = ep / "audio"
    out.mkdir(exist_ok=True)
    timing_path = out / "timing.json"
    timing = json.loads(timing_path.read_text(encoding="utf-8")) if timing_path.exists() else {}
    if a.fit_only:
        tempo = fit_length(script, timing, out)
        timing_path.write_text(encoding="utf-8", data=json.dumps(timing, ensure_ascii=False, indent=1))
        print(f"尺合わせ: 話す速さ {tempo:.3f} 倍（動画 {predicted_total(script, timing):.1f} 秒の見込み）")
        return
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

    suspects = []
    for i, line in enumerate(script["lines"], 1):
        if a.only and i not in a.only:
            continue
        chunks = tts_chunks(line)
        text = "".join(chunks)
        note = ""
        if engine == "openjtalk":
            x = openjtalk(text, cfg)
        else:
            x, note = fal_line(text, cfg, voice_id, check=not a.no_filler_check)
            if note.startswith("要確認"):
                suspects.append(i)
        x = normalize(trim(x))
        sf.write(out / f"line_{i:02d}.wav", x, SR)
        sf.write(out / f"line_{i:02d}_raw.wav", x, SR)
        bounds = chunk_bounds(x, chunks, cfg)
        timing[f"{i:02d}"] = {"engine": engine, "tts": text, "dur": round(len(x) / SR, 3), "bounds": bounds,
                              "raw_dur": round(len(x) / SR, 3), "raw_bounds": bounds}
        if note:
            timing[f"{i:02d}"]["filler"] = note
        print(f"{i:02d} {len(x) / SR:5.2f}s {text}" + (f"  ← {note}" if note else ""), flush=True)
    n = len(script["lines"])
    timing = {k: v for k, v in timing.items() if int(k) <= n}      # 文を減らしたときの古い分を消す
    if not a.no_fit and all(f"{i:02d}" in timing for i in range(1, n + 1)):
        tempo = fit_length(script, timing, out)
        if abs(tempo - 1) >= 0.002:
            print(f"尺合わせ: 話す速さを {tempo:.3f} 倍にしました（動画 {predicted_total(script, timing):.1f} 秒の見込み）")
    timing_path.write_text(encoding="utf-8", data=json.dumps(timing, ensure_ascii=False, indent=1))
    total = sum(v["dur"] for v in timing.values())
    print(f"音声合計 {total:.1f}s（{len(timing)}文）")
    if suspects:
        nums = " ".join(str(n) for n in suspects)
        print(f"\n要確認: 文 {nums} の頭に「えー」が残っているかもしれません。聞いて気になれば\n"
              f"  python tools/tts.py {a.episode} --engine fal --only {nums}\nで作り直せます")


if __name__ == "__main__":
    main()
