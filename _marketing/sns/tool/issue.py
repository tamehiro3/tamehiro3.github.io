"""Issueフォーム（.github/ISSUE_TEMPLATE/sns-draft.yml）の本文を読み取る。

フォームは「### 見出し」ごとに回答が並ぶ Markdown になる。見出しの言い回しが
少し変わっても読めるよう、キーワードで欄を見分ける。
"""
import re

SEPARATOR_RE = re.compile(r"^\s*[-ー－―]{3,}\s*$", re.M)
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
    clean = lambda v: None if (v is None or v.strip() in ("", NO_RESPONSE)) else v.strip()
    return {
        "posts": split_posts(text),
        "genre": clean(genre),
        "link_label": clean(link) or "なし",
        "checks": checks,
        "has_form": text is not None,
    }
