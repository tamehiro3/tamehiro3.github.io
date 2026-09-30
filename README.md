# tamehiro3.github.io

「しのびのゲーム工房」— ゲームポータル(ルートサイト)。

## このリポジトリの役割

- **https://tamehiro3.github.io/ のトップページ**(公開中ゲームの紹介・ランディング)
- **ads.txt の正式な置き場所**(AdSenseはドメイン直下 `tamehiro3.github.io/ads.txt` しか読まないため、ここに置く)
- **プライバシーポリシー**(`privacy.html`・AdSense審査の必須要件)

## AdSense の状況と残りの手順

設置済み(2026-09-26 時点):

- 審査コード(`ca-pub-2175971581635704`)… ポータル・両ゲーム・両ゲームの遊び方ページの `<head>`
- `ads.txt` … このリポジトリ直下
- `privacy.html` … 第三者配信・Cookie・オプトアウト(aboutads.info)の記載あり
- `robots.txt` / `sitemap.xml` … 審査クローラー向け
- 遊び方ページ(`/ninja-mission-kobo/about.html`・`/shinobi-nazomeguri/about.html`)… ゲーム画面はJSで描画され文字が少ないため、審査で「有用性の低いコンテンツ」と判定されないよう文章ページを追加

残りの手順(AdSense管理画面での作業):

1. 「サイト」で `tamehiro3.github.io` の状態を確認。「要審査」「準備中」なら「審査をリクエスト」
2. 承認されたら「広告 → 広告ユニットごと → ディスプレイ広告」でユニットを2つ作成(例: `ninja-home-banner` / `nazomeguri-bottom`)
3. 表示されたコードの `data-ad-slot="1234567890"` の数字を、それぞれ
   - `ninja-mission-kobo/ads.js` の `slot`
   - `shinobi-nazomeguri/ads.js` の `slot`
   に入れて各ゲームを再公開。**slot が空のあいだはゲーム内の広告枠は表示されません**(仮表示は審査で不利なため出さない)
4. 推奨: 「ブランド保護 → コンテンツ」で子ども向けゲームの広告カテゴリを絞る/「自動広告」はゲーム画面(`/ninja-mission-kobo/`, `/shinobi-nazomeguri/`)を除外ページに設定

## 更新方法

ファイルを編集したら `★サイトを公開する.bat` をダブルクリック。

## SNS自動投稿（Typeless × GitHub）

Typelessで話した下書きを GitHub の Issue に置くと、機械検品 → 承認 → 毎日1本の自動投稿まで回る仕組みを `_marketing/` に置いています(`_` で始まるフォルダなので公開サイトには出ません)。

- はじめての設定（あなたの作業の手順書）: [`_marketing/SETUP.md`](_marketing/SETUP.md)
- 使い方: [`_marketing/README.md`](_marketing/README.md)
- 設計図と進め方: [`_marketing/BLUEPRINT.md`](_marketing/BLUEPRINT.md)
- 軍配の点検記録: [`_marketing/GUNBAI_REVIEW.md`](_marketing/GUNBAI_REVIEW.md)
- 本番スイッチ: `_marketing/sns/config.json` の `mode`(初期値 `dry-run` = 投稿しない)

## 次のゲームの設計図（Roblox版・企画段階）

- [`_design/roblox-koka-scroll-wars/BLUEPRINT.md`](_design/roblox-koka-scroll-wars/BLUEPRINT.md) — 「巻物争奪・甲賀の街」(仮題「忍びの蔵と結びの術」)。盗る・守る型にAI要素（術合わせ・推理・課題カード）を乗せた設計。コードはまだなく、着手前の確認項目が15章にある
