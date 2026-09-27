# ショート動画パイプライン（AI初心者の時短ワザ）

台本からキャラクター動画（1080×1920 / 60秒）を作って点検し、投稿・改善までを回すための作業フォルダです。
フォルダ名が `_` で始まるので、GitHub Pages（Jekyll）のサイトには公開されません。

## 10ステップと成果物

| # | ステップ | 成果物 | 状態 |
|---|---|---|---|
| ① | 伸びている動画のリサーチ | `research/01_trend_research.md` | 済（各SNSのページを開けなかったため、数値は検索と記事から） |
| ② | テーマ別の60秒台本 | `scripts/02_scripts_by_theme.md`（5本）、`episodes/ep01/script.json` | 済 |
| ③ | ためひろさんの声のクローン（fal） | `tools/tts.py --engine fal`、`voice_ref/README.md` | **未**：fal.ai に接続できず、`FAL_KEY` も声の素材もないため |
| ④ | 1文ずつ音声化 | `episodes/ep01/audio/`（timing.json） | 仮の合成音声（Open JTalk）で作成。③ができたら差し替える |
| ⑤ | キャラクターシートの組み合わせ | `tools/extract_assets.py` | 済：顔9状態（口パク×まばたき）、10ポーズ、表情4つ |
| ⑥ | 60秒の動画編集 | `tools/render.py` → `episodes/ep01/out/ep01.mp4` | 済（57.3秒） |
| ⑦ | テロップ・見出し・図解・効果音 | 同上 | 済 |
| ⑧ | 軍配で点検 | `tools/qa.py` → `episodes/ep01/out/qa/`（qa_report.md、gunbai_review.md、frames_*.png） | 機械検品は通過。出荷判定は「保留（条件つき）」 |
| ⑨ | 3媒体に投稿（AIラベルON） | `episodes/ep01/post/captions.md` | キャプションは作成済み。**投稿は未**（接続手段なし） |
| ⑩ | 数字から改善点を出す → 次の動画 | `improve/10_improvement_plan.md`、`tools/analyze.py`、`episodes/ep02/` | 計測シートと分析ツール、改善を反映した次回の動画を作成済み |

## 使い方（設計図：`design/00_blueprint_review.md`）

本番（クローン声）は、キーと声の素材がある Windows PC で実行します。クラウドは設計と試作に使います。

**Windows（PowerShell、`_shorts` フォルダで実行）**

```powershell
python tools/setup.py                        # 初回のみ（ffmpeg は winget install Gyan.FFmpeg）
python tools/fal_api.py check                # キーが読めるか（キーは C:\Users\3mori\SNS\fal APIキー.txt）
python tools/fal_api.py selftest             # fal に接続できるか、API の仕様が合っているか
python tools/fal_api.py clone "声のファイル.m4a" --start 60 --seconds 90
python tools/fal_api.py tts "それ、チャットジーピーティーに打ち込んで大丈夫？" test.wav
python tools/fal_api.py approve              # test.wav を聞いて本人の声なら承認（承認するまで次は動かない）
python tools/tts.py episodes/ep01 --engine fal
python tools/render.py episodes/ep01
python tools/qa.py episodes/ep01             # Whisper の文字起こし照合つき
python tools/analyze.py improve/metrics_ep01.csv   # 投稿後の数字から改善点を出す
```

**クラウド・Linux（仮の声で試作）**：`bash tools/setup.sh` のあと、`python3 tools/tts.py episodes/ep01` → `render.py` → `qa.py`

キーと声の素材は、リポジトリの外に置いてください。「★サイトを公開する.bat」はフォルダの中身をすべて公開します。

途中のコマだけ確認したいとき：`python3 tools/render.py episodes/ep01 --stills 0 12.5 30`

## 見た目のスタイル

`script.json` の `"style": "studio"` で、ゴールイメージに合わせた見た目になります（ep01・ep02 はこちら）。

- 背景：夜の配信スタジオ。手前にキャラシートのマイク
- キャラ：画面いっぱいに大きく表示し、文ごとにしぐさを変える
- 図解：画面の説明が要る文だけ、上に白いカードが浮かぶ（`chat` / `settings` / `menu` / `list` / `compare`）。`big` / `cta` / `title` は頭の横に絵文字アイコンを出す
- テロップ：胸元に明朝体（Zen Old Mincho Black）の白文字。【】は色ではなく大きさで強調
- 見出し：区切りの最初の約2秒だけ、上に紺の帯を出す。そのあとカードが出る

`style` を書かなければ、旧スタイル（上半分の図解パネル＋丸ゴシックのテロップ）になります。

## 台本ファイル（script.json）の書き方

```json
{"text": "それ、ChatGPTに／打ち込んで【大丈夫？】",
 "tts": "それ、チャットジーピーティーに／打ち込んで大丈夫？",
 "shot": "close", "pose": "face", "heading": "なぜ？", "se": "ding",
 "visual": {"type": "title", "emoji": "😨", "text": "それ、打ち込んで\n【大丈夫？】"}}
```

- `／`：声の区切り。ここでテロップが切り替わる（時刻は音声から自動で推定）
- `【】`：大きく黄色で出す言葉（図解の中では赤）
- `tts`：読み方を指定したいときだけ書く（英字・数字はカナにする）
- `shot`：`close`（寄り）か `wide`（引き）。書かなければ1文ごとに交互
- `pose`
  - `face`：口パク＋まばたきの顔
  - `pose01`〜`pose10`：10ポーズ。寄りのときは上半身を切り出し、05と07以外は口パクあり
  - `expr_happy` / `expr_angry` / `expr_sleepy` / `expr_normal`：表情
- `heading`：話の区切りの見出し。中央に大きく出たあと、パネル左上に残る
- `se`：`ding` / `kira` / `pop` / `whoosh`。冒頭の「ドンッ」と見出しの「ポン」は自動で入る
- `visual`：上半分の図解
  - `title` / `big` / `cta`：大きな文字と絵文字
  - `chat`：チャット画面（`stamp` でハンコ）
  - `settings`：設定画面（`toggle`、`switch_to` でオン→オフの演出）
  - `menu`：メニュー一覧
  - `list`：番号つきの一覧（`show` で1つずつ増やす）
  - `compare`：比べる2枚のカード

## 画面の設計

- 上：図解パネル（y 150〜890）
- 中：テロップ（中心 y 1010、x 59〜955）
- 下：キャラクター
- TikTok・リール・ショートの右側ボタンと下のキャプションに隠れないよう、テロップと見出しは x 50〜965・y 150〜1440 に収めています（`qa.py` で毎回確認）。

## ライセンス

- フォント M PLUS Rounded 1c（テロップ・図解）と、絵文字画像の元の Noto Color Emoji は SIL Open Font License 1.1
- waifu2x のモデルは MIT
- 効果音は `tools/sfx.py` でその場で合成（外部素材なし）

## できた動画を Discord に送る

1. Discord で「チャンネルの編集 → 連携サービス → ウェブフック → 新しいウェブフック → ウェブフックURLをコピー」
2. その URL を、リポジトリの外のファイル `C:\Users\3mori\SNS\discord_webhook.txt` に1行で保存する（git に上げない・チャットに貼らない）
3. `python tools/discord_send.py check` で、送れる状態か確かめる（投稿はしない）
4. 作るついでに送る: `python tools/make.py ep12 ep10 ep14 --engine fal --discord`
   できている動画だけ送る: `python tools/discord_send.py ep12 ep10 ep14`

無料の Discord は1ファイル10MBまでなので、送る用に圧縮した `out/epXX_discord.mp4`（720p）を作って送る。投稿には元の `epXX.mp4` を使う。
