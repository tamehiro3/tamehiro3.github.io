# tamehiro3.github.io

「しのびのゲーム工房」— ゲームポータル(ルートサイト)。

## このリポジトリの役割

- **https://tamehiro3.github.io/ のトップページ**(公開中ゲームの紹介・ランディング)
- **ads.txt の正式な置き場所**(AdSenseはドメイン直下 `tamehiro3.github.io/ads.txt` しか読まないため、ここに置く)
- **プライバシーポリシー**(`privacy.html`・AdSense審査の必須要件)

## AdSense申請の手順(GitHub側は準備済み)

1. [Google AdSense](https://adsense.google.com/) でアカウント作成
2. 「サイトを追加」で `tamehiro3.github.io` を登録
3. 表示される審査コード(`<script async src="...adsbygoogle.js?client=ca-pub-XXXX"...>`)を
   `index.html` の `<head>` 内のコメント「▼▼ AdSense審査コードはこの下に貼り付ける ▼▼」の下に貼る
4. `ads.txt` の `pub-0000000000000000` を自分のIDに書き換えて行頭の `# ` を消す
5. `★サイトを公開する.bat` をダブルクリックして再公開 → AdSense管理画面で審査をリクエスト
6. 合格後、`ninja-game/ads.js` の `client` / `slot` にIDを入れてninja-gameも再公開

## 更新方法

ファイルを編集したら `★サイトを公開する.bat` をダブルクリック。
