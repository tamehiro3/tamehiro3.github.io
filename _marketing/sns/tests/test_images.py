"""画像つき下書き: 取得・形式判定・画像の説明の検品・OCR照合・承認・投稿（SNS・GitHub・git には触らない）。"""
import contextlib
import hashlib
import io
import json
import os
import shutil
import struct
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from helpers import ATTACH_MD, ATTACH_URL, FACTS, issue_body, load, temp_sns_root

import channels
import media
import sns
from issue import parse_issue_form
from lint import lint_image_text, lint_ocr_text, ocr_coverage
from store import Store

RULES = load("rules.json")
OWNER = "tamehiro3"
POST = "今日の謎を画像にしました。答えはあしたの夜に出します。"
DESC = "藍色の背景に金色の文字。今日の謎。ひらがな3文字の生き物で、夜になると光るものはなんでしょう？答えはあした。しのびのゲーム工房"
OCR_OK = "SAE\nひらがな3文字の生き物で、\n夜になると光るものはなんでしょう ?\n答えはあした\nしのびのゲーム工房"
PNG = media.tiny_png(32, 18)


def tiny_jpeg(width=640, height=360):
    """大きさの読み取りに必要な部分だけのJPEG（SOI・APP0・SOF0）。"""
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof0 = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00"
    return b"\xff\xd8" + app0 + sof0 + b"\xff\xd9"


def jpeg_with_exif(gps=True):
    """IFD0 に GPS 参照（0x8825）を持つ EXIF 入りJPEG（大きさの読み取りに必要な部分だけ）。"""
    tags = [(0x010F, 2, 1, 0)] + ([(0x8825, 4, 1, 26)] if gps else [])
    ifd = struct.pack("<H", len(tags)) + b"".join(struct.pack("<HHII", *t) for t in tags) + b"\x00" * 4
    tiff = b"II*\x00" + struct.pack("<I", 8) + ifd
    app1 = b"\xff\xe1" + struct.pack(">H", 2 + 6 + len(tiff)) + b"Exif\x00\x00" + tiff
    return tiny_jpeg()[:2] + app1 + tiny_jpeg()[2:]


class MediaTest(unittest.TestCase):
    def test_gps_in_photo_is_detected(self):
        self.assertEqual(media.exif_info(jpeg_with_exif(gps=True)), (True, True))
        self.assertEqual(media.exif_info(jpeg_with_exif(gps=False)), (True, False))
        self.assertEqual(media.exif_info(tiny_jpeg()), (False, False))
        self.assertEqual(media.exif_info(PNG), (False, False))
        self.assertEqual(media.sniff(jpeg_with_exif()), ("image/jpeg", 640, 360))

    def test_sniff_png_and_jpeg(self):
        self.assertEqual(media.sniff(PNG), ("image/png", 32, 18))
        self.assertEqual(media.sniff(tiny_jpeg()), ("image/jpeg", 640, 360))

    def test_unsupported_formats(self):
        for data in (b"GIF89a" + b"\x00" * 20, b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 20, b"hello world"):
            with self.assertRaises(media.MediaError):
                media.sniff(data)

    def test_only_github_attachments_are_found_and_fetched(self):
        text = f'{ATTACH_MD}\n![x](https://example.com/a.png)\n{ATTACH_MD}'
        self.assertEqual(media.find_attachments(text), [ATTACH_URL])
        with self.assertRaises(media.MediaError):
            media.download("https://example.com/a.png", 1000)

    def test_download_size_limit_and_redirect_host(self):
        class Res(io.BytesIO):
            def __init__(self, data, url):
                super().__init__(data)
                self.url = url

            def geturl(self):
                return self.url

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        ok_host = "https://private-user-images.githubusercontent.com/1/x.png?jwt=abc"
        with mock.patch("urllib.request.urlopen", return_value=Res(PNG, ok_host)):
            self.assertEqual(media.download(ATTACH_URL, 10_000), PNG)
        with mock.patch("urllib.request.urlopen", return_value=Res(b"x" * 2000, ok_host)):
            with self.assertRaises(media.MediaError):
                media.download(ATTACH_URL, 1000)
        with mock.patch("urllib.request.urlopen", return_value=Res(PNG, "https://evil.example/x.png")):
            with self.assertRaises(media.MediaError):
                media.download(ATTACH_URL, 10_000)

    def test_ocr_unavailable_without_tesseract(self):
        with mock.patch("shutil.which", return_value=None):
            self.assertEqual(media.ocr(PNG), ("unavailable", ""))


