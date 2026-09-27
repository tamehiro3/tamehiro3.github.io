"""事実台帳の引用が、今のサイトのページに本当にあるか（ページが書き換わって台帳とずれたら落ちる）。"""
import html
import re
import unittest

from helpers import FACTS, SNS_DIR

REPO = SNS_DIR.parents[1]


class FactLedgerTest(unittest.TestCase):
    def test_quotes_exist_in_site_pages(self):
        ledger = FACTS.read_text(encoding="utf-8").split("## 言ってはいけないこと")[0]
        pages = "".join(html.unescape(re.sub(r"<[^>]+>", "", (REPO / name).read_text(encoding="utf-8")))
                        for name in ("index.html", "privacy.html"))
        quotes = re.findall(r"「([^「」]{6,})」", ledger)
        self.assertGreater(len(quotes), 20)
        missing = [q for q in quotes if q not in pages]
        self.assertEqual(missing, [], "ページから消えた引用があります。事実台帳を直してください")


if __name__ == "__main__":
    unittest.main()
