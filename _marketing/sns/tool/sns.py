#!/usr/bin/env python3
"""しのびのゲーム工房 SNS自動投稿ツール（Typelessの下書き → 検品 → 承認 → 定時投稿）

使い方:
  python3 sns.py issue-event <event.json>   Issueイベントを処理（検品コメント／承認なら在庫へ）
  python3 sns.py post                       在庫から1本投稿（config.json の mode に従う）
  python3 sns.py weekly                     週次改善Issueを作る
  python3 sns.py check "本文" [リンク名]     手元で機械検品だけ試す
  python3 sns.py lint-queue                 在庫全件を再検品（CI用）
"""
import json
import os
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import channels  # noqa: E402
import gh  # noqa: E402
from issue import parse_issue_form  # noqa: E402
from lint import lint_post  # noqa: E402
from store import Store, git_sync, now_jst  # noqa: E402

SNS_ROOT = Path(os.environ.get("SNS_ROOT") or Path(__file__).resolve().parents[1])
REPO_ROOT = Path(os.environ.get("SNS_REPO_ROOT") or Path(__file__).resolve().parents[3])
FACTS_PATH = Path(os.environ.get("SNS_FACTS") or Path(__file__).resolve().parents[2] / "OFFER_FACTS.md")
INSPECT_MARKER = "<!-- sns-inspect -->"
DRAFT_LABEL, APPROVE_LABEL, ALERT_LABEL, WEEKLY_LABEL = "SNS下書き", "承認", "SNS警報", "週次改善"
MAX_REJECTS = 3  # 同じ1本がSNS側に拒否され続けたら保留に回す回数


def load_json(name):
    return json.loads((SNS_ROOT / name).read_text(encoding="utf-8"))


def facts_text():
    return FACTS_PATH.read_text(encoding="utf-8") if FACTS_PATH.exists() else ""


def resolve_link(cfg, label):
    links = cfg.get("links", {})
    if label not in links:
        return None, f"リンク先「{label}」は config.json の links にありません"
    return links[label], None


def inspect_posts(cfg, rules, parsed, store):
    link, link_error = resolve_link(cfg, parsed["link_label"])
    existing = store.all_texts()
    results = []
    for text in parsed["posts"]:
        r = lint_post(text, link, cfg, rules, facts_text(), existing)
        if link_error:
            r.add("block", link_error)
        results.append(r)
        existing = existing + [r.text]  # 同じIssue内の重複も拾う
    return link, results


def _level_line(r):
    blocks = sum(1 for f in r.findings if f.level == "block")
    warns = len(r.warnings)
    head = "❌ ブロック" if blocks else ("⚠️ 要確認" if warns else "✅ 通過")
    return f"{head}（ブロック {blocks} / 要確認 {warns}）"


def render_report(cfg, parsed, results):
    lines = ["## 軍配 機械検品レポート", ""]
    if not parsed["has_form"]:
        lines.append("「投稿文」欄が見つかりません。Issueフォーム「SNS下書き」から作成してください。")
        return "\n".join(lines)
    blocked = any(r.blocked for r in results) or not results
    verdict = "❌ 直すところがあります（このままでは承認できません）" if blocked else "✅ 機械検品は通過"
    lines += [f"- 本数: {len(results)} / 主戦場: {cfg['channel']} / リンク先: {parsed['link_label']} / ジャンル: {parsed['genre'] or '未選択'}",
              f"- 判定: {verdict}", ""]
    for i, r in enumerate(results, 1):
        lines.append(f"### {i}本目 — {_level_line(r)}")
        lines.append("")
        preview = r.text.replace("@", "@\u200b").replace("＠", "＠\u200b")  # 引用でメンション通知を飛ばさない
        lines += ["> " + (ln if ln else "　") for ln in preview.split("\n")]
        lines.append("")
        lines.append(f"- 文字数: X換算 {r.x_length}/{cfg['x']['max_weighted_length']}・Bluesky {r.bsky_length}/{cfg['bluesky']['max_graphemes']}")
        for f in r.findings:
            lines.append(f"- {'❌' if f.level == 'block' else '⚠️'} {f.message}")
        lines.append("")
    lines += ["---",
              "**次にやること**",
              "1. ❌ があれば本文を編集（保存すると自動で再検品）",
              "2. ⚠️ を自分の目で確認し、本文の「検品チェック」4つにチェック",
              f"3. ラベル「{APPROVE_LABEL}」を付ける → 在庫に入り、毎日1本ずつ自動投稿されます"]
    return "\n".join(lines)


