# 忍び足 — アプリ化（Capacitor 8）

ブラウザ版の `shinobi-ashi/`（ビルドなしの素の HTML/CSS/JS）を、そのまま iPhone と Android のアプリに包むための土台です。
CryptoNinja（CC0・Ninja DAO）のキャラクターを使った個人制作の非公式ファンゲームです。

- appId: `io.github.tamehiro3.shinobiashi`　appName: 忍び足　webDir: `www`
- 外への通信はしない。広告・解析・課金・ログインなし。サーバーからの通知（プッシュ）も使わない。
- アプリでは Service Worker を使わない（`sw.js` は www に写さない）。

## フォルダ

```
app/
  package.json            依存（版は固定）。npm scripts: copy-web / sync / sync:android / sync:ios / open:android / open:ios / test
  capacitor.config.json   appId・appName・webDir。android.includePlugins で Android には歩数計プラグインを入れない
  scripts/copy-web.mjs    shinobi-ashi の中身を www/ に写す（下の「copy-web がすること」）
  scripts/test-platform.mjs  steps.js / store.js / notify.js の Node テスト（Capacitor は作り物に差し替え）
  scripts/make-icons.mjs  shinobi-ashi/icons/ の絵から、Android と iPhone のアイコン・スプラッシュを作って入れる
  android/                Android Studio のプロジェクト（npx cap add android で作り、手を入れたもの）
  ios/                    Xcode のプロジェクト（npx cap add ios で作り、手を入れたもの。SwiftPM なので CocoaPods は要らない）
  www/                    写し（git に入れない。copy-web で毎回作り直す）
  node_modules/           git に入れない
```

### copy-web がすること

1. `shinobi-ashi/` の `index.html`・`about.html`・`manifest.webmanifest`・`*.js`（`sw.js` を除く）・`*.css`・`img/`・`icons/`・`vendor/` を `www/` に写す。`tools/`・`docs/`・`app/`・README は写さない。
2. `node_modules/@capacitor/core/dist/capacitor.js` を `www/capacitor.js` に写し、www の HTML の最初の `<script>` の前に `<script src="capacitor.js"></script>` を入れる。
   （ビルドなしの素の JS では `import { registerPlugin } from '@capacitor/core'` が使えないため。`store.js` の `SA.Cap.plugin(name)` がこれを使う）
3. www の HTML に Content-Security-Policy の meta を入れる（`connect-src 'self'` など。同じ場所のファイルだけを読み、外へは通信できない）。
   調べもので外したいときは `node scripts/copy-web.mjs --no-csp`。
ブラウザ版のファイルは変えない。

## アプリの中での部品

| 部品 | iPhone | Android |
|---|---|---|
| 歩数 `steps.js` | `@capgo/capacitor-pedometer`（CMPedometer）。`getMeasurement({start,end})` を1時間ずつ呼ぶ。過去7日まで | 自作プラグイン `ShinobiSteps`。(b) Recording API（購読から10日・1時間ごと）→だめなら (c) 歩数センサーの前景差分 |
| 歩行中判定 | `startMeasurementUpdates` の `currentCadence` が 1.2歩/秒以上。3秒のうちに通知が来なければ、直前10秒の `getMeasurement` の歩数÷10秒 | `TYPE_STEP_DETECTOR` のイベントが3秒で4回以上 |
| 保存 `store.js` | `@capacitor/filesystem` の `Directory.LibraryNoCloud`（Library/NoCloud。iCloud バックアップの対象外）に `progress.json` | 同じ（アプリの `files/`。バックアップの規則で除外） |
| 設定 | `@capacitor/preferences` | 同じ（バックアップに残すのはこれだけ） |
| 通知 `notify.js` | `@capacitor/local-notifications`（端末の中だけ） | 同じ。正確なアラームの権限は使わない |
| 書き出しの共有 | `@capacitor/share`（share.js） | 同じ |
| 戻るボタン | （ない） | `MainActivity` が `SA.Cap.back()`（store.js）を呼ぶ。重ねた画面を閉じる → ホームへ戻す → どちらもなければアプリを閉じる |

