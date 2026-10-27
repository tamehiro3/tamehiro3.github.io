# 忍び足（しのびあし）— 実装仕様（v1 試作）

設計図「忍び足 家族版」（2026-10-25、16章）を、動くゲームにするための仕様です。
数値はすべて `data.js` にあります。ここでは仕組み・画面・部品の受け渡し（API）を決めます。
設計図の原本はこの環境では失われたため、残った記録（第1章全文、主要な数値、最終検証の整合一覧）から組み直しました。
組み直しで決め直した点は末尾「設計図との差」に書きます。

## 0. いちばん大事な決まり（破ってはいけない）

1. **インターネットに何も送らない。** `fetch`/XHR/WebSocket/外部の画像・フォント・スクリプトを一切使わない（Service Worker が同じフォルダのファイルをキャッシュするのは可）。CDN 禁止。ライブラリは `vendor/` に同梱。
2. **広告・解析・課金・ガチャ・ポイント・お金・交換・ランキング・チャット・自由入力の文字送受信なし。** 連続日数（ストリーク）を見せない。累計と「週に目標に届いた日の数」だけ。
3. **個人情報を聞かない。** 名前・年齢・位置・連絡先を入力させない。位置情報 API を呼ばない。年齢は聞かず「おとな／こども」を選ぶだけ。
4. **全部の文にふりがな。** 画面に出す日本語はすべて `{漢字|かな}` の書式で書く（`SA.UI.furi()` が `<ruby>` にする）。ひらがな・カタカナ・数字・記号は書式不要。設定「ふりがな」を「なし」にしたときだけ外す（既定は「あり」）。
5. **非公式の表記。** タイトル画面・図鑑・おうちの方へに「CryptoNinja（CC0・Ninja DAO）のキャラクターを使った個人制作の非公式ファンゲームです」。「公式」「公認」「コラボ」と書かない。ストア名・アイコンに CryptoNinja の語を入れない。
6. **こどもモードの守り**（第1章の4点）: 目標歩数の既定値（こども10,000／おとな8,000）、相性の時間帯（こどもは `kids` の時間帯）、深夜0〜5時の歩数を修行値に入れない、「ひみつの術」4体（令・瀬織・イブキ・孫市）の技名を「ひみつの{術|じゅつ}」と出す。
7. **歩きながら操作させない。** 起動時に3秒の歩行中判定。歩行中は全ボタンを押せなくし「{止|と}まってから{見|み}てね」と出す（ブラウザの試遊では判定できないので、ためし歩きの「歩いている（テスト）」スイッチで確かめる）。
8. **既存のブラウザゲームと同じ作り。** ビルドなしの素の HTML/CSS/JavaScript。`file://` でも http でも動く。ES モジュールは使わず、各ファイルは IIFE で `window.SA` に部品を足す（Node でも `require` できる形: `if (typeof module!=='undefined') module.exports = …`）。ライブラリは `vendor/` の2つ（QR 生成・QR 読み取り）だけ。

## 1. フォルダとファイル（担当ごとに分ける）

```
shinobi-ashi/
  index.html            画面の骨組み（UI担当）
  style.css             見た目（UI担当）
  ui.js                 画面の部品・ふりがな・画面遷移・各画面（UI担当。長くなるなら screens.js に分けてよい）
  about.html            遊び方・おうちの方へ（UI担当。広告コードなし）
  sw.js, manifest.webmanifest, icons/   オフライン・ホーム画面（UI担当。icons の画像は絵担当が作る）
  data.js               数値と構造（作成済み。変えるときは理由を docs/CHANGES.md に1行）
  rules.js              ルール（画面なし・Node でテスト）（ルール担当）
  content.js            文章（一言・小話・図鑑文・保護者向け文）（文章担当）
  steps.js              歩数の取り出し口（iOS / Android(b)(c) / ためし歩き / なし）（アプリ担当）
  store.js              保存（ブラウザ: localStorage、アプリ: Filesystem＋Preferences）（アプリ担当）
  share.js              見せ合い QR・書き出しファイル・診断ファイル（QR担当）
  vendor/qrcode.js, vendor/jsQR.js, vendor/LICENSES.md   （QR担当）
  figure.js             キャラの絵（6欄の状態・4面・染め・武器・ラスタ化）（絵担当）
  fx.js                 忍術の間の演出（Canvas、3秒）（絵担当）
  art.js, chars.js, sheet.js, img/art/   ニンジャ里ライフから複製（変えない。直したいときは figure.js 側で包む）
  tools/test_rules.mjs  ルールのテスト（ルール担当）
  tools/e2e.mjs         Playwright の通しテスト（結合担当）
  tools/build_icons.mjs アイコン作成（絵担当）
  tools/fx_preview.html 演出の見本ページ（絵担当、開発用）
  app/                  Capacitor（アプリ化）の土台（アプリ担当）
  docs/SPEC.md（本書）, docs/CHANGES.md
  README.md             遊び方・動かし方・テスト・アプリ化・設計図との差（最後に結合担当がまとめる）
```

