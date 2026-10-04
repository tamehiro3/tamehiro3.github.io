# ニンジャ夜明け隊（試作版）

CryptoNinja の39人が仲間になる、**コマンドでたたかうRPG** です。
割れた「暁の鐘」のかけら5つを取り戻して、明けない夜を終わらせます。設計は [`DESIGN.md`](DESIGN.md)（③ RPG 版 詳細設計書 v2.0）。

- 遊ぶ: https://tamehiro3.github.io/ninja-yoake-tai/
- 遊び方・保護者の方へ: `about.html`
- キャラクターシート（39体・2.7頭身）: `sheets/`。ゲームの絵と同じ **2.7頭身**（`DESIGN.md` §11.1）。見た目の定義は `../ninja-sato-life/chars.js`（2頭身のシートは `../ninja-sato-life/sheets/`）

CryptoNinja（CC0・Ninja DAO）のキャラクターを使った個人制作の非公式ファンゲームです。物語・忍術・セリフ・妖怪はゲームの創作で、公式の設定ではありません。
2026-10-04 に、協力防衛の試作（② 1回6分・NPC2人）から、このRPGに作り直しました（名前と置き場所は引きつぎ）。

## 遊びの芯

- **弱点と崩し**：8つの型（斬・打・射・火・水・雷・風・光）。弱点で当てると構えが減り、0で「崩し」（今と次の番に動けず、受けるダメージ1.6倍）
- **印（いん）**：番ごとに1つたまる（最大5）。使うと、こうげきの回数・術の威力が上がる。崩したところに印をぶつける
- **39人の仲間集め**：物語で17人、依頼・勝負・さがし物で22人。仲間帳にヒント。前の4人が戦い、控えの4人は1度だけかけつける
- **探索の術**：リーリー（大岩を押す）・鷹の目（隠し道）・風遁（霧）・焙烙玉（ひびの入った岩）
- **夜明け**：かけらを取り戻すたびに、地図と戦いの空が明るくなる

## 動かし方

ライブラリなしの HTML / JavaScript だけで動きます（ビルド不要）。キャラクターの絵は `../ninja-sato-life/art.js`・`chars.js`・`img/art/` を使うので、**リポジトリの直下から** サーバーを立ててください。

```sh
# リポジトリの直下で
python3 -m http.server 8765
# → http://127.0.0.1:8765/ninja-yoake-tai/
```

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` | 画面の器（地図の表示・会話・戦闘・メニュー・タイトル） |
| `data_base.js` | 型・役割・状態・能力の伸び方・経験値・妖怪の基準の強さ・戦いの決まり・乱数 |
| `data_chars.js` / `data_skills.js` | 主人公と39人（能力・こうげきの型・武器・忍術・加入レベル）／忍術約200と絆技16 |
| `data_items.js` / `data_enemies.js` | 道具・お守り・素材・大事な物・店・宿・鍛冶／妖怪・ボス・腕だめしの相手・群れ |
| `data_maps.js` | 13の地図と旅の地図（`tools/build_maps.mjs` で作る。手で直さない） |
| `data_story.js` | 物語と加入のイベント（命令の並び） |
| `state.js` / `battle.js` / `field.js` / `script.js` | 判定（状態と保存・戦闘・マス目と障害物・イベントの実行）。画面に依存しないので Node でテストする |
| `sprites.js` / `draw_world.js` / `draw_yokai.js` | 忍者の絵（art.js の SVG を画像に）・地面と建物・妖怪の絵 |
| `render_field.js` / `render_battle.js` | フィールド（夜の明かり・霧）と戦闘（背景・術の光・数字）の描画 |
| `battle_ui.js` | 戦闘の流れ（できごとを順に見せる）・コマンド・ねらう相手・勝ち負け |
| `ui.js` / `ui_menu.js` | 会話・えらぶ・タイトル・はじめる画面／メニュー・店・鍛冶・仲間帳・図鑑・旅の地図 |
| `input.js` / `audio.js` / `game.js` | 入力（キー・タッチ・マウス）／音（WebAudio で合成した曲と効果音）／全体の流れとイベントの host |
| `sw.js` / `manifest.webmanifest` / `icons/` | ホーム画面に追加・オフライン |
| `sheets/` | 2.7頭身のキャラクターシート39枚と一覧（`../ninja-sato-life/tools/build_sheets.mjs --heads 2.7` で作る） |
| `tools/` | テストと開発用の道具（下） |

## テスト

```sh
node ninja-yoake-tai/tools/test_core.mjs       # 判定：状態・保存・戦闘・イベント・フィールド
node ninja-yoake-tai/tools/test_content.mjs    # 内容：仲間・忍術・妖怪・地図・物語・曲・絵の整合
node ninja-yoake-tai/tools/playthrough.mjs 7   # 自動で最初から最後まで（種を変えて何度か）
node ninja-yoake-tai/tools/balance.mjs 40      # 章ごとの雑魚戦・ボスの勝率と長さ（開発用）
node ninja-yoake-tai/tools/build_maps.mjs show kirimichi   # 地図を文字で見る（引数なしなら data_maps.js を作り直す）
# 2.7頭身のキャラクターシートを作り直す（playwright-core と Chromium が必要。くわしくは build_sheets.mjs の先頭）
node ninja-sato-life/tools/build_sheets.mjs --heads 2.7 --out ../ninja-yoake-tai/sheets --game ニンジャ夜明け隊
```

自動で遊ぶテスト（`playthrough.mjs`）は、物語の順に歩いて話し、障害物を片づけ、戦いは「おまかせ」で進めます。
39人全員が仲間になり、かけら5つ・エンディングまで届くこと、出口や人のところへ実際に歩いて行けることを確かめます。

## 更新するとき

- 中身を変えたら `index.html` の `?v=4` と `sw.js` の `CACHE` / `V` の番号を上げる
- `../ninja-sato-life/art.js` を直したら（2.7頭身の `heads` など）、`index.html` と `sw.js` で読む `art.js?v=3` の番号も上げる。`chars.js?v=2` は里ライフ側の番号に合わせる
- art.js の既定（`heads` なし）の絵はニンジャ里ライフが使うので、変えるときは里ライフの見た目が変わらないことを確かめる
- 地図は `tools/build_maps.mjs` を直して作り直す。数値を変えたら `test_core.mjs`・`playthrough.mjs`・`balance.mjs` を回す
- トップページの紹介文を変えたら、`../_marketing/OFFER_FACTS.md` も同じコミットで直す
