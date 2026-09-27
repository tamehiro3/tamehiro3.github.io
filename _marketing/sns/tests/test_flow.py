"""受付→承認→在庫→投稿の一連の流れ（SNS・GitHub・git には触らない）。"""
import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from helpers import issue_body, temp_sns_root

import channels
import sns
from issue import parse_issue_form
from store import Store

OWNER = "tamehiro3"
POST_A = "今日の謎です。ひらがな3文字の生き物で、夜になると光るものはなんでしょう。答えはあしたの夜に。"
POST_B = "子どもと一緒にめいろの謎をといてみました。制限時間がないので、自分のペースで考えられるのがよかったです。"


def event(action, body, sender=OWNER, author=OWNER, label=None, state="open", number=7):
    ev = {"action": action, "sender": {"login": sender},
          "issue": {"number": number, "title": "[SNS] 今週の分", "body": body, "state": state,
                    "user": {"login": author}, "html_url": f"https://github.com/{OWNER}/x/issues/{number}"}}
    if label:
        ev["label"] = {"name": label}
    path = Path(tempfile.mkdtemp()) / "event.json"
    path.write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
    return str(path)


class FlowBase(unittest.TestCase):
    config = {}

    def setUp(self):
        self.root = temp_sns_root(self.config)
        self._patch = mock.patch.object(sns, "SNS_ROOT", self.root)
        self._patch.start()
        self.store = Store(self.root)
        self.env = mock.patch.dict(os.environ, {"SNS_NOW": "2026-09-28T20:17:00+09:00"})
        self.env.start()

    def tearDown(self):
        self._patch.stop()
        self.env.stop()

    def run_cmd(self, fn, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = fn(*args)
        return code, out.getvalue()

    def approve(self, text, **kw):
        body = issue_body(text, **{k: v for k, v in kw.items() if k in ("genre", "link", "checked")})
        extra = {k: v for k, v in kw.items() if k in ("sender", "author", "state")}
        return self.run_cmd(sns.cmd_issue_event, event("labeled", body, label="承認", **extra))


class IssueParseTest(unittest.TestCase):
    def test_multiple_posts_and_checks(self):
        body = issue_body(f"{POST_A}\n\n---\n\n{POST_B}\n\nーーー\n\n3本目", link="忍びの謎巡り",
                          checked=(True, False, True, True)).replace("- [X] リーガル", "- [x] リーガル")
        parsed = parse_issue_form(body)
        self.assertEqual(parsed["posts"], [POST_A, POST_B, "3本目"])
        self.assertEqual(parsed["link_label"], "忍びの謎巡り")
        self.assertEqual(parsed["genre"], "今日の謎")
        self.assertEqual([c for c, _ in parsed["checks"]], [True, False, True, True, False])


class InboxTest(FlowBase):
    def test_opened_posts_report_without_queueing(self):
        code, out = self.run_cmd(sns.cmd_issue_event, event("opened", issue_body(POST_A)))
        self.assertEqual(code, 0)
        self.assertIn("軍配 機械検品レポート", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_owner_approval_enqueues_all_posts(self):
        code, out = self.approve(f"{POST_A}\n\n---\n\n{POST_B}", link="にんじゃミッション工房")
        self.assertEqual(code, 0)
        items = [self.store.load(p) for p in self.store.items(self.store.queue)]
        self.assertEqual(len(items), 2, out)
        self.assertEqual(items[0]["id"], "20260928-i7-1")
        self.assertTrue(items[0]["text"].endswith("https://tamehiro3.github.io/ninja-mission-kobo/"))
        self.assertEqual(items[0]["approved_by"], OWNER)
        self.assertIn("在庫に入れました", out)

    def test_unchecked_review_is_refused(self):
        _, out = self.approve(POST_A, checked=(True, True, False, True))
        self.assertIn("検品チェックが未完了", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_blocked_text_is_refused(self):
        _, out = self.approve("毎日の謎ときで認知症予防。広告なしで安心です")
        self.assertIn("機械検品で ❌", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_non_owner_cannot_approve_or_author(self):
        _, out = self.approve(POST_A, sender="someone")
        self.assertIn("承認できるのは所有者", out)
        _, out = self.approve(POST_A, author="someone")
        self.assertIn("所有者（tamehiro3）が書いた下書きだけ", out)
        self.assertEqual(self.store.items(self.store.queue), [])

    def test_second_approval_of_same_text_is_duplicate(self):
        self.approve(POST_A)
        _, out = self.approve(POST_A)
        self.assertIn("機械検品で ❌", out)
        self.assertEqual(len(self.store.items(self.store.queue)), 1)

    def test_non_sns_issue_ignored(self):
        path = event("opened", "hello")
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        data["issue"]["title"] = "バグ報告"
        Path(path).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        code, out = self.run_cmd(sns.cmd_issue_event, path)
        self.assertEqual(code, 0)
        self.assertIn("SNS下書きではない", out)


class PostTest(FlowBase):
    config = {"mode": "live", "channel": "x"}

    def setUp(self):
        super().setUp()
        self.creds = mock.patch.dict(os.environ, {"X_API_KEY": "k", "X_API_SECRET": "s",
                                                  "X_ACCESS_TOKEN": "t", "X_ACCESS_TOKEN_SECRET": "ts"})
        self.creds.start()
        self.approve(f"{POST_A}\n\n---\n\n{POST_B}")

    def tearDown(self):
        self.creds.stop()
        super().tearDown()

    def test_posts_one_item_and_records_result(self):
        with mock.patch.object(channels, "post_x", return_value={"remote_id": "99", "url": "https://x.com/i/web/status/99"}) as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0, out)
        m.assert_called_once()
        self.assertEqual(m.call_args[0][0], POST_A)
        posted = [self.store.load(p) for p in self.store.items(self.store.posted)]
        self.assertEqual(len(posted), 1)
        self.assertEqual(posted[0]["remote_id"], "99")
        self.assertEqual(posted[0]["cost_usd"], 0.015)
        self.assertEqual(len(self.store.items(self.store.queue)), 1)
        self.assertEqual(self.store.items(self.store.sending), [])
        self.assertIn("[SNS在庫] 残り1本", out)

    def test_auto_commit_touches_only_state_folders(self):
        with mock.patch.object(sns, "git_sync") as git, \
                mock.patch.object(channels, "post_x", return_value={"remote_id": "1", "url": "u"}):
            self.run_cmd(sns.cmd_post)
        allowed = {self.root / d for d in ("queue", "sending", "posted", "held", "media", "inbox")}
        self.assertEqual(git.call_count, 2)  # 送信開始（確保）と投稿完了
        for call in git.call_args_list:
            self.assertEqual(set(call[0][0]), allowed)

    def test_daily_cap_prevents_second_post(self):
        with mock.patch.object(channels, "post_x", return_value={"remote_id": "1", "url": "u"}) as m:
            self.run_cmd(sns.cmd_post)
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        self.assertEqual(m.call_count, 1)
        self.assertIn("今日の上限本数", out)

    def test_rejected_post_goes_back_to_queue(self):
        with mock.patch.object(channels, "post_x", side_effect=channels.PostRejected("HTTP 403")):
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 1)
        queue = [self.store.load(p) for p in self.store.items(self.store.queue)]
        self.assertEqual(len(queue), 2)
        self.assertEqual(self.store.items(self.store.sending), [])
        self.assertIn("HTTP 403", json.dumps(queue, ensure_ascii=False))
        self.assertIn("投稿失敗", out)

    def test_repeated_rejection_moves_item_to_held(self):
        with mock.patch.object(channels, "post_x", side_effect=channels.PostRejected("HTTP 400")):
            for _ in range(sns.MAX_REJECTS):
                self.run_cmd(sns.cmd_post)
        held = [self.store.load(p) for p in self.store.items(self.store.held)]
        self.assertEqual(len(held), 1)
        self.assertEqual(held[0]["text"], POST_A)
        self.assertEqual(len(self.store.items(self.store.queue)), 1)  # 次の1本は在庫に残る
        with mock.patch.object(channels, "post_x", return_value={"remote_id": "7", "url": "u"}) as m:
            self.run_cmd(sns.cmd_post)
        self.assertEqual(m.call_args[0][0], POST_B)

    def test_uncertain_post_stays_in_sending_and_halts_next_run(self):
        with mock.patch.object(channels, "post_x", side_effect=channels.PostUncertain("timeout")):
            code, _ = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 1)
        self.assertEqual(len(self.store.items(self.store.sending)), 1)
        with mock.patch.object(channels, "post_x") as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 1)
        m.assert_not_called()
        self.assertIn("送信中のまま", out)

    def test_budget_guard_stops_posting(self):
        cfg = json.loads((self.root / "config.json").read_text(encoding="utf-8"))
        cfg["x"]["monthly_budget_usd"] = 0.01
        (self.root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
        with mock.patch.object(channels, "post_x") as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        m.assert_not_called()
        self.assertIn("予算", out)

    def test_force_dry_run_from_manual_dispatch(self):
        with mock.patch.dict(os.environ, {"SNS_FORCE_DRY_RUN": "true"}), \
                mock.patch.object(channels, "post_x") as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        m.assert_not_called()
        self.assertIn("[dry-run]", out)
        self.assertEqual(len(self.store.items(self.store.queue)), 2)

    def test_missing_credentials_alerts_without_claiming(self):
        with mock.patch.dict(os.environ, {"X_API_KEY": ""}), mock.patch.object(channels, "post_x") as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 1)
        m.assert_not_called()
        self.assertIn("X_API_KEY", out)
        self.assertEqual(self.store.items(self.store.sending), [])

    def test_item_failing_new_rules_is_held_and_next_is_posted(self):
        rules = json.loads((self.root / "rules.json").read_text(encoding="utf-8"))
        rules["block"].append({"pattern": "光る", "reason": "テスト用の新ルール"})
        (self.root / "rules.json").write_text(json.dumps(rules, ensure_ascii=False), encoding="utf-8")
        with mock.patch.object(channels, "post_x", return_value={"remote_id": "5", "url": "u"}) as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0, out)
        self.assertEqual(m.call_args[0][0], POST_B)
        self.assertEqual(len(self.store.items(self.store.held)), 1)