読み込み順（index.html）: `vendor/qrcode.js` → `vendor/jsQR.js` → `art.js` → `chars.js` → `data.js` → `content.js` → `rules.js` → `figure.js` → `fx.js` → `store.js` → `steps.js` → `share.js` → `ui.js`。各ファイルの URL には `?v=1` を付ける（sw.js と合わせる）。

## 2. 名前空間と部品の受け渡し（API）

すべて `window.SA` の下。Node では `require('./rules.js')` などで同じものが返る。

### 2.1 データ（作成済み）
- `SA.DATA` … `data.js`。CONFIG, RANKS, VISIT_AT, REPS, FIRST8, VISIT_ORDER, CLANS, ROAD_COLOR, DYES, STATIONS, CLAN_WINDOWS, AFFINITY, JUTSU_FX, SECRET_JUTSU, KIDS_BIO, BOND_LINES_AT。
- `NSL_CHARS` … `chars.js`（39体: `CHARS`, `BY_ID[id]` に id/num/name/en/clan/jutsu/weapon/birthday/bio/color/palette/art/greet/talk など）。`art` は art.js 用の見た目の定義。

### 2.2 ルール `SA.Rules`（rules.js。DOM なし・時計を直接読まない・乱数を使わない）

日付は端末の地方時の `'YYYY-MM-DD'` 文字列。曜日・祝日・満月・二十四節気はこの文字列から計算する（`new Date(y, m-1, d)` で地方時の正午として扱う）。

```js
SA.Rules.newState({ mainId, mode: 'kodomo'|'otona', today: 'YYYY-MM-DD', route: 'ios'|'androidB'|'androidC'|'sim'|'none' }) -> state
SA.Rules.ingest(state, days, ctx) -> { state, events }
  // days: [{ date:'YYYY-MM-DD', steps: 整数（その日の端末の合計）, buckets: 24個の整数（1時間ごと）|null, src: 'ios'|'androidB'|'androidC'|'sim' }]
  //   同じ日を何度読んでもよい（今日の途中→夕方→夜）。前回より増えた分だけを足す（冪等）。減った値は無視。
  //   buckets は 15分ごと（96個）でもよい。長さで判断する（24→60分、96→15分）。null は区間なし（相性の時間帯系は判定なし）。
  // ctx: { today:'YYYY-MM-DD' }
  // events: 画面が順に見せる出来事（下の 2.2.2）
SA.Rules.setChoice(state, date, { home: bool }) -> state        // 今日は「道を進める」か「里に納める（我が家）」か。その日の取り込み前でも後でもよい（後なら、その日の分を付け替える）
SA.Rules.setFamilyDay(state, date, bool) -> state             // 「家族で歩いた日」
SA.Rules.setSlots(state, ids /*長さ3、null可*/, alloc /*合計100、10きざみ*/) -> state   // 修行枠。主相棒は必ずどこかの枠に入る。来訪済みの体だけ入れられる。同じ体を2つの枠に入れない。割り当て変更は「その日の、まだ取り込んでいない分」から効く
SA.Rules.openScroll(state, charId) -> { state, jutsu: { charId, fx, rank, okugi, secret } } | null   // 巻物を1本開く（巻物がなければ null）
SA.Rules.search(state) -> { state, found: charId|null }      // 隠れ里の「探す」。候補の中から1体（決定的に: その時点の hideTotal と回数から選ぶ）。見つけた体は来訪の列の先頭へ
SA.Rules.readGuest(state, payload, today) -> { state, entry }  // 見せ合い QR を読んだ（share.js が解いた中身）。掲示板に貼る（最大5。同じ charIndex で修行値が同じか少ない古い札は置き換え）。里の客7日
SA.Rules.dye(state, charId, dyeId, today) -> { state, ok, reason }  // 市の染め（日曜だけ。日曜1回。使える色だけ）
SA.Rules.summary(state, today) -> 画面用のまとめ（今日の歩数/目標/修行値/上限まで/巻物の数/次の来訪までの歩数/次の宿場まで/各枠の相性が合ったか/位の進み）
SA.Rules.weekReview(state, mondayDate) -> { days: [...7日], goalDays, total, perChar: [...] }
SA.Rules.dayReview(state, date) -> { steps, shugyo, rejected, capped, goalReached, affinity: [...], scrollsToday, visitsToday, stationsToday }
SA.Rules.diagnostics(state) -> 診断ファイルの行（日付・修行値・不採用歩数・上限到達・目標到達・我が家・家族で歩いた・開いた回数・歩行中判定の回数 の9項目）
SA.Rules.noteOpen(state, date) / noteWalkingBlock(state, date) -> state   // 開いた回数・歩行中判定が出た回数（診断用）
SA.Rules.rankOf(shugyoTotal) -> 0..5 ; SA.Rules.okugiOf(total) -> 0..2
SA.Rules.queue(state) -> 来訪を待っている体の id の列（主相棒と来訪済みを除く。刃は最後）
SA.Rules.isHoliday(date), isFullMoon(date), solarTerm(date) -> {name,kana}|null, weekday(date) -> 0..6, addDays(date, n), diffDays(a, b)
SA.Rules.validate(state) -> { ok, errors }   // 読み込み時の検査
SA.Rules.migrate(obj) -> state               // 古い版のデータを今の版に
```

