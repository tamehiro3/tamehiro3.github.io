"""fal API の呼び出しをまとめたモジュール（声のクローン＝MiniMax、読み上げ、文字起こし）。

APIキーはコードに書かず、_shorts/assets/.fal_key から読む（.gitignore 済み）。
ファイルの中身は「キーだけの1行」か「FAL_KEY=キー」のどちらでもよい。

  python3 tools/fal_api.py check                         # キーが読めるか（値は表示しない）
  python3 tools/fal_api.py selftest                      # 既製の声で1語だけ読ませ、キー・接続・API仕様を確かめる（数円程度）
  python3 tools/fal_api.py clone voice_ref/sample.m4a --start 60 --seconds 90
  python3 tools/fal_api.py clone https://example.com/voice.m4a
  python3 tools/fal_api.py tts "それ、ChatGPTに打ち込んで大丈夫？" test.wav   # 試聴用
  python3 tools/fal_api.py approve                       # 試聴して本人の声だと確認したら承認（これが無いと一括生成しない）
  python3 tools/fal_api.py transcribe episodes/ep01/out/ep01.mp4
"""
import argparse
import json
import os
import stat
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY_FILE = ROOT / "assets" / ".fal_key"
# Windows のメモ帳で保存すると「.fal_key.txt」になることがあるので、それも探す。
# いちばん安全なのはリポジトリの外（1つ上のフォルダ。例 C:\Users\3mori\SNS\）に置くこと。
# そこなら「★サイトを公開する.bat」（git add -A）でも絶対に公開されない。
_OUTSIDE = ROOT.parent.parent
KEY_CANDIDATES = [KEY_FILE, ROOT / "assets" / ".fal_key.txt",
                  _OUTSIDE / ".fal_key", _OUTSIDE / ".fal_key.txt", _OUTSIDE / "fal APIキー.txt"]
VOICE_CACHE = ROOT / "voice_ref" / "voice_id.json"

CLONE_MODEL = "fal-ai/minimax/voice-clone"
TTS_MODEL = "fal-ai/minimax/speech-02-hd"
ASR_MODEL = "fal-ai/whisper"


def extract_key(raw: bytes) -> str:
    """ファイルの中身からキーの部分だけを取り出す。
    メモ帳の BOM・Shift_JIS・全角文字・「APIキー：」のような見出しや説明が混ざっていてもよい。"""
    import re
    import unicodedata
    for enc in ("utf-8-sig", "cp932", "utf-16"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return ""
    text = unicodedata.normalize("NFKC", text)          # 全角の英数字・コロンを半角に
    # fal のキーは「ID:秘密の文字列」の形
    m = re.findall(r"[A-Za-z0-9][A-Za-z0-9_\-]{7,}:[A-Za-z0-9_\-]{16,}", text)
    if m:
        return max(m, key=len)
    tokens = [t for t in re.findall(r"[\x21-\x7e]+", text) if len(t) >= 20 and not t.upper().startswith("FAL_KEY")]
    tokens = [t.split("=", 1)[1] if t.upper().startswith("FAL_KEY=") else t for t in tokens]
    return max(tokens, key=len) if tokens else ""


def load_key() -> None:
    """assets/.fal_key を読んで fal_client 用の環境変数 FAL_KEY に入れる"""
    key_file = next((p for p in KEY_CANDIDATES if p.exists()), None)
    if key_file is None:
        raise SystemExit("fal のAPIキーが見つかりません。次のどれかに1行で保存してください:\n  "
                         + "\n  ".join(str(p) for p in KEY_CANDIDATES))
    key = extract_key(key_file.read_bytes())
    if not key:
        raise SystemExit(f"{key_file} の中にキーが見つかりません。\n"
                         "fal のダッシュボードの「API Keys」でコピーしたキー（英数字と : と - だけの文字列）を、"
                         "そのファイルに1行だけ貼ってください。見出しや説明は書かなくて大丈夫です")
    if os.name != "nt" and key_file.stat().st_mode & (stat.S_IRGRP | stat.S_IROTH):
        print(f"注意: {key_file.name} を他のユーザーも読めます。chmod 600 を推奨", file=sys.stderr)
    os.environ["FAL_KEY"] = key


def _client():
    load_key()
    try:
        import fal_client
    except ImportError:
        raise SystemExit("fal-client がありません: pip install fal-client")
    return fal_client


def _subscribe(model: str, args: dict) -> dict:
    fal = _client()
    try:
        return fal.subscribe(model, arguments=args, with_logs=False)
    except Exception as e:
        msg = str(e)
        if "401" in msg or "403" in msg:
            raise SystemExit(f"fal に認証で断られました（{model}）。キーが正しいか確認してください")
        raise


def upload(path: Path) -> str:
    return _client().upload_file(str(path))


def clone_voice(source: str, start: float = 0, seconds: float = 90, name: str = "", force: bool = False) -> str:
    """MiniMax で声をクローンして custom_voice_id を返す。
    source はローカルの音声ファイルか https URL。ローカルなら start 秒目から seconds 秒を切り出して送る。
    結果は voice_ref/voice_id.json に保存し、次回からはそれを使う（force=True で作り直し）。"""
    if VOICE_CACHE.exists() and not force:
        return json.loads(VOICE_CACHE.read_text())["custom_voice_id"]
    if source.startswith("https://"):
        url = source
    else:
        src = Path(source)
        if not src.exists():
            raise SystemExit(f"音声ファイル「{source}」が見つかりません。\n"
                             "「声のファイルのパス」の部分は、実際のファイルの場所に置き換えてください。\n"
                             "エクスプローラーで m4a ファイルを PowerShell の画面にドラッグすると、場所が自動で入ります。\n"
                             "例: python tools/fal_api.py clone \"C:\\Users\\3mori\\Documents\\AudioBlog\\音声メディアが生き残る理由.m4a\" --start 60 --seconds 90")
        with tempfile.TemporaryDirectory() as d:
            clip = Path(d) / "ref.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(seconds), "-i", str(src),
                            "-ac", "1", "-ar", "44100", str(clip)], check=True)
            if seconds < 10 or float(subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(clip)],
                    capture_output=True, text=True).stdout or 0) < 10:
                raise SystemExit("クローンには10秒以上の音声が必要です")
            url = upload(clip)
    res = _subscribe(CLONE_MODEL, {"audio_url": url, "noise_reduction": True, "need_volume_normalization": True})
    vid = res["custom_voice_id"]
    VOICE_CACHE.parent.mkdir(exist_ok=True)
    VOICE_CACHE.write_text(json.dumps({"custom_voice_id": vid, "source": name or Path(source).name,
                                       "start": start, "seconds": seconds}, ensure_ascii=False))
    return vid


