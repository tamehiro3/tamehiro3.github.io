# SNS自動投稿の使い方（Typeless × GitHub）

設計の全体像は [BLUEPRINT.md](BLUEPRINT.md)、点検の記録は [GUNBAI_REVIEW.md](GUNBAI_REVIEW.md) にあります。
ここは「毎週どう使うか」と「最初の設定」だけをまとめています。

## 毎週やること（日曜・15分）

1. スマホの GitHub アプリ（またはブラウザ）でこのリポジトリを開き、**Issues → New issue → 「SNS下書き」** を選ぶ
2. 「投稿文」欄をタップして **Typeless で話す**。輪番表（[BLUEPRINT.md §4.2](BLUEPRINT.md#42-輪番表日曜にこの順で7本話す)）の月曜の分から順に。1本ごとに空行をはさんで `---` の行で区切る
3. ジャンルとリンク先をプルダウンで選んで保存 → 数十秒で**機械検品の結果がコメント**される
4. ❌ があれば本文を直す（保存すると再検品）。⚠️ は自分の目で確認する
5. 本文の「検品チェック」4つにチェック → 右側の Labels で **「承認」** を付ける
6. 在庫に入ったというコメントが付き、Issue が閉じる。あとは毎日 20:17 に1本ずつ投稿される
7. 日曜の夜に届く「週次改善」Issue に、SNSのアナリティクス画面の数字を写して、所見を一言書く

> ジャンルやリンク先が違う投稿は、Issue を分けてください（1つの Issue の中は同じジャンル・同じリンク先になります）。

## 最初の設定（1回だけ）

### 1. このブランチを master に取り込む

プルリクエストをマージすると、Actions タブに「SNS 受付」「SNS 定時投稿」「SNS 週次改善」「SNS テスト」が出ます。
取り込んだ時点では `mode: dry-run` なので、SNSには何も投稿されません。

### 2. Typeless の個人辞書に登録する

誤変換を防ぐため、次の言葉を Typeless の辞書（Dictionary）に登録します。

`しのびのゲーム工房` `にんじゃミッション工房` `忍びの謎巡り` `CryptoNinja` `CNP` `なぞとき` `小判` `旅日記` `おにむず任務` `ずらし暗号`

Typeless は音声をクラウドで文章にします。子どもの名前や学校名は話さないでください。

### 3. 主戦場の認証情報を登録する

GitHub のこのリポジトリで **Settings → Secrets and variables → Actions → New repository secret** から登録します。
値はここ（GitHub の Secrets）にだけ置き、ファイルには書きません。

**X の場合**（従量課金。先にクレジットの購入が必要）
1. X の開発者ポータル（developer.x.com）でアプリを作る
2. アプリの権限を **Read and write** にする（権限を変えたら、アクセストークンを作り直す）
3. 次の4つを Secrets に登録する

| Secret の名前 | 中身 |
|---|---|
| `X_API_KEY` | API Key（Consumer Key） |
| `X_API_SECRET` | API Key Secret（Consumer Secret） |
| `X_ACCESS_TOKEN` | Access Token |
| `X_ACCESS_TOKEN_SECRET` | Access Token Secret |

**Bluesky の場合**（無料）
1. Bluesky アプリの 設定 → プライバシーとセキュリティ → **アプリパスワード** で新しく作る（ログイン用のパスワードは使わない）
2. `BSKY_HANDLE`（例: `yourname.bsky.social`）と `BSKY_APP_PASSWORD` を Secrets に登録する
3. `_marketing/sns/config.json` の `channel` を `bluesky` にする

画面の名前は変わることがあります。見つからないときは各サービスの公式ヘルプで確認してください。

### 4. 試運転（ドライラン）

1. 「SNS下書き」Issue を1本作り、検品コメントを確認して「承認」を付ける
2. **Actions → SNS 定時投稿 → Run workflow**（「ドライラン」にチェックが入ったまま）で実行
3. ログに「投稿予定」の文面と「認証情報: すべて設定済み」が出れば準備完了

### 5. 本番開始

1. X の料金ページ・自動化ルールを公式サイトで確認する（点検では検索経由でしか確認できていません）
2. `_marketing/sns/config.json` の `"mode": "dry-run"` を `"mode": "live"` に書き換えて保存
3. `_marketing/ledgers/DECISIONS.md` に「本番開始」の行を1行足す

## 警報 Issue が来たら

| 警報 | 意味 | やること |
|---|---|---|
| `[SNS在庫] 残りN本` | 在庫が7本を切った | 日曜に補充する（補充後の次の投稿で自動的に閉じる） |
| `[SNS在庫] 在庫切れ` | 今日は投稿されない | 下書きを作って承認する |
| `[SNS警報] 投稿失敗` | SNS側が受け付けなかった（投稿はされていない。在庫に戻してある。同じ1本が3回続けて失敗したら `held/` に保留） | 本文のエラーを見る。認証切れ・残高不足・文字数など |
| `[SNS警報] 送信中のまま` | 投稿されたか分からない。自動投稿は止まっている | SNSを確認し、投稿済みなら `sending/` のファイルを `posted/` へ、未投稿なら `queue/` へ移す |
| `[SNS警報] 予算` | 今月のX API推定額が上限に届く | 上限を上げるか、翌月まで待つか（本人判断・判断ログに記入） |
| `[SNS警報] 認証情報が未設定` | Secrets が足りない | 手順3をやり直す |
| `[SNS警報] 保留` | 承認済みの投稿が、ルール変更後の再検品で不合格 | `held/` の投稿を直して出し直すか、そのまま捨てる |

ファイルを別のフォルダへ移すには、GitHub の画面でそのファイルを編集し、ファイル名の欄でフォルダ部分（例: `sending/`）を書き換えて保存します。

## すぐ止めたいとき

`_marketing/sns/config.json` の `mode` を `"paused"` にして保存。次の定時実行から何もしなくなります。

## 手元で検品だけ試す（PC）

```
python3 _marketing/sns/tool/sns.py check "ここに投稿文" 忍びの謎巡り
python3 -m unittest discover -s _marketing/sns/tests
```