#### 2.2.1 1日の計算（ingest の中身）
1. **不採用**: 区間（bucket）の歩数が「1時間あたり12,000歩」を超える区間、または「区間の平均が毎分200歩」を超える区間は、その区間の歩数をまるごと不採用。こどもモードは0〜5時の区間も不採用（区間がないとき＝null は深夜の判定ができないので不採用0）。
2. **採用歩数** = 合計 − 不採用（下限0）。**修行値（その日）** = min(採用歩数, 16,500)。16,500 に届いたら `capped=true`（「今日はここまで」）。
3. **差分だけ足す**: その日に前回までに足した修行値 `daily[date].shugyo` との差（増えた分）だけを、以下に配る。
4. **来訪累計** `visitTotal += 増えた分`（我が家の日も含む）。**道の累計** `roadTotal += 増えた分`（我が家の日は足さない）。**隠れ里の累計** `hideTotal += 増えた分`（我が家の日だけ）。
5. **巻物**: `visitTotal` が 1,000 の倍数をまたぐごとに巻物+1（`scrolls`）。
6. **修行枠へ配る**: 枠 i の相棒に `増えた分 × alloc[i]/100 × (相性が合えば1.2)` を足す（端数は切り捨て、相性の判定は「その日の区間全体」で行い、日の途中で合ったら、それまでに配った分も含め、その日のその体の分を1.2倍に揃える＝その日の体ごとの配分を毎回作り直して差分を足す）。
7. **相性の判定**（AFFINITY の type ごと。区間が null の日は clan/win/cont/bits を「判定なし」=1.0）:
   - `clan` … CLAN_WINDOWS[その体のクラン] の時間帯に 1,000歩以上（こどもモードは kids の時間帯）
   - `win` … `from`〜`to`時（to は含まない）に 1,000歩以上（こどもモードは `kids`）
   - `cont` … 1時間（15分区間なら連続4区間の和）に 3,000歩以上の区間がある
   - `bits` … 100歩以上の1時間が6つ以上
   - `holiday` … 土日・祝日（振替休日・国民の休日を含む） / `weekday` … それ以外
   - `restAfter` … 前の日の修行値が 3,000 未満（記録がない日も「休んだ」に数える）
   - `home` … 我が家の日 / `road` … 我が家でない日 / `family` … 家族で歩いた日
   - `goal` … その日の修行値が目標歩数以上
   - `with` … `ids` のどれかが同じ日に修行枠にいる（来訪済みであること）
   - `withRank` … 同じ日に、位が `rank` 以上の別の相棒が修行枠にいる
   - `fullmoon` … 月齢が満月の前後1日（月齢 13.8〜15.8 日。基準の新月 2000-01-06 18:14 UTC、朔望月 29.530588853 日）
   - `sekki` … 二十四節気の日（太陽黄経が15度の倍数になる日。簡易式で可。2026年の立春2/4・春分3/20・夏至6/21・秋分9/23・冬至12/22 がテストで合うこと）
   - `steady` … 前の日の修行値との差が25%以内で、その日の修行値が2,000以上
