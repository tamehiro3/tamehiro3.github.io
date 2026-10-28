# 忍び足（しのびあし）（試作版 v1）

毎日の歩数で、忍者の相棒を育てる家族向けのゲームです。歩いた分が相棒の「修行」になり、巻物で忍術を見せてくれます。仲間が里に来て、宿場をたどる「忍びの道」も進みます。
無料で、広告・課金はありません。歩数はインターネットに送りません。

- 遊ぶ: https://tamehiro3.github.io/shinobi-ashi/ （ブラウザでは「ためし歩き」で試遊できます）
- 遊び方・おうちの方へ: `about.html`
- 実装の仕様: `docs/SPEC.md`

CryptoNinja（CC0・Ninja DAO）のキャラクターを使った個人制作の非公式ファンゲームです。セリフ・宿場の小話・図鑑文・修行の相性はゲームの創作です。

## 大事な決まり（SPEC 0 の要約）

- インターネットに何も送らない（fetch・XHR・外部の画像やフォントやスクリプトを使わない。ライブラリは `vendor/` に同梱）
- 広告・解析・課金・ガチャ・ランキング・チャットはない。連続日数は見せない
- 名前・年齢・位置・連絡先を聞かない。年齢は聞かず「おとな／こども」を選ぶだけ
- 画面の文はすべて `{漢字|かな}` の書式でふりがなを付ける（`SA.UI.furi()` が `<ruby>` にする）
- こどもモードの守り: 深夜0〜5時の歩数を修行に入れない、相性の時間帯を昼に寄せる、「ひみつの術」の名を伏せる
- 歩いているあいだは操作させない（起動時に3秒の判定。ブラウザではためし歩きの「歩いている（テスト）」で確かめる）
- ビルドなしの素の HTML/CSS/JavaScript。各ファイルは IIFE で `window.SA` に部品を足す（Node でも `require` できる）

## 動かし方

ビルドは要りません。`file://` で開いても遊べます。オフライン用の Service Worker は http(s) のときだけ動きます。

```sh
# リポジトリの直下で
python3 -m http.server 8765
# → http://127.0.0.1:8765/shinobi-ashi/
```

ブラウザでは `data.js` の `CONFIG.WEB_TRIAL` が `true` のとき「ためし歩き（試遊版だけ）」の引き出しが出ます（+500〜+10,000歩、時間帯、歩き方、次の日へ、7日すすめる、歩いている（テスト）、はじめから）。
`false` にすると、ブラウザは「ながめるモード」（図鑑・忍びの道・書き出しファイルを開く）だけになります。

## ファイル

