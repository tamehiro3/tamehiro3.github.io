"""Canva→下書き: 書き出しURLの受付・受付での保存・承認・片付け・下書き本文の生成（SNS・GitHub・git には触らない）。"""
import contextlib
import io
import json
import os
import re
import struct
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from helpers import SNS_DIR, temp_sns_root

import media
import sns
from issue import CHECK_LABELS, build_issue_body, parse_issue_form
from store import Store

OWNER = "tamehiro3"
POST = "今日の謎をCanvaでカードにしました。答えはあしたの夜に出します。"
DESC = "藍色の背景に金色の文字。今日の謎。ひらがな3文字の生き物で、夜になると光るものはなんでしょう？答えはあした。しのびのゲーム工房"
OCR_OK = "ひらがな3文字の生き物で、\n夜になると光るものはなんでしょう?\n答えはあした\nしのびのゲーム工房"
DESIGN = "DAHWSwVQsLo"


def canva_url(expires_in=7371, start=None, name="0001-8425626145244853852.jpg"):
    start = start or datetime.now(timezone.utc)
    return (f"https://export-download.canva.com/VQsLo/{DESIGN}/-1/0/{name}?X-Amz-Algorithm=AWS4-HMAC-SHA256"
            f"&X-Amz-Date={start:%Y%m%dT%H%M%SZ}&X-Amz-Expires={expires_in}&X-Amz-Signature=abc")


def canva_jpeg():
    """Canvaの書き出しと同じく、位置情報のない撮影情報（EXIF）が入ったJPEG。"""
    ifd = struct.pack("<H", 1) + struct.pack("<HHII", 0x010F, 2, 1, 0) + b"\x00" * 4
    tiff = b"II*\x00" + struct.pack("<I", 8) + ifd
    app1 = b"\xff\xe1" + struct.pack(">H", 2 + 6 + len(tiff)) + b"Exif\x00\x00" + tiff
    sof0 = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, 900, 1600, 1) + b"\x01\x11\x00"
    return b"\xff\xd8" + app1 + sof0 + b"\xff\xd9"


JPG = canva_jpeg()


class CanvaUrlTest(unittest.TestCase):
    def test_found_in_markdown_with_html_escapes(self):
        url = canva_url()
        found = media.find_attachments(f"![画像]({url.replace('&', '&amp;')})\n<!-- canva-design: {DESIGN} -->")
        self.assertEqual(found, [url])
        self.assertEqual(media.source_of(url), "canva")

    def test_key_ignores_signature(self):
        a, b = canva_url(), canva_url(expires_in=99, start=datetime(2026, 1, 1, tzinfo=timezone.utc))
        self.assertEqual(media.url_key(a), media.url_key(b))
        self.assertNotEqual(media.url_key(a), media.url_key(canva_url(name="0001-other.jpg")))

    def test_expiry(self):
        start = datetime(2026, 9, 26, 22, 2, 43, tzinfo=timezone.utc)
        self.assertEqual(media.canva_expiry(canva_url(7371, start)), datetime(2026, 9, 27, 0, 5, 34, tzinfo=timezone.utc))
        self.assertIsNone(media.canva_expiry("https://export-download.canva.com/x.jpg"))

    def test_other_canva_hosts_are_not_fetched(self):
        with self.assertRaises(media.MediaError):
            media.download("https://www.canva.com/design/DAHWSwVQsLo/view", 1000)

    def test_expired_link_message(self):
        old = canva_url(60, datetime.now(timezone.utc) - timedelta(hours=3))
        err = urllib.error.HTTPError(old, 403, "Forbidden", {}, io.BytesIO(b""))
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(media.MediaError) as ctx:
                media.download(old, 1000)
        self.assertIn("期限が切れています", str(ctx.exception))

    def test_redirect_away_from_canva_is_refused(self):
        class Res(io.BytesIO):
            def geturl(self):
                return "https://evil.example/x.jpg"

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        with mock.patch("urllib.request.urlopen", return_value=Res(JPG)):
            with self.assertRaises(media.MediaError):
                media.download(canva_url(), 10_000)