def cmd_issue_event(event_path):
    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    action, issue = event.get("action"), event.get("issue") or {}
    number = issue.get("number")
    if not (issue.get("title") or "").startswith("[SNS]"):
        print("SNS下書きではないので何もしない")
        return 0
    cfg, rules, store = load_json("config.json"), load_json("rules.json"), Store(SNS_ROOT)
    parsed = parse_issue_form(issue.get("body") or "")

    if action == "labeled":
        if (event.get("label") or {}).get("name") != APPROVE_LABEL:
            return 0
        return approve(event, cfg, rules, store, parsed)

    if issue.get("state") == "closed":
        print("閉じたIssueは検品しない")
        return 0
    if action == "opened":
        gh.ensure_labels()
        gh.add_labels(number, [DRAFT_LABEL])
    _, results = inspect_posts(cfg, rules, parsed, store)
    gh.upsert_comment(number, INSPECT_MARKER, render_report(cfg, parsed, results))
    return 0


def approve(event, cfg, rules, store, parsed):
    issue = event["issue"]
    number = issue["number"]
    owner = cfg.get("owner") or os.environ.get("GITHUB_REPOSITORY_OWNER")
    sender = (event.get("sender") or {}).get("login")
    author = (issue.get("user") or {}).get("login")
    problems = []
    if issue.get("state") == "closed":
        problems.append("閉じたIssueは承認できません（新しい下書きを作ってください）")
    if sender != owner:
        problems.append(f"承認できるのは所有者（{owner}）だけです")
    if author != owner:
        problems.append(f"所有者（{owner}）が書いた下書きだけ承認できます")
    if not parsed["posts"]:
        problems.append("投稿文が空です")
    link, results = inspect_posts(cfg, rules, parsed, store)
    if any(r.blocked for r in results):
        problems.append("機械検品で ❌ が残っています（検品コメントを確認）")
    if not parsed["checks"]:
        problems.append("検品チェック欄が見つかりません")
    unchecked = [label for checked, label in parsed["checks"] if not checked]
    if unchecked:
        problems.append("検品チェックが未完了: " + " / ".join(unchecked))

    if problems:
        gh.upsert_comment(number, INSPECT_MARKER, render_report(cfg, parsed, results))
        gh.comment(number, "## 承認できませんでした\n" + "\n".join(f"- {p}" for p in problems)
                   + f"\n\n直したら、もう一度ラベル「{APPROVE_LABEL}」を付けてください。")
        gh.remove_label(number, APPROVE_LABEL)
        print("承認不可:", problems)
        return 0

    posts = [{"text": r.text, "genre": parsed["genre"], "link_label": parsed["link_label"], "link": link,
              "warnings": [f.message for f in r.warnings]} for r in results]
    source = {"issue": number, "url": issue.get("html_url")}
    paths = store.enqueue(posts, source, sender)
    git_sync(store.state_dirs(), f"SNS: #{number} の下書き{len(paths)}本を在庫へ（承認: {sender}）", REPO_ROOT)
    stock = len(store.items(store.queue))
    gh.comment(number, f"## 在庫に入れました（{len(paths)}本）\n"
               + "\n".join(f"- `{p.name}`" for p in paths)
               + f"\n\n在庫は合計 {stock} 本。毎日1本ずつ自動投稿されます（mode: `{cfg['mode']}`）。")
    gh.close_issue(number)
    return 0


