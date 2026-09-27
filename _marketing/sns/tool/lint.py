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
    threads_length: int = 0

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


def _content_checks(body, raw, rules, facts_text, add, prefix=""):
    """文面の中身の検品（投稿文と画像の説明で共通）: 異言語・表現ルール・事実台帳の数字。"""
    odd = sorted(set(CYRILLIC_HANGUL_RE.findall(body)))
    if odd:
        add("block", f"{prefix}異言語の文字が混入: {''.join(odd)}")
    simp = sorted({ch for ch in body if ch in SIMPLIFIED_CHARS})
    if simp:
        add("block", f"{prefix}簡体字が混入: {''.join(simp)}（Typelessの変換ミスの可能性）")
    for level in ("block", "warn"):
        for rule in rules.get(level, []):
            m = re.search(rule["pattern"], body)
            if m:
                add(level, f"{prefix}「{m.group(0)}」: {rule['reason']}")
    missing = _numbers_missing_from_facts(raw, facts_text)
    if missing:
        add("warn", f"{prefix}事実台帳に見当たらない数字: {'、'.join(missing)}（日付や謎の中の数字ならOK。実績・機能の数字なら台帳に登録してから）")


def lint_image_text(declared, rules, facts_text="", max_len=1000):
    """画像の説明（画像の中の文字を本人が読み上げたもの。代替テキストにもなる）を投稿文と同じ基準で検品する。"""
    findings = []
    add = lambda level, msg: findings.append(Finding(level, msg))  # noqa: E731
    text = clean_text(declared)
    if text in EMPTY_MARKERS:
        add("block", "画像の説明が空です（画像の中の文字をそのまま全部、Typelessで読み上げてください。文字がなければ絵の説明だけ）")
        return findings
    if len(text) > max_len:
        add("block", f"画像の説明が長すぎます（{len(text)}/{max_len}字。Xの代替テキストの上限）")
    body = URL_RE.sub("", text)
    if "**" in body:
        add("block", "画像の説明: Markdown記号（**）が残っています")
    _content_checks(body, text, rules, facts_text, add, prefix="画像の説明: ")
    return findings


def _chars(text):
    """照合用に、文字と数字だけを残す（OCRが挟む空白や記号の揺れを消す）。"""
    norm = unicodedata.normalize("NFKC", text or "").lower()
    return "".join(ch for ch in norm if unicodedata.category(ch)[0] in "LN")


def ocr_coverage(ocr_text, declared):
    """OCRで読めた文字の2文字組のうち、画像の説明に含まれる割合（0〜1）。読めた文字が少なすぎればNone。"""
    o, d = _chars(ocr_text), _chars(declared)
    if len(o) < 8:
        return None
    grams = {o[i:i + 2] for i in range(len(o) - 1)}
    have = {d[i:i + 2] for i in range(len(d) - 1)}
    return len(grams & have) / len(grams)


OCR_BLOCK_MIN_CHARS = 3  # これより短い一致（IQ・治る など）は誤読で出やすいので要確認止まり


def lint_ocr_text(ocr_text, declared, rules, min_coverage=0.5):
    """文字認識（OCR）の結果を検品する。

    禁止表現（block）のうち3文字以上の一致は、誤読で偶然そろうことがまずないので止める（fail closed）。
    短い一致・要確認表現・説明との食い違いは、誤読のこともあるので「要確認」止まり。
    """
    findings = []
    body = unicodedata.normalize("NFKC", ocr_text or "")
    compact = re.sub(r"\s+", "", body)
    for level in ("block", "warn"):
        for rule in rules.get(level, []):
            m = re.search(rule["pattern"], compact) or re.search(rule["pattern"], body)
            if not m:
                continue
            hit = re.sub(r"\s+", "", m.group(0))
            if level == "block" and len(hit) >= OCR_BLOCK_MIN_CHARS:
                findings.append(Finding("block", f"画像の中に「{hit}」があります（文字認識で検出）: {rule['reason']}。"
                                                 "画像を直して書き出し直してください"))
            else:
                findings.append(Finding("warn", f"画像の文字認識で「{hit}」を検出: {rule['reason']}（誤認識のこともあるので画像を目で確認）"))
    cov = ocr_coverage(ocr_text, declared)
    if cov is not None and cov < min_coverage:
        findings.append(Finding("warn", f"画像の文字と「画像の説明」が大きく違う可能性（一致率 {cov:.0%}）。説明に書いていない文字が画像にないか確認"))
    return findings


def lint_post(text, link, cfg, rules, facts_text="", existing_texts=()):
    """1本の下書きを検品する。existing_texts は在庫・投稿済みの本文（重複検出用）。"""
    raw = clean_text(text)
    composed = compose(raw, link)
    result = LintResult(text=composed)
    result.x_length = x_weighted_length(composed)
    result.bsky_length = bsky_length(composed)
    result.threads_length = len(unicodedata.normalize("NFC", composed))  # 保守的に数える（絵文字の合成も1字ずつ）

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
    t_max = cfg.get("threads", {}).get("max_chars", 500)
    if channel == "threads" and result.threads_length > t_max:
        result.add("block", f"Threadsの文字数オーバー（{result.threads_length}/{t_max}字）")

    urls = URL_RE.findall(composed)
    if len(urls) > 1:
        result.add("block", f"リンクが{len(urls)}個あります（1投稿1リンク）。URLは話さず、リンク先プルダウンで選んでください")
    # 設定のリンク先に書いたURL（メルマガなど）は、そのまま許可する
    prefixes = tuple(cfg.get("allowed_link_prefixes", [])) + tuple(v for v in cfg.get("links", {}).values() if v)
    for url in urls:
        if not url.startswith(prefixes):
            result.add("block", f"許可されていないリンク先: {url}")

    tags = HASHTAG_RE.findall(composed)
    max_tags = cfg.get(channel, {}).get("max_hashtags", cfg.get("max_hashtags", 2))
    if len(tags) > max_tags:
        why = "Threadsのトピックは1投稿1つ" if channel == "threads" else "ハッシュタグ乱用対策"
        result.add("block", f"ハッシュタグが{len(tags)}個（上限{max_tags}。{why}）")

    mentions = MENTION_RE.findall(URL_RE.sub("", composed))
    if mentions:
        result.add("block", f"メンション {' '.join(mentions)} は自動投稿に使えません（各SNSの自動化ルール・誤爆防止）。手動で投稿してください")

    body = URL_RE.sub("", composed)
    if "**" in body or "__" in body or re.search(r"^#{1,6}\s", body, re.M):
        result.add("block", "Markdown記号（** や見出しの #）が残っています")
    _content_checks(body, raw, rules, facts_text, result.add)

    normalized = composed.strip()
    if any(normalized == (t or "").strip() for t in existing_texts):
        result.add("block", "在庫または投稿済みに同じ文面があります（重複投稿はX規約違反・二重投稿防止）")
    return result
