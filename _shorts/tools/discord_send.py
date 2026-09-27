"""できあがった動画を Discord のチャンネルへ送る（Webhook を使う）。

Webhook の URL はコードに書かず、リポジトリの外のファイルから読む（fal のキーと同じ考え方）。
  いちばんおすすめ: C:\\Users\\3mori\\SNS\\discord_webhook.txt （リポジトリの1つ上のフォルダ）
ファイルの中身は URL だけの1行でよい（説明や見出しが混ざっていても URL の部分だけ拾う）。

  python tools/discord_send.py check                 # URL が読めて、Webhook が生きているか（投稿はしない）
  python tools/discord_send.py ep12 ep10 ep14        # 動画を送る
  python tools/discord_send.py ep12 --limit-mb 50    # サーバーのブーストで上限が大きいとき

Discord の無料枠は 1ファイル 10MB まで。それを超える動画は、送る用に圧縮した
episodes/epXX/out/epXX_discord.mp4 を作って送る（投稿用の epXX.mp4 はそのまま）。
"""
import argparse
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_OUTSIDE = ROOT.parent.parent
URL_CANDIDATES = [_OUTSIDE / "discord_webhook.txt", _OUTSIDE / "discord_webhook",
                  _OUTSIDE / "Discord Webhook.txt", _OUTSIDE / "discord webhook.txt",
                  ROOT / "assets" / ".discord_webhook", ROOT / "assets" / ".discord_webhook.txt"]
URL_RE = re.compile(r"https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api/webhooks/\d+/[A-Za-z0-9_\-]+")
UA = "tamehiro-shorts (https://github.com/tamehiro3, 1.0)"


def extract_url(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp932", "utf-16"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return ""
    m = URL_RE.search(unicodedata.normalize("NFKC", text))
    return m.group(0) if m else ""


def load_url() -> str:
    env = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if URL_RE.fullmatch(env.strip()):
        return env.strip()
    f = next((p for p in URL_CANDIDATES if p.exists()), None)
    if f is None:
        raise SystemExit("Discord の Webhook URL が見つかりません。次のどれかに URL を1行で保存してください:\n  "
                         + "\n  ".join(str(p) for p in URL_CANDIDATES[:1] + URL_CANDIDATES[4:5]))
    url = extract_url(f.read_bytes())
    if not url:
        raise SystemExit(f"{f} の中に Webhook の URL が見つかりません。\n"
                         "Discord の「チャンネルの編集 → 連携サービス → ウェブフック → ウェブフックURLをコピー」で"
                         "コピーした URL（https://discord.com/api/webhooks/... で始まる）を貼ってください")
    return url


def masked(url: str) -> str:
    return re.sub(r"/[A-Za-z0-9_\-]+$", "/****", url)


def check():
    url = load_url()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            info = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Webhook に届きません（HTTP {e.code}）。URL が古いか、Webhook が削除されています: {masked(url)}")
    print(f"OK: Webhook「{info.get('name', '?')}」に送れます（{masked(url)}）")


def duration(path: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return float(r.stdout.strip())


def shrink(src: Path, limit_mb: float) -> Path:
    """limit_mb に収まるよう 2パスで圧縮する。収まっていればそのまま返す"""
    limit = limit_mb * 1000 * 1000          # 念のため 1MB=100万バイトで数える
    if src.stat().st_size <= limit * 0.98:
        return src
    dst = src.with_name(src.stem + "_discord.mp4")
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime and dst.stat().st_size <= limit:
        return dst
    dur = duration(src)
    audio_k = 96
    video_k = int(limit * 0.92 * 8 / dur / 1000) - audio_k
    if video_k < 300:
        raise SystemExit(f"{src.name} は {limit_mb:g}MB に収めると画質が悪くなりすぎます。--limit-mb を上げてください")
    scale = [] if video_k >= 1500 else ["-vf", "scale=720:-2"]
    log = str(dst.with_suffix(""))
    null = "NUL" if os.name == "nt" else "/dev/null"
    base = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), *scale, "-c:v", "libx264",
            "-preset", "medium", "-b:v", f"{video_k}k", "-pix_fmt", "yuv420p", "-passlogfile", log]
    subprocess.run([*base, "-pass", "1", "-an", "-f", "mp4", null], check=True)
    subprocess.run([*base, "-pass", "2", "-c:a", "aac", "-b:a", f"{audio_k}k", "-movflags", "+faststart", str(dst)],
                   check=True)
    for p in dst.parent.glob(Path(log).name + "*.log*"):
        p.unlink(missing_ok=True)
    if dst.stat().st_size > limit:
        raise SystemExit(f"{dst.name} が {limit_mb:g}MB を超えました（{dst.stat().st_size / 1e6:.1f}MB）")
    return dst


def post(url: str, message: str, file: Path):
    boundary = uuid.uuid4().hex
    payload = json.dumps({"content": message[:1900], "allowed_mentions": {"parse": []}}, ensure_ascii=False)
    body = b"".join([
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
        f"Content-Type: application/json\r\n\r\n".encode(), payload.encode("utf-8"), b"\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"{file.name}\"\r\n"
        f"Content-Type: video/mp4\r\n\r\n".encode(), file.read_bytes(), b"\r\n",
        f"--{boundary}--\r\n".encode()])
    req = urllib.request.Request(url + "?wait=true", data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 413:
            raise SystemExit(f"{file.name} が大きすぎて Discord に断られました。--limit-mb を小さくしてください")
        raise SystemExit(f"Discord への送信に失敗しました（HTTP {e.code}）: {e.read()[:300].decode('utf-8', 'replace')}")


def message_for(ep: str, note: str = "") -> str:
    d = ROOT / "episodes" / ep
    s = json.loads((d / "script.json").read_text(encoding="utf-8"))
    first = re.sub(r"[【】／]", "", s["lines"][0]["text"])
    lines = [f"**{ep}**　{first}", s.get("theme", "")]
    qa = d / "out" / "qa" / "qa_report.md"
    if qa.exists():
        v = next((l.strip("#* ") for l in qa.read_text(encoding="utf-8").splitlines() if "判定" in l), "")
        if v:
            lines.append(v if v.startswith("判定") else f"点検: {v}")
    if (d / "post" / "captions.md").exists():
        lines.append(f"キャプション: _shorts/episodes/{ep}/post/captions.md")
    if note:
        lines.append(note)
    return "\n".join(l for l in lines if l)


def send(episodes, limit_mb=10.0, note=""):
    url = load_url()
    for ep in episodes:
        src = ROOT / "episodes" / ep / "out" / f"{ep}.mp4"
        if not src.exists():
            raise SystemExit(f"{src} がありません。先に python tools/make.py {ep} で作ってください")
        f = shrink(src, limit_mb)
        extra = f"（Discord 用に圧縮: {f.stat().st_size / 1e6:.1f}MB。投稿には元の {src.name} を使う）" if f != src else ""
        post(url, message_for(ep, note + extra), f)
        print(f"送りました: {ep}（{f.name}, {f.stat().st_size / 1e6:.1f}MB）", flush=True)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("episodes", nargs="+", help="check または ep12 ep10 ...")
    ap.add_argument("--limit-mb", type=float, default=10.0, help="Discord の1ファイルの上限（無料は 10）")
    a = ap.parse_args()
    if a.episodes == ["check"]:
        check()
    else:
        send(a.episodes, a.limit_mb)


if __name__ == "__main__":
    main()