def _alert(key, title, body, live=True):
    """警報Issueを出す。dry-run では外部に何も書かず、表示だけにする。"""
    if live:
        gh.upsert_issue(key, title, body, ALERT_LABEL)
    print(f"[警報{'' if live else '（dry-runのため表示のみ）'}] {title}\n{body}")


def estimate_cost(cfg, item):
    if cfg["channel"] != "x":
        return 0.0
    x = cfg["x"]
    return x["cost_per_link_post_usd"] if item.get("link") else x["cost_per_post_usd"]


def cmd_post():
    cfg, rules, store = load_json("config.json"), load_json("rules.json"), Store(SNS_ROOT)
    mode = cfg.get("mode", "dry-run")
    if os.environ.get("SNS_FORCE_DRY_RUN") == "true" and mode == "live":
        mode = "dry-run"
    channel = cfg.get("channel")
    now = now_jst()
    live = mode == "live"
    alert = lambda key, title, body: _alert(key, title, body, live)  # noqa: E731
    print(f"mode={mode} channel={channel} now={now.isoformat(timespec='minutes')}")
    if mode == "paused":
        print("一時停止中（config.json の mode: paused）。何もしない")
        return 0
    if channel not in ("x", "bluesky"):
        alert("[SNS警報] 設定", "[SNS警報] 設定: channel が不正", f"config.json の channel は x か bluesky（現在: {channel}）")
        return 1

    stuck = store.items(store.sending)
    if stuck:
        alert("[SNS警報] 送信中のまま", f"[SNS警報] 送信中のまま止まった投稿があります（{len(stuck)}件）",
               "投稿されたかどうか分からないため、自動投稿を止めています（二重投稿防止）。\n\n"
               + "\n".join(f"- `_marketing/sns/sending/{p.name}`" for p in stuck)
               + "\n\n**確認のしかた**: SNSを見て、\n- 投稿されていた → ファイルを `posted/` へ移動\n"
                 "- 投稿されていない → ファイルを `queue/` へ移動\n（GitHubの画面でファイルを編集し、ファイル名欄のフォルダ部分を書き換えると移動できます）")
        return 1
    if live:
        gh.close_issues("[SNS警報] 送信中のまま", ALERT_LABEL, "送信中のファイルが片付いたので、自動投稿を再開しました。")

    if store.posted_count_on(now.date()) >= cfg.get("max_posts_per_day", 1):
        print("今日の上限本数に達しているので投稿しない")
        return 0

    item_path = None
    for path in store.items(store.queue):
        item = store.load(path)
        others = [t for t in store.all_texts() if t != item.get("text")]
        r = lint_post(item["text"], None, cfg, rules, facts_text(), others)
        if r.blocked:  # 承認後にルールが変わった等。この1本だけ保留して次へ
            reasons = [f.message for f in r.findings if f.level == "block"]
            if live:
                store.hold(path, reasons)
                git_sync(store.state_dirs(), f"SNS: {path.stem} を保留（再検品で不合格）", REPO_ROOT)
                alert("[SNS警報] 保留", f"[SNS警報] 保留: {path.stem}",
                       "承認後の再検品で不合格になったため `held/` に移しました。\n" + "\n".join(f"- {x}" for x in reasons))
            else:
                print(f"[dry-run] {path.name} は再検品で不合格: {reasons}")
            continue
        item_path = path
        break

    remaining = len(store.items(store.queue)) - (1 if item_path else 0)
    if item_path is None:
        alert("[SNS在庫]", "[SNS在庫] 在庫切れ：今日は投稿されません",
               f"在庫（queue）が0本です。Typelessで話して、Issue「SNS下書き」から補充してください。（{now:%Y-%m-%d}）")
        return 0

    item = store.load(item_path)
    cost = estimate_cost(cfg, item)
    if channel == "x":
        budget = cfg["x"]["monthly_budget_usd"]
        spent = store.month_spend(f"{now:%Y-%m}")
        if spent + cost > budget:
            alert("[SNS警報] 予算", f"[SNS警報] 予算: 今月のX API推定額が上限に達しました",
                   f"今月の推定額 ${spent:.3f} + 次の1本 ${cost:.3f} > 上限 ${budget:.2f}。"
                   "上限を上げるかどうかは本人判断です（config.json の x.monthly_budget_usd と判断ログ）。")
            return 0

    print(f"--- 投稿予定: {item['id']}（リンク: {item.get('link_label')} / 推定 ${cost:.3f}）---\n{item['text']}\n---")
    creds, missing = (channels.x_credentials if channel == "x" else channels.bluesky_credentials)(os.environ)
    if not live:
        print(f"[dry-run] 投稿しない。在庫は投稿後 {remaining} 本の見込み。"
              f"認証情報: {'未設定 ' + ', '.join(missing) if missing else 'すべて設定済み'}")
        return 0
    if missing:
        alert("[SNS警報] 認証", "[SNS警報] 認証情報が未設定です",
               "GitHub の Settings → Secrets and variables → Actions に次を登録してください: " + ", ".join(missing))
        return 1

    sending_path = store.claim(item_path)
    git_sync(store.state_dirs(), f"SNS: 送信開始 {item['id']}", REPO_ROOT)
    try:
        if channel == "x":
            result = channels.post_x(item["text"], creds)
        else:
            bs = cfg.get("bluesky", {})
            result = channels.post_bluesky(item["text"], creds, bs.get("service", "https://bsky.social"),
                                           bs.get("langs", ["ja"]))
    except channels.PostRejected as e:
        tries = len(store.load(sending_path).get("failures", [])) + 1
        if tries >= MAX_REJECTS:  # 同じ1本が先頭で詰まり続けないよう、保留に回して次へ進める
            store.hold(sending_path, [f"{tries}回続けて受け付けられませんでした: {e}"])
            where = "`held/` に移しました（次の定時実行からは次の1本を投稿します）"
        else:
            store.release(sending_path, str(e))
            where = f"在庫に戻しました（{tries}/{MAX_REJECTS}回目。{MAX_REJECTS}回続くと保留に回します）"
        git_sync(store.state_dirs(), f"SNS: 送信失敗 {item['id']}（{tries}回目）", REPO_ROOT)
        alert("[SNS警報] 投稿失敗", f"[SNS警報] 投稿失敗: {item['id']}",
               f"相手先が受け付けませんでした（投稿はされていません）。{where}\n\n```\n{e}\n```\n\n"
               "認証切れ・残高不足・文字数・重複などが考えられます。")
        return 1
    except channels.PostUncertain as e:
        alert("[SNS警報] 送信中のまま", f"[SNS警報] 送信中のまま止まった投稿があります（1件）",
               f"投稿されたか分かりません。SNSを確認してください。\n\n- `_marketing/sns/sending/{sending_path.name}`\n\n```\n{e}\n```")
        return 1

    store.finish(sending_path, channel, result, cost)
    git_sync(store.state_dirs(), f"SNS: 投稿完了 {item['id']}", REPO_ROOT)
    print(f"投稿しました: {result.get('url')}")
    gh.close_issues("[SNS警報] 投稿失敗", ALERT_LABEL, "その後の投稿は成功しました。")

    threshold = cfg.get("low_stock_threshold", 7)
    if remaining < threshold:
        alert("[SNS在庫]", f"[SNS在庫] 残り{remaining}本（目安{threshold}本）",
               f"在庫が{threshold}本を切りました。日曜の補充でTypelessから話してください。（{now:%Y-%m-%d}）")
    else:
        gh.close_issues("[SNS在庫]", ALERT_LABEL, f"在庫が{remaining}本に回復しました。")
    return 0