8. **位**: 体ごとの累計修行値が RANKS の total をまたいだら `rank` イベント。免許皆伝（90万）のあと 120万・150万で `okugi` イベント。
9. **来訪**: `visitTotal` が VISIT_AT[k] をまたぐごとに、列の先頭の体が来る（`visit` イベント）。列 = VISIT_ORDER から主相棒と来訪済みを除いたもの（かくれる探しで見つけた体は先頭へ）。38回目（115万）は刃で、`jinShadow`（なぞの影。名前は「？？？」）。来訪累計 120万で `jinReveal`（刃が名乗る）。
10. **宿場**: `roadTotal` が 2万の倍数をまたぐごとに `station` イベント（idx 0〜50、51以降は二巡目で idx = 100 − n…を折り返し。二巡目は小話を出さず到着だけ）。宿場17（吉原）は `stationEvent: 'atoza'`（アトザが道で待っている。来訪済みでなくても会話だけ出る）。宿場に `dye` があればその色が使えるようになる（`dyeUnlock` イベント）。
11. **絆**: その日に枠にいて、その日のその体の修行値が 1,000 以上になった時点で、その日1回だけ絆+1（`bond` イベント、BOND_LINES_AT に当たれば `line` 付き）。
12. **目標**: その日の修行値が目標に届いた時点で `goal` イベント（その日1回）。
13. **修行お休み**: 前回の同期日から今日までに、経路の HISTORY_DAYS を超えて読めない日があったら、その日数を `rest` イベントで知らせる（罰はない。「{開|ひら}かなかった{日|ひ}の{分|ぶん}は、{開|ひら}いた{日|ひ}の{修行|しゅぎょう}に{入|はい}る」は Android(c) のときだけの文）。
14. **実歩数の保持**: `recent[date] = steps`（7日分だけ。8日目に消す）。`daily[date]` には歩数そのものを持たない: { shugyo, rejected, capped, goal, home, family, src, opens, walkBlocks, aff:{id:true} }。

#### 2.2.2 events の形
```js
{ type: 'scroll', n }                       // 巻物が n 本増えた
{ type: 'goal', date }
{ type: 'cap', date }                       // 今日はここまで
{ type: 'affinity', id, date }              // 相性が合った（その日はじめて）
{ type: 'bond', id, bond, line: true|false }
{ type: 'rank', id, rank }                  // 1..5
{ type: 'okugi', id, level }                // 1..2
{ type: 'visit', id, n }                    // n 回目の来訪（1..37）
{ type: 'jinShadow' } / { type: 'jinReveal' }
{ type: 'station', idx, round }             // round 1 or 2
{ type: 'stationEvent', idx, kind: 'atoza' }
{ type: 'dyeUnlock', dyeId }
{ type: 'hideOpen' }                        // かくれる探しが始まった（14万）
{ type: 'rest', days }
```

#### 2.2.3 state の形（rules.js が作る。保存はこの JSON をそのまま）
```js
{
  app: 'shinobi-ashi', v: 1,
  createdAt, mode, goal, mainId, route,
  furigana: true,
  slots: ['anne', null, null], alloc: [100, 0, 0],   // はじめは主相棒1体に100%
  chars: { anne: { joined:'2026-10-27', shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null } },
  visits: 0, foundIds: [],                 // 来訪の回数、かくれる探しで見つけて先頭に回した体
  jin: { shadow: false, revealed: false },
  visitTotal: 0, roadTotal: 0, hideTotal: 0, searches: 0,
  scrolls: 0, scrollsOpened: 0,
  stationsReached: 0, round: 1, diary: [ { date, idx, stamp } ],   // 旅の日記（スタンプを選ぶだけ。文字の入力なし）
  dyes: ['none','ai'], lastDyeDate: null,
  daily: { 'YYYY-MM-DD': { shugyo, rejected, capped, goal, home, family, src, opens, walkBlocks, aff:{}, alloc:{id:val} } },
  recent: { 'YYYY-MM-DD': steps },
  board: [ { charIndex, rank, okugi, shugyo, dye, bond, station, round, date, readAt } ],
  guests: [ { charIndex, dye, until } ],
  lastSync: null, lastSyncDate: null,
  settings: { homeButton: true, familyButton: true, notify: { evening: '18:30', on: true }, showSecretNames: false, sound: true }
}
```

### 2.3 歩数 `SA.Steps`（steps.js）
```js
await SA.Steps.detect() -> { route: 'ios'|'androidB'|'androidC'|'sim'|'none', canBuckets: bool, historyDays }
await SA.Steps.permission() -> 'granted'|'denied'|'prompt'
await SA.Steps.request() -> 'granted'|'denied'
await SA.Steps.read(fromDate, toDate) -> days[]（2.2 の ingest に渡す形。今日は「今まで」の分）
await SA.Steps.walkingNow(ms=3000) -> bool
SA.Steps.sim   // ためし歩き（ブラウザだけ）: { addSteps(n, {hour, spread:'cont'|'bits'|'flat'}), nextDay(), skipDays(n), setWalking(bool), today(), reset() }。今日の日付を自分で持つ（実の時計から何日ずらすか）
SA.Steps.today() -> 'YYYY-MM-DD'   // 画面とルールが使う「今日」（sim のときはずらした日付）
```
- iOS（Capacitor）: `@capgo/capacitor-pedometer` の `getMeasurement({start,end})` を1時間ごとに呼んで buckets を作る（過去7日まで）。`isAvailable().stepCounting` が false なら 'none'（ながめるモード）。歩行中判定は `startMeasurementUpdates` の `currentCadence` が 1.2 以上。
- Android（Capacitor）: 自作プラグイン `ShinobiSteps`（app/ 参照）。(b) Recording API（購読した時点から10日、1時間ごと）を先に試し、だめなら (c) 歩数センサーの前景差分（区間なし。起動ごとに前回値との差を「今日」に入れる。再起動・バックアップ復元のときは基準を捨てる）。
- ブラウザ: `CONFIG.WEB_TRIAL` が true なら 'sim'、false なら 'none'。

