"""機械検品（軍配 review-protocol §1）。

客観的に判定できる形式要件だけをここで見る。文体・事実・リーガルの最終判断は人間
（Issueの検品チェック欄）に残す。判定は 3 段階:
  block = 承認できない / warn = 人の目で確認 / ok
"""
import re
import unicodedata
from dataclasses import dataclass, field

URL_RE = re.compile(r"https?://[^\s　]+")
HASHTAG_RE = re.compile(r"(?:(?<=\s)|^)[#＃]([^\s#＃、。，．,.!！?？「」（）()]+)", re.M)
MENTION_RE = re.compile(r"(?<![0-9A-Za-z_.])[@＠][A-Za-z0-9_]{1,15}")
CYRILLIC_HANGUL_RE = re.compile(r"[Ѐ-ӿᄀ-ᇿ㄰-㆏가-힯]")
# 日本語で使わない簡体字だけを並べる（日本語の常用字を混ぜると誤検知の源になる）
SIMPLIFIED_CHARS = set(
    "这们说为么时过对发经现实进动问关头还样种给让从应该产业东车长门马鸟龙"
    "亲认识边岁谜戏题读语请谢欢乐爱开习级难简单线网页买卖"
)
NUMBER_RE = re.compile(r"(\d+(?:\.\d+)?)([^\s\d、。，．,.!！?？]{0,2})")
EMPTY_MARKERS = {"", "_No response_"}

# X（twitter-text v3）の重み: この範囲の文字は1、それ以外は2。URLは一律23。
_X_LIGHT_RANGES = ((0, 4351), (8192, 8205), (8208, 8223), (8242, 8247))
_ZERO_WIDTH = {0x200D, 0xFE0E, 0xFE0F}
X_URL_LENGTH = 23


@dataclass
class Finding:
    level: str  # "block" | "warn"
    message: str


@dataclass
class LintResult:
    text: str  # 実際に投稿される本文（リンク付加後）
    findings: list = field(default_factory=list)
    x_length: int = 0
    bsky_length: int = 0

    @property
    def blocked(self):
        return any(f.level == "block" for f in self.findings)

    @property
    def warnings(self):
        return [f for f in self.findings if f.level == "warn"]

    def add(self, level, message):
        self.findings.append(Finding(level, message))


def clean_text(text):
    """改行・空白の揺れだけを整える（文面そのものは変えない）。"""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.split("\n")]
    out = "\n".join(lines).strip()
    return re.sub(r"\n{3,}", "\n\n", out)


def compose(text, link):
    text = clean_text(text)
    return f"{text}\n{link}" if link else text


def _is_modifier(cp):
    return cp in _ZERO_WIDTH or 0x1F3FB <= cp <= 0x1F3FF or 0xFE00 <= cp <= 0xFE0F


def x_weighted_length(text):
    total = 0
    for _ in URL_RE.finditer(text):
        total += X_URL_LENGTH
    rest = URL_RE.sub("", unicodedata.normalize("NFC", text))
    for ch in rest:
        cp = ord(ch)
        if _is_modifier(cp):
            continue
        total += 1 if any(lo <= cp <= hi for lo, hi in _X_LIGHT_RANGES) else 2
    return total


def bsky_length(text):
    """書記素数の近似（結合文字・異体字セレクタ・ZWJ連結は数えない）。"""
    count = 0
    after_zwj = False
    for ch in unicodedata.normalize("NFC", text):
        cp = ord(ch)
        if cp == 0x200D:
            after_zwj = True
            continue
        if after_zwj:
            after_zwj = False
            continue
        if _is_modifier(cp) or unicodedata.combining(ch):
            continue
        count += 1
    return count


def _numbers_missing_from_facts(text, facts_text):
    facts = unicodedata.normalize("NFKC", facts_text or "")
    body = unicodedata.normalize("NFKC", URL_RE.sub("", text))
    body = HASHTAG_RE.sub("", body)
    missing = []
    for m in NUMBER_RE.finditer(body):
        token = m.group(1) + m.group(2)[:1]  # 数字＋単位の1文字目で照合（10種類→「10種」）
        if token not in facts and m.group(0) not in missing:
            missing.append(m.group(0))
    return missing


def lint_post(text, link, cfg, rules, facts_text="", existing_texts=()):
    """1本の下書きを検品する。existing_texts は在庫・投稿済みの本文（重複検出用）。"""
    raw = clean_text(text)
    composed = compose(raw, link)
    result = LintResult(text=composed)
    result.x_length = x_weighted_length(composed)
    result.bsky_length = bsky_length(composed)

    if raw in EMPTY_MARKERS:
        result.add("block", "本文が空です")
        return result
    if len(raw) < 15:
        result.add("warn", f"本文が短すぎないか（{len(raw)}字）")

    channel = cfg.get("channel", "x")
    x_max = cfg.get("x", {}).get("max_weighted_length", 280)
    b_max = cfg.get("bluesky", {}).get("max_graphemes", 300)
    if channel == "x" and result.x_length > x_max:
        result.add("block", f"Xの文字数オーバー（X換算 {result.x_length}/{x_max}。全角はおよそ{x_max // 2}字まで）")
    if channel == "bluesky" and result.bsky_length > b_max:
        result.add("block", f"Blueskyの文字数オーバー（{result.bsky_length}/{b_max}字）")

    urls = URL_RE.findall(composed)
    if len(urls) > 1:
        result.add("block", f"リンクが{len(urls)}個あります（1投稿1リンク）。URLは話さず、リンク先プルダウンで選んでください")
    prefixes = tuple(cfg.get("allowed_link_prefixes", []))
    for url in urls:
        if not url.startswith(prefixes):
            result.add("block", f"許可されていないリンク先: {url}")

    tags = HASHTAG_RE.findall(composed)
    max_tags = cfg.get("max_hashtags", 2)
    if len(tags) > max_tags:
        result.add("block", f"ハッシュタグが{len(tags)}個（上限{max_tags}。X自動化ルールのハッシュタグ乱用対策）")

    mentions = MENTION_RE.findall(URL_RE.sub("", composed))
    if mentions:
        result.add("block", f"メンション {' '.join(mentions)} は自動投稿に使えません（X自動化ルール・誤爆防止）。手動で投稿してください")

    body = URL_RE.sub("", composed)
    odd = sorted(set(CYRILLIC_HANGUL_RE.findall(body)))
    if odd:
        result.add("block", f"異言語の文字が混入: {''.join(odd)}")
    simp = sorted({ch for ch in body if ch in SIMPLIFIED_CHARS})
    if simp:
        result.add("block", f"簡体字が混入: {''.join(simp)}（Typelessの変換ミスの可能性）")
    if "**" in body or "__" in body or re.search(r"^#{1,6}\s", body, re.M):
        result.add("block", "Markdown記号（** や見出しの #）が残っています")

    for rule in rules.get("block", []):
        m = re.search(rule["pattern"], body)
        if m:
            result.add("block", f"「{m.group(0)}」: {rule['reason']}")
    for rule in rules.get("warn", []):
        m = re.search(rule["pattern"], body)
        if m:
            result.add("warn", f"「{m.group(0)}」: {rule['reason']}")

    missing = _numbers_missing_from_facts(raw, facts_text)
    if missing:
        result.add("warn", f"事実台帳に見当たらない数字: {'、'.join(missing)}（日付や謎の中の数字ならOK。実績・機能の数字なら台帳に登録してから）")

    normalized = composed.strip()
    if any(normalized == (t or "").strip() for t in existing_texts):
        result.add("block", "在庫または投稿済みに同じ文面があります（重複投稿はX規約違反・二重投稿防止）")
    return result