### 戻るボタン（Android）

`@capacitor/app` を足さずに、`MainActivity` の `OnBackPressedCallback` から WebView の `SA.Cap.back()` を呼ぶ。
`SA.Cap.back()` は次の順に片づけ、片づけたら true を返す（false ならふつうの戻る＝アプリを閉じる）。

1. `document` に cancelable な `backbutton` イベントを流す。画面側が `preventDefault()` したら、それに任せる。
2. `SA.Cap.onBack(fn)` で登録した関数（あとから登録したものから）。true を返したら、それに任せる。
3. どちらもなければ画面の形から: 重ねた画面（`#layer .modal-back`）があれば、いちばん上の「とじる」（`[data-act=close]`）を押す。
   出来事のカード（閉じるボタンがない）は「つぎへ」（`[data-act=ev-next]`）を押す（最後のカードでは「とじる」なので、押し続ければ閉じる）。
   どちらもない画面は閉じずに戻るを食べるだけ（うっかり閉じないように）。
   重ねた画面がなく、ホーム（ながめるモードはいちばん左のタブ）以外にいればそこへ戻す。歩いているあいだは画面を動かさない。

ブラウザの「戻る」（history）は画面担当の扱い（modal を開くときに `history.pushState` を1つ積み、`popstate` で `SA.Cap.back()` か同じ片づけを呼ぶ）。
アプリの Android では WebView の history は使わない（戻るボタンは上の仕組みが先に受け取る）。

### 記録が読めなかったとき（store.js）

`progress.json`（ブラウザは `shinobi-ashi:v1`）の JSON が壊れていて（途中で切れているなど）、控え（ブラウザは `:bak`、アプリは `progress.tmp.json`）も読めないとき、
`SA.Store.load()` は null ではなく `{ corrupt: true, app: 'shinobi-ashi:corrupt' }` を返す（`SA.Store.isCorrupt(x)` で見分けられる）。
画面はこれを見て「記録が読めませんでした」（書き出しファイルから戻す）へ進む。はじめての画面に進んで黙って上書きすることはない。
壊れた中身は、読み込んだときに `shinobi-ashi:v1:broken`（アプリは `progress.broken.json`）へ1つだけ写して残す（`SA.Store.brokenText()` で読める）。
`SA.Store.loadBackup()` は控えだけを読む（本体が検査を通らないときに画面が使う）。

### Android の自作プラグイン `ShinobiSteps`

`android/app/src/main/java/io/github/tamehiro3/shinobiashi/ShinobiStepsPlugin.java`（`MainActivity` で `registerPlugin`）。

| メソッド | 返すもの |
|---|---|
| `isAvailable()` | `{ recording, counter, detector, sdk }`（recording＝Google Play 開発者サービスが `LocalRecordingClient.LOCAL_RECORDING_CLIENT_MIN_VERSION_CODE` 以上） |
| `checkPermission()` / `requestPermission()` | `{ activity: 'granted'|'denied'|'prompt' }`（ACTIVITY_RECOGNITION） |
| `subscribe()` | Recording API の購読（`TYPE_STEP_COUNT_DELTA`）。何度呼んでもよい |
| `readHourly({ start, end })` | `{ buckets: [{ start, end, steps }] }`（ミリ秒。1時間ごと。最大10日分） |
| `readCounter()` | `{ steps, bootCount, elapsedRealtime, timestamp, installId }`（TYPE_STEP_COUNTER の現在値。installId は `getNoBackupFilesDir()` に置いた印） |
| `walkingNow({ ms })` | `{ events, available }`（TYPE_STEP_DETECTOR のイベント数） |

(c) の基準値は Preferences の `steps.c`。次のときは差分を捨てて基準を取り直す: 基準がない／`BOOT_COUNT` が変わった（再起動）／値が小さくなった／`installId` が変わった（入れ直し・バックアップからの復元。印はバックアップに入らない場所にあるので、戻すと変わる）／前回の読み取りが (c) でなかった。

### Android の設定で変えたところ