class FormTemplateTest(unittest.TestCase):
    def test_check_labels_match_issue_form(self):
        form = (SNS_DIR.parents[1] / ".github/ISSUE_TEMPLATE/sns-draft.yml").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r"^\s+- label: (.+)$", form, re.M), CHECK_LABELS)

    def test_built_body_round_trips(self):
        url = canva_url()
        parsed = parse_issue_form(build_issue_body(POST, "今日の謎", "忍びの謎巡り", url, DESC, DESIGN))
        self.assertEqual(parsed["posts"], [POST])
        self.assertEqual(parsed["images"], [url])
        self.assertEqual(parsed["image_desc"], DESC)
        self.assertEqual(parsed["link_label"], "忍びの謎巡り")
        self.assertEqual(parsed["canva_design_id"], DESIGN)
        self.assertEqual(parsed["source_marker"], "claude-canva")
        self.assertEqual(len(parsed["checks"]), 5)
        self.assertFalse(any(c for c, _ in parsed["checks"]))  # Claudeはチェックを入れない


def event(action, body, sender=OWNER, author=OWNER, label=None, number=51):
    ev = {"action": action, "sender": {"login": sender},
          "issue": {"number": number, "title": "[SNS] Canva", "body": body, "state": "open",
                    "user": {"login": author}, "html_url": f"https://github.com/{OWNER}/x/issues/{number}"}}
    if label:
        ev["label"] = {"name": label}
    path = Path(tempfile.mkdtemp()) / "event.json"
    path.write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
    return str(path)


def approved_body(url):
    body = build_issue_body(POST, "今日の謎", "なし", url, DESC, DESIGN)
    return body.replace("- [ ] ", "- [x] ")  # 本人がGitHubの画面でチェックした状態