class ModeTest(FlowBase):
    config = {"mode": "dry-run"}

    def test_dry_run_changes_nothing(self):
        self.approve(POST_A)
        with mock.patch.object(channels, "post_x") as m:
            code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        m.assert_not_called()
        self.assertIn(POST_A, out)
        self.assertEqual(len(self.store.items(self.store.queue)), 1)

    def test_empty_queue_in_dry_run_only_prints_alert(self):
        code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        self.assertIn("dry-runのため表示のみ", out)

    def test_paused_does_nothing(self):
        cfg = json.loads((self.root / "config.json").read_text(encoding="utf-8"))
        cfg["mode"] = "paused"
        (self.root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
        code, out = self.run_cmd(sns.cmd_post)
        self.assertEqual(code, 0)
        self.assertIn("一時停止中", out)

    def test_weekly_summary(self):
        code, out = self.run_cmd(sns.cmd_weekly)
        self.assertEqual(code, 0)
        self.assertIn("投稿本数: 0 / 目標7", out)
        self.assertIn("所見", out)


if __name__ == "__main__":
    unittest.main()


class GitHubSafetyTest(unittest.TestCase):
    def test_local_runs_never_write_to_github(self):
        import gh
        env = {"GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "o/r", "GITHUB_ACTIONS": "", "SNS_GH": ""}
        with mock.patch.dict(os.environ, env):
            self.assertFalse(gh.online())
        with mock.patch.dict(os.environ, dict(env, GITHUB_ACTIONS="true")):
            self.assertTrue(gh.online())