- `variables.gradle`: `minSdkVersion = 29`（Recording API on mobile と、実行時の許可としての ACTIVITY_RECOGNITION が Android 10 から）、`playServicesFitnessVersion = '21.2.0'`
- `app/build.gradle`: `com.google.android.gms:play-services-fitness`
- `AndroidManifest.xml`: `ACTIVITY_RECOGNITION` を足す。`INTERNET`・`ACCESS_NETWORK_STATE`・`SCHEDULE_EXACT_ALARM`・`AD_ID` を `tools:node="remove"` で外す。`android:dataExtractionRules="@xml/data_extraction_rules"`・`android:fullBackupContent="@xml/backup_rules"`（どちらも `CapacitorStorage.xml`＝Preferences だけを入れる。progress.json は入れない）。`usesCleartextTraffic="false"`
- `AndroidManifest.xml`: 家族の掲示板で QR をカメラで読むため `android.permission.CAMERA` と `<uses-feature android:name="android.hardware.camera" android:required="false"/>`（カメラのない端末にも入れられる。許可は WebView の getUserMedia のときに Capacitor が聞く）
- `res/xml/file_paths.xml`: 共有シートに渡せる場所を cache と `files/exports/` だけにした
- `capacitor.config.json` の `android.includePlugins` で、Android には `@capgo/capacitor-pedometer` を入れない（Android の歩数は自作プラグイン）
- `AndroidManifest.xml`: `MainActivity` に `android:screenOrientation="portrait"`（縦だけ。画面は縦長のスマホ前提。Android 16 からは幅 600dp 以上の端末ではこの指定が無視される）
- `MainActivity.java`: 戻るボタン（上の「戻るボタン（Android）」）
- アイコンとスプラッシュ: `scripts/make-icons.mjs` で `shinobi-ashi/icons/` の絵に差し替えた（`mipmap-*/ic_launcher*.png`・`mipmap-anydpi-v26/ic_launcher*.xml`・`drawable*/splash.png`。Capacitor の既定のロゴ `drawable-v24/ic_launcher_foreground.xml` は消した）

### iOS の設定で変えたところ

- `ios/App/App/Info.plist`: `NSMotionUsageDescription` = 「毎日歩く習慣づくりのために、iPhone が数えた歩数を相棒の修行に使います。歩数はインターネットには送りません」、`CFBundleDevelopmentRegion` = ja、`ITSAppUsesNonExemptEncryption` = false
- `ios/App/App/Info.plist`: `NSCameraUsageDescription` = 「家族の相棒の QR コードを読むためにカメラを使います。映像は保存も送信もしません」（ないままカメラを使うとアプリが落ちる）
- `ios/App/App/Info.plist`: `UISupportedInterfaceOrientations` は `UIInterfaceOrientationPortrait` だけ（縦だけ。`~ipad` の項目は消した）
- `ios/App/App.xcodeproj/project.pbxproj`: `TARGETED_DEVICE_FAMILY = 1`（iPhone のみ。Debug と Release の両方）
- `ios/App/App/PrivacyInfo.xcprivacy`（プライバシーマニフェスト）を作り、App ターゲットの Copy Bundle Resources に入れた。中身は
  `NSPrivacyTracking` = false、`NSPrivacyTrackingDomains` と `NSPrivacyCollectedDataTypes` は空、`NSPrivacyAccessedAPITypes` に
  `NSPrivacyAccessedAPICategoryUserDefaults`（理由 `CA92.1`。@capacitor/preferences）と `NSPrivacyAccessedAPICategoryFileTimestamp`（理由 `C617.1`。@capacitor/filesystem）。
  Capacitor 本体はマニフェストを持っているが、Preferences・Filesystem・LocalNotifications・pedometer は持っていないので、アプリ側に要る（ないと App Store Connect への提出で ITMS-91053 になる）
- アイコンとスプラッシュ: `scripts/make-icons.mjs` で差し替えた（`Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`（1024×1024・透明なし）と `Splash.imageset/splash-2732x2732*.png`）

