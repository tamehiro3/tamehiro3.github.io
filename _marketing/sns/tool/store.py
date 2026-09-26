"""在庫（queue）→ 送信中（sending）→ 投稿済み（posted）の台帳。1投稿=1 JSONファイル。

送信の前に必ず sending/ へ「確保」してコミットする（at-most-once）。
送信の途中で落ちても、sending/ に残ったファイルが「要確認」の目印になり、
同じ投稿が自動で二度出ることはない。
"""
import hashlib
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))


def now_jst():
    override = os.environ.get("SNS_NOW")
    if override:
        dt = datetime.fromisoformat(override)
        return dt if dt.tzinfo else dt.replace(tzinfo=JST)
    return datetime.now(JST)


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.queue = self.root / "queue"
        self.sending = self.root / "sending"
        self.posted = self.root / "posted"
        self.held = self.root / "held"
        for d in (self.queue, self.sending, self.posted, self.held):
            d.mkdir(parents=True, exist_ok=True)

    def state_dirs(self):
        """自動コミットしてよいのは在庫の状態フォルダだけ（設定やコードは巻き込まない）。"""
        return [self.queue, self.sending, self.posted, self.held]

    @staticmethod
    def items(directory):
        return sorted(p for p in Path(directory).glob("*.json"))

    @staticmethod
    def load(path):
        return json.loads(Path(path).read_text(encoding="utf-8"))

    @staticmethod
    def save(path, data):
        Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def all_texts(self):
        texts = []
        for d in (self.queue, self.sending, self.posted, self.held):
            texts += [self.load(p).get("text", "") for p in self.items(d)]
        return texts

    def enqueue(self, posts, source, approved_by):
        """posts: [{"text", "link_label", "link", "genre", "warnings"}]"""
        now = now_jst()
        paths = []
        for i, post in enumerate(posts, 1):
            item_id = f"{now:%Y%m%d}-i{source['issue']}-{i}"
            data = {
                "id": item_id,
                "text": post["text"],
                "genre": post.get("genre"),
                "link_label": post.get("link_label"),
                "link": post.get("link"),
                "text_sha256": hashlib.sha256(post["text"].encode("utf-8")).hexdigest(),
                "source": source,
                "approved_by": approved_by,
                "approved_at": now.isoformat(timespec="seconds"),
                "inspection_warnings": post.get("warnings", []),
            }
            path = self.queue / f"{item_id}.json"
            if path.exists():
                raise FileExistsError(f"同じIDの在庫があります: {path.name}")
            self.save(path, data)
            paths.append(path)
        return paths

    def _move(self, path, directory, updates=None):
        data = self.load(path)
        data.update(updates or {})
        dest = Path(directory) / Path(path).name
        self.save(dest, data)
        Path(path).unlink()
        return dest

    def claim(self, path):
        return self._move(path, self.sending, {"claimed_at": now_jst().isoformat(timespec="seconds")})

    def release(self, path, error):
        data = self.load(path)
        failures = data.get("failures", []) + [{"at": now_jst().isoformat(timespec="seconds"), "error": error}]
        return self._move(path, self.queue, {"failures": failures, "claimed_at": None})

    def finish(self, path, channel, result, cost_usd):
        return self._move(path, self.posted, {
            "channel": channel,
            "posted_at": now_jst().isoformat(timespec="seconds"),
            "remote_id": result.get("remote_id"),
            "remote_url": result.get("url"),
            "cost_usd": cost_usd,
        })

    def hold(self, path, reasons):
        return self._move(path, self.held, {"held_reasons": reasons})

    def posted_items(self):
        return [self.load(p) for p in self.items(self.posted)]

    def posted_count_on(self, day):
        return sum(1 for d in self.posted_items() if (d.get("posted_at") or "").startswith(day.isoformat()))

    def month_spend(self, month_prefix):
        return round(sum(d.get("cost_usd") or 0 for d in self.posted_items()
                         if (d.get("posted_at") or "").startswith(month_prefix)), 4)


def git_enabled():
    """Actions上では既定で有効。SNS_GIT=0 で強制的に無効（テスト用）、SNS_GIT=1 で手元でも有効。"""
    flag = os.environ.get("SNS_GIT")
    if flag in ("0", "1"):
        return flag == "1"
    return os.environ.get("GITHUB_ACTIONS") == "true"


def git_sync(paths, message, cwd):
    """変更をコミットしてプッシュする。競合したら rebase して最大3回まで押し直す。"""
    if not git_enabled():
        print(f"[git無効] コミットしない: {message}")
        return False

    def run(*args, check=True):
        return subprocess.run(["git", *args], cwd=cwd, check=check, text=True, capture_output=True)

    run("add", "-A", "--", *[str(p) for p in paths])
    if run("diff", "--cached", "--quiet", check=False).returncode == 0:
        print(f"[git] 変更なし: {message}")
        return False
    run("-c", "user.name=github-actions[bot]",
        "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit", "-m", message)
    for attempt in range(3):
        pushed = run("push", "origin", "HEAD", check=False)
        if pushed.returncode == 0:
            print(f"[git] push: {message}")
            return True
        print(f"[git] push失敗（{attempt + 1}回目）: {pushed.stderr.strip()[:300]}")
        run("pull", "--rebase", "--autostash", "origin", run("rev-parse", "--abbrev-ref", "HEAD").stdout.strip())
    raise RuntimeError(f"git push に3回失敗: {message}")