### 2.4 保存 `SA.Store`（store.js）
```js
await SA.Store.load() -> state|null
await SA.Store.save(state)            // 失敗しても例外を投げずに false。画面は「保存できませんでした」を出す
await SA.Store.clear()
await SA.Store.getPref(key) / setPref(key, value)   // 小さな設定（おとな/こども・目標・通知時刻・同期時刻・最後の書き出し日・(c) の基準値）
```
- ブラウザ: localStorage（キー `shinobi-ashi:v1`）。localStorage が使えない端末ではメモリだけ（画面に「この端末では記録が残りません」）。
- アプリ: 進行データは `@capacitor/filesystem` の `Directory.LibraryNoCloud` に `progress.json`（iOS は iCloud バックアップの対象外。Android は data_extraction_rules で除外）。書くときは一時ファイルに書いてから置き換える。設定は `@capacitor/preferences`。

### 2.5 見せ合いと書き出し `SA.Share`（share.js）
```js
SA.Share.encodeGuest(state, charId) -> 'SA1-XXXX…'（QR に入れる文字。英大文字と数字と - だけ＝QR の英数字モード）
SA.Share.decodeGuest(text) -> { ok, payload|reason }   // 版・CRC32 を確かめる
SA.Share.qrSvg(text, size) -> SVG 文字列（vendor/qrcode.js）
await SA.Share.scanCamera(videoEl, { onResult, onError }) -> stop()   // getUserMedia＋vendor/jsQR.js。カメラの映像は端末の外に出さない
await SA.Share.scanImageFile(file) -> text|null       // 画像ファイルから読む（試遊・カメラがない端末）
SA.Share.exportFile(state) -> { name: 'shinobi-ashi-YYYYMMDD.json', text }   // 全データ（直近7日の歩数を含む）。CRC32 つき
SA.Share.importFile(text) -> { ok, state|reason }
SA.Share.diagnosticsFile(state) -> { name, text }      // 9項目の CSV（テスター用）
await SA.Share.saveText(name, text)   // ブラウザはダウンロード、アプリは Filesystem に書いて @capacitor/share で共有シート
```
QR の中身（版1、18バイト→ Crockford Base32 で29文字、先頭に `SA1-`）: [0]版=1, [1]charIndex(0-38, chars.js の並び), [2]rank(下位3ビット)|okugi<<3, [3-6]累計修行値(uint32, big endian), [7]染めの番号(DYES の並び), [8]絆(0-255で頭打ち), [9-10]日付(2026-01-01 からの日数 uint16), [11]宿場の番号, [12]周回(1|2), [13]予備0, [14-17]CRC32(0〜13 の CRC)。名前・年齢・位置・端末情報・歩数・識別子は入れない。

### 2.6 絵 `SA.Fig`（figure.js）と演出 `SA.FX`（fx.js）
```js
SA.Fig.svg(charId, { state: 'normal'|'happy'|'surprised'|'serious'|'walk'|'hide', view: 'front'|'quarter'|'side'|'back', dye: dyeId, weapon: bool, frame: 0..3, shadow: bool }) -> SVG 文字列（viewBox 0 0 200 240）
SA.Fig.el(charId, opts, cssSize) -> HTMLElement（インライン SVG を包んだ div）
await SA.Fig.bitmap(charId, opts, px) -> ImageBitmap|HTMLCanvasElement（Canvas 用。同じ opts はキャッシュ。キャッシュは 25MB を目安に古いものから捨てる）
SA.Fig.silhouette(charId) -> 未来訪の体の「？」影（図鑑・隠れ里）
SA.Fig.sheet6(charId, opts) -> HTMLElement（6欄: ふつう・うれしい・びっくり・しんけん・あるく・かくれる）
SA.FX.play(canvas, { charId, fx, rank, okugi, secret, kidsMode, onDone }) -> { skip() }   // 3秒。rank で派手さが変わる（1=小さく, 2=相棒の周り, 3=画面半分, 4=画面全体, 5=背景が変わる）。okugi で残像と金の縁取りを足す。secret は共通のきらきらだけ
SA.FX.TYPES   // 実装した演出の名前の一覧（data.js の JUTSU_FX の値をすべて含む）
```
- `hide`（かくれる・擬態）は sheet.js と同じ考え方（びっくり顔の体の前に竹と布の幕）を figure.js で描く。art.js は変えない。
- 武器（`weapon`）は位が中忍以上のときだけ true にする（画面側の責任）。孫市の銃は `CONFIG.SHOW_GUN` が false なら出さない。
- 染め（`dye`）は装束の主な色（`top.color`、袖・下衣の同系色）を差し替える。
- 状態の使い分け（画面側）: ふつう＝ホームの待機、うれしい＝目標・位が上がった・来訪、びっくり＝来訪の瞬間・巻物、しんけん＝修行枠の画面・忍術の前、あるく＝取り込みの演出・忍びの道、かくれる＝深夜0〜5時・修行お休み・掲示板で14日読んでいない札・隠れ里の候補。