`npx cap add ios` をやり直したときは、上のものをもう一度入れる。Xcode で入れるなら:
1. App ターゲット → Info → 「Privacy - Motion Usage Description」と「Privacy - Camera Usage Description」を足して上の文言
2. App ターゲット → General → Supported Destinations で iPad と Mac を消して iPhone だけ（Build Settings の Targeted Device Family が `1`）
3. App ターゲット → General → Deployment Info の Device Orientation で Portrait だけにチェック
4. git にある `PrivacyInfo.xcprivacy` を `ios/App/App/` に戻し、Xcode の左の一覧の App フォルダへドラッグして「Add to targets: App」にチェック（Build Phases → Copy Bundle Resources に入ったことを確かめる）
5. `node scripts/make-icons.mjs`（下の「アイコンとスプラッシュ」）

## 組み立て

どちらも、まずリポジトリの `shinobi-ashi/app/` で:

```sh
npm install            # Node 22 以上（Capacitor 8 の条件）
npm run copy-web       # www/ を作る
npx cap sync           # www と プラグインを android/ ios/ に反映
```

ブラウザ版のファイルを直したら、毎回 `npm run sync`（copy-web と cap sync）をやり直す。

### Windows（Android Studio）

1. 新しい Android Studio（JDK 21 同梱。Android Gradle Plugin 8.13 が動く版）を入れ、SDK Manager で Android SDK Platform 36 と Build-Tools を入れる。
2. `shinobi-ashi\app` で `npm install` → `npm run sync:android` → `npm run open:android`（または Android Studio で `shinobi-ashi\app\android` を開く）。
3. Gradle の同期が終わったら、実機を USB でつなぎ（開発者向けオプションで USB デバッグ）、Run ▶。
4. 配布用は Build → Generate Signed App Bundle / APK。鍵（.jks）は git に入れない。
5. アイコンとスプラッシュは `shinobi-ashi/icons/` の絵に差し替え済み（下の「アイコンとスプラッシュ」）。Android Studio で、ホーム画面のアイコンが月と足あとの絵になっているか確かめる（Capacitor のロゴが出たら、make-icons をやり直す）。

### Mac（Xcode）

1. Capacitor 8 が求める版の Xcode（公式ドキュメントの「Environment Setup」で確かめる）。対象は iOS 15 以降の iPhone。CocoaPods は要らない（Capacitor 8 は Swift Package Manager）。
2. `shinobi-ashi/app` で `npm install` → `npm run sync:ios` → `npm run open:ios`（`ios/App/App.xcodeproj` が開く）。
3. App ターゲット → Signing & Capabilities で自分の Team を選ぶ。Bundle Identifier は `io.github.tamehiro3.shinobiashi`。
4. 上の「iOS の設定で変えたところ」が入っているか確かめる（Info.plist の Motion / Camera Usage Description、iPhone のみ、縦だけ、Copy Bundle Resources に PrivacyInfo.xcprivacy）。
5. 実機をつないで Run ▶。初回は iPhone の 設定 → 一般 → VPN とデバイス管理 で開発元を信頼する。
6. 配布は Product → Archive → Distribute App（TestFlight）。その前に下の「配布の前に」を済ませる。

## アイコンとスプラッシュ

絵は絵担当の `shinobi-ashi/tools/build_icons.mjs` が `shinobi-ashi/icons/` に作る（`icon-1024.png`・`icon-foreground-1024.png`・`icon-background-1024.png`・`splash-2732.png`）。
アプリに入れるのは `scripts/make-icons.mjs`（いまの絵で作って入れてある）。絵を変えたら:

```sh
cd shinobi-ashi/app
npm install --no-save sharp@0.34.4   # 画像を縮めるだけに使う（package.json には入れない）
node scripts/make-icons.mjs
```

| 元の絵 | 入る先 |
|---|---|
| `icons/icon-1024.png` | iOS `Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`（1024×1024、透明なし）、Android `mipmap-*/ic_launcher.png`（48dp）・`ic_launcher_round.png`（丸く切る） |
| `icons/icon-foreground-1024.png` | Android `mipmap-*/ic_launcher_foreground.png`（108dp。前景は絵の側で中央 66% に収めてある） |
| `icons/icon-background-1024.png` | Android `mipmap-*/ic_launcher_background.png`（108dp） |
| `icons/splash-2732.png` | Android `drawable*/splash.png`（縦・横の各密度、中央で切る）、iOS `Splash.imageset/splash-2732x2732*.png` |

