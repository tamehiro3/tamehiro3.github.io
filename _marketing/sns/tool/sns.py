#!/usr/bin/env python3
"""しのびのゲーム工房 SNS自動投稿ツール（Typelessの下書き → 検品 → 承認 → 定時投稿）

使い方:
  python3 sns.py issue-event <event.json>   Issueイベントを処理（検品コメント／承認なら在庫へ）
  python3 sns.py post                       在庫から1本投稿（config.json の mode に従う）
  python3 sns.py weekly                     週次改善Issueを作る
  python3 sns.py check "本文" [リンク名]     手元で機械検品だけ試す
  python3 sns.py lint-queue                 在庫全件を再検品（CI用）
  python3 sns.py x-media-check              Xへの画像アップロードが通るかだけ確かめる（投稿はしない）
"""
import json
import os
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import channels  # noqa: E402
import gh  # noqa: E402
import media  # noqa: E402
from issue import parse_issue_form  # noqa: E402
from lint import Finding, clean_text, lint_image_text, lint_ocr_text, lint_post  # noqa: E402
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


def inspect_posts(cfg, rules, parsed, store, fetch_images=False):
    """投稿文と添付画像を検品する。画像の指摘は1本目の投稿に付ける（画像つきは1本だけ）。"""
    link, link_error = resolve_link(cfg, parsed["link_label"])
    existing = store.all_texts()
    results = []
    for text in parsed["posts"]:
        r = lint_post(text, link, cfg, rules, facts_text(), existing)
        if link_error:
            r.add("block", link_error)
        results.append(r)
        existing = existing + [r.text]  # 同じIssue内の重複も拾う
    images, image_findings = inspect_images(cfg, rules, parsed, store, fetch_images)
    if results:
        results[0].findings.extend(image_findings)
    return link, results, images


def inspect_images(cfg, rules, parsed, store, fetch):
    """添付画像の検品。合否は本人が書いた「画像の説明」で決め、OCRは要確認の材料にだけ使う。"""
    findings, images = [], []
    urls = parsed.get("images") or []
    if parsed.get("images_in_text"):
        findings.append(Finding("block", "画像は「投稿文」ではなく「添付画像」欄に貼ってください"))
    if not urls:
        if parsed.get("image_desc"):
            findings.append(Finding("warn", "「画像の説明」がありますが、画像が添付されていません"))
        return images, findings
    icfg = cfg.get("images", {})
    max_n = icfg.get("max_per_post", 1)
    channel = cfg["channel"]
    if len(parsed["posts"]) > 1:
        findings.append(Finding("block", "画像つきの下書きは、投稿文を1本だけにしてください（どの投稿の画像か分からなくなるため）"))
    if len(urls) > max_n:
        findings.append(Finding("block", f"画像は1投稿{max_n}枚までです（{len(urls)}枚添付）"))
    if channel == "x" and not cfg["x"].get("images_enabled"):
        findings.append(Finding("block", "Xへの画像投稿はまだ有効になっていません（Actionsの「SNS X画像の疎通確認」が成功したら、config.json の x.images_enabled を true に）"))
    findings += lint_image_text(parsed.get("image_desc") or "", rules, facts_text())
    if not fetch:
        findings.append(Finding("warn", "所有者以外の下書きなので、画像の取得と文字認識はしていません"))
        return images, findings
    max_bytes = cfg[channel].get("max_image_bytes", 1_000_000)
    used = store.image_hashes()
    for n, url in enumerate(urls[:max_n], 1):
        try:
            data = media.download(url, max_bytes)
            info = media.describe(data)
        except media.MediaError as e:
            findings.append(Finding("block", f"画像{n}: {e}"))
            continue
        if info.pop("gps"):
            findings.append(Finding("block", f"画像{n}: 撮影場所（GPSの位置情報）が入っています。"
                                             "位置情報を消した画像か、Canvaで書き出した画像を貼ってください"))
        elif info.pop("exif"):
            findings.append(Finding("warn", f"画像{n}: 撮影情報（EXIF）が入っています。写真なら、写っているものと撮影情報を確認してください"))
        info.pop("exif", None)
        status, text = media.ocr(data)
        info.update({"data": data, "alt": clean_text(parsed.get("image_desc") or ""),
                     "ocr_status": status, "ocr_text": text[:1000]})
        if status == "ok":
            findings += lint_ocr_text(text, parsed.get("image_desc") or "", rules, icfg.get("min_ocr_coverage", 0.5))
        else:
            findings.append(Finding("warn", f"画像{n}: 文字認識を実行できませんでした（{status}）。画像の文字は目で確認してください"))
        if info["sha256"] in used:
            findings.append(Finding("warn", f"画像{n}: 同じ画像を以前の投稿（または在庫）でも使っています"))
        images.append(info)
    return images, findings