### 2.7 文章 `SA.TEXT`（content.js）
```js
SA.TEXT = {
  bond: { anne: [12本], sakuya: [...], kohaku, shiba, karma, hayate, nemu, hinanojoh },   // 最初の8体×12本＝96本（絆 BOND_LINES_AT で順に開く）
  greet: { 39体: '来訪したときのあいさつ1本' },                                    // 39本
  sekki: { 立春: '…', … 24節気 },                                                    // 24本（その日のホームで主相棒が言う）
  special: { cap, rest, rankUp, menkyo, okugi, jinReveal },                            // 6本（{name} を相棒名に置き換える）
  idle: { 39体: ['短い一言', …2〜3本] },                                             // 最初の8体以外のふだんの一言（chars.js の talk を参考に、歩く・修行の話に寄せる）
  stations: [51件: { tale: '宿場の小話1〜2文' }],                                       // 0〜50。史実と伝承のよく知られたことだけ。料金・日程・営業時間は書かない
  atoza: ['吉原でアトザが待っている場面の会話 3〜4行'],
  jin: { shadow: '…', reveal: ['…', '…'] },
  zukan: { 39体: 'ゲームの図鑑文 1〜2文' },                                            // 公式紹介文（chars.js の bio）とは別に、ゲームでの様子
  parent: { short: '…', detail: [...], privacy: [...], gate: '…' },                    // おうちの方へ（2.5〜2.7 の4つの主張: 歩数・位置・年齢・つながり）
  help: [ { q, a } ],                                                                    // 遊び方
  stamps: [ '旅の日記のスタンプの言葉 12種' ]
}
```
すべて `{漢字|かな}` のふりがな書式。こども（小学3〜5年）が読める言葉。怖い・痛い・人を傷つける表現を書かない。ほかの人と比べない。歩きすぎをすすめない（「休むのも修行」）。夜道・早朝の外出をすすめない。

## 3. 画面（UI担当）

縦長のスマホ（幅 360〜430px）を基本に、タブレット・PC でも中央 480px の列で崩れないこと。和紙の色（ニンジャ里ライフと同じ系統: `--washi #f7f1e5`, `--ink #3b2a20`）。フォントは端末のもの（外部フォントを読まない）。ボタンは大きく（高さ44px以上）。アニメーションは「動きを減らす」設定（prefers-reduced-motion）で控えめにする。

### 3.1 はじめて（初回3分）
- 手順0: 「おうちの方へ」（このアプリについて。短い説明と、詳しい説明への入口）。「つぎへ」。
- 手順1: タイトル「{忍|しの}び{足|あし}」副題「{家族|かぞく}で{歩|ある}く{三十九|さんじゅうく}の{里|さと}」。非公式の表記。ブラウザでは「ためし歩きで遊ぶ（試遊）」「ながめる（図鑑と忍びの道）」の2つ。
- 手順2: 主相棒を選ぶ（REPS の4体を「ふつう」ポーズで並べ、クランの一文）。
- 手順3: おとな／こども（既定は「こども」を選んだ状態。「おとな」に変えるときだけ関門を1回通す）。
- 手順4: 修行枠と我が家ボタンの説明（3コマ）。
- 手順5: 歩数の許可（自前の説明画面「{毎日|まいにち}{歩|ある}く{習慣|しゅうかん}づくりのために、{端末|たんまつ}が{数|かぞ}えた{歩数|ほすう}を{相棒|あいぼう}の{修行|しゅぎょう}に{使|つか}います。{歩数|ほすう}はインターネットには{送|おく}りません」→ OS の許可）。ここにも「おうちの方へ」の入口。
- 手順6: 最初の取り込み（iOS は過去7日を読める。Android(b) と試遊は今日から）。ホームへ。