`npx @capacitor/assets generate` でも作れるが、あの道具はアダプティブアイコンに 16.7% の inset を足すので前景が小さくなり、
`AndroidManifest.xml` の書式も書き直す。使ったときは `mipmap-anydpi-v26/ic_launcher*.xml` を make-icons の形（inset なし）に戻す。

## 配布の前に（ストアで本人が入力するもの）

このアプリは「データを集めない・送らない」ので、申告はどれも「なし」になる。入力はストアの管理画面で本人が行う。

**Google Play Console**
- データ セーフティ: 「アプリはユーザーデータを収集または共有しますか」→ いいえ（歩数・身体活動は端末の中だけで使い、送らない。INTERNET 権限もない）。暗号化・削除の依頼の項目は「収集しない」ので対象外
- ターゲット ユーザーとコンテンツ: 対象年齢にこどもを含めるなら「ファミリー向けポリシー」に沿うことの宣言（広告なし・広告 ID なし・位置情報なし・アカウントなし）。対象年齢の選び方は本人が決める
- 身体活動の権限（`ACTIVITY_RECOGNITION`）の使い道: 「毎日の歩数を相棒の修行（ゲームの進み）に使います。歩数は端末の外に送りません」
- カメラの権限（`CAMERA`）の使い道: 「家族が見せる QR コードを読むときだけ使います。映像は保存も送信もしません」
- コンテンツのレーティング（IARC）の質問票: 暴力の表現なし（忍術は光と煙の演出だけ。孫市の銃は `CONFIG.SHOW_GUN` が false なので出ない）、ユーザー間のやりとりなし、課金なし、位置情報の共有なし
- 広告: 「広告を含まない」
- アプリ名とアイコンに CryptoNinja の語を入れない。説明文に「CryptoNinja（CC0・Ninja DAO）のキャラクターを使った個人制作の非公式ファンゲームです」

**App Store Connect**
- App のプライバシー（プライバシー表示）: 「データを収集していません」
- 年齢区分の質問票: 上の IARC と同じ答え（暴力の表現なし・ユーザー間のやりとりなし・課金なし）
- Kids カテゴリに入れるか: 入れると「保護者の関門」や外部リンクの決まりがさらに厳しくなる。入れるかは本人が決める（このアプリは外部リンクなし・関門ありなので、どちらでも合う作り）
- 輸出コンプライアンス: `ITSAppUsesNonExemptEncryption` = false（独自の暗号を使わない）
- プライバシーポリシーの URL は両方のストアで必須。中身は「おうちの方へ」と同じ（集めない・送らない）。置き場所は本人が決める

## 実機での確かめ方