class ImageTextLintTest(unittest.TestCase):
    facts = FACTS.read_text(encoding="utf-8")

    def test_description_required(self):
        self.assertEqual(lint_image_text("", RULES)[0].level, "block")
        self.assertEqual(lint_image_text("_No response_", RULES)[0].level, "block")

    def test_description_uses_same_rules_as_posts(self):
        levels = {f.level for f in lint_image_text("日本一やさしい謎。広告なしで遊べる", RULES, self.facts)}
        self.assertIn("block", levels)
        self.assertFalse([f for f in lint_image_text(DESC, RULES, self.facts) if f.level == "block"])

    def test_undeclared_banned_phrase_in_image_blocks(self):
        findings = lint_ocr_text("今日の謎\n日本一やさしい謎とき\n広告なしで遊べます", DESC, RULES)
        blocks = [f.message for f in findings if f.level == "block"]
        self.assertTrue(any("日本一" in m for m in blocks), findings)
        self.assertTrue(any("広告なし" in m for m in blocks), findings)
        self.assertTrue(any("一致率" in f.message and f.level == "warn" for f in findings))

    def test_ocr_spaces_between_letters_are_ignored(self):
        findings = lint_ocr_text("日 本 一 や さ し い", DESC, RULES)
        self.assertTrue(any(f.level == "block" and "日本一" in f.message for f in findings), findings)

    def test_short_ocr_hits_stay_warnings(self):
        findings = lint_ocr_text("SAE IQ ea", DESC, RULES)
        self.assertTrue(findings)
        self.assertNotIn("block", {f.level for f in findings})

    def test_coverage_of_honest_image_is_high(self):
        self.assertGreater(ocr_coverage(OCR_OK, DESC), 0.7)
        self.assertEqual(lint_ocr_text(OCR_OK, DESC, RULES), [])
        self.assertIsNone(ocr_coverage("ab", DESC))  # 読めた文字が少なすぎるときは判定しない

    @unittest.skipUnless(shutil.which("tesseract"), "tesseract が入っていない環境では実物のOCRは試さない")
    def test_real_ocr_reads_japanese(self):
        status, text = media.ocr(PNG)
        self.assertEqual(status, "ok")


def event(action, body, sender=OWNER, author=OWNER, label=None, number=21):
    ev = {"action": action, "sender": {"login": sender},
          "issue": {"number": number, "title": "[SNS] 画像つき", "body": body, "state": "open",
                    "user": {"login": author}, "html_url": f"https://github.com/{OWNER}/x/issues/{number}"}}
    if label:
        ev["label"] = {"name": label}
    path = Path(tempfile.mkdtemp()) / "event.json"
    path.write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
    return str(path)