def _level_line(r):
    blocks = sum(1 for f in r.findings if f.level == "block")
    warns = len(r.warnings)
    head = "❌ ブロック" if blocks else ("⚠️ 要確認" if warns else "✅ 通過")
    return f"{head}（ブロック {blocks} / 要確認 {warns}）"


def _image_lines(images, parsed):
    lines = []
    for n, img in enumerate(images, 1):
        kind = "PNG" if img["mime"] == "image/png" else "JPG"
        lines.append(f"- 🖼 画像{n}: {kind} {img['width']}×{img['height']}・{img['bytes'] // 1000}KB（sha256 {img['sha256'][:12]}）")
    if parsed.get("images"):
        desc = (parsed.get("image_desc") or "（なし）").replace("@", "@\u200b")
        lines.append("- 画像の説明（代替テキストになります）:")
        lines += ["  > " + ln for ln in desc.split("\n")]
    fence = "`" * 3
    for n, img in enumerate(images, 1):
        if img.get("ocr_status") == "ok":
            text = (img.get("ocr_text") or "（文字なし）").replace("`", "'")
            lines += ["", f"<details><summary>画像{n}の文字認識（OCR）の結果 — 誤読を含みます</summary>", "",
                      fence, text, fence, "", "</details>", ""]
    return lines