### 3.2 ホーム
主相棒の大きな絵（状態は 2.6 の使い分け）、枠の2体は小さく横に。今日の歩数と目標の輪、修行値（上限まで）、巻物の数（押すと忍術の間）、「{取|と}り{込|こ}む」ボタン（アプリでは起動時と前景復帰時に自動）、今日の選択「{道|みち}を{進|すす}める／{里|さと}に{納|おさ}める（{我|わ}が{家|や}）」（設定で隠せる）、「{家族|かぞく}で{歩|ある}いた{日|ひ}」ボタン（設定で隠せる）、次の来訪までの棒、次の宿場までの棒、二十四節気・満月の日の一言、里の客（読み取った家族の相棒）が画面の端を歩く。16,500 に届いたら「{今日|きょう}はここまで。あとは{休|やす}むのも{修行|しゅぎょう}」。深夜0〜5時は相棒が「かくれる」で眠っている（こどもモードは通知も出さない）。
取り込み後は events を順に見せる（取り込み演出は合計10秒以内。各出来事は1枚のカードで、タップで次へ、「まとめて見る」で一覧）。

### 3.3 修行（修行枠）
3つの枠。来訪済みの体から選ぶ（主相棒は外せない）。割り当ての見本3つ＋10%きざみの調整。各体の位・次の位までの棒・相性（こどもモードは kidsLabel）・今日相性が合ったか。区間が取れない経路では時間帯の相性に「この{端末|たんまつ}では{判定|はんてい}できません」。

### 3.4 忍術の間
巻物を開くと Canvas 全画面で3秒の演出（SA.FX.play）。「とばす」ボタン。巻物を何本も開くときは枠の体を順に回す。「ひみつの術」の体は名前を伏せ（こどもモード）、共通のきらきら。

### 3.5 出来事のカード
来訪（びっくり→うれしい、あいさつ、図鑑が開く、「修行枠に入れる？」）、位が上がった（新しい位の名、免許皆伝は背景が変わる）、奥義、宿場に着いた（宿場名・ふりがな・小話・差し色、旅の日記のスタンプを選ぶ）、吉原のアトザ、刃の影・名乗り、目標に届いた、今日はここまで、修行お休み、染め色が使えるようになった、かくれる探しが始まった。

### 3.6 忍びの道
様式化した地図（実の地図ではない。線と宿場の点、クランの色の区間と街道色の区間）。いまの位置、次の宿場まで、着いた宿場は押すと小話。画面の注記「{距離|きょり}は{直線|ちょくせん}の{目安|めやす}です」。旅の日記（着いた日とスタンプの一覧）。二巡目は帰り道として逆にたどる。

### 3.7 図鑑
39体の格子（来訪前は「？」の影、番号だけ）。詳細: 名前（ふりがな）、クラン、忍術（ひみつの術の扱い）、武器（中忍以上で表示。孫市の銃は SHOW_GUN）、誕生日、公式紹介文（こどもモードの令は KIDS_BIO）、図鑑文、6欄（タブで切り替え）と4面（まえ・ななめ・よこ・うしろ）、公式イラスト（img/art/<id>.jpg、「公式イラスト」と明記）、位・修行値・絆・相性・聞いた一言。

### 3.8 里（隠れ里と家族の掲示板）
- 隠れ里: 14万歩（最初の8体がそろう）までは「まだ{静|しず}か」。そのあと、候補3体が「かくれる」で隠れている絵。隠れ里の累計 5,000歩ごとに「探す」1回。見つけた体は次の来訪で来る。
- 家族の掲示板: 最大5枚の札。「見せる」（相棒を選んで QR を大きく出す）、「読む」（カメラ、または画像ファイル）。14日読み直していない札は「かくれる」。読み取った相棒は7日「里の客」。チャット・文字の送受信はない。
- 市の染め（日曜だけ）: 相棒と色を選ぶ（日曜1回）。

### 3.9 ふりかえり
一日（その日の歩数・修行値・相性・巻物・来訪・宿場。就寝前に見る想定）、週（月曜の朝に先週分が出る。7日の棒と「目標に届いた日」の数。連続日数は出さない）。

### 3.10 メニューと保護者設定
メニュー: ふりかえり、遊び方、おうちの方へ（読むだけなら関門なし。外部リンクは関門の奥）、保護者設定（関門）、ふりがな（あり/なし）、音（あり/なし）、このアプリについて（非公式表記・クレジット・ライセンス）。
**関門**: 設定ボタンの3秒長押し → 「ふりがななしの漢字の指示文」（例: 「三、七、一の順に押してください」）を読んで数字のボタンを押す。問題は毎回変わる。3回まちがえたら1分待つ。
**保護者設定**: 目標歩数（3,000〜12,000、500きざみ）、おとな・こどもの切り替え、通知の時間帯と停止（アプリだけ）、我が家ボタンの表示、「家族で歩いた日」ボタンの表示、歩数の許可の取り消し方（説明）、書き出し・読み込み、「ひみつの術」の名の閲覧（おとなモードだけ。こどもモードでも保護者が見る用に名前を一時表示）、外部リンク（なし。将来の公式サイト用の枠だけ）、診断ファイル、はじめから（確認2回）。

