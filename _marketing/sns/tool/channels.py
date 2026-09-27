"""投稿先（Threads / X / Bluesky）への送信。標準ライブラリだけで動かす。

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
X_MEDIA_URL = "https://api.x.com/2/media/upload"
X_MEDIA_METADATA_URL = "https://api.x.com/2/media/metadata"
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


def _http_json(method, url, headers, payload, uncertain_on_5xx=True, raw=None, content_type="application/json"):
    data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", content_type)
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


def _x_auth(url, creds):
    return oauth1_header("POST", url, creds["X_API_KEY"], creds["X_API_SECRET"],
                         creds["X_ACCESS_TOKEN"], creds["X_ACCESS_TOKEN_SECRET"])


def x_upload_media(data, mime, creds):
    """画像を1枚アップロードして media id を返す。

    X API v2 の画像アップロードが OAuth 1.0a で通るかは未確認（点検 G1）。
    `sns.py x-media-check` で疎通を確かめてから config の x.images_enabled を true にする。
    アップロードの段階ではまだ投稿は作られないので、失敗はすべて「確実に未投稿」として扱う。
    """
    payload = {"media": base64.b64encode(data).decode(), "media_category": "tweet_image", "media_type": mime}
    try:
        res = _http_json("POST", X_MEDIA_URL, {"Authorization": _x_auth(X_MEDIA_URL, creds)}, payload)
    except PostUncertain as e:
        raise PostRejected(f"画像アップロード失敗: {e}") from None
    body = res.get("data") or res
    media_id = body.get("id") or body.get("media_id_string") or body.get("media_id")
    if not media_id:
        raise PostRejected(f"画像アップロードの応答にIDがありません: {json.dumps(res)[:300]}")
    return str(media_id)


def x_set_alt_text(media_id, alt, creds):
    payload = {"id": media_id, "metadata": {"alt_text": {"text": alt[:1000]}}}
    _http_json("POST", X_MEDIA_METADATA_URL, {"Authorization": _x_auth(X_MEDIA_METADATA_URL, creds)}, payload)


def post_x(text, creds, media_ids=None):
    body = {"text": text}
    if media_ids:
        body["media"] = {"media_ids": list(media_ids)}
    res = _http_json("POST", X_POST_URL, {"Authorization": _x_auth(X_POST_URL, creds)}, body)
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


def post_bluesky(text, creds, service="https://bsky.social", langs=("ja",), images=()):
    """images: [{"data", "mime", "alt", "width", "height"}]"""
    # セッション作成と画像アップロードの失敗は「まだ何も投稿していない」ので確実な失敗として扱う
    session = _http_json("POST", f"{service}/xrpc/com.atproto.server.createSession", {},
                         {"identifier": creds["BSKY_HANDLE"], "password": creds["BSKY_APP_PASSWORD"]},
                         uncertain_on_5xx=False)
    auth = {"Authorization": f"Bearer {session['accessJwt']}"}
    embedded = []
    for img in images:
        up = _http_json("POST", f"{service}/xrpc/com.atproto.repo.uploadBlob", auth, None,
                        uncertain_on_5xx=False, raw=img["data"], content_type=img["mime"])
        if not up.get("blob"):
            raise PostRejected(f"画像アップロードの応答にblobがありません: {json.dumps(up)[:300]}")
        entry = {"alt": img.get("alt") or "", "image": up["blob"]}
        if img.get("width") and img.get("height"):
            entry["aspectRatio"] = {"width": img["width"], "height": img["height"]}
        embedded.append(entry)
    record = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "langs": list(langs),
    }
    facets = bluesky_facets(text)
    if facets:
        record["facets"] = facets
    if embedded:
        record["embed"] = {"$type": "app.bsky.embed.images", "images": embedded}
    res = _http_json("POST", f"{service}/xrpc/com.atproto.repo.createRecord", auth,
                     {"repo": session["did"], "collection": "app.bsky.feed.post", "record": record})
    uri = res.get("uri")
    if not uri:
        raise PostUncertain(f"応答にURIがありません: {json.dumps(res)[:300]}")
    rkey = uri.rsplit("/", 1)[-1]
    handle = session.get("handle") or creds["BSKY_HANDLE"]
    return {"remote_id": uri, "url": f"https://bsky.app/profile/{handle}/post/{rkey}"}


# ---- Threads（Meta Threads API）--------------------------------------------------------------
# 1) 投稿の箱（コンテナ）を作る → 2) 画像の処理が終わるのを待つ → 3) 公開する、の2段階。
# 箱を作るまでは何も公開されないので、そこまでの失敗はすべて「確実に未投稿」。
# 鍵（アクセストークン）は本文（フォーム）で送り、URL・ログ・エラー文には出さない。

THREADS_API = "https://graph.threads.net/v1.0"


def threads_credentials(env):
    missing = [] if env.get("THREADS_ACCESS_TOKEN") else ["THREADS_ACCESS_TOKEN"]
    if missing:
        return None, missing
    return {"THREADS_ACCESS_TOKEN": env["THREADS_ACCESS_TOKEN"], "THREADS_USER_ID": env.get("THREADS_USER_ID")}, []


def _threads_call(method, url, fields, token, uncertain_on_5xx):
    fields = dict(fields, access_token=token)
    if method == "GET":
        req = urllib.request.Request(url + "?" + urllib.parse.urlencode(fields), method="GET")
    else:
        req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), method=method)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", "shinobi-sns-bot/1.0")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400].replace(token, "***")
        msg = f"HTTP {e.code}: {detail}"
        if 400 <= e.code < 500 or not uncertain_on_5xx:
            raise PostRejected(msg) from None
        raise PostUncertain(msg) from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        msg = f"通信エラー: {type(e).__name__}"
        if uncertain_on_5xx:
            raise PostUncertain(msg) from None
        raise PostRejected(msg) from None


def threads_me(creds, api=THREADS_API):
    """鍵が生きているかの確認にも使う（投稿はしない）。"""
    return _threads_call("GET", f"{api}/me", {"fields": "id,username"}, creds["THREADS_ACCESS_TOKEN"], False)


def post_threads(text, creds, api=THREADS_API, image_url=None, alt_text=None, wait_seconds=30,
                 poll_every=5, sleep=time.sleep):
    token = creds["THREADS_ACCESS_TOKEN"]
    user_id = creds.get("THREADS_USER_ID") or threads_me(creds, api).get("id")
    if not user_id:
        raise PostRejected("ThreadsのユーザーIDを取得できませんでした")
    fields = {"media_type": "IMAGE" if image_url else "TEXT", "text": text}
    if image_url:
        fields["image_url"] = image_url
        if alt_text:
            fields["alt_text"] = alt_text[:1000]
    container = _threads_call("POST", f"{api}/{user_id}/threads", fields, token, False).get("id")
    if not container:
        raise PostRejected("Threadsの投稿の箱（コンテナ）を作れませんでした")
    # 画像の取り込み・処理が終わるまで待つ（Metaの案内では公開まで30秒ほど空ける）
    waited, status = 0, None
    while True:
        status = _threads_call("GET", f"{api}/{container}", {"fields": "status,error_message"}, token, False)
        state = status.get("status")
        if state == "FINISHED":
            break
        if state in ("ERROR", "EXPIRED"):
            raise PostRejected(f"Threadsが投稿の準備に失敗しました（{state}: {status.get('error_message', '')}）")
        if waited >= wait_seconds:
            raise PostRejected(f"Threadsの画像の処理が {wait_seconds} 秒で終わりませんでした（状態: {state}）")
        sleep(poll_every)
        waited += poll_every
    published = _threads_call("POST", f"{api}/{user_id}/threads_publish", {"creation_id": container}, token, True)
    media_id = published.get("id")
    if not media_id:
        raise PostUncertain(f"公開の応答にIDがありません: {json.dumps(published)[:200]}")
    url = None
    try:
        url = _threads_call("GET", f"{api}/{media_id}", {"fields": "permalink"}, token, False).get("permalink")
    except (PostRejected, PostUncertain):
        pass  # 公開はできている。URLが取れないだけなので投稿は成功扱い
    return {"remote_id": media_id, "url": url or "https://www.threads.net/"}


def url_reachable(url):
    """Threadsが画像を取り込めるか（公開URLに画像があるか）を先に確かめる。"""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "shinobi-sns-bot/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return 200 <= res.status < 300 and (res.headers.get("Content-Type") or "").startswith("image/")
    except Exception:  # noqa: BLE001
        return False