| 確かめること | やり方 | 期待 |
|---|---|---|
| 通信ゼロ | 機内モード（Wi-Fi も切る）で起動〜取り込み〜図鑑〜書き出しまで通す。Android は `adb shell dumpsys package io.github.tamehiro3.shinobiashi \| grep permission` で INTERNET がないこと | どこも止まらない。INTERNET 権限がない |
| 画面が出る | INTERNET を外しても WebView が `https://localhost` の中身を出せるか（Capacitor はアプリ内のファイルを横取りして返すので通るはず） | 白い画面にならない。白ければ最初に疑う所 |
| 歩数の許可 | 初回の説明画面 →「許可」 | iPhone は「モーションとフィットネス」、Android は「身体活動」の許可が出る |
| iPhone 7日の境界 | 8日以上アプリを開かずに歩いてから開く（日付を変えて試すなら、設定→一般→日付と時刻） | 7日前までの分だけ入り、それより前は「修行お休み」の知らせ |
| Android (b) 10日の境界 | 購読から11日以上たった端末で、10日以上開かずに歩いてから開く | 10日前までの分だけ入る。購読前の日は 0 |
| Android (c) | Recording API が使えない端末（Google Play 開発者サービスがない／古い）で、開く→歩く→開く | 2回目に差分が「今日」に入る。区間がないので時間帯の相性は「この端末では判定できません」 |
| 再起動 | (c) の端末で 開く→歩く→再起動→開く | 再起動の前に歩いた分（前回開いてから再起動まで）は入らない。今日の分は減らない。二重に入らない |
| バックアップから戻す | Android で「Google にバックアップ」→ 入れ直して復元 | 進行データは戻らず「はじめて」から。設定（おとな/こども・目標など）だけ戻る。(c) の基準は取り直す |
| iCloud | iPhone の 設定 → Apple ID → iCloud → ストレージを管理 → バックアップ | 忍び足の進行データが入っていない（Library/NoCloud。`@capacitor/filesystem` の `notSyncedLibrary`） |
| 歩行中 | 歩きながら起動。iPhone は「3秒で判定できたか」を10回ほど試して数える（CMPedometer の最初の通知は歩き始めて数秒後に来ることが多いので、3秒のうちに通知が来なかったときは直前10秒の歩数÷10秒で決めている） | 3秒の判定のあと、全部のボタンが押せず「止まってから見てね」。iPhone で歩いているのに押せてしまうことが多ければ、判定の時間を iOS だけ延ばす（ルール担当の `CONFIG` に足す） |
| 戻るボタン（Android） | 図鑑の詳しい画面・出来事のカード・保護者設定を開いて戻るボタン。ホーム以外のタブで戻る。ホームで戻る | 重ねた画面だけが閉じる（出来事のカードは1枚ずつ「つぎへ」、最後の1枚で閉じる）。ホーム以外のタブならホームへ。ホームならアプリが閉じる |
| 縦だけ | 端末を横にする | 画面が回らない（縦のまま） |
| アイコン | ホーム画面・アプリの切り替え画面・設定のアプリ一覧 | 月と足あとと巻物の絵。Capacitor のロゴが出ない |
| 通知 | 18:30 の通知・最後の同期から6日目 18:00・月曜 7:30。21〜7時に時刻を置いても出ない。保護者設定で止めると全部消える | Android 12 以降でも「アラームとリマインダー」の設定画面は出ない（`isExactNotification: false`） |

## この環境で作れなかったもの