読み込み順（`index.html`）: `vendor/qrcode.js` → `vendor/jsQR.js` → `art.js` → `chars.js` → `data.js` → `content.js` → `rules.js` → `figure.js` → `fx.js` → `store.js` → `steps.js` → `notify.js` → `share.js` → `screens.js` → `ui.js`（どれも `?v=1` 付き）

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` | 画面の骨組みと見た目（和紙の色、幅 360〜430px の縦長、PC では中央 480px の列） |
| `ui.js`（`SA.UI`） | ふりがな（`furi`）、部品、モーダル、画面の切り替え、起動と取り込みの流れ、歩行中判定、関門、ためし歩きの引き出し、`about.html` の本文 |
| `screens.js`（`SA.Screens`） | 各画面: はじめて（手順0〜6）・ホーム・修行枠・忍術の間・出来事のカード・忍びの道・図鑑・里（隠れ里・家族の掲示板・市の染め）・ふりかえり・メニュー・保護者設定・ながめるモード |
| `about.html` | 遊び方・おうちの方へ（広告コードなし） |
| `sw.js` / `manifest.webmanifest` / `icons/` | ホーム画面に追加・オフライン。`version.txt` は版の確かめ用 |
| `data.js`（`SA.DATA`） | 数値と構造（上限 16,500・巻物 1,000歩・位・来訪の節目・宿場51・相性39件・染め色など）。ここが正 |
| `rules.js`（`SA.Rules`） | ルール（取り込みの冪等・不採用・上限・配分・相性16種・位・来訪・宿場と二巡目・巻物・絆・かくれる探し・掲示板・染め・祝日・満月・二十四節気・ふりかえり・診断・validate/migrate）。DOM・時計・乱数・通信を使わない |
| `content.js`（`SA.TEXT`） | 文章（絆の一言96本・あいさつ39・節気24・宿場の小話51・図鑑文39・おうちの方へ・遊び方・スタンプ12） |
| `steps.js`（`SA.Steps`） | 歩数の取り出し口（iOS・Android(b) Recording API・Android(c) 歩数センサーの差分・ためし歩き・なし） |
| `store.js`（`SA.Store`・`SA.Cap`） | 保存（ブラウザ: localStorage、アプリ: LibraryNoCloud の progress.json と Preferences） |
| `notify.js`（`SA.Notify`） | ローカル通知3種（アプリだけ。21〜7時は出さない） |
| `share.js`（`SA.Share`） | 見せ合い QR（`SA1-`＋29文字、CRC32）、カメラと画像からの読み取り、書き出し・読み込み、診断ファイル |
| `vendor/qrcode.js` / `vendor/jsQR.js` | QR を作る・読むライブラリ（書き換えなし。`vendor/LICENSES.md`） |
| `figure.js`（`SA.Fig`） | キャラの絵（6つの状態・4面・染め・武器の出し入れ・「？」の影・Canvas 用のラスタ化） |
| `fx.js`（`SA.FX`） | 忍術の間の演出32種（Canvas、3秒。位で広さ、奥義で残像と金の縁取り） |
| `art.js` / `chars.js` / `sheet.js` / `img/art/` | ニンジャ里ライフから複製した絵の描画・39体のデータ・シートの組版・公式イラスト（変えない。直すときは figure.js 側で包む） |
| `tools/test_rules.mjs` | ルールのテスト |
| `tools/test_share.mjs` | QR・書き出し・CRC のテスト（Playwright があればブラウザの部も） |
| `tools/test_figure.mjs` | 絵と演出のテスト（`--browser --fx` でブラウザの部） |
| `tools/check_content.mjs` | 文章の検査（ふりがなの書式・本数・書かない言葉・続柄） |
| `tools/e2e.mjs` | Playwright の通しテスト（390×844 と 360×640） |
| `tools/fx_preview.html` / `tools/build_icons.mjs` | 演出の見本ページ（開発用）・アイコンの作り直し |
| `app/` | Capacitor 8 のアプリ化の土台（`app/README.md`） |
| `docs/SPEC.md` | 実装仕様 |

## テスト

リポジトリの直下で走らせます。Playwright は `require('playwright')` で読める所に入っていること（`playwright install` は要らない環境で確かめた）。

```sh
node shinobi-ashi/tools/test_rules.mjs                 # 合格 440 / 不合格 0（約0.3秒）
node shinobi-ashi/tools/test_share.mjs                 # 合格 1054 / 不合格 0（--no-browser で Node の部だけ: 1037）
node shinobi-ashi/tools/test_figure.mjs                # 4095 合格 / 0 不合格（約2秒）
node shinobi-ashi/tools/test_figure.mjs --browser --fx # 4113 合格 / 0 不合格（約70秒。全32種の演出を再生）
node shinobi-ashi/tools/check_content.mjs              # 合格 986 / 不合格 0（--list で読みが2通りある親字の一覧）
node shinobi-ashi/app/scripts/test-platform.mjs        # 170 件合格 / 0 件不合格（Capacitor は作り物に差し替え）
node shinobi-ashi/tools/e2e.mjs [--out <dir>]          # 合格 578 / 不合格 0（約2分。2つの画面の大きさ）
```

`e2e.mjs` は、リポジトリ直下で `python3 -m http.server` を空いているポートに立て、`http://127.0.0.1:<port>/shinobi-ashi/` を開きます（終わったら止めます）。通しの中身:

はじめて（手順0〜6・主相棒・こども）→ ためし歩きで +10,000 を8日（とちゅうで「7日すすめる」）→ 出来事のカード（来訪・位・宿場・巻物・目標・絆・染め色・相性・まとめて見る）→ 巻物を開いて忍術の間 → 修行枠に来訪した体を入れて割り当てを変える → 歩いている（テスト）→ 忍びの道 → 図鑑の詳細（6つの顔・4つの向き・公式イラスト）→ 里の掲示板で自分の QR を出し、その QR を画像にして「画像から読む」で読み戻す → 保護者設定（関門を正しく解く）→ 書き出し → はじめから → 読み込みで戻る → ふりかえり（一日・週）→ ふりがな「なし」→ about.html → WEB_TRIAL=false のながめるモード（`data.js` を書きかえて配る。書き出しファイルを開く）

数えるもの: 外部ホストへの要求（0）、コンソールのエラーと pageerror（0）、ルビのない漢字（関門の問題文 `#gate-q` は除く）、`{` `|` `}` の残り、横あふれ、「公認」「コラボ」、ふりかえりの「連続」。スクリーンショットは `--out`（既定は OS の一時フォルダの `shinobi-ashi-e2e/`）に、画面の大きさごとに61枚ずつ置きます。
いまの結果: 390×844 も 360×640 も、外部への要求 0・コンソールのエラー 0・pageerror 0。

## アプリ化

