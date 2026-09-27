"""主戦場 Threads と週刊メルマガ（Substack）の下書き（SNS・GitHub・git には触らない）。"""
import contextlib
import io
import json
import os
import re
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest import mock

from helpers import ATTACH_MD, FACTS, SNS_DIR, issue_body, load, temp_sns_root

import channels
import media
import sns
from lint import lint_post
from store import Store

CFG = load("config.json")
RULES = load("rules.json")
FACTS_TEXT = FACTS.read_text(encoding="utf-8")
OWNER = "tamehiro3"
POST = "今日の謎です。ひらがな3文字の生き物で、夜になると光るものはなんでしょう。答えはメルマガで。"
DESC = "藍色の背景に金色の文字。今日の謎。ひらがな3文字の生き物で、夜になると光るものはなんでしょう？答えはあした。しのびのゲーム工房"
TOKEN = "THAAsecret-token-value"
PNG = media.tiny_png(32, 18)


class _Res(io.BytesIO):
    status = 200
    headers = {"Content-Type": "application/json"}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def res(obj):
    return _Res(json.dumps(obj).encode())


def http_error(code, body=b'{"error":{"message":"bad","code":100}}'):
    return urllib.error.HTTPError("https://graph.threads.net/x", code, "err", {}, io.BytesIO(body))


def form(req):
    return dict(urllib.parse.parse_qsl(req.data.decode())) if req.data else \
        dict(urllib.parse.parse_qsl(urllib.parse.urlparse(req.full_url).query))


class ThreadsLintTest(unittest.TestCase):
    def lint(self, text, link=None, cfg=CFG):
        return lint_post(text, link, cfg, RULES, FACTS_TEXT, [])

    def test_config_uses_threads(self):
        self.assertEqual(CFG["channel"], "threads")

    def test_500_char_limit(self):
        self.assertFalse(self.lint("あ" * 500).blocked)
        r = self.lint("あ" * 501)
        self.assertTrue(any("Threadsの文字数オーバー" in f.message for f in r.findings))
        self.assertFalse(self.lint("あ" * 200).blocked)  # Xなら140字で止まる長さでも通る

    def test_one_topic_tag(self):
        self.assertFalse(self.lint("今日の謎を出します。答えはあした。\n#なぞとき").blocked)
        r = self.lint("今日の謎を出します。答えはあした。\n#なぞとき #CNP")
        self.assertTrue(any("トピックは1投稿1つ" in f.message for f in r.findings))

    def test_links_in_config_are_allowed(self):
        cfg = json.loads(json.dumps(CFG))
        cfg["links"]["メルマガ"] = "https://shinobi.substack.com/"
        self.assertFalse(self.lint(POST, "https://shinobi.substack.com/", cfg).blocked)
        self.assertTrue(self.lint(POST, "https://other.substack.com/").blocked)


class FormTest(unittest.TestCase):
    def test_link_options_match_config(self):
        form_yml = (SNS_DIR.parents[1] / ".github/ISSUE_TEMPLATE/sns-draft.yml").read_text(encoding="utf-8")
        block = form_yml.split("id: link", 1)[1].split("default:", 1)[0]
        options = re.findall(r"^\s+- (.+)$", block, re.M)
        self.assertEqual(options, list(CFG["links"].keys()))