- **APK / AAB**: Android SDK と Android Gradle Plugin・androidx・Google Play 開発者サービスのライブラリは `dl.google.com`（`maven.google.com` の転送先）からしか取れず、この環境ではそこへの通信が止められているため、Gradle の組み立てができない。
- **IPA**: Xcode は macOS にしかないため。`ios/` のプロジェクトは `npx cap add ios` で作れた（Capacitor 8 は SwiftPM なので CocoaPods なしで生成できる）が、組み立てと署名は Mac で行う。
- **play-services-fitness の API 名の照合**: AAR を `maven.google.com` から取れなかったため、`javap` での確認はできていない。`ShinobiStepsPlugin.java` は次のように型検査した:
  - Android の API（SensorManager・Settings.Global.BOOT_COUNT・getNoBackupFilesDir など）: Maven Central の `org.robolectric:android-all:16-robolectric-13921718` で javac が通った
  - Capacitor の型: `node_modules/@capacitor/android` の本物のソース（JSObject・JSArray・PermissionState・注釈）と、Plugin・PluginCall・BridgeActivity の署名を写した stub で javac が通った
  - Google Play 開発者サービス: 公開されている使い方（Recording API on mobile のガイド）に合わせて書いた stub での確認だけ。**Android Studio で最初に組み立てるときに、次の名前と型がずれていないかを見る**（`ShinobiStepsPlugin.java` の `recordingAvailable` / `subscribe` / `readHourly` / `toBuckets`）:
    - `GoogleApiAvailabilityLight.getInstance().isGooglePlayServicesAvailable(Context, int)` と `ConnectionResult.SUCCESS`
    - `LocalRecordingClient.LOCAL_RECORDING_CLIENT_MIN_VERSION_CODE`
    - `FitnessLocal.getLocalRecordingClient(Context)` → `LocalRecordingClient`
    - `LocalRecordingClient.subscribe(LocalDataType.TYPE_STEP_COUNT_DELTA)` → `Task<Void>`
    - `new LocalDataReadRequest.Builder().aggregate(LocalDataType.TYPE_STEP_COUNT_DELTA).bucketByTime(1, TimeUnit.HOURS).setTimeRange(start, end, TimeUnit.SECONDS).build()`
    - `LocalRecordingClient.readData(LocalDataReadRequest)` → `Task<LocalDataReadResponse>`、`LocalDataReadResponse.getBuckets()` → `List<LocalBucket>`
    - `LocalBucket.getDataSets()` → `List<LocalDataSet>`、`LocalBucket.getStartTime(TimeUnit)` / `getEndTime(TimeUnit)` → `long`（**引数に TimeUnit を取るか**）
    - `LocalDataSet.getDataPoints()` → `List<LocalDataPoint>`
    - `LocalDataPoint.getValue(LocalField.FIELD_STEPS).asInt()`（**`LocalValue` に `asInt()` があるか**）
  - **ここでコンパイルが止まったときの逃げ道**: `ShinobiStepsPlugin.java` で、(b) の3つを一時的に「使えない」にすれば、(c)（歩数センサーの前景差分）で遊べる。
    1. `recordingAvailable()` の中身を `return false;` だけにする
    2. `subscribe(PluginCall call)` と `readHourly(PluginCall call)` の中身を `call.reject("recording api unavailable", "UNAVAILABLE");` だけにする
    3. `toBuckets(...)` を消し、`com.google.android.gms.` で始まる import を消す（`app/build.gradle` の `play-services-fitness` の行も外してよい）

    `steps.js` は `isAvailable().recording` が false なら (c) を使う作りなので、JS 側は直さなくてよい。区間が取れないので、時間帯の相性は「この端末では判定できません」になる。
  - `MainActivity.java`（戻るボタン）: androidx.activity の `OnBackPressedCallback` / `getOnBackPressedDispatcher()` と Capacitor の `bridge.getWebView()` の署名を写した stub と、android-all（`WebView.evaluateJavascript`）で javac が通った
  - `play-services-fitness` の版は 21.2.0（Recording API on mobile が入った版）にしてある。新しい版があれば `variables.gradle` の `playServicesFitnessVersion` を上げてよい

## ライセンス

- `@capgo/capacitor-pedometer`（iPhone の歩数）: **MPL-2.0**（Mozilla Public License 2.0）。ファイル単位のコピーレフト。改変せずに使っているので、アプリ全体のライセンスには影響しない。配布するときは「このアプリは MPL-2.0 の @capgo/capacitor-pedometer を使っています。ソースは https://github.com/Cap-go/capacitor-pedometer 」とクレジット（このアプリについて）に書く。プラグインのファイルを直したときは、直したファイルを MPL-2.0 で公開する。
- Capacitor 本体と公式プラグイン（core・cli・android・ios・preferences・filesystem・share・local-notifications）: MIT。
- Google Play 開発者サービス（play-services-fitness）: Android SDK のライセンス。

## テスト

```sh
node shinobi-ashi/app/scripts/test-platform.mjs
```

ためし歩き（cont・bits・flat、次の日へ、7日すすめる、歩いている（テスト）、はじめから、7日の読み取り）、保存（localStorage・壊れたときの控え・控えもないときの corrupt の印と :broken の写し・容量いっぱい・メモリだけ・アプリの tmp→rename）、iPhone と Android (b)(c) の作り物での読み取り（7日・10日・再起動・値の減少・復元・同時読み取り）、iPhone の歩行中判定（通知が来ないときの直前10秒）、通知の予定（21〜7時・止める・6日目）、戻るボタン（重ねた画面・ホームへ・出来事のカードの「つぎへ」・閉じるボタンのない画面・歩行中・ながめるモード）、ためし歩きで10日すすめると「修行お休み」が出ることを確かめる。