class CanvaInboxTest(unittest.TestCase):
    def setUp(self):
        self.root = temp_sns_root({"channel": "bluesky"})
        self.url = canva_url()
        self.patches = [mock.patch.object(sns, "SNS_ROOT", self.root),
                        mock.patch.dict(os.environ, {"SNS_NOW": "2026-09-28T20:17:00+09:00",
                                                     "GITHUB_REPOSITORY": "tamehiro3/tamehiro3.github.io",
                                                     "GITHUB_REF_NAME": "master"}),
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

    def staged(self):
        return sorted(p.name for p in self.store.inbox.glob("*") if p.name != ".gitkeep")

    def test_opened_stages_image_and_shows_it(self):
        with mock.patch.object(media, "download", return_value=JPG), mock.patch.object(sns, "git_sync") as git:
            _, out = self.run_cmd(sns.cmd_issue_event, event("opened", build_issue_body(POST, image_url=self.url,
                                                                                         image_desc=DESC, canva_design_id=DESIGN)))
        self.assertEqual(self.staged(), [f"i51-{media.url_key(self.url)}.jpg"])
        git.assert_called_once()
        self.assertEqual(git.call_args[0][0], [self.store.inbox])
        self.assertIn("受付で保存済み", out)
        self.assertIn("https://raw.githubusercontent.com/tamehiro3/tamehiro3.github.io/master/", out)
        self.assertIn("Claude が Canva から作りました", out)
        self.assertNotIn("撮影情報（EXIF）", out)  # Canvaの書き出しの撮影情報は指摘しない
        self.assertIn("✅ 機械検品は通過", out)

    def test_approval_after_link_expired_uses_staged_image(self):
        with mock.patch.object(media, "download", return_value=JPG), mock.patch.object(sns, "git_sync"):
            self.run_cmd(sns.cmd_issue_event, event("opened", approved_body(self.url)))
        expired = media.MediaError("Canvaの画像リンクの期限が切れています")
        with mock.patch.object(media, "download", side_effect=expired) as dl, mock.patch.object(sns, "git_sync"):
            _, out = self.run_cmd(sns.cmd_issue_event, event("labeled", approved_body(self.url), label="承認"))
        dl.assert_not_called()
        self.assertIn("在庫に入れました", out)
        item = self.store.load(self.store.items(self.store.queue)[0])
        meta = item["images"][0]
        self.assertEqual((self.store.media / meta["file"]).read_bytes(), JPG)
        self.assertEqual(meta["source"], "canva")
        self.assertEqual(meta["canva_design_id"], DESIGN)
        self.assertNotIn("X-Amz-Signature", json.dumps(item))  # 署名つきURLは在庫に残さない
        self.assertFalse([k for k in meta if k.startswith("_")])
        self.assertEqual(self.staged(), [])  # 承認したら受付の保存画像は片付く

    def test_expired_link_without_staging_blocks(self):
        expired = media.MediaError("Canvaの画像リンクの期限が切れています（期限 09/27 09:05 JST）")
        with mock.patch.object(media, "download", side_effect=expired), mock.patch.object(sns, "git_sync"):
            _, out = self.run_cmd(sns.cmd_issue_event, event("labeled", approved_body(self.url), label="承認"))
        self.assertIn("期限が切れています", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_closing_without_approval_cleans_up(self):
        with mock.patch.object(media, "download", return_value=JPG), mock.patch.object(sns, "git_sync"):
            self.run_cmd(sns.cmd_issue_event, event("opened", approved_body(self.url)))
        self.assertEqual(len(self.staged()), 1)
        with mock.patch.object(sns, "git_sync") as git:
            self.run_cmd(sns.cmd_issue_event, event("closed", approved_body(self.url)))
        self.assertEqual(self.staged(), [])
        git.assert_called_once()

    def test_non_owner_canva_link_is_not_fetched_or_staged(self):
        with mock.patch.object(media, "download") as dl, mock.patch.object(sns, "git_sync") as git:
            self.run_cmd(sns.cmd_issue_event, event("opened", approved_body(self.url), author="someone"))
        dl.assert_not_called()
        git.assert_not_called()
        self.assertEqual(self.staged(), [])


class CanvaDraftCommandTest(unittest.TestCase):
    def setUp(self):
        self.root = temp_sns_root({"channel": "bluesky"})
        self.patch = mock.patch.object(sns, "SNS_ROOT", self.root)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()

    def run_draft(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = sns.cmd_canva_draft(list(args))
        return code, out.getvalue()

    def test_outputs_issue_json(self):
        code, out = self.run_draft("--text", POST, "--image-url", canva_url(), "--image-desc", DESC, "--design-id", DESIGN)
        self.assertEqual(code, 0, out)
        data = json.loads(out[out.index("{"):])
        self.assertEqual(data["labels"], ["SNS下書き"])
        self.assertTrue(data["title"].startswith("[SNS] "))
        parsed = parse_issue_form(data["body"])
        self.assertEqual(parsed["canva_design_id"], DESIGN)
        self.assertIn("リンクの期限", out)

    def test_blocked_text_makes_no_draft(self):
        code, out = self.run_draft("--text", "日本一やさしい謎とき。広告なしで遊べます", "--image-url", canva_url(),
                                   "--image-desc", DESC)
        self.assertEqual(code, 1)
        self.assertIn("下書きは作りません", out)
        self.assertNotIn('"body"', out)

    def test_blocked_image_description_makes_no_draft(self):
        code, _ = self.run_draft("--text", POST, "--image-url", canva_url(), "--image-desc", "期間限定の謎。今だけ無料")
        self.assertEqual(code, 1)

    def test_only_canva_links(self):
        code, _ = self.run_draft("--text", POST, "--image-url", "https://example.com/a.jpg", "--image-desc", DESC)
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
