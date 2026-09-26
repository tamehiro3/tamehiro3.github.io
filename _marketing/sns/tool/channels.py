"""投稿先（X / Bluesky）への送信。標準ライブラリだけで動かす。

例外の使い分けが二重投稿防止の要:
  PostRejected  = 相手が確実に受け付けなかった（在庫に戻して再挑戦してよい）
  PostUncertain = 投稿されたか分からない（止めて人間が確認する）
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from lint import HASHTAG_RE, URL_RE

X_POST_URL = "https://api.x.com/2/tweets"
TIMEOUT = 30


class PostRejected(Exception):
    """投稿されていないことが確実な失敗。"""


class PostUncertain(Exception):
    """投稿されたかどうか分からない失敗。"""


def _pct(value):
    return urllib.parse.quote(str(value), safe="-._~")


def oauth1_header(method, url, consumer_key, consumer_secret, token, token_secret,
                  extra_params=None, nonce=None, timestamp=None):
    """OAuth 1.0a (HMAC-SHA1) の Authorization ヘッダを作る。JSON本文は署名に含めない。"""
    oauth = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": nonce or secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(timestamp or int(time.time())),
        "oauth_token": token,
        "oauth_version": "1.0",
    }
    params = dict(oauth)
    params.update(extra_params or {})
    encoded = sorted((_pct(k), _pct(v)) for k, v in params.items())
    param_str = "&".join(f"{k}={v}" for k, v in encoded)
    base = "&".join([method.upper(), _pct(url), _pct(param_str)])
    key = f"{_pct(consumer_secret)}&{_pct(token_secret)}"
    sig = base64.b64encode(hmac.new(key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    oauth["oauth_signature"] = sig
    return "OAuth " + ", ".join(f'{_pct(k)}="{_pct(v)}"' for k, v in sorted(oauth.items()))


def _http_json(method, url, headers, payload, uncertain_on_5xx=True):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "shinobi-sns-bot/1.0")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        msg = f"HTTP {e.code}: {detail}"
        if 400 <= e.code < 500 or not uncertain_on_5xx:
            raise PostRejected(msg) from None
        raise PostUncertain(msg) from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        if uncertain_on_5xx:
            raise PostUncertain(f"通信エラー: {e}") from None
        raise PostRejected(f"通信エラー: {e}") from None


def x_credentials(env):
    names = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]
    missing = [n for n in names if not env.get(n)]
    return ({n: env[n] for n in names} if not missing else None), missing


def post_x(text, creds):
    auth = oauth1_header("POST", X_POST_URL, creds["X_API_KEY"], creds["X_API_SECRET"],
                         creds["X_ACCESS_TOKEN"], creds["X_ACCESS_TOKEN_SECRET"])
    res = _http_json("POST", X_POST_URL, {"Authorization": auth}, {"text": text})
    post_id = (res.get("data") or {}).get("id")
    if not post_id:
        raise PostUncertain(f"応答にIDがありません: {json.dumps(res)[:300]}")
    return {"remote_id": post_id, "url": f"https://x.com/i/web/status/{post_id}"}


def bluesky_credentials(env):
    names = ["BSKY_HANDLE", "BSKY_APP_PASSWORD"]
    missing = [n for n in names if not env.get(n)]
    return ({n: env[n] for n in names} if not missing else None), missing


def bluesky_facets(text):
    """リンクとハッシュタグの facet（UTF-8 のバイト位置）を作る。"""
    def byte_pos(i):
        return len(text[:i].encode("utf-8"))

    facets = []
    for m in URL_RE.finditer(text):
        facets.append({
            "index": {"byteStart": byte_pos(m.start()), "byteEnd": byte_pos(m.end())},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": m.group(0)}],
        })
    for m in HASHTAG_RE.finditer(text):
        tag = m.group(1)
        if len(tag) > 64:
            continue
        facets.append({
            "index": {"byteStart": byte_pos(m.start()), "byteEnd": byte_pos(m.end())},
            "features": [{"$type": "app.bsky.richtext.facet#tag", "tag": tag}],
        })
    return facets


def post_bluesky(text, creds, service="https://bsky.social", langs=("ja",)):
    # セッション作成の失敗は「まだ何も投稿していない」ので確実な失敗として扱う
    session = _http_json("POST", f"{service}/xrpc/com.atproto.server.createSession", {},
                         {"identifier": creds["BSKY_HANDLE"], "password": creds["BSKY_APP_PASSWORD"]},
                         uncertain_on_5xx=False)
    record = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "langs": list(langs),
    }
    facets = bluesky_facets(text)
    if facets:
        record["facets"] = facets
    res = _http_json("POST", f"{service}/xrpc/com.atproto.repo.createRecord",
                     {"Authorization": f"Bearer {session['accessJwt']}"},
                     {"repo": session["did"], "collection": "app.bsky.feed.post", "record": record})
    uri = res.get("uri")
    if not uri:
        raise PostUncertain(f"応答にURIがありません: {json.dumps(res)[:300]}")
    rkey = uri.rsplit("/", 1)[-1]
    handle = session.get("handle") or creds["BSKY_HANDLE"]
    return {"remote_id": uri, "url": f"https://bsky.app/profile/{handle}/post/{rkey}"}