class ImageFlowBase(unittest.TestCase):
    config = {"channel": "bluesky", "mode": "live"}

    def setUp(self):
        self.root = temp_sns_root(self.config)
        self.patches = [mock.patch.object(sns, "SNS_ROOT", self.root),
                        mock.patch.dict(os.environ, {"SNS_NOW": "2026-09-28T20:17:00+09:00",
                                                     "BSKY_HANDLE": "a.bsky.social", "BSKY_APP_PASSWORD": "p",
                                                     "X_API_KEY": "k", "X_API_SECRET": "s",
                                                     "X_ACCESS_TOKEN": "t", "X_ACCESS_TOKEN_SECRET": "ts"}),
                        mock.patch.object(media, "download", return_value=PNG),
                        mock.patch.object(media, "ocr", return_value=("ok", OCR_OK))]
        for p in self.patches:
            p.start()
        self.store = Store(self.root)

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()

    def run_cmd(self, fn, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = fn(*args)
        return code, out.getvalue()

    def set_cfg(self, **x):
        cfg = json.loads((self.root / "config.json").read_text(encoding="utf-8"))
        cfg["x"].update(x)
        (self.root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    def body(self, text=POST, desc=DESC, image_checked=True, **kw):
        return issue_body(text, image_md=ATTACH_MD, image_desc=desc, image_checked=image_checked, **kw)

    def approve(self, body, **kw):
        return self.run_cmd(sns.cmd_issue_event, event("labeled", body, label="承認", **kw))


class ImageInboxTest(ImageFlowBase):
    def test_report_shows_image_and_ocr(self):
        code, out = self.run_cmd(sns.cmd_issue_event, event("opened", self.body()))
        self.assertEqual(code, 0)
        self.assertIn("🖼 画像1: PNG 32×18", out)
        self.assertIn("文字認識（OCR）の結果", out)
        self.assertIn("✅ 機械検品は通過", out)

    def test_approval_saves_image_with_hash(self):
        code, out = self.approve(self.body())
        self.assertIn("在庫に入れました", out)
        item = self.store.load(self.store.items(self.store.queue)[0])
        meta = item["images"][0]
        self.assertEqual(meta["sha256"], hashlib.sha256(PNG).hexdigest())
        self.assertEqual(meta["alt"], DESC)
        self.assertEqual((self.store.media / meta["file"]).read_bytes(), PNG)
        self.assertNotIn("data", meta)

    def test_image_checkbox_required_only_with_image(self):
        _, out = self.approve(self.body(image_checked=False))
        self.assertIn("検品チェックが未完了", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_missing_description_blocks(self):
        _, out = self.approve(self.body(desc=""))
        self.assertIn("画像の説明が空です", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_image_with_multiple_posts_blocks(self):
        _, out = self.approve(self.body(text=f"{POST}\n\n---\n\n二本目の投稿です。答えはあしたの夜に出します。"))
        self.assertIn("投稿文を1本だけ", out)

    def test_image_pasted_into_post_text_blocks(self):
        _, out = self.approve(issue_body(f"{POST}\n{ATTACH_MD}"))
        self.assertIn("「添付画像」欄に貼って", out)

    def test_photo_with_location_blocks(self):
        with mock.patch.object(media, "download", return_value=jpeg_with_exif(gps=True)):
            _, out = self.approve(self.body())
        self.assertIn("GPSの位置情報", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_download_failure_blocks_approval(self):
        with mock.patch.object(media, "download", side_effect=media.MediaError("画像を取得できませんでした（HTTP 404）")):
            _, out = self.approve(self.body())
        self.assertIn("画像を取得できませんでした", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_non_owner_images_are_not_fetched(self):
        with mock.patch.object(media, "download") as dl:
            _, out = self.run_cmd(sns.cmd_issue_event, event("opened", self.body(), author="someone"))
        dl.assert_not_called()
        self.assertIn("画像の取得と文字認識はしていません", out)


class ImagePostTest(ImageFlowBase):
    def test_bluesky_posts_image_with_alt_and_ratio(self):
        self.approve(self.body())
        with mock.patch.object(channels, "post_bluesky", return_value={"remote_id": "at://x", "url": "u"}) as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0, out)
        images = m.call_args[0][4]
        self.assertEqual(images[0]["data"], PNG)
        self.assertEqual(images[0]["alt"], DESC)
        self.assertEqual((images[0]["width"], images[0]["height"]), (32, 18))

    def test_tampered_image_is_held(self):
        self.approve(self.body())
        item = self.store.load(self.store.items(self.store.queue)[0])
        (self.store.media / item["images"][0]["file"]).write_bytes(media.tiny_png(8, 8))
        with mock.patch.object(channels, "post_bluesky") as m:
            self.run_cmd(sns.cmd_post)
        m.assert_not_called()
        held = self.store.load(self.store.items(self.store.held)[0])
        self.assertIn("承認時から変わっています", " ".join(held["held_reasons"]))

    def test_bluesky_size_limit_holds_oversized_image(self):
        self.approve(self.body())
        cfg = json.loads((self.root / "config.json").read_text(encoding="utf-8"))
        cfg["bluesky"]["max_image_bytes"] = 10
        (self.root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
        with mock.patch.object(channels, "post_bluesky") as m:
            self.run_cmd(sns.cmd_post)
        m.assert_not_called()
        self.assertEqual(len(self.store.items(self.store.held)), 1)


class XImageTest(ImageFlowBase):
    config = {"channel": "x", "mode": "live"}

    def test_x_images_blocked_until_enabled(self):
        _, out = self.approve(self.body())
        self.assertIn("Xへの画像投稿はまだ有効になっていません", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_x_uploads_sets_alt_and_attaches_media(self):
        self.set_cfg(images_enabled=True)
        self.approve(self.body())
        with mock.patch.object(channels, "x_upload_media", return_value="555") as up, \
                mock.patch.object(channels, "x_set_alt_text") as alt, \
                mock.patch.object(channels, "post_x", return_value={"remote_id": "9", "url": "u"}) as post:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0, out)
        up.assert_called_once_with(PNG, "image/png", mock.ANY)
        alt.assert_called_once_with("555", DESC, mock.ANY)
        self.assertEqual(post.call_args[0][2], ["555"])
        posted = self.store.load(self.store.items(self.store.posted)[0])
        self.assertEqual(posted["cost_usd"], 0.045)  # 投稿0.015 ＋ 画像（アップロード＋代替テキスト）0.015×2

    def test_alt_text_failure_does_not_stop_post(self):
        self.set_cfg(images_enabled=True)
        self.approve(self.body())
        with mock.patch.object(channels, "x_upload_media", return_value="555"), \
                mock.patch.object(channels, "x_set_alt_text", side_effect=channels.PostRejected("HTTP 403")), \
                mock.patch.object(channels, "post_x", return_value={"remote_id": "9", "url": "u"}) as post:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        post.assert_called_once()
        self.assertIn("代替テキストを設定できませんでした", out)

    def test_upload_failure_returns_item_to_queue(self):
        self.set_cfg(images_enabled=True)
        self.approve(self.body())
        with mock.patch.object(channels, "x_upload_media", side_effect=channels.PostRejected("HTTP 403")), \
                mock.patch.object(channels, "post_x") as post:
            code, _ = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 1)
        post.assert_not_called()
        self.assertEqual(len(self.store.items(self.store.queue)), 1)
        self.assertEqual(self.store.items(self.store.sending), [])

    def test_disabling_x_images_after_approval_holds_item(self):
        self.set_cfg(images_enabled=True)
        self.approve(self.body())
        self.set_cfg(images_enabled=False)
        with mock.patch.object(channels, "post_x") as post:
            self.run_cmd(sns.cmd_post)
        post.assert_not_called()
        self.assertEqual(len(self.store.items(self.store.held)), 1)

    def test_media_check_command(self):
        with mock.patch.object(channels, "x_upload_media", return_value="777"):
            code, out = self.run_cmd(sns.cmd_x_media_check)
        self.assertEqual(code, 0)
        self.assertIn("成功", out)
        with mock.patch.object(channels, "x_upload_media", side_effect=channels.PostRejected("HTTP 403: Forbidden")):
            code, out = self.run_cmd(sns.cmd_x_media_check)
        self.assertEqual(code, 1)
        self.assertIn("通りませんでした", out)


class ChannelImageTest(unittest.TestCase):
    CREDS = {"X_API_KEY": "k", "X_API_SECRET": "s", "X_ACCESS_TOKEN": "t", "X_ACCESS_TOKEN_SECRET": "ts"}

    def test_x_upload_5xx_counts_as_not_posted(self):
        import urllib.error
        err = urllib.error.HTTPError("u", 503, "e", {}, io.BytesIO(b"x"))
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(channels.PostRejected):
                channels.x_upload_media(PNG, "image/png", self.CREDS)

    def test_x_upload_request_shape(self):
        class R(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        with mock.patch("urllib.request.urlopen", return_value=R(b'{"data": {"id": "123"}}')) as m:
            self.assertEqual(channels.x_upload_media(PNG, "image/png", self.CREDS), "123")
        sent = json.loads(m.call_args[0][0].data)
        self.assertEqual(sent["media_category"], "tweet_image")
        self.assertEqual(sent["media_type"], "image/png")
        self.assertTrue(m.call_args[0][0].get_header("Authorization").startswith("OAuth "))

    def test_bluesky_upload_blob_and_embed(self):
        class R(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        session = R(json.dumps({"accessJwt": "jwt", "did": "did:plc:a", "handle": "a.bsky.social"}).encode())
        blob = {"$type": "blob", "ref": {"$link": "bafy"}, "mimeType": "image/png", "size": len(PNG)}
        uploaded = R(json.dumps({"blob": blob}).encode())
        created = R(json.dumps({"uri": "at://did:plc:a/app.bsky.feed.post/3k", "cid": "c"}).encode())
        with mock.patch("urllib.request.urlopen", side_effect=[session, uploaded, created]) as m:
            channels.post_bluesky("テスト", {"BSKY_HANDLE": "a.bsky.social", "BSKY_APP_PASSWORD": "p"},
                                  images=[{"data": PNG, "mime": "image/png", "alt": "説明", "width": 32, "height": 18}])
        up_req = m.call_args_list[1][0][0]
        self.assertTrue(up_req.full_url.endswith("com.atproto.repo.uploadBlob"))
        self.assertEqual(up_req.data, PNG)
        self.assertEqual(up_req.get_header("Content-type"), "image/png")
        record = json.loads(m.call_args_list[2][0][0].data)["record"]
        self.assertEqual(record["embed"]["$type"], "app.bsky.embed.images")
        self.assertEqual(record["embed"]["images"][0]["alt"], "説明")
        self.assertEqual(record["embed"]["images"][0]["aspectRatio"], {"width": 32, "height": 18})


class ParseTest(unittest.TestCase):
    def test_form_image_fields(self):
        parsed = parse_issue_form(issue_body(POST, image_md=ATTACH_MD, image_desc=DESC))
        self.assertEqual(parsed["images"], [ATTACH_URL])
        self.assertEqual(parsed["image_desc"], DESC)
        self.assertEqual(parsed["images_in_text"], [])
        empty = parse_issue_form(issue_body(POST))
        self.assertEqual(empty["images"], [])
        self.assertIsNone(empty["image_desc"])


if __name__ == "__main__":
    unittest.main()
