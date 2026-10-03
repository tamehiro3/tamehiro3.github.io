"""メルマガ原稿の機械検品（文体・表現）。

使い方: python3 _marketing/mailmag/check.py <原稿.md> [...]
ルールは同じフォルダの ng_rules.json。block が1つでもあれば終了コード1。
事実・リーガルの最終判断は人間に残す（設計図 §7）。
"""
import json
import re
import sys
from pathlib import Path

RULES = json.loads((Path(__file__).with_name("ng_rules.json")).read_text(encoding="utf-8"))
FLAGS = {"s": re.S, "m": re.M}


def _compile(rule):
    flags = 0
    for f in rule.get("flags", ""):
        flags |= FLAGS[f]
    return re.compile(rule["pattern"], flags)


def _line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def check(text):
    """(level, message) のリストを返す。level は block / warn。"""
    out = []
    for level in ("block", "warn"):
        for rule in RULES[level]:
            for m in _compile(rule).finditer(text):
                out.append((level, f"{_line_of(text, m.start())}行目「{m.group(0)[:20]}」: {rule['reason']}"))
    for rule in RULES["limit"]:
        hits = _compile(rule).findall(text)
        if len(hits) > rule["max"]:
            out.append(("warn", f"「{rule['pattern']}」が{len(hits)}回（上限{rule['max']}）: {rule['reason']}"))
    sentences = re.split(r"(?<=[。！？!?])", text)
    run, worst = 0, 0
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        run = run + 1 if re.search(r"(です|ます|でした|ました|ません)。$", s) else 0
        worst = max(worst, run)
    rh = RULES["rhythm"]
    if worst > rh["max_consecutive_desu_masu"]:
        out.append(("warn", f"です・ます止めが{worst}文連続（上限{rh['max_consecutive_desu_masu']}）: {rh['reason']}"))
    return out


def main(paths):
    blocked = False
    for p in paths:
        findings = check(Path(p).read_text(encoding="utf-8"))
        print(f"== {p}: block {sum(l == 'block' for l, _ in findings)} / warn {sum(l == 'warn' for l, _ in findings)}")
        for level, msg in findings:
            print(f"  [{level}] {msg}")
        blocked |= any(l == "block" for l, _ in findings)
    return 1 if blocked else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
