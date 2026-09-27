---
name: sns-canva-draft
description: しのびのゲーム工房のSNS下書きを、Canvaの画像つきで作る手順。Canvaのテンプレート「今日の謎カード」の文字を本人の文面に差し替えて書き出し、事前検品してから下書きIssueを作る。「今日の謎カードを作って下書きにして」「Canvaで画像を作ってSNSに出したい」と言われたら使う。承認は本人だけで、Claudeは承認ラベルを付けない。
---

# Canva画像つきのSNS下書きを作る

このリポジトリのSNS自動投稿（`_marketing/`）は「本人が話す → 下書きIssue → 機械検品 → 本人が承認 → 毎日1本投稿」で回っている。
このスキルは、その下書きを **Canvaの画像つきで Claude が代わりに組み立てる** ための手順。設計と点検の記録は `_marketing/GUNBAI_REVIEW.md` §10。

## 守ること（軍配の信号色。破ったら下書きを作らない）

1. **文面は本人の言葉だけ。** 投稿文・謎・メッセージは本人が話した（書いた）ものを使う。Claude が謎や主張、数字を作らない。足りなければ本人に聞く。
2. **承認は本人だけ。** Claude はラベル「承認」を付けない。検品チェックに印を付けない。Issueを閉じない。Claude がやるのは下書きIssueを作るところまで。
3. **Canvaを保存する前に、プレビューを本人に見せてOKをもらう。** 差し替え後のサムネイルを見せ、OKが出てから保存する（Canvaのツールの決まりでもある）。
4. **テンプレートを直接書き換えない。** 必ず `copy-design` で複製してから編集する。
5. **事実は事実台帳（`_marketing/OFFER_FACTS.md`）にあるものだけ。** 禁止表現は `_marketing/sns/rules.json`。例: 効果の断言、No.1、期間限定、「広告なし」、投資の話。
6. **写真・人の顔・子どもは使わない。** テンプレートの素材と文字だけで作る。
7. **書き出したらすぐIssueを作る。** Canvaの書き出しリンクは期限つきで、実測では2時間で切れるものもあった。Issueができると、受付のワークフローが画像を取得してリポジトリに保存する。

## 手順

### 1. 本人から受け取る
- 投稿文（Typelessで話したもの）
- 画像に入れる謎の文面（1〜2行。答えは書かない）
- ジャンル（今日の謎／親子で／作り手の話／遊び方／大人の脳トレ時間／今週のおすすめ／その他）
- リンク先（なし／にんじゃミッション工房／忍びの謎巡り／ポータル）

### 2. Canvaで画像を作る
テンプレート: 「今日の謎カード」（デザインID `DAHWSwVQsLo`、1600×900）。文字要素は「今日の謎」「答えはあした」「しのびのゲーム工房」と、謎の本文の4つ。

1. `copy-design`（design_id: `DAHWSwVQsLo`）→ 新しいデザインID
2. `read-design`（新しいID、`open_transaction: true`、`filter.fields: ["design_content", "thumbnails"]`）→ transaction_id と、謎の本文の要素（いちばん長い文字要素）の locator_id を控える
3. `edit-design`（`finalize: "keep_open"`）で `find_and_replace_text`：謎の本文を本人の文面に差し替える。改行は `\n`。タイトルは `update_title` で「今日の謎カード YYYY-MM-DD」などに
4. 返ってきたサムネイルを本人に見せ、はみ出し・誤字がないか確認してもらう
5. OKなら `edit-design`（`finalize: "commit"`）で保存。直しがあれば keep_open で直す。やめるなら `cancel`
6. `export-design`（`format: {"type": "jpg", "quality": 80, "width": 1440}`）→ 書き出しURL（`https://export-download.canva.com/...`）。幅1440はThreadsの目安

### 3. 事前検品して、Issueの中身を作る
```
python3 _marketing/sns/tool/sns.py canva-draft \
  --text "投稿文" \
  --image-url "書き出しURL" \
  --image-desc "画像の中の文字を全部そのまま＋短い絵の説明" \
  --genre 今日の謎 --link なし --design-id <新しいデザインID>
```
- `--image-desc` は代替テキストになり、受付では画像の文字認識（OCR）と照合される。デザインの全文字要素を上から順に入れる。
  例:「藍色の背景に金色の文字。今日の謎。朝は4本、昼は2本、夜は3本の足で歩くものはなあに？答えはあした。しのびのゲーム工房」
- 終了コードが1（❌あり）なら、Issueは作らない。本人と文面を直す。
- 0なら、最後に出る JSON の `title` / `body` / `labels` を使う。

### 4. 下書きIssueを作る
GitHub の連携（`issue_write`、method `create`）で作る。
- owner `tamehiro3` / repo `tamehiro3.github.io`
- title・body・labels は手順3の JSON のまま（labels は `SNS下書き` だけ）

### 5. 本人に伝える
- Issue のリンク
- 1分ほどで「軍配 機械検品レポート」がコメントされ、Canvaの画像が受付で保存されること
- 本人がやること: レポートを読む → 検品チェック5つに印 → ラベル「承認」

## うまくいかないとき
- 受付のワークフローは `master` にあるものが動く。まだ取り込まれていなければ、Issueを作っても検品されない
- レポートに「Canvaの画像リンクの期限が切れています」と出たら、`export-design` で書き出し直し、Issue本文の画像URLを新しいものに差し替える（編集すると再検品される）
- 主戦場は Threads（`config.json` の `channel`）。Xに戻した場合、`x.images_enabled` が false のままだと画像つき下書きは止まる
- リンク先「メルマガ」は、Substack のURLを `config.json` の `links` に入れるまで選べない
