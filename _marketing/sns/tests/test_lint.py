import unittest

from helpers import FACTS, load

from lint import bsky_length, lint_post, x_weighted_length

CFG = dict(load("config.json"), channel="x")  # この表のテストはXの基準で見る（Threadsは test_threads.py）
RULES = load("rules.json")
FACTS_TEXT = FACTS.read_text(encoding="utf-8")
OK_TEXT = "今日の謎です。ひらがな3文字の生き物で、夜になると光るものはなんでしょう。答えはあしたの夜に。"


def lint(text, link=None, existing=(), cfg=CFG):
    return lint_post(text, link, cfg, RULES, FACTS_TEXT, existing)


def messages(result, level):
    return [f.message for f in result.findings if f.level == level]


class LengthTest(unittest.TestCase):
    def test_japanese_counts_double(self):
        self.assertEqual(x_weighted_length("あ" * 140), 280)
        self.assertEqual(x_weighted_length("abc"), 3)

    def test_url_counts_23(self):
        self.assertEqual(x_weighted_length("あ\nhttps://tamehiro3.github.io/ninja-mission-kobo/"), 2 + 1 + 23)

    def test_emoji_modifiers_not_counted_twice(self):
        self.assertEqual(x_weighted_length("👍️"), 2)
        self.assertEqual(bsky_length("👨‍👩‍👧"), 1)

    def test_over_limit_blocks(self):
        self.assertFalse(lint("あ" * 140).blocked)
        r = lint("あ" * 141)
        self.assertTrue(r.blocked)
        self.assertTrue(any("文字数オーバー" in m for m in messages(r, "block")))

    def test_link_is_appended_and_counted(self):
        r = lint(OK_TEXT, "https://tamehiro3.github.io/")
        self.assertTrue(r.text.endswith("\nhttps://tamehiro3.github.io/"))
        self.assertEqual(r.x_length, x_weighted_length(OK_TEXT) + 1 + 23)


class RuleTest(unittest.TestCase):
    def test_clean_post_passes(self):
        r = lint(OK_TEXT)
        self.assertFalse(r.blocked, r.findings)

    def test_efficacy_claims_block(self):
        for text in ["毎日解くと認知症予防になります", "これで頭が良くなる謎とき", "成績が上がる脳トレです"]:
            self.assertTrue(lint(text).blocked, text)

    def test_superlative_blocks_but_unique_does_not(self):
        self.assertTrue(lint("なぞときゲームでNo.1の面白さを目指しました").blocked)
        self.assertTrue(lint("日本一やさしい暗号の謎をつくりました").blocked)
        r = lint("This is a unique puzzle game for families.")
        self.assertFalse(any("IQ" in m or "No.1" in m for m in messages(r, "block")), r.findings)

    def test_contradicting_fact_blocks(self):
        self.assertTrue(lint("広告なしで安心して遊べる無料ゲームです").blocked)

    def test_fake_scarcity_blocks(self):
        self.assertTrue(lint("期間限定で新しい謎を公開しています").blocked)

    def test_investment_talk_blocks(self):
        self.assertTrue(lint("CNPのキャラが値上がりするかもしれません").blocked)

    def test_engagement_bait_blocks(self):
        self.assertTrue(lint("リポストした人の中から抽選でプレゼントします").blocked)

    def test_in_game_currency_is_only_warning(self):
        r = lint("小判を稼げるようになったので、里を飾るのが楽しくなりました")
        self.assertFalse(r.blocked, r.findings)
        self.assertTrue(any("小判" in m for m in messages(r, "warn")))

    def test_guarantee_is_warning(self):
        r = lint("これは絶対に解けるはずの、やさしい謎をつくってみました")
        self.assertFalse(r.blocked)
        self.assertTrue(messages(r, "warn"))


class FormatTest(unittest.TestCase):
    def test_mention_blocks(self):
        self.assertTrue(lint("今日は@someone さんと遊びました。親子で楽しい時間でした").blocked)

    def test_email_like_is_not_mention(self):
        r = lint("連絡はGitHubのIssueへ。a.b@example とは書きません。いつもありがとうございます")
        self.assertFalse(any("メンション" in m for m in messages(r, "block")))

    def test_too_many_hashtags_block(self):
        self.assertTrue(lint("今日の謎を出します。\n#なぞとき #脳トレ #CNP").blocked)
        self.assertFalse(lint("今日の謎を出します。答えはあした。\n#なぞとき #CNP").blocked)

    def test_simplified_chinese_blocks(self):
        r = lint("今日の谜は、忍者が出てくる问题です。答えはあした")
        self.assertTrue(any("簡体字" in m for m in messages(r, "block")))

    def test_japanese_kanji_not_flagged_as_simplified(self):
        r = lint("会う・来る・実家・発見・対戦・経験・現在・進む・動く・問題・関係・頭・謎・戯れ・題・読む・語る")
        self.assertFalse(any("簡体字" in m for m in messages(r, "block")), r.findings)

    def test_cyrillic_and_hangul_block(self):
        self.assertTrue(lint("今日の謎はこれ。ПРИВЕТ。答えはあした").blocked)
        self.assertTrue(lint("今日の謎はこれ。안녕。答えはあした").blocked)

    def test_markdown_residue_blocks(self):
        self.assertTrue(lint("今日の謎は**とても**むずかしいです。答えはあした").blocked)

    def test_two_links_block(self):
        r = lint("こちらもどうぞ https://tamehiro3.github.io/ 今日の謎の答え", "https://tamehiro3.github.io/shinobi-nazomeguri/")
        self.assertTrue(any("1投稿1リンク" in m for m in messages(r, "block")))

    def test_foreign_link_blocks(self):
        self.assertTrue(lint("見てください https://example.com/ 今日の謎の答えはここ").blocked)

    def test_empty_blocks(self):
        self.assertTrue(lint("_No response_").blocked)
        self.assertTrue(lint("   ").blocked)


class FactAndDuplicateTest(unittest.TestCase):
    def test_numbers_in_fact_ledger_pass(self):
        r = lint("にんじゃミッション工房は10種類のなぞときがあって、1回5分で遊べます")
        self.assertFalse(any("事実台帳" in m for m in messages(r, "warn")), r.findings)

    def test_unknown_numbers_warn(self):
        r = lint("にんじゃミッション工房は50種類のなぞときがあります。ぜひ遊んでください")
        self.assertTrue(any("50" in m for m in messages(r, "warn")))

    def test_duplicate_blocks(self):
        r = lint(OK_TEXT, existing=[OK_TEXT])
        self.assertTrue(any("同じ文面" in m for m in messages(r, "block")))


if __name__ == "__main__":
    unittest.main()