### 3.11 ながめるモード（歩数を数えられない端末・ブラウザで WEB_TRIAL=false）
図鑑と忍びの道の閲覧と「書き出しファイルを開く」の3つだけ。図鑑は全体を「？」の影で見せ、書き出しファイルを開いたらその記録の様子を見せる（読むだけ）。

### 3.12 ためし歩き（ブラウザの試遊だけ）
画面の下から出る引き出し「ためし{歩|ある}き（{試遊版|しゆうばん}だけ）」: +500/+1,000/+3,000/+10,000 歩（時間帯を 朝・昼・夕・夜・深夜 から選ぶ、歩き方 続けて／こまめに）、「次の日へ」「7日すすめる」「歩いている（テスト）」スイッチ、「はじめから」。押すとすぐ取り込みが走る。アプリでは出さない。

## 4. アプリ化（app/。アプリ担当）
- Capacitor 8 系。`app/package.json`、`app/capacitor.config.json`（appId `io.github.tamehiro3.shinobiashi`、appName「忍び足」、webDir `www`）、`app/scripts/copy-web.mjs`（shinobi-ashi の中身を www に写す。sw.js・tools・docs・app は除く）。
- 依存: @capacitor/core, cli, android, ios, preferences, filesystem, share, local-notifications、@capgo/capacitor-pedometer（iOS の歩数。ライセンスは MPL-2.0 であることを README に書く）。
- Android 自作プラグイン `ShinobiSteps`（Java）: `isAvailable()`, `checkPermission()/requestPermission()`（ACTIVITY_RECOGNITION）, `subscribe()`（Recording API の購読）, `readHourly({start,end})`（(b): 1時間ごとの歩数）, `readCounter()`（(c): TYPE_STEP_COUNTER の現在値・BOOT_COUNT・elapsedRealtime）, `walkingNow({ms})`（TYPE_STEP_DETECTOR のイベント数）。API 名は play-services-fitness の AAR（maven.google.com）を javap で確かめ、可能なら javac で型検査する。
- AndroidManifest: ACTIVITY_RECOGNITION、INTERNET 権限を外す（`tools:node="remove"`、[確認18]）、`android:dataExtractionRules` と `android:fullBackupContent` で進行データを除外（Preferences だけ残す）。
- iOS: Info.plist に NSMotionUsageDescription、TARGETED_DEVICE_FAMILY=1（iPhone のみ）、外部通信なし。
- `app/README.md`: Windows（Android Studio）と Mac（Xcode）での組み立て手順、実機での確かめ方（7日・10日の境界、再起動、機内モード）。
- この環境では Android SDK と Xcode が使えないので、APK/IPA は作らない。作れない理由を README に書く。

## 5. テストと合格の条件
- `node shinobi-ashi/tools/test_rules.mjs` がすべて合格（冪等・上限・不採用・深夜・相性の全 type・位の境界・来訪の順と主相棒の除外・刃の影と名乗り・宿場と二巡目・巻物・我が家の付け替え・かくれる探し・掲示板の置き換えと14日・染め（日曜1回）・祝日（2026年の祝日一覧）・満月・二十四節気・7日の保持・修行お休み・validate/migrate）。
- `node shinobi-ashi/tools/e2e.mjs`（Playwright, 390×844 と 360×640）: 初回3分→ためし歩きで歩数→来訪・位・宿場・巻物→図鑑→道→掲示板（自分の QR を画像で読み直す）→保護者設定（関門）→書き出し→読み込み→ふりかえり、でコンソールエラー0、**外部へのリクエスト0**（ページ外のホストへの要求を数える）。
- 画面の文字にふりがなの抜け（`{` `|` の残り、ルビのない漢字の多い文）がないこと（e2e でざっと数える）。

## 6. 設計図との差（組み直しで決めたこと）
- 来訪は「主相棒を除いた38体が、2万×12・3万×13・4万×13 の38回で来る。刃はいつも38回目（115万歩）に『なぞの影』として来て、120万歩で名乗る」。設計図の「38体の来訪完了（115万）と刃（120万）」を、39体で矛盾なく満たす形にした。
- 修行の相性39件の表は失われたため、記録に残っていた条件（猫又の夜20〜23時、伊賀共通の夜18〜23時、甲賀共通の朝5〜9時、柴の朝7時まで、金鬼の「中忍以上の相棒と同じ日」、ネムとおえんの我が家、時間帯の体）を残して作り直した（data.js）。倍率1.2は仮。
- 進行データの保存は SQLite ではなく、`Directory.LibraryNoCloud` の JSON 1ファイルにした（iCloud バックアップ除外をネイティブのコードなしで満たせ、依存が少ないため）。
- 宿場50の名前（東海道19宿・二巡目の宿・伊勢と大和の道）は data.js で決めた。小話は content.js。
- 区間は1時間ごと（iOS は1時間ごとに問い合わせる）。毎分200歩の判定は、区間の平均で見る。