def tts(text: str, voice_id: str, out_path: Path, model: str = TTS_MODEL, speed: float = 1.15,
        pitch: int = 0, emotion: str = "happy", sample_rate: int = 48000) -> Path:
    """クローン声で1文を読み上げて wav（mono）で保存する"""
    args = {"voice_setting": {"voice_id": voice_id, "speed": speed, "vol": 1.0, "pitch": pitch, "emotion": emotion},
            "language_boost": "Japanese", "output_format": "url"}
    try:
        res = _subscribe(model, {"text": text, **args})
    except Exception as e:  # 新しい世代のモデルは text ではなく prompt のことがある
        if "422" not in str(e):
            raise
        res = _subscribe(model, {"prompt": text, **args})
    with tempfile.TemporaryDirectory() as d:
        raw = Path(d) / "a.bin"
        urllib.request.urlretrieve(res["audio"]["url"], raw)
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-ac", "1", "-ar", str(sample_rate),
                        str(out_path)], check=True)
    return out_path


def is_approved() -> bool:
    return VOICE_CACHE.exists() and json.loads(VOICE_CACHE.read_text()).get("approved") is True


def approve() -> None:
    if not VOICE_CACHE.exists():
        raise SystemExit("先に clone を実行してください")
    d = json.loads(VOICE_CACHE.read_text())
    d["approved"] = True
    VOICE_CACHE.write_text(json.dumps(d, ensure_ascii=False))


def selftest() -> None:
    """既製の声（MiniMax のプリセット）で短い語を読ませて、キー・接続・入力項目名が正しいかを確かめる"""
    with tempfile.TemporaryDirectory() as d:
        out = tts("テスト", "Wise_Woman", Path(d) / "t.wav", speed=1.0, emotion="neutral")
        size = out.stat().st_size
    print(f"OK: fal に接続でき、{TTS_MODEL} で音声が返りました（{size} bytes）")


def transcribe(path: Path, language: str = "ja") -> dict:
    """Whisper で文字起こし（動画でも可。音声だけ取り出して送る）"""
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "a.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-ac", "1", "-ar", "16000", str(wav)],
                       check=True)
        url = upload(wav)
    return _subscribe(ASR_MODEL, {"audio_url": url, "task": "transcribe", "language": language,
                                  "chunk_level": "segment"})


def main():
    ap = argparse.ArgumentParser(description="fal API（MiniMax 声クローン・読み上げ・Whisper）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    sub.add_parser("selftest")
    sub.add_parser("approve")
    c = sub.add_parser("clone")
    c.add_argument("source", help="音声ファイルのパスか https URL")
    c.add_argument("--start", type=float, default=0)
    c.add_argument("--seconds", type=float, default=90)
    c.add_argument("--force", action="store_true", help="保存済みの声IDを無視して作り直す")
    t = sub.add_parser("tts")
    t.add_argument("text")
    t.add_argument("out")
    t.add_argument("--speed", type=float, default=1.15)
    w = sub.add_parser("transcribe")
    w.add_argument("path")
    a = ap.parse_args()

    if a.cmd == "check":
        load_key()
        k = os.environ["FAL_KEY"]
        shape = "ID:秘密の文字列 の形" if ":" in k else "コロンなし（fal のキーは通常 ID:秘密の文字列 の形なので要確認）"
        print(f"キーを読み込みました（{len(k)}文字、{shape}、英数字のみ: {'はい' if k.isascii() else 'いいえ'}）")
    elif a.cmd == "selftest":
        selftest()
    elif a.cmd == "approve":
        approve()
        print("承認しました。python tools/tts.py episodes/ep01 --engine fal で全文を作れます")
    elif a.cmd == "clone":
        print("custom_voice_id:", clone_voice(a.source, a.start, a.seconds, force=a.force))
    elif a.cmd == "tts":
        if not VOICE_CACHE.exists():
            raise SystemExit("先に clone を実行してください")
        vid = json.loads(VOICE_CACHE.read_text())["custom_voice_id"]
        print("saved", tts(a.text, vid, Path(a.out), speed=a.speed))
    elif a.cmd == "transcribe":
        print(transcribe(Path(a.path)).get("text", ""))


if __name__ == "__main__":
    main()
