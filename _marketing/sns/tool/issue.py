"""Issueフォーム（.github/ISSUE_TEMPLATE/sns-draft.yml）の本文を読み取る。

フォームは「### 見出し」ごとに回答が並ぶ Markdown になる。見出しの言い回しが
少し変わっても読めるよう、キーワードで欄を見分ける。
"""
import re

from media import find_attachments

SEPARATOR_RE = re.compile(r"^\s*[-ー－―]{3,}\s*$", re.M)
CANVA_DESIGN_RE = re.compile(r"<!--\s*canva-design:\s*([A-Za-z0-9_-]+)\s*-->")
SOURCE_RE = re.compile(r"<!--\s*sns-source:\s*([\w-]+)\s*-->")
# Issueフォーム（sns-draft.yml）の検品チェックと同じ文言。Claudeが下書きを作るときもこの形にする
CHECK_LABELS = [
    "文体｜自分の体験・自分の言葉になっている（Typelessの整形で意味が変わっていない）",
    "事実｜数字・実績は事実台帳（_marketing/OFFER_FACTS.md）にあるものだけ",
    "リーガル｜効果・効能、No.1・最上級、NFT・投資・値上がりの話をしていない",
    "プライバシー｜子どもの名前・学校・顔など、個人が分かる情報がない",
    "画像｜画像の文字は説明欄と同じで、人の顔や子どもが写っておらず、使ってよい素材だけ（CNPはCC0、Canva素材はライセンスの範囲）",
]
CHECK_RE = re.compile(r"^\s*[-*]\s*\[( |x|X)\]\s*(.+?)\s*$", re.M)
NO_RESPONSE = "_No response_"


def _sections(body):
    sections = {}
    current = None
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        m = re.match(r"^###\s+(.+?)\s*$", line)
        if m:
            current = m.group(1)
            sections[current] = []
        elif current is not None:
            sections[current].append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items()}


def _find(sections, keyword):
    for title, value in sections.items():
        if keyword in title:
            return value
    return None


def split_posts(text):
    if not text or text.strip() == NO_RESPONSE:
        return []
    return [p.strip() for p in SEPARATOR_RE.split(text) if p.strip()]


def parse_issue_form(body):
    sections = _sections(body)
    text = _find(sections, "投稿文")
    genre = _find(sections, "ジャンル")
    link = _find(sections, "リンク")
    checks_raw = _find(sections, "検品") or ""
    checks = [(m.group(1).lower() == "x", m.group(2)) for m in CHECK_RE.finditer(checks_raw)]
    clean = lambda v: None if (v is None or v.strip() in ("", NO_RESPONSE)) else v.strip()  # noqa: E731
    image_desc = clean(_find(sections, "画像の説明"))
    return {
        "posts": split_posts(text),
        "genre": clean(genre),
        "link_label": clean(link) or "なし",
        "checks": checks,
        "has_form": text is not None,
        "images": find_attachments(_find(sections, "添付画像") or ""),
        "images_in_text": find_attachments(text or ""),
        "image_desc": image_desc,
        "canva_design_id": (CANVA_DESIGN_RE.search(body or "") or [None, None])[1],
        "source_marker": (SOURCE_RE.search(body or "") or [None, None])[1],
    }


def build_issue_body(text, genre="今日の謎", link_label="なし", image_url=None, image_desc=None,
                     canva_design_id=None, source="claude-canva"):
    """Issueフォームと同じ形の本文を作る（Claudeが下書きを代わりに作るとき用）。チェックはすべて空欄。"""
    image = "_No response_"
    if image_url:
        image = f"![画像]({image_url})"
        if canva_design_id:
            image += f"\n<!-- canva-design: {canva_design_id} -->"
    checks = "\n".join(f"- [ ] {label}" for label in CHECK_LABELS)
    return (f"<!-- sns-source: {source} -->\n"
            f"### 投稿文\n\n{text.strip()}\n\n"
            f"### ジャンル（輪番）\n\n{genre}\n\n"
            f"### リンク先（1投稿1リンク）\n\n{link_label}\n\n"
            f"### 添付画像（任意・1枚まで）\n\n{image}\n\n"
            f"### 画像の説明（画像を付けたときは必須）\n\n{(image_desc or '').strip() or '_No response_'}\n\n"
            f"### 検品チェック（機械検品のコメントを読んでから、自分でチェック）\n\n{checks}\n")
