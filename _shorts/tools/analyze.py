"""⑩ 投稿後の数字から、次回の改善点を洗い出す。

  python3 tools/analyze.py improve/metrics_ep01.csv [--out improve/analysis_ep01.md]

CSV は improve/metrics_template.csv の列（空欄可）。各アプリのインサイト画面の数字を、投稿の
24時間後・72時間後・7日後に1行ずつ記録する。

判定の基準値はすべて「目安（勘）」。自分の投稿が5〜10本たまったら、自分の中央値に置き換えること
（軍配の根拠の掟：勘は勘と書く）。
"""
import argparse
import csv
from pathlib import Path

# 基準値（目安・勘）。(弱い, 強い)
TH = {
    "hook": (0.60, 0.75),           # 冒頭で離脱しなかった割合（YouTube「スワイプされずに視聴」、TikTok 2〜3秒維持）
    "watch_ratio": (0.35, 0.55),    # 平均視聴時間 ÷ 尺
    "completion": (0.15, 0.30),     # 最後まで見た割合
    "like": (0.03, 0.06),
    "comment": (0.002, 0.006),
    "share": (0.003, 0.010),
    "save": (0.005, 0.015),
    "send": (0.005, 0.015),         # Instagram の送信（DM）÷ リーチ
    "follow": (0.001, 0.004),
    "fyp": (0.50, 0.80),            # おすすめ（For You）経由の割合
}

FIX = {
    "hook": [
        "1文目を短くする（15文字以内）。1コマ目に「結果」か「危険」を見せる",
        "冒頭の図解を文字より絵（スイッチ・スマホ画面）中心にする",
        "カバー（1コマ目）とキャプションの1行目を、問いかけと同じ言葉にそろえる",
    ],
    "watch_ratio": [
        "解決策の提示を8秒以内に前倒しする（問題の説明は1文に）",
        "中だるみしている区間（リテンショングラフの落ち込み）の文を削る・短くする",
        "図解の切り替えを2〜3秒ごとにする（同じ図のまま4秒以上続けない）",
    ],
    "completion": [
        "最後の3秒で冒頭の問いに戻るループを強める（最後のコマ＝1コマ目にする）",
        "まとめを1文に縮め、CTAを最後の5秒に置く",
    ],
    "like": ["共感できる「あるある」の一文を入れる（本人の体験）"],
    "comment": [
        "キャプションに、一言で答えられる質問かキーワードを置く（例：「オフにした」とコメント）",
        "賛否が分かれる一言を入れる（ただし事実は曲げない）",
    ],
    "share": ["「誰に送ればいいか」を名指しする（親・同僚・ママ友）"],
    "save": [
        "手順を画面に一覧で残す（保存して後で見返す理由を作る）",
        "キャプションに手順を文字で書く",
    ],
    "send": ["動画内のCTAを「送ってあげて」に一本化する（Instagram 向け）"],
    "follow": [
        "シリーズ名と次回予告を最後の図解に入れる",
        "プロフィールに「毎日19時にAIの時短ワザ」など、フォローする理由を書く",
    ],
    "fyp": [
        "キャプションとテロップに、検索される言葉（ChatGPT、設定、使い方）を入れる",
        "投稿時間を変えて比べる（18時／21時）",
    ],
}

LABEL = {"hook": "冒頭の維持（フック）", "watch_ratio": "平均視聴率（中だるみ）", "completion": "完了率",
         "like": "いいね率", "comment": "コメント率", "share": "シェア率", "save": "保存率",
         "send": "送信率（IG）", "follow": "フォロー率", "fyp": "おすすめ経由の割合"}


def f(x):
    try:
        return float(str(x).replace(",", "").replace("%", "")) if str(x).strip() != "" else None
    except ValueError:
        return None


def pct(x):
    """"45%" でも 0.45 でも受ける"""
    v = f(x)
    if v is None:
        return None
    return v / 100 if (isinstance(x, str) and "%" in x) or v > 1 else v


def rates(r):
    views = f(r.get("views")) or 0
    reach = f(r.get("reach")) or views
    dur = f(r.get("duration_sec")) or 57
    out = {}
    if f(r.get("avg_watch_sec")) is not None:
        out["watch_ratio"] = f(r["avg_watch_sec"]) / dur
    for k, col in [("hook", "hook_rate"), ("completion", "completion_rate"), ("fyp", "fyp_share")]:
        if pct(r.get(col)) is not None:
            out[k] = pct(r[col])
    for k in ("like", "comment", "share", "save", "follow"):
        v = f(r.get(k + "s"))
        if v is not None and views:
            out[k] = v / views
    if f(r.get("sends")) is not None and reach:
        out["send"] = f(r["sends"]) / reach
    return out


def grade(k, v):
    lo, hi = TH[k]
    return "弱い" if v < lo else "強い" if v >= hi else "ふつう"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--out")
    a = ap.parse_args()
    rows = list(csv.DictReader(open(a.csv, encoding="utf-8")))
    if not rows or all(not f(r.get("views")) for r in rows):
        raise SystemExit("数字が入っていません。投稿後に improve/metrics_template.csv をコピーして記入してください")
    L = [f"# 投稿後の分析: {Path(a.csv).stem}", "", "基準値は目安（勘）。自分の投稿が5〜10本たまったら、自分の中央値に置き換えてください。", ""]
    weak_count = {}
    for r in rows:
        if not f(r.get("views")):
            continue
        rt = rates(r)
        L += [f"## {r.get('platform')}（{r.get('checkpoint')}）  再生 {int(f(r['views'])):,}", "",
              "| 指標 | 値 | 判定 |", "|---|---|---|"]
        for k, v in rt.items():
            g = grade(k, v)
            L.append(f"| {LABEL[k]} | {v * 100:.1f}% | {g} |")
            if g == "弱い":
                weak_count[k] = weak_count.get(k, 0) + 1
        L.append("")
    # 優先順位：ファネルの上から（フック → 視聴 → 完了 → 反応 → 拡散）
    order = ["hook", "watch_ratio", "completion", "fyp", "share", "send", "save", "comment", "like", "follow"]
    L += ["## 次回の改善点（優先順）", ""]
    n = 0
    for k in order:
        if k in weak_count:
            n += 1
            L.append(f"{n}. **{LABEL[k]}が弱い**（{weak_count[k]}媒体）")
            L += [f"   - {x}" for x in FIX[k]]
    if not n:
        L.append("弱い指標はありません。いまのテンプレートを変えずに、別のテーマで再現するか試してください（勝ちパターンの認定）。")
    L += ["", "## 判断ログ（追記のみ）", "", "| 日付 | 変えたこと | 理由（上の指標） | 結果（次回の数字） |", "|---|---|---|---|", "|  |  |  |  |"]
    text = "\n".join(L)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