class PostThreadsTest(unittest.TestCase):
    creds = {"THREADS_ACCESS_TOKEN": TOKEN, "THREADS_USER_ID": None}

    def test_text_post_flow(self):
        calls = [res({"id": "1789"}), res({"id": "C1"}), res({"status": "FINISHED"}), res({"id": "M1"}),
                 res({"permalink": "https://www.threads.net/@shinobi/post/abc"})]
        with mock.patch("urllib.request.urlopen", side_effect=calls) as m:
            out = channels.post_threads("こんにちは", self.creds, sleep=lambda s: None)
        self.assertEqual(out, {"remote_id": "M1", "url": "https://www.threads.net/@shinobi/post/abc"})
        reqs = [c[0][0] for c in m.call_args_list]
        self.assertTrue(reqs[0].full_url.startswith("https://graph.threads.net/v1.0/me?"))
        self.assertEqual(reqs[1].full_url, "https://graph.threads.net/v1.0/1789/threads")
        self.assertEqual(form(reqs[1]), {"media_type": "TEXT", "text": "こんにちは", "access_token": TOKEN})
        self.assertEqual(reqs[3].full_url, "https://graph.threads.net/v1.0/1789/threads_publish")
        self.assertEqual(form(reqs[3])["creation_id"], "C1")
        for r in reqs:  # 鍵はPOSTの本文にだけ入れ、POSTのURLには出さない
            if r.get_method() == "POST":
                self.assertNotIn(TOKEN, r.full_url)

    def test_image_post_waits_until_finished(self):
        sleeps = []
        calls = [res({"id": "C2"}), res({"status": "IN_PROGRESS"}), res({"status": "FINISHED"}), res({"id": "M2"}),
                 res({"permalink": "https://www.threads.net/@s/post/x"})]
        with mock.patch("urllib.request.urlopen", side_effect=calls) as m:
            channels.post_threads("画像つき", dict(self.creds, THREADS_USER_ID="42"),
                                  image_url="https://raw.githubusercontent.com/a/b/master/m.jpg", alt_text="説明",
                                  sleep=sleeps.append)
        created = form(m.call_args_list[0][0][0])
        self.assertEqual(created["media_type"], "IMAGE")
        self.assertEqual(created["image_url"], "https://raw.githubusercontent.com/a/b/master/m.jpg")
        self.assertEqual(created["alt_text"], "説明")
        self.assertEqual(sleeps, [5])

    def test_container_error_is_not_posted(self):
        calls = [res({"id": "C3"}), res({"status": "ERROR", "error_message": "image fetch failed"})]
        with mock.patch("urllib.request.urlopen", side_effect=calls):
            with self.assertRaises(channels.PostRejected):
                channels.post_threads("x", dict(self.creds, THREADS_USER_ID="42"), sleep=lambda s: None)

    def test_processing_timeout_is_not_posted(self):
        calls = [res({"id": "C4"})] + [res({"status": "IN_PROGRESS"})] * 10
        with mock.patch("urllib.request.urlopen", side_effect=calls):
            with self.assertRaises(channels.PostRejected):
                channels.post_threads("x", dict(self.creds, THREADS_USER_ID="42"), wait_seconds=10,
                                      sleep=lambda s: None)

    def test_container_5xx_is_not_posted(self):
        with mock.patch("urllib.request.urlopen", side_effect=http_error(500)):
            with self.assertRaises(channels.PostRejected):
                channels.post_threads("x", dict(self.creds, THREADS_USER_ID="42"), sleep=lambda s: None)

    def test_publish_5xx_is_uncertain(self):
        calls = [res({"id": "C5"}), res({"status": "FINISHED"}), http_error(503)]
        with mock.patch("urllib.request.urlopen", side_effect=calls):
            with self.assertRaises(channels.PostUncertain):
                channels.post_threads("x", dict(self.creds, THREADS_USER_ID="42"), sleep=lambda s: None)

    def test_token_never_appears_in_errors(self):
        body = json.dumps({"error": {"message": f"Invalid token {TOKEN}", "code": 190}}).encode()
        with mock.patch("urllib.request.urlopen", side_effect=http_error(400, body)):
            with self.assertRaises(channels.PostRejected) as ctx:
                channels.post_threads("x", dict(self.creds, THREADS_USER_ID="42"), sleep=lambda s: None)
        self.assertNotIn(TOKEN, str(ctx.exception))

    def test_permalink_failure_still_counts_as_posted(self):
        calls = [res({"id": "C6"}), res({"status": "FINISHED"}), res({"id": "M6"}), http_error(500)]
        with mock.patch("urllib.request.urlopen", side_effect=calls):
            out = channels.post_threads("x", dict(self.creds, THREADS_USER_ID="42"), sleep=lambda s: None)
        self.assertEqual(out["remote_id"], "M6")


