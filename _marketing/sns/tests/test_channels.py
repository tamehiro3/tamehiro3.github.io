import io
import json
import unittest
import urllib.error
from unittest import mock

import helpers  # noqa: F401  (sys.path を通す)

import channels


class OAuthTest(unittest.TestCase):
    def test_matches_published_signature_vector(self):
        # X(旧Twitter)の公式ドキュメント「Creating a signature」の例と同じ入力
        header = channels.oauth1_header(
            "POST", "https://api.twitter.com/1.1/statuses/update.json",
            "xvz1evFS4wEEPTGEFPHBog", "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
            "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
            extra_params={"status": "Hello Ladies + Gentlemen, a signed OAuth request!", "include_entities": "true"},
            nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", timestamp=1318622958)
        self.assertIn('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"', header)
        self.assertTrue(header.startswith("OAuth "))


class FacetTest(unittest.TestCase):
    def test_byte_offsets_with_japanese(self):
        text = "今日の謎 #なぞとき\nhttps://tamehiro3.github.io/"
        facets = channels.bluesky_facets(text)
        raw = text.encode("utf-8")
        found = {}
        for f in facets:
            span = raw[f["index"]["byteStart"]:f["index"]["byteEnd"]].decode("utf-8")
            found[f["features"][0]["$type"]] = (span, f["features"][0])
        self.assertEqual(found["app.bsky.richtext.facet#link"][0], "https://tamehiro3.github.io/")
        self.assertEqual(found["app.bsky.richtext.facet#tag"][0], "#なぞとき")
        self.assertEqual(found["app.bsky.richtext.facet#tag"][1]["tag"], "なぞとき")


def _http_error(code):
    return urllib.error.HTTPError("https://x", code, "err", {}, io.BytesIO(b'{"detail":"x"}'))


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


CREDS = {"X_API_KEY": "k", "X_API_SECRET": "s", "X_ACCESS_TOKEN": "t", "X_ACCESS_TOKEN_SECRET": "ts"}


class ErrorClassificationTest(unittest.TestCase):
    def test_4xx_is_rejected(self):
        with mock.patch("urllib.request.urlopen", side_effect=_http_error(403)):
            with self.assertRaises(channels.PostRejected):
                channels.post_x("テスト", CREDS)

    def test_5xx_is_uncertain(self):
        with mock.patch("urllib.request.urlopen", side_effect=_http_error(503)):
            with self.assertRaises(channels.PostUncertain):
                channels.post_x("テスト", CREDS)

    def test_network_error_is_uncertain(self):
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
            with self.assertRaises(channels.PostUncertain):
                channels.post_x("テスト", CREDS)

    def test_x_success(self):
        body = json.dumps({"data": {"id": "123", "text": "テスト"}}).encode()
        with mock.patch("urllib.request.urlopen", return_value=_Resp(body)) as m:
            res = channels.post_x("テスト", CREDS)
        self.assertEqual(res["remote_id"], "123")
        sent = m.call_args[0][0]
        self.assertEqual(sent.full_url, channels.X_POST_URL)
        self.assertEqual(json.loads(sent.data), {"text": "テスト"})
        self.assertTrue(sent.get_header("Authorization").startswith("OAuth "))

    def test_bluesky_session_failure_is_rejected_even_on_5xx(self):
        with mock.patch("urllib.request.urlopen", side_effect=_http_error(502)):
            with self.assertRaises(channels.PostRejected):
                channels.post_bluesky("テスト", {"BSKY_HANDLE": "a.bsky.social", "BSKY_APP_PASSWORD": "p"})

    def test_bluesky_success(self):
        session = json.dumps({"accessJwt": "jwt", "did": "did:plc:abc", "handle": "a.bsky.social"}).encode()
        created = json.dumps({"uri": "at://did:plc:abc/app.bsky.feed.post/3kxyz", "cid": "c"}).encode()
        with mock.patch("urllib.request.urlopen", side_effect=[_Resp(session), _Resp(created)]) as m:
            res = channels.post_bluesky("テスト https://tamehiro3.github.io/",
                                        {"BSKY_HANDLE": "a.bsky.social", "BSKY_APP_PASSWORD": "p"})
        self.assertEqual(res["url"], "https://bsky.app/profile/a.bsky.social/post/3kxyz")
        record = json.loads(m.call_args_list[1][0][0].data)["record"]
        self.assertEqual(record["langs"], ["ja"])
        self.assertEqual(record["facets"][0]["features"][0]["uri"], "https://tamehiro3.github.io/")

    def test_missing_credentials_listed(self):
        creds, missing = channels.x_credentials({"X_API_KEY": "k"})
        self.assertIsNone(creds)
        self.assertEqual(missing, ["X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"])


if __name__ == "__main__":
    unittest.main()
