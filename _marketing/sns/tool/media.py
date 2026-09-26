"""下書きに添付された画像の取得・形式判定・文字認識（OCR）。

- 取得してよいのは GitHub の添付ファイルURLだけ（任意のURLは取りに行かない）
- 形式は PNG / JPEG のみ。幅・高さはファイルの先頭から読む（外部ライブラリ不要）
- OCR は tesseract があるときだけ（GitHub Actions では画像つき下書きのときに入れる）。
  誤読があるので、OCRの結果は「要確認」の材料にだけ使い、合否は画像の説明（本人の申告）で決める
"""
import hashlib
import re
import shutil
import struct
import subprocess
import tempfile
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

ATTACHMENT_RE = re.compile(
    r"https://(?:github\.com/user-attachments/assets/[0-9A-Fa-f-]{36}"
    r"|github\.com/[\w.-]+/[\w.-]+/assets/\d+/[0-9A-Fa-f-]{36}"
    r"|user-images\.githubusercontent\.com/\d+/[\w.-]+)"
)
EXT = {"image/png": "png", "image/jpeg": "jpg"}
TIMEOUT = 30


class MediaError(Exception):
    pass


def find_attachments(text):
    seen = []
    for url in ATTACHMENT_RE.findall(text or ""):
        if url not in seen:
            seen.append(url)
    return seen


def _host_ok(url):
    host = urllib.parse.urlparse(url).hostname or ""
    return host == "github.com" or host.endswith(".githubusercontent.com")


def download(url, max_bytes):
    if not ATTACHMENT_RE.fullmatch(url):
        raise MediaError(f"GitHubの添付ファイル以外のURLは取得しません: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "shinobi-sns-bot/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            if not _host_ok(res.geturl()):
                raise MediaError("転送先がGitHubではありません")
            data = res.read(max_bytes + 1)
    except MediaError:
        raise
    except Exception as e:  # noqa: BLE001  取得できなければ理由を添えて止める
        raise MediaError(f"画像を取得できませんでした（{e}）") from None
    if len(data) > max_bytes:
        raise MediaError(f"画像が大きすぎます（{max_bytes // 1000}KBまで）")
    return data


def sniff(data):
    """(MIMEタイプ, 幅, 高さ) を返す。PNG / JPEG 以外は MediaError。"""
    if data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        if b"acTL" in data[:4096]:
            raise MediaError("動くPNG（APNG）には対応していません")
        return "image/png", width, height
    if data[:3] == b"\xff\xd8\xff":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01, 0xFF) or 0xD0 <= marker <= 0xD7:
                i += 2 if marker != 0xFF else 1
                continue
            (length,) = struct.unpack(">H", data[i + 2:i + 4])
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                height, width = struct.unpack(">HH", data[i + 5:i + 9])
                return "image/jpeg", width, height
            i += 2 + length
        raise MediaError("JPEGの大きさを読み取れませんでした")
    if data[:6] in (b"GIF87a", b"GIF89a"):
        raise MediaError("GIFには対応していません（CanvaからPNGかJPGで書き出してください）")
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        raise MediaError("WebPには対応していません（CanvaからPNGかJPGで書き出してください）")
    raise MediaError("PNGかJPGの画像ではありません")


def _tiff_has_gps(tiff):
    """EXIF（TIFF形式）の最初の項目一覧に GPS 情報への参照（タグ 0x8825）があるか。"""
    endian = {b"II": "<", b"MM": ">"}.get(tiff[:2])
    if not endian or len(tiff) < 8:
        return False
    (ifd,) = struct.unpack(endian + "I", tiff[4:8])
    if ifd + 2 > len(tiff):
        return False
    (count,) = struct.unpack(endian + "H", tiff[ifd:ifd + 2])
    for k in range(count):
        off = ifd + 2 + 12 * k
        if off + 12 > len(tiff):
            break
        if struct.unpack(endian + "H", tiff[off:off + 2])[0] == 0x8825:
            return True
    return False


def exif_info(data):
    """(撮影情報EXIFがあるか, 位置情報GPSがあるか)。スマホの写真には撮影場所が入っていることがある。"""
    tiffs = []
    if data[:3] == b"\xff\xd8\xff":
        i = 2
        while i + 4 < len(data) and data[i] == 0xFF:
            marker = data[i + 1]
            if marker in (0xD9, 0xDA):  # 画像本体に入ったら終わり
                break
            (length,) = struct.unpack(">H", data[i + 2:i + 4])
            payload = data[i + 4:i + 2 + length]
            if marker == 0xE1 and payload[:6] == b"Exif\x00\x00":
                tiffs.append(payload[6:])
            i += 2 + length
    elif data[:8] == b"\x89PNG\r\n\x1a\n":
        i = 8
        while i + 8 <= len(data):
            (length,) = struct.unpack(">I", data[i:i + 4])
            kind = data[i + 4:i + 8]
            if kind == b"eXIf":
                tiffs.append(data[i + 8:i + 8 + length])
            if kind == b"IEND":
                break
            i += 12 + length
    return bool(tiffs), any(_tiff_has_gps(t) for t in tiffs)


def describe(data):
    mime, width, height = sniff(data)
    has_exif, has_gps = exif_info(data)
    return {"mime": mime, "ext": EXT[mime], "width": width, "height": height,
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "exif": has_exif, "gps": has_gps}


def ocr(data, lang="jpn+eng", timeout=60):
    """(状態, 文字) を返す。状態は ok / unavailable / error。

    ページの読み方を2通り（自動段組=3、ばらばらの文字=11）試して結果をつなげる。
    大きな装飾文字と本文の両方を拾いやすくするため。
    """
    exe = shutil.which("tesseract")
    if not exe:
        return "unavailable", ""
    texts = []
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "image"
        path.write_bytes(data)
        for psm in ("3", "11"):
            try:
                out = subprocess.run([exe, str(path), "stdout", "-l", lang, "--psm", psm],
                                     capture_output=True, text=True, timeout=timeout)
            except (subprocess.TimeoutExpired, OSError) as e:
                return "error", str(e)
            if out.returncode != 0:
                return "error", out.stderr.strip()[:300]
            texts.append(re.sub(r"\n{2,}", "\n", out.stdout).strip())
    return "ok", "\n".join(t for t in texts if t)


def tiny_png(width=16, height=16, rgb=(31, 42, 68)):
    """疎通確認・テスト用の小さな単色PNG。"""
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