def event(action, body, label=None, number=61):
    ev = {"action": action, "sender": {"login": OWNER},
          "issue": {"number": number, "title": "[SNS] Threads", "body": body, "state": "open",
                    "user": {"login": OWNER}, "html_url": "u"}}
    if label:
        ev["label"] = {"name": label}
    path = Path(tempfile.mkdtemp()) / "event.json"
    path.write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
    return str(path)


class ThreadsFlowTest(unittest.TestCase):
    def setUp(self):
        self.root = temp_sns_root({"mode": "live"})
        cfg = json.loads((self.root / "config.json").read_text(encoding="utf-8"))
        cfg["threads"]["token_issued_on"] = "2026-09-20"
        cfg["links"]["メルマガ"] = "https://shinobi.substack.com/"
        (self.root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
        self.patches = [mock.patch.object(sns, "SNS_ROOT", self.root),
                        mock.patch.dict(os.environ, {"SNS_NOW": "2026-09-28T20:17:00+09:00", "THREADS_ACCESS_TOKEN": TOKEN,
                                                     "GITHUB_REPOSITORY": "tamehiro3/tamehiro3.github.io",
                                                     "GITHUB_REF_NAME": "master"}),
                        mock.patch.object(media, "download", return_value=PNG),
                        mock.patch.object(media, "ocr", return_value=("ok", DESC))]
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

    def set_threads(self, **kw):
        cfg = json.loads((self.root / "config.json").read_text(encoding="utf-8"))
        cfg["threads"].update(kw)
        (self.root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    def approve(self, text=POST, link="メルマガ", image=False):
        body = issue_body(text, link=link, image_md=ATTACH_MD if image else "", image_desc=DESC if image else "",
                          image_checked=image)
        return self.run_cmd(sns.cmd_issue_event, event("labeled", body, label="承認"))

    def test_text_post_with_newsletter_link(self):
        _, out = self.approve()
        self.assertIn("在庫に入れました", out)
        with mock.patch.object(channels, "post_threads", return_value={"remote_id": "M1", "url": "u"}) as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0, out)
        text, _, _, image_url, alt, _ = m.call_args[0]
        self.assertTrue(text.endswith("\nhttps://shinobi.substack.com/"))
        self.assertIsNone(image_url)
        posted = self.store.load(self.store.items(self.store.posted)[0])
        self.assertEqual(posted["channel"], "threads")
        self.assertEqual(posted["cost_usd"], 0.0)

    def test_image_post_uses_public_repo_url(self):
        self.approve(text="今日の謎を画像にしました。答えはあしたの夜に出します。", link="なし", image=True)
        item = self.store.load(self.store.items(self.store.queue)[0])
        with mock.patch.object(channels, "url_reachable", return_value=True) as head, \
                mock.patch.object(channels, "post_threads", return_value={"remote_id": "M2", "url": "u"}) as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0, out)
        url = m.call_args[0][3]
        self.assertEqual(url, "https://raw.githubusercontent.com/tamehiro3/tamehiro3.github.io/master/"
                              f"_marketing/sns/media/{item['images'][0]['file']}")
        head.assert_called_once_with(url)
        self.assertIsNone(m.call_args[0][4])  # 代替テキストは初期値オフ（APIの仕様が未確認）

    def test_unreachable_image_returns_item_to_queue(self):
        self.approve(text="今日の謎を画像にしました。答えはあしたの夜に出します。", link="なし", image=True)
        with mock.patch.object(channels, "url_reachable", return_value=False), \
                mock.patch.object(channels, "post_threads") as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 1)
        m.assert_not_called()
        self.assertIn("画像の公開URLに画像がありません", out)
        self.assertEqual(len(self.store.items(self.store.queue)), 1)

    def test_token_warning_but_still_posts(self):
        self.set_threads(token_issued_on="2026-08-01")  # 残り2日
        self.approve()
        with mock.patch.object(channels, "post_threads", return_value={"remote_id": "M", "url": "u"}) as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        m.assert_called_once()
        self.assertIn("期限まであと2日", out)
        self.assertIn("[SNS警報] Threadsの鍵", out)

    def test_expired_token_stops_before_claiming(self):
        self.set_threads(token_issued_on="2026-07-01")
        self.approve()
        with mock.patch.object(channels, "post_threads") as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 1)
        m.assert_not_called()
        self.assertIn("期限が切れています", out)
        self.assertEqual(self.store.items(self.store.sending), [])

    def test_unset_newsletter_link_blocks(self):
        cfg = json.loads((self.root / "config.json").read_text(encoding="utf-8"))
        cfg["links"]["メルマガ"] = ""
        (self.root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
        _, out = self.approve()
        self.assertIn("URLがまだ設定されていません", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_wide_image_warns(self):
        with mock.patch.object(media, "download", return_value=media.tiny_png(1600, 4)):
            _, out = self.run_cmd(sns.cmd_issue_event, event("opened", issue_body(
                "今日の謎を画像にしました。答えはあしたの夜に出します。", image_md=ATTACH_MD, image_desc=DESC,
                image_checked=True)))
        self.assertIn("幅1600px", out)

    def test_threads_check_command(self):
        with mock.patch.object(channels, "threads_me", return_value={"id": "42", "username": "shinobi"}):
            code, out = self.run_cmd(sns.cmd_threads_check)
        self.assertEqual(code, 0)
        self.assertIn("@shinobi", out)
        self.assertNotIn(TOKEN, out)
        with mock.patch.object(channels, "threads_me", side_effect=channels.PostRejected("HTTP 400: invalid")):
            code, out = self.run_cmd(sns.cmd_threads_check)
        self.assertEqual(code, 1)


class NewsletterTest(unittest.TestCase):
    def setUp(self):
        self.root = temp_sns_root({"mode": "live"})
        self.patches = [mock.patch.object(sns, "SNS_ROOT", self.root),
                        mock.patch.dict(os.environ, {"SNS_NOW": "2026-09-27T21:07:00+09:00"})]
        for p in self.patches:
            p.start()
        store = Store(self.root)
        for i, (genre, text, link) in enumerate([
                ("今日の謎", "今日の謎です。夜になると光る生き物はなんでしょう。", None),
                ("親子で", "子どもと一緒にめいろの謎をといてみました。", None),
                ("今週のおすすめ", "今週のおすすめは忍びの謎巡りです。\nhttps://tamehiro3.github.io/shinobi-nazomeguri/",
                 "https://tamehiro3.github.io/shinobi-nazomeguri/")], 1):
            store.save(store.posted / f"2026092{i}-i1-{i}.json",
                       {"id": f"x{i}", "text": text, "genre": genre, "link": link,
                        "posted_at": f"2026-09-2{i + 2}T20:17:00+09:00", "cost_usd": 0})

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()

    def test_draft_contents(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            sns.cmd_newsletter()
        draft = out.getvalue()
        self.assertIn("件名: 週刊しのびの謎（09/21〜09/27）", draft)
        self.assertIn("夜になると光る生き物はなんでしょう。", draft)
        self.assertIn("答え：［ここに書く］", draft)
        self.assertIn("［あなたの一言", draft)
        self.assertEqual(draft.count("https://"), 2)  # 遊んでみる（1通1リンク）＋問い合わせ先
        self.assertIn("https://tamehiro3.github.io/shinobi-nazomeguri/", draft)
        for must in ("送信者：", "お問い合わせ：", "配信停止：", "住所："):
            self.assertIn(must, draft)

    def test_weekly_issue_contains_draft_and_checklist(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            sns.cmd_weekly()
        body = out.getvalue()
        self.assertIn("## 6. 週刊メルマガの下書き", body)
        self.assertIn("特定電子メール法", body)
        self.assertIn("自動送信はしません", body)
        self.assertIn("Threadsの鍵を作った日が未設定", body)

    def test_template_text_passes_rules(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            sns.cmd_newsletter()
        draft = out.getvalue()
        for rule in RULES["block"]:
            self.assertIsNone(re.search(rule["pattern"], draft), rule["pattern"])


if __name__ == "__main__":
    unittest.main()
