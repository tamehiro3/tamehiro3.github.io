"""GitHub REST API の最小ラッパー（Issue・コメント・ラベル）。

GITHUB_TOKEN が無い手元実行では、何をするはずだったかを表示するだけ（オフライン）。
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

LABELS = {
    "SNS下書き": ("1f2a44", "Typelessで話したSNS下書き（機械検品つき）"),
    "承認": ("2e7d32", "所有者が付けると在庫（queue）に入る"),
    "SNS警報": ("b71c1c", "在庫切れ・投稿失敗・予算上限など、自動投稿からの知らせ"),
    "週次改善": ("b8934a", "週1回の改善セッション（軍配 kaizen）"),
}


def _config():
    return os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY"), \
        os.environ.get("GITHUB_API_URL", "https://api.github.com")


def online():
    token, repo, _ = _config()
    return bool(token and repo)


def request(method, path, body=None, ok_statuses=()):
    token, repo, api = _config()
    url = f"{api}/repos/{repo}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        if e.code in ok_statuses:
            return None
        raise RuntimeError(f"GitHub API {method} {path}: HTTP {e.code} {e.read().decode(errors='replace')[:300]}") from None


def _offline(action, detail=""):
    print(f"[オフライン] {action}" + (f"\n{detail}" if detail else ""))


def ensure_labels():
    if not online():
        return _offline("ラベルを用意", ", ".join(LABELS))
    for name, (color, desc) in LABELS.items():
        request("POST", "/labels", {"name": name, "color": color, "description": desc}, ok_statuses=(422,))


def upsert_comment(issue, marker, body):
    """marker を含む自分（bot）のコメントがあれば書き換え、なければ新規。"""
    body = f"{marker}\n{body}"
    if not online():
        return _offline(f"#{issue} に検品コメント", body)
    comments = request("GET", f"/issues/{issue}/comments?per_page=100") or []
    for c in comments:
        if marker in (c.get("body") or "") and (c.get("user") or {}).get("type") == "Bot":
            return request("PATCH", f"/issues/comments/{c['id']}", {"body": body})
    return request("POST", f"/issues/{issue}/comments", {"body": body})


def comment(issue, body):
    if not online():
        return _offline(f"#{issue} にコメント", body)
    return request("POST", f"/issues/{issue}/comments", {"body": body})


def add_labels(issue, names):
    if not online():
        return _offline(f"#{issue} にラベル {names}")
    return request("POST", f"/issues/{issue}/labels", {"labels": list(names)})


def remove_label(issue, name):
    if not online():
        return _offline(f"#{issue} からラベル {name} を外す")
    return request("DELETE", f"/issues/{issue}/labels/{urllib.parse.quote(name)}", ok_statuses=(404,))


def close_issue(issue):
    if not online():
        return _offline(f"#{issue} を完了で閉じる")
    return request("PATCH", f"/issues/{issue}", {"state": "closed", "state_reason": "completed"})


def _open_issues(label):
    return request("GET", f"/issues?state=open&labels={urllib.parse.quote(label)}&per_page=100") or []


def upsert_issue(key, title, body, label):
    """タイトルが key で始まる未完了Issueがあれば更新、なければ作成（同じ警報を増やさない）。"""
    if not online():
        return _offline(f"Issue「{title}」を作成/更新", body)
    ensure_labels()
    for it in _open_issues(label):
        if it.get("title", "").startswith(key) and "pull_request" not in it:
            return request("PATCH", f"/issues/{it['number']}", {"title": title, "body": body})
    return request("POST", "/issues", {"title": title, "body": body, "labels": [label]})


def close_issues(key, label, note):
    if not online():
        return _offline(f"「{key}」の警報Issueがあれば閉じる")
    for it in _open_issues(label):
        if it.get("title", "").startswith(key) and "pull_request" not in it:
            request("POST", f"/issues/{it['number']}/comments", {"body": note})
            request("PATCH", f"/issues/{it['number']}", {"state": "closed", "state_reason": "completed"})


def issue_exists(title, label):
    if not online():
        return False
    return any(it.get("title") == title for it in _open_issues(label))
