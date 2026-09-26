import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1] / "tool"
SNS_DIR = Path(__file__).resolve().parents[1]
FACTS = Path(__file__).resolve().parents[2] / "OFFER_FACTS.md"
sys.path.insert(0, str(TOOL))

# テスト中は git も GitHub API も絶対に触らない
os.environ["SNS_GIT"] = "0"
os.environ.pop("GITHUB_TOKEN", None)


def load(name):
    return json.loads((SNS_DIR / name).read_text(encoding="utf-8"))


def temp_sns_root(config_overrides=None):
    """本物の config/rules をコピーした一時ディレクトリを作る。"""
    root = Path(tempfile.mkdtemp(prefix="sns-test-"))
    shutil.copy(SNS_DIR / "rules.json", root / "rules.json")
    cfg = load("config.json")
    for k, v in (config_overrides or {}).items():
        cfg[k] = v
    (root / "config.json").write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    return root


def issue_body(text, genre="今日の謎", link="なし", checked=(True, True, True, True)):
    """GitHub が Issueフォームから作る本文と同じ形。"""
    labels = [
        "文体｜自分の体験・自分の言葉になっている（Typelessの整形で意味が変わっていない）",
        "事実｜数字・実績は事実台帳（_marketing/OFFER_FACTS.md）にあるものだけ",
        "リーガル｜効果・効能、No.1・最上級、NFT・投資・値上がりの話をしていない",
        "プライバシー｜子どもの名前・学校・顔など、個人が分かる情報がない",
    ]
    checks = "\n".join(f"- [{'X' if c else ' '}] {label}" for c, label in zip(checked, labels))
    return (f"### 投稿文\n\n{text}\n\n### ジャンル（輪番）\n\n{genre}\n\n"
            f"### リンク先（1投稿1リンク）\n\n{link}\n\n"
            f"### 検品チェック（機械検品のコメントを読んでから、自分でチェック）\n\n{checks}\n")