def render_report(cfg, parsed, results, images=()):
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
        if i == 1:
            lines += _image_lines(images, parsed)
        for f in r.findings:
            lines.append(f"- {'❌' if f.level == 'block' else '⚠️'} {f.message}")
        lines.append("")
    lines += ["---",
              "**次にやること**",
              "1. ❌ があれば本文を編集（保存すると自動で再検品）",
              "2. ⚠️ を自分の目で確認し、本文の「検品チェック」にチェック（画像つきなら「画像」の項目も）",
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
    owner = cfg.get("owner") or os.environ.get("GITHUB_REPOSITORY_OWNER")
    by_owner = (issue.get("user") or {}).get("login") == owner
    _, results, images = inspect_posts(cfg, rules, parsed, store, fetch_images=by_owner)
    gh.upsert_comment(number, INSPECT_MARKER, render_report(cfg, parsed, results, images))
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
    link, results, images = inspect_posts(cfg, rules, parsed, store, fetch_images=(author == owner))
    if any(r.blocked for r in results):
        problems.append("機械検品で ❌ が残っています（検品コメントを確認）")
    if parsed["images"] and len(images) != len(parsed["images"]) and author == owner:
        problems.append("添付画像を取得できませんでした（検品コメントを確認）")
    if not parsed["checks"]:
        problems.append("検品チェック欄が見つかりません")
    # 「画像」の項目は、画像を付けたときだけ必須
    unchecked = [label for checked, label in parsed["checks"]
                 if not checked and (parsed["images"] or not label.startswith("画像"))]
    if unchecked:
        problems.append("検品チェックが未完了: " + " / ".join(unchecked))

    if problems:
        gh.upsert_comment(number, INSPECT_MARKER, render_report(cfg, parsed, results, images))
        gh.comment(number, "## 承認できませんでした\n" + "\n".join(f"- {p}" for p in problems)
                   + f"\n\n直したら、もう一度ラベル「{APPROVE_LABEL}」を付けてください。")
        gh.remove_label(number, APPROVE_LABEL)
        print("承認不可:", problems)
        return 0

    posts = [{"text": r.text, "genre": parsed["genre"], "link_label": parsed["link_label"], "link": link,
              "warnings": [f.message for f in r.warnings]} for r in results]
    if images:
        posts[0]["images"] = images
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
    cost = x["cost_per_link_post_usd"] if item.get("link") else x["cost_per_post_usd"]
    requests_per_image = 2 if x.get("alt_text", True) else 1  # アップロード＋代替テキスト
    cost += len(item.get("images", [])) * requests_per_image * x.get("cost_per_media_request_usd", 0.015)
    return round(cost, 4)


def image_problems(cfg, store, item):
    """在庫の画像が投稿できる状態かを確かめる（承認後の差し替え・設定変更の検出）。"""
    problems = []
    channel = cfg["channel"]
    if item.get("images") and channel == "x" and not cfg["x"].get("images_enabled"):
        problems.append("画像つきの投稿ですが、Xへの画像投稿が有効になっていません（x.images_enabled）")
    limit = cfg[channel].get("max_image_bytes", 1_000_000)
    for meta in item.get("images", []):
        try:
            data = store.load_image(meta)
        except (FileNotFoundError, ValueError) as e:
            problems.append(str(e))
            continue
        if len(data) > limit:
            problems.append(f"画像 {meta['file']} が {channel} の上限（{limit // 1000}KB）を超えています")
    return problems


def post_to_channel(cfg, channel, item, creds, store):
    """1本を投稿する。画像のアップロードは投稿の前に行い、失敗したら「未投稿」として扱う。"""
    images = [dict(meta, data=store.load_image(meta)) for meta in item.get("images", [])]
    if channel == "x":
        media_ids = []
        for img in images:
            media_id = channels.x_upload_media(img["data"], img["mime"], creds)
            if cfg["x"].get("alt_text", True) and img.get("alt"):
                try:
                    channels.x_set_alt_text(media_id, img["alt"], creds)
                except (channels.PostRejected, channels.PostUncertain) as e:
                    print(f"[注意] 代替テキストを設定できませんでした（投稿は続けます）: {e}")
            media_ids.append(media_id)
        return channels.post_x(item["text"], creds, media_ids)
    bs = cfg.get("bluesky", {})
    return channels.post_bluesky(item["text"], creds, bs.get("service", "https://bsky.social"),
                                 bs.get("langs", ["ja"]), images)


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
        reasons = [f.message for f in r.findings if f.level == "block"] + image_problems(cfg, store, item)
        if reasons:  # 承認後にルールや設定が変わった・画像が差し替わった等。この1本だけ保留して次へ
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

    pics = "".join(f"\n[画像] {m['file']}（代替テキスト: {m.get('alt', '')[:40]}）" for m in item.get("images", []))
    print(f"--- 投稿予定: {item['id']}（リンク: {item.get('link_label')} / 推定 ${cost:.3f}）---\n{item['text']}{pics}\n---")
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
        result = post_to_channel(cfg, channel, item, creds, store)
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
    parsed = {"posts": [text], "genre": None, "link_label": link_label, "checks": [], "has_form": True,
              "images": [], "images_in_text": [], "image_desc": None}
    _, results, images = inspect_posts(cfg, rules, parsed, store)
    print(render_report(cfg, parsed, results, images))
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
        reasons = [f.message for f in r.findings if f.level == "block"] + image_problems(cfg, store, item)
        print(f"{'NG' if reasons else 'OK'} {path.name}: " + " / ".join(reasons))
        bad += bool(reasons)
    print(f"在庫 {len(store.items(store.queue))} 本、不合格 {bad} 本")
    return 1 if bad else 0


def cmd_x_media_check():
    """小さな画像を1枚だけXにアップロードして、画像投稿が使えるかを確かめる。投稿は作らない。"""
    creds, missing = channels.x_credentials(os.environ)
    if missing:
        print("認証情報が未設定です: " + ", ".join(missing))
        return 1
    try:
        media_id = channels.x_upload_media(media.tiny_png(), "image/png", creds)
    except channels.PostRejected as e:
        print("❌ Xへの画像アップロードは通りませんでした（投稿はしていません）。\n"
              f"{e}\n\n"
              "401/403 の場合、今の認証方式（OAuth 1.0a）ではXの画像アップロードが使えない可能性が高いです。\n"
              "x.images_enabled は false のままにして、画像つき投稿は Bluesky で出すか、手動で投稿してください（点検 G1）。")
        return 1
    print(f"✅ Xへの画像アップロードに成功しました（media id: {media_id}。投稿は作っていません）。\n"
          "config.json の x.images_enabled を true にしてよい状態です。変えたら判断ログに1行残してください。")
    return 0


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
    if cmd == "x-media-check":
        return cmd_x_media_check()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
