"""⑧ 完成動画の機械検品（軍配 review-protocol の「機械検品」を動画向けにしたもの）

  python3 tools/qa.py episodes/ep01

検査内容
  A. 音声 … 台本どおりに読んでいるか
       - assets/.fal_key があれば fal の Whisper で文字起こしして台本と照合
       - なければ音声合成エンジン（Open JTalk）の実際の読み（音素）をカタカナにして照合用に出力し、
         英字の綴り読み・数字の読み・難読語を自動で拾う
       - 書き出した mp4 の各文の区間に声が入っているか
  B. 画面 … 1秒ごとのコマを並べたシート、テロップの安全領域・縮小率・表示時間、
       フォントにない文字（文字の欠け）、図解パネルからのはみ出し
  C. 音量 … ラウドネス（-14 LUFS 目安）、トゥルーピーク、文ごとの声量差、効果音と声の比
  D. 台本ルール … 文字数、冒頭の問いかけ、AIっぽい言い回し、尺
出力: <ep>/out/qa/qa_report.md, qa.json, frames_*.png
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
import soundfile as sf
from fontTools.ttLib import TTCollection, TTFont
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render as R  # noqa: E402
from tts import OJT_DIC, OJT_VOICE, plain  # noqa: E402

SR = 48000
AI_WORDS = ["これにより", "さらに", "重要", "不可欠", "ぜひ", "いかがでしたか", "しましょう", "結論から言うと",
            "解説します", "魅力的", "画期的", "革新的", "最適", "活用", "実現", "可能性があります", "について",
            "徹底", "完全ガイド", "必見", "神", "最強"]
# 期待する読み（音素をカナにしたときの表記。長音は「オ」になる：今日→キョオ）
RISKY_READ = {"一時": "イチジ", "最中": "サイチュウ", "今日": "キョオ", "上手": "ジョオズ", "生憎": "アイニク"}

# ---------------- A. 音声 ----------------
KANA = {
    "a": "ア", "i": "イ", "u": "ウ", "e": "エ", "o": "オ", "N": "ン", "cl": "ッ",
}
CV = {"k": "カキクケコ", "g": "ガギグゲゴ", "s": "サシスセソ", "z": "ザジズゼゾ", "t": "タチツテト", "d": "ダヂヅデド",
      "n": "ナニヌネノ", "h": "ハヒフヘホ", "b": "バビブベボ", "p": "パピプペポ", "m": "マミムメモ", "r": "ラリルレロ"}
YOON = {"ky": "キ", "gy": "ギ", "sh": "シ", "j": "ジ", "ch": "チ", "ny": "ニ", "hy": "ヒ", "by": "ビ", "py": "ピ",
        "my": "ミ", "ry": "リ", "ty": "テ", "dy": "デ"}
SMALL = {"a": "ャ", "u": "ュ", "o": "ョ", "e": "ェ", "i": "ィ"}
VIDX = "aiueo"


def phonemes(text):
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "t.txt").write_text(text, encoding="utf-8")
        subprocess.run(["open_jtalk", "-x", OJT_DIC, "-m", OJT_VOICE, "-ot", f"{d}/t.trace", "-ow", "/dev/null",
                        f"{d}/t.txt"], check=True)
        lab = (Path(d) / "t.trace").read_text(encoding="utf-8", errors="ignore")
    seg = lab.split("[Output label]")[-1] if "[Output label]" in lab else lab
    ph = [p[1] for p in re.findall(r"\^([^-]+)-([^+]+)\+", seg)]
    # トレースにはラベル列が2回出るので、最初の発話（sil〜sil）だけ使う
    start = next((i for i, p in enumerate(ph) if p != "sil"), 0)
    end = next((i for i in range(start, len(ph)) if ph[i] == "sil"), len(ph))
    return ph[start:end]


def to_kana(phs):
    out, i = [], 0
    while i < len(phs):
        p = phs[i]
        nxt = phs[i + 1].lower() if i + 1 < len(phs) else ""
        if p in ("sil", "pau"):
            out.append("、" if p == "pau" else "")
        elif p.lower() in VIDX:
            out.append("アイウエオ"[VIDX.index(p.lower())])
        elif p in KANA:
            out.append(KANA[p])
        elif nxt in VIDX:
            v = VIDX.index(nxt)
            if p in YOON:
                base = YOON[p]
                out.append(base if (nxt == "i" and p in ("sh", "j", "ch")) else base + SMALL[nxt])
            elif p in CV:
                out.append(CV[p][v])
            elif p == "ts":
                out.append("ツ" if nxt == "u" else "ツ" + SMALL[nxt])
            elif p == "f":
                out.append("フ" if nxt == "u" else "フ" + SMALL[nxt])
            elif p == "y":
                out.append({"a": "ヤ", "u": "ユ", "o": "ヨ", "e": "イェ"}.get(nxt, "イ"))
            elif p == "w":
                out.append({"a": "ワ", "o": "ヲ"}.get(nxt, "ウ" + SMALL.get(nxt, "")))
            elif p == "v":
                out.append("ヴ" + ("" if nxt == "u" else SMALL[nxt]))
            else:
                out.append(p)
            i += 1
        else:
            out.append(p)
        i += 1
    return "".join(out).strip("、")


def fal_transcribe(wav_path):
    import fal_api
    return fal_api.transcribe(Path(wav_path))


def norm(s):
    s = plain(s).replace("／", "")
    return re.sub(r"[、。！？!?「」『』…\s]", "", s)


def check_audio(ep, script, tl, final_mp4, rep):
    lines = tl["lines"]
    timing = json.loads((ep / "audio" / "timing.json").read_text(encoding="utf-8"))
    rows, issues = [], []
    engine = next(iter(timing.values()))["engine"]
    # 最終 mp4 から音声を取り出す
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "final.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(final_mp4), "-ac", "1", "-ar", str(SR), str(wav)], check=True)
        final, _ = sf.read(wav, dtype="float32")
        asr = None
        if (Path(__file__).resolve().parent.parent / "assets" / ".fal_key").exists():
            try:
                asr = fal_transcribe(wav)
            except Exception as e:  # ネットワーク不可など
                rep["asr_error"] = str(e)[:300]
    voice, _ = sf.read(ep / "out" / "voice_only.wav", dtype="float32")
    # 最終音声と声トラックのずれ（相互相関、±0.5秒）
    hop = 480
    def env(x):
        n = len(x) // hop
        return np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1))
    ef, ev = env(final), env(voice)
    n = min(len(ef), len(ev))
    ef, ev = ef[:n] - ef[:n].mean(), ev[:n] - ev[:n].mean()
    lags = range(-50, 51)
    cc = [np.dot(ef[max(0, l):n + min(0, l)], ev[max(0, -l):n - max(0, l)]) for l in lags]
    lag = list(lags)[int(np.argmax(cc))] * hop / SR
    rep["audio_sync_offset_s"] = round(lag, 3)
    if abs(lag) > 0.02:
        issues.append(f"音ズレ: 最終動画の音声が声トラックから {lag:+.3f}s ずれている")
    for ln, src in zip(lines, script["lines"]):
        a, b = int(ln["start"] * SR), int(ln["end"] * SR)
        seg = final[a:b]
        rms_db = 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)
        tts_text = plain((src.get("tts") or src["text"]).replace("／", ""))
        # 音素での読み確認は Open JTalk がある環境（仮の声）だけ。クローン声は Whisper で照合する
        kana = to_kana(phonemes(tts_text)) if engine == "openjtalk" and shutil.which("open_jtalk") else ""
        flags = []
        if re.search(r"[A-Za-z]", tts_text):
            flags.append("英字をそのまま読ませている（綴り読みの恐れ）")
        if re.search(r"[0-9０-９]", tts_text):
            flags.append("数字をそのまま読ませている（読み違いの恐れ）")
        for w, good in RISKY_READ.items():
            if kana and good and w in tts_text and good not in kana:
                flags.append(f"「{w}」の読みが {good} になっていない")
        if rms_db < -40:
            flags.append(f"区間がほぼ無音（{rms_db:.1f} dBFS）")
        rows.append({"i": ln["i"], "script": plain(src["text"]).replace("／", ""), "tts": tts_text,
                     "reading": kana, "rms_db": round(float(rms_db), 1), "flags": flags})
        issues += [f"{ln['i']:02d}: {f}" for f in flags]
    if asr:
        full = norm("".join(r["script"] for r in rows))
        got = norm(asr.get("text", ""))
        ratio = SequenceMatcher(None, full, got).ratio()
        rep["asr"] = {"engine": "fal-ai/whisper", "text": asr.get("text", ""), "match_ratio": round(ratio, 3)}
        if ratio < 0.9:
            issues.append(f"文字起こしと台本の一致率が低い（{ratio:.2f}）")
    else:
        rep["asr"] = {"engine": None, "note": "Whisper 等の文字起こしモデルをこの環境で入手できなかったため未実施。"
                      "音声合成エンジンの実際の読み（音素）で代替検査。assets/.fal_key を置くと fal の Whisper で自動実施。"}
    rep["audio_lines"] = rows
    return issues


# ---------------- B. 画面 ----------------
def cmap_of(path):
    if path.endswith(".ttc"):
        return set(TTCollection(path).fonts[0].getBestCmap().keys())
    return set(TTFont(path).getBestCmap().keys())


def visual_texts(v):
    out = []
    def walk(x):
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, dict):
            for k, y in x.items():
                if k not in ("type", "emoji", "icons", "icon") and not k.startswith("_"):
                    walk(y)
        elif isinstance(x, list):
            for y in x:
                walk(y)
    walk(v)
    return out


def emoji_of(v):
    es = []
    if v.get("emoji"):
        es.append(v["emoji"])
    for c in (v.get("left"), v.get("right")):
        if c and c.get("emoji"):
            es.append(c["emoji"])
    es += list((v.get("icons") or {}).values())
    if v.get("icon"):
        es.append(v["icon"])
    for m in v.get("msgs", []):
        if m.get("emoji"):
            es.append(m["emoji"])
    return es


def check_frames(ep, script, tl, final_mp4, rep, qa_dir):
    issues = []
    # 1秒ごとのコマ
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(final_mp4), "-vf", "fps=1", f"{d}/f_%03d.png"], check=True)
        frames = sorted(Path(d).glob("f_*.png"))
        per = 20
        for s in range(0, len(frames), per):
            batch = frames[s:s + per]
            tw, th = 270, 480
            sheet = Image.new("RGB", (tw * 5, (th + 34) * ((len(batch) + 4) // 5)), (20, 20, 30))
            for k, f in enumerate(batch):
                im = Image.open(f).resize((tw, th))
                x, y = (k % 5) * tw, (k // 5) * (th + 34)
                sheet.paste(im, (x, y + 34))
                ImageDraw.Draw(sheet).text((x + 8, y + 4), f"{s + k:02d}s", font=R.font(R.F_BLACK, 24), fill=(255, 230, 80))
            sheet.save(qa_dir / f"frames_{s:02d}-{s + len(batch) - 1:02d}s.png")
        rep["frame_count_checked"] = len(frames)
    # 文字の欠け（フォントにない文字）
    telop_cmap, black_cmap, bold_cmap = cmap_of(R.F_TELOP), cmap_of(R.F_BLACK), cmap_of(R.F_BOLD)
    missing = set()
    for ln in tl["lines"]:
        for c in ln["chunks"]:
            for ch in plain(c["text"]).replace("\n", ""):
                if ord(ch) not in telop_cmap:
                    missing.add(("テロップ", ch))
        v = ln.get("visual") or {}
        for t in visual_texts(v):
            for ch in plain(t).replace("\n", ""):
                if ord(ch) not in black_cmap or ord(ch) not in bold_cmap:
                    missing.add(("図解", ch))
        for e in emoji_of(v):
            if R.emoji_base(e) is None:
                missing.add(("絵文字", e))
    for kind, ch in sorted(missing):
        issues.append(f"文字の欠け: {kind}のフォントに「{ch}」(U+{ord(ch[0]):04X}) がない")
    # テロップ: 安全領域・縮小率・表示時間
    sx0, sy0, sx1, sy1 = tl["safe"]
    trows = []
    for ln in tl["lines"]:
        nxt_start = None
        for c_i, c in enumerate(ln["chunks"]):
            x0, y0, x1, y1 = c["box"]
            end = ln["chunks"][c_i + 1]["t"] if c_i + 1 < len(ln["chunks"]) else ln["end"]
            dur = end - c["t"]
            ti = R.telop_image(c["text"])
            # 縮小率 = 実際の高さ / 縮小なしの想定高さ
            lines_n = max(1, round(ti.height / 150))
            natural_w = R.rich_width(c["text"].split("\n")[0], R.TELOP_SIZE, R.F_TELOP, R.TELOP_EMPH)
            scale = c.get("scale") or (min(1.0, R.TELOP_IMG_MAXW / (natural_w + 60)) if lines_n == 1 else 1.0)
            ok_safe = x0 >= sx0 and x1 <= sx1 and y0 >= sy0 and y1 <= sy1
            trows.append({"line": ln["i"], "text": c["text"], "box": c["box"], "dur": round(dur, 2),
                          "scale": round(scale, 2), "safe": ok_safe})
            if not ok_safe:
                issues.append(f"{ln['i']:02d}「{plain(c['text'])}」: テロップが安全領域の外 {c['box']}")
            if scale < 0.8:
                issues.append(f"{ln['i']:02d}「{plain(c['text'])}」: テロップを {scale:.2f} 倍まで縮小（小さすぎ）")
            if dur < 0.5:
                issues.append(f"{ln['i']:02d}「{plain(c['text'])}」: 表示 {dur:.2f}s は短すぎて読めない")
    rep["telops"] = trows
    # 図解のはみ出し（パネル端に描画が触れていないか）
    seen = set()
    for ln in tl["lines"]:
        v = ln.get("visual")
        if not v:
            continue
        key = json.dumps(v, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        layer = R.VISUALS[v["type"]](v, 3.0, True)
        a = np.asarray(layer.getchannel("A"))
        band = 3
        edges = {"上": a[:band].max(), "下": a[-band:].max(), "左": a[:, :band].max(), "右": a[:, -band:].max()}
        hit = [k for k, m in edges.items() if m > 40]
        if hit and v["type"] != "chat":
            issues.append(f"{ln['i']:02d}: 図解（{v['type']}）がパネルの{'・'.join(hit)}端にはみ出している可能性")
    return issues


# ---------------- C. 音量 ----------------
def ebur128(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-filter_complex",
                        "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    s = r.stderr[r.stderr.rfind("Summary:"):]
    get = lambda k: float(re.search(k + r":\s+(-?[\d.]+)", s).group(1))
    return {"I_LUFS": get("I"), "LRA_LU": get("LRA"), "TruePeak_dBTP": get("Peak")}


def check_levels(ep, tl, final_mp4, rep):
    issues = []
    lv = ebur128(final_mp4)
    rep["loudness"] = lv
    if not (-15.5 <= lv["I_LUFS"] <= -12.5):
        issues.append(f"ラウドネス {lv['I_LUFS']} LUFS（目安 -14±1.5）")
    if lv["TruePeak_dBTP"] > -1.0:
        issues.append(f"トゥルーピーク {lv['TruePeak_dBTP']} dBTP（-1.0 以下に）")
    voice, _ = sf.read(ep / "out" / "voice_only.wav", dtype="float32")
    fx, _ = sf.read(ep / "out" / "sfx_only.wav", dtype="float32")
    # 文ごとの声量（話している部分の RMS）
    per = []
    for ln in tl["lines"]:
        seg = voice[int(ln["start"] * SR):int(ln["end"] * SR)]
        w = 960
        n = len(seg) // w
        r = np.sqrt((seg[:n * w].reshape(n, w) ** 2).mean(1))
        r = r[r > r.max() * 0.1]
        per.append(20 * np.log10(np.sqrt((r ** 2).mean()) + 1e-9))
    per = np.array(per)
    rep["line_level_db"] = [round(float(x), 1) for x in per]
    spread = float(per.max() - per.min())
    rep["line_level_spread_db"] = round(spread, 1)
    if spread > 4:
        issues.append(f"文ごとの声量差が {spread:.1f} dB（4 dB 以内に）")
    vpk = 20 * np.log10(np.abs(voice).max() + 1e-9)
    vrms = float(np.median(per))
    ev = []
    for t, name, g in tl["events"]:
        a = int(t * SR)
        seg = fx[a:a + int(0.9 * SR)]
        pk = 20 * np.log10(np.abs(seg).max() + 1e-9)
        w = 960
        n = max(1, len(seg) // w)
        rms = 20 * np.log10(np.sqrt((seg[:n * w].reshape(n, w) ** 2).mean(1)).max() + 1e-9)
        rel = rms - vrms
        ev.append({"t": round(t, 2), "sfx": name, "peak_dbfs": round(float(pk), 1),
                   "loudest_rms_vs_voice_db": round(float(rel), 1)})
        limit = 3.0 if name == "hook" else -4.0
        if rel > limit:
            issues.append(f"{t:5.2f}s 効果音「{name}」が声より大きい（声比 {rel:+.1f} dB、上限 {limit:+.0f} dB）")
        if rel < -24:
            issues.append(f"{t:5.2f}s 効果音「{name}」が小さすぎて聞こえない（声比 {rel:+.1f} dB）")
    rep["sfx_events"] = ev
    rep["sfx_count"] = len(ev)
    if len(ev) > 8:
        issues.append(f"効果音が {len(ev)} 回（控えめにするなら 8 回以内）")
    return issues


# ---------------- D. 台本 ----------------
def check_script(script, tl, rep):
    issues = []
    rows = []
    for i, ln in enumerate(script["lines"], 1):
        t = plain(ln["text"]).replace("／", "")
        n = len(t)
        rows.append({"i": i, "chars": n, "text": t})
        if not 14 <= n <= 25:
            issues.append(f"{i:02d}: {n}文字（20文字前後に）")
        for w in AI_WORDS:
            if w in t:
                issues.append(f"{i:02d}: AIっぽい言い回し「{w}」")
    rep["script_lines"] = rows
    first = plain(script["lines"][0]["text"])
    if not first.rstrip().endswith(("？", "?")):
        issues.append("1文目が問いかけ（？）で終わっていない")
    if not (55 <= tl["total"] <= 60.5):
        issues.append(f"尺 {tl['total']:.1f}s（55〜60秒に）")
    rep["duration_s"] = round(tl["total"], 2)
    return issues


def main():
    ep = Path(sys.argv[1]).resolve()
    out = ep / "out"
    qa_dir = out / "qa"
    qa_dir.mkdir(exist_ok=True)
    script = json.loads((ep / "script.json").read_text(encoding="utf-8"))
    tl = json.loads((out / "timeline.json").read_text(encoding="utf-8"))
    final = out / f"{ep.name}.mp4"
    rep, sections = {}, {}
    sections["A 音声（台本どおりか）"] = check_audio(ep, script, tl, final, rep)
    sections["B 画面（欠け・はみ出し）"] = check_frames(ep, script, tl, final, rep, qa_dir)
    sections["C 音量（声・効果音）"] = check_levels(ep, tl, final, rep)
    sections["D 台本ルール"] = check_script(script, tl, rep)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate,sample_rate,channels",
                            "-show_entries", "format=duration,size", "-of", "json", str(final)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    rep["file"] = json.loads(probe.stdout)
    rep["sections"] = sections
    (qa_dir / "qa.json").write_text(encoding="utf-8", data=json.dumps(rep, ensure_ascii=False, indent=1))

    L = [f"# 機械検品レポート: {ep.name}", ""]
    total = sum(len(v) for v in sections.values())
    L.append(f"**判定: {'通過（指摘 0 件）' if total == 0 else f'要修正（指摘 {total} 件）'}**")
    L.append("")
    for k, v in sections.items():
        L.append(f"## {k} … {'OK' if not v else f'{len(v)} 件'}")
        L += [f"- {x}" for x in v] or ["- 指摘なし"]
        L.append("")
    lv = rep["loudness"]
    L += ["## 数値", "",
          f"- 尺: {rep['duration_s']} 秒 / 1秒ごとのコマ {rep['frame_count_checked']} 枚を確認（frames_*.png）",
          f"- ラウドネス: {lv['I_LUFS']} LUFS / LRA {lv['LRA_LU']} LU / トゥルーピーク {lv['TruePeak_dBTP']} dBTP",
          f"- 文ごとの声量差: {rep['line_level_spread_db']} dB",
          f"- 音ズレ: {rep['audio_sync_offset_s']} 秒",
          f"- 効果音: {rep['sfx_count']} 回", ""]
    L += ["| 時刻 | 効果音 | ピーク dBFS | 声との差 dB |", "|---|---|---|---|"]
    L += [f"| {e['t']}s | {e['sfx']} | {e['peak_dbfs']} | {e['loudest_rms_vs_voice_db']:+} |" for e in rep["sfx_events"]]
    L += ["", "## 読み上げの照合", "", rep["asr"].get("note", f"一致率 {rep['asr'].get('match_ratio')}"), "",
          "| # | 台本 | エンジンが実際に読んだ音 | 区間の音量 |", "|---|---|---|---|"]
    L += [f"| {r['i']:02d} | {r['script']} | {r['reading']} | {r['rms_db']} dBFS |" for r in rep["audio_lines"]]
    L += ["", "## テロップ", "", "| # | テロップ | 表示秒 | 縮小率 | 安全領域 |", "|---|---|---|---|---|"]
    L += [f"| {t['line']:02d} | {plain(t['text'])} | {t['dur']} | {t['scale']} | {'OK' if t['safe'] else 'NG'} |" for t in rep["telops"]]
    (qa_dir / "qa_report.md").write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L[:40]))


if __name__ == "__main__":
    main()