def cmd_weekly():
    cfg, store = load_json("config.json"), Store(SNS_ROOT)
    now = now_jst()
    start = (now - timedelta(days=6)).date()
    week = [d for d in store.posted_items() if (d.get("posted_at") or "")[:10] >= start.isoformat()]
    genres = {}
    for d in week:
        genres[d.get("genre") or "未設定"] = genres.get(d.get("genre") or "未設定", 0) + 1
    links = sum(1 for d in week if d.get("link"))
    title = f"[週次改善] {start:%m/%d}〜{now:%m/%d}"
    if gh.issue_exists(title, WEEKLY_LABEL):
        print("今週の週次改善Issueは作成済み")
        return 0
    body = "\n".join([
        "## 1. 自動集計（出典: `_marketing/sns/posted/`）",
        f"- 投稿本数: {len(week)} / 目標7（主戦場: {cfg['channel']}、mode: `{cfg['mode']}`）",
        f"- ジャンル内訳: {'、'.join(f'{k} {v}' for k, v in genres.items()) or 'なし'}",
        f"- リンク付き: {links}本（目安: 週2本）",
        f"- 今月のX API推定額: ${store.month_spend(f'{now:%Y-%m}'):.3f} / 上限 ${cfg['x']['monthly_budget_usd']:.2f}",
        f"- 在庫: {len(store.items(store.queue))}本 / 送信中のまま: {len(store.items(store.sending))} / 保留: {len(store.items(store.held))}",
        "",
        "## 2. 手で写す数字（SNSのアナリティクス画面から。取れない項目は「未計測」）",
        "- インプレッション合計: ",
        "- いいね・リポスト・返信の合計: ",
        "- プロフィールへのアクセス / リンククリック: ",
        "- フォロワー数（週末時点）: ",
        "",
        "## 3. 所見（一言）",
        "- ",
        "",
        "## 4. 提案（最大3件。仮説／根拠の数字／確信度（根拠がなければ「勘」）／観測期間／やめる基準）",
        "- ",
        "",
        "## 5. 裁定（承認・却下・保留）→ `_marketing/ledgers/DECISIONS.md` に1行追記して、このIssueを閉じる",
        "- ",
        "",
        "> 「実績がゼロだった」のか「計測が壊れている」のかを先に区別する。数字には必ず出典を書く（軍配 kaizen §2）。",
    ])
    gh.upsert_issue(title, title, body, WEEKLY_LABEL)
    print(body)
    return 0


