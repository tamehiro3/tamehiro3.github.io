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


def issue_body(text, genre="今日の謎", link="なし", checked=(True, True, True, True), image_md="",
               image_desc="", image_checked=False):
    """GitHub が Issueフォームから作る本文と同じ形。"""
    labels = [
        "文体｜自分の体験・自分の言葉になっている（Typelessの整形で意味が変わっていない）",
        "事実｜数字・実績は事実台帳（_marketing/OFFER_FACTS.md）にあるものだけ",
        "リーガル｜効果・効能、No.1・最上級、NFT・投資・値上がりの話をしていない",
        "プライバシー｜子どもの名前・学校・顔など、個人が分かる情報がない",
        "画像｜画像の文字は説明欄と同じで、人の顔や子どもが写っておらず、使ってよい素材だけ（CNPはCC0、Canva素材はライセンスの範囲）",
    ]
    flags = list(checked) + [image_checked]
    checks = "\n".join(f"- [{'X' if c else ' '}] {label}" for c, label in zip(flags, labels))
    return (f"### 投稿文\n\n{text}\n\n### ジャンル（輪番）\n\n{genre}\n\n"
            f"### リンク先（1投稿1リンク）\n\n{link}\n\n"
            f"### 添付画像（任意・1枚まで）\n\n{image_md or '_No response_'}\n\n"
            f"### 画像の説明（画像を付けたときは必須）\n\n{image_desc or '_No response_'}\n\n"
            f"### 検品チェック（機械検品のコメントを読んでから、自分でチェック）\n\n{checks}\n")


ATTACH_URL = "https://github.com/user-attachments/assets/2c3f5b4a-1d2e-4f60-9a7b-0123456789ab"
ATTACH_MD = f'<img width="1600" height="900" alt="Image" src="{ATTACH_URL}" />'