`app/` に Capacitor 8 の土台があります（Android: 自作プラグイン `ShinobiSteps`、iOS: `@capgo/capacitor-pedometer`）。組み立て・実機での確かめ方・この環境で作れなかったもの（APK/IPA）は `app/README.md` を見てください。

```sh
cd shinobi-ashi/app
npm install
npm run sync      # shinobi-ashi の中身を www に写し（sw.js・tools・docs・app は除く。CSP の meta と capacitor.js を足す）、cap sync
```

アプリでは Service Worker を使いません。INTERNET 権限を外し、進行データは iCloud・Android のバックアップの対象外に置きます。

## 更新するとき

- 中身を変えたら `index.html`（と `about.html`）の `?v=1` と、`sw.js` の `CACHE`（`shinobi-ashi-v1`）・`V`（`?v=1`）を同じ番号に上げる。上げないと、ホーム画面に追加した人に古い版が残る
- ファイルを足したら `sw.js` の `CORE` にも足す（`tools/`・`docs/`・`app/` は入れない）
- `data.js` の数値を変えたら、理由を `docs/CHANGES.md` に1行書く。文章の数値（上限・巻物など）は content.js が `CONFIG` から差し込むので追随する（こどもの時間帯の文だけは手で直す）
- アイコンは `node shinobi-ashi/tools/build_icons.mjs` で作り直す。図柄は月・足袋の足あと・巻物で、キャラクターと CryptoNinja の語は入れていない
- アプリは `app/` で `npm run sync` をやり直す
- 変えたら上のテストを全部走らせる

## ライセンス

- QR のライブラリ: `vendor/LICENSES.md`（qrcode-generator 2.0.4 は MIT、jsQR 1.4.0 は Apache-2.0。QR コードは株式会社デンソーウェーブの登録商標）
- iOS の歩数: `@capgo/capacitor-pedometer` は MPL-2.0（`app/README.md`）
- キャラクター: CryptoNinja（CC0・Ninja DAO）。このゲームは非公式のファンゲームです

## 設計図との差（docs/SPEC.md 6 の要約）

設計図「忍び足 家族版」（2026-10-25）の原本はこの環境で失われたため、残った記録から組み直しました。

- **来訪**: 主相棒を除いた38体が、2万×12・3万×13・4万×13 の38回で来る。刃はいつも38回目（115万歩）に「なぞの影」として来て、120万歩で名乗る
- **修行の相性**: 39件の表は失われたため、残っていた条件（猫又の夜・伊賀と甲賀の時間帯・柴の朝・金鬼の「中忍以上と同じ日」・ネムとおえんの我が家など）を残して作り直した。倍率1.2は仮
- **保存**: SQLite ではなく `Directory.LibraryNoCloud` の JSON 1ファイル（iCloud バックアップの除外をネイティブのコードなしで満たせ、依存が少ない）
- **宿場**: 50宿（伊賀上野→甲賀→東海道→小田原→二巡目の西への道→伊勢・大和→和歌山城→雑賀崎）の名前は data.js で決め、小話は content.js
- **区間**: 1時間ごと（iOS は1時間ごとに問い合わせる）。毎分200歩の判定は区間の平均で見る

実装で決めたこと（各担当の報告から、遊びに関わるもの）:

- 宿場は二巡目のおわり（100回目）で止まる。割り当ては10%きざみ（見本の「三人で分ける」34/33/33 だけ例外）
- かくれる探しの候補は来訪の列の先頭3体（刃と見つけ済みを除く）。満月と二十四節気は日本時間で計算する
- 「ひみつの術」の名は、おとなモードでも保護者設定で「あり」にしたときだけ出す。孫市の武器欄は `SHOW_GUN` が false のあいだ「ひみつ」
- 武器の表示は中忍から。巻物・団子・三味線・筆なども「武器欄の物」として、中忍まで外す
- 演出はどのモードでもこども向けのやさしい表現。OS の通知はルビを出せないので、ふりがな「あり」ではかなだけで出す

## 実機でまだ確かめていないこと

この環境では Android SDK と Xcode が使えないため、次は実機で確かめます（くわしくは `app/README.md`）。

- iOS の7日・Android(b) の10日の境界、再起動、バックアップからの復元、機内モード
- 3秒の歩行中判定、前景に戻ったときの取り込み、通知の許可の流れ
- カメラでの QR 読み取り（ブラウザでは偽のカメラと画像ファイルで確かめた）
- INTERNET 権限を外した WebView で画面が出るか、CSP が画面を止めないか（Chromium で www を開いたときは CSP の違反0）
- 満月の13日（2026年）を公表元（国立天文台の暦要項など）と照らす。宿場の小話を作者が一度読む