def cmd_check(text, link_label="なし"):
    cfg, rules, store = load_json("config.json"), load_json("rules.json"), Store(SNS_ROOT)
    parsed = {"posts": [text], "genre": None, "link_label": link_label, "checks": [], "has_form": True}
    _, results = inspect_posts(cfg, rules, parsed, store)
    print(render_report(cfg, parsed, results))
    return 1 if any(r.blocked for r in results) else 0


def cmd_lint_queue():
    cfg, rules, store = load_json("config.json"), load_json("rules.json"), Store(SNS_ROOT)
    assert cfg.get("mode") in ("dry-run", "live", "paused"), "config.mode が不正"
    assert cfg.get("channel") in ("x", "bluesky"), "config.channel が不正"
    bad = 0
    for path in store.items(store.queue):
        item = store.load(path)
        others = [t for t in store.all_texts() if t != item.get("text")]
        r = lint_post(item["text"], None, cfg, rules, facts_text(), others)
        status = "NG" if r.blocked else "OK"
        print(f"{status} {path.name}: " + " / ".join(f.message for f in r.findings if f.level == "block"))
        bad += r.blocked
    print(f"在庫 {len(store.items(store.queue))} 本、不合格 {bad} 本")
    return 1 if bad else 0


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, args = argv[1], argv[2:]
    if cmd == "issue-event" and args:
        return cmd_issue_event(args[0])
    if cmd == "post":
        return cmd_post()
    if cmd == "weekly":
        return cmd_weekly()
    if cmd == "check" and args:
        return cmd_check(args[0], args[1] if len(args) > 1 else "なし")
    if cmd == "lint-queue":
        return cmd_lint_queue()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
