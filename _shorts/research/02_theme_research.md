# 新テーマ調査（2026-09-26）

> 前提：採用済み（ep01学習オフ・ep04 AI講座・ep07役割・ep05プリント）と没テーマは除外。数値の多くはSNSから取得できず「不明」と記載。未確認情報は根拠に使っていない。


調査日は2026-09-26です。WebSearchを約60回かけました（日本語・英語、ニュース／公式ヘルプ／note／X・はてブの検索結果要約）。

**前提**
- X・TikTok・YouTube・Instagramの再生数やいいね数は、検索結果からはほとんど取れませんでした。取れなかったものは「不明」と書き、推測では埋めていません。
- 検索上位には、AIが書いたとみられるSEOブログが多く混ざっていました。「9月2日にAI音声ロマンス詐欺の57人を起訴」「社長の声を複製して45億円の被害」などは、報道や公的機関で裏が取れなかったので**未確認**扱いにし、候補の根拠には使っていません。
- 採用済み・没のテーマとは重複しないようにしました。重複に近いものは注記しています。

---

## 候補一覧（18件）

### 1. 「警察とビデオ通話」になったら、その時点で詐欺
- **冒頭の問いかけ案**：「警察からビデオ通話、来たらどうする？」
- **どこで話題か**
  - トレンドマイクロ「個人セキュリティ脅威動向レポート2026年上半期」（2026-08-20）を、マイナビニュースと毎日新聞（Yahoo!ニュース転載）が報道。
  - 同記事が引く警察庁の数字：2026年上半期のニセ警察詐欺は認知4,466件（前年同期比6.2%減）、被害額507億9,000万円（27.3%増）。
  - SNSでの数値は不明。
- **なぜ伸びそうか**：危険・防御、時事、家族に共有されやすい。
- **60秒の骨子**
  1. 警視庁を装う偽サイトに「ビデオ通話機能」が付いた（2026年6月末ごろから確認）。
  2. ディープフェイクで合成した「警察官・検事」が画面に出る事例もある。
  3. 警視庁は「うちはやりません」と注意喚起している（毎日新聞）。
  4. 対処：いったん切る → 自分で調べた警察署の番号にかけ直す → 家族に話す。
- **事実として言えること**
  - 手口と件数・被害額：https://news.mynavi.jp/techplus/article/20260820-4843551/
  - 元レポート：https://www.trendmicro.com/ja_jp/about/newsroom/press-releases/2026/pr-20260820-01.html
  - 警視庁のコメント：https://news.yahoo.co.jp/articles/133179fd38ef061bad9bea02479bf1a086b2dc41
  - 警察庁SOS47：https://www.npa.go.jp/bureau/safetylife/sos47/new-topics/
- **模式図で描けるか**：○（着信画面 → 偽の逮捕状画面 → ビデオ通話画面 → ×印）。
- **事実が変わるリスク**：低め。ただし件数は最新の警察庁発表で確認し直すこと。

### 2. AIチャットの「共有リンク」を今すぐ掃除
- **冒頭の問いかけ案**：「そのAIの会話、検索で丸見えかも？」
- **どこで話題か**
  - 2026年7月25日ごろ、Claudeの共有チャットとArtifactsがGoogle検索に表示されていた件。TechCrunch（2026-07-27）とAxios（同日）が報道。
  - 日本語でも解説記事が多数（GMO天秤AIなど）。
  - X上にトレンドページあり（件数は不明）。
- **なぜ伸びそうか**：危険・防御、最小努力（設定を1か所見るだけ）、時事。
- **60秒の骨子**
  1. 「共有」ボタンで作ったリンクは、リンクを知っている人なら誰でも見られる。
  2. 7月にはClaudeの共有会話が検索結果に出た。2025年にはGrokやChatGPTでも同じような騒ぎがあった。
  3. ChatGPTでは「設定 → データコントロール → 共有リンク → 管理」で一覧が出て、削除できる。
  4. 個人情報を含む会話は共有しない。
- **事実として言えること**
  - TechCrunch：https://techcrunch.com/2026/07/27/psa-your-claude-shared-chats-and-artifacts-may-have-ended-up-on-google/
  - Axios：https://www.axios.com/2026/07/27/anthropic-claude-public-chats-google-search
  - ChatGPT共有リンクFAQ（公式）：https://help.openai.com/ja-jp/articles/7925741-chatgpt-shared-links-faq
- **模式図で描けるか**：○（設定画面 → 共有リンク一覧 → ゴミ箱）。
- **事実が変わるリスク**：中（メニュー名が変わりやすい）。
- **注意**：採用済みの「データコントロール（学習オフ）」と同じ画面を使うので、続編として出すとつながりが良い。

### 3. ChatGPTに広告が出るようになった。どれが広告か見分けて消す
- **冒頭の問いかけ案**：「チャッピーの答えの下、それ広告やで？」
- **どこで話題か**
  - 日本では2026年6月22日から、無料版とGoプランで広告のテスト表示が開始。Impress Watch、ITmedia AI+が報道。
  - SNSでの数値は不明。
- **なぜ伸びそうか**：時事、損失回避（広告を答えだと思い込まない）、「知らなかった」系。
- **60秒の骨子**
  1. 対象は無料版とGoプラン（18歳以上）。Plus以上には出ない。
  2. 広告は回答の下に「スポンサー」付きのカードで出る。回答の中身には影響しない、と公式は説明している。
  3. 広告ごとのメニューで「非表示」「この広告について」が選べる。
  4. 設定で広告のパーソナライズをオフにしたり、広告データを削除したりできる。
- **事実として言えること**
  - 公式ヘルプ：https://help.openai.com/en/articles/20001047-ads-in-chatgpt
  - Impress Watch：https://www.watch.impress.co.jp/docs/news/2118443.html
  - ITmedia：https://www.itmedia.co.jp/aiplus/article/2606/19/2000000107/
  - 日本語UIでの設定項目名：**未確認**
- **模式図で描けるか**：○（回答の下にスポンサーカード →「…」メニュー）。
- **事実が変わるリスク**：中（テスト段階なので仕様が変わりやすい）。

### 4. 家族で「合言葉」を決める（AIの声マネ対策）
- **冒頭の問いかけ案**：「家族の声でお金貸して…本物？」
- **どこで話題か**
  - セコムの調査（20〜69歳の500人、2026年6月実施）を、ITmedia NEWS（2026-09-09）と産経（Yahoo!ニュース）が報道。
  - 結果：AIを悪用した犯罪が今後増えると思う人が約9割（プレスリリースでは91%）。家族でルールを「話し合っていない」人が約4人に3人。
- **なぜ伸びそうか**：感情（家族）、最小努力（今夜決められる）、危険・防御。
- **60秒の骨子**
  1. AIは数秒の声から本人そっくりの声を作れると言われている。
  2. セコムの研究員は「家族で本人確認用の合言葉を決めておくことも有効」と勧めている。
  3. 合言葉はSNSに載っていない言葉にする（ペットの名前や誕生日はNG）。
  4. 私用SNSは公開範囲を限定する。
- **事実として言えること**
  - https://www.itmedia.co.jp/news/article/2609/09/2000001303/
  - https://prtimes.jp/main/html/rd/p/000000112.000069357.html
  - 「数秒の声でクローンできる」は海外ブログの記述のみで、公的な出典は**未確認**。動画では「短い音声でも」程度にぼかすこと。
- **模式図で描けるか**：○（家族LINEグループで合言葉を決める画面）。
- **事実が変わるリスク**：低。
- **注意**：没になった「訪問販売をAI音声で練習」とは別の切り口（防御側）です。

### 5. 災害のとき「その写真、AIかも」
- **冒頭の問いかけ案**：「地震のあとの衝撃写真、すぐ拡散する？」
- **どこで話題か**
  - 令和8年熊本地震（2026年7月、最大震度7）のあと、NHKが報道：
    - 報道写真をAIで加工したとみられる被災者の偽画像が拡散。
    - 生成AIで作った偽動画や、偽の救助要請も。
  - はてなブックマークにもエントリーあり（ブクマ数は不明）。
  - piyologがまとめ記事を公開（2026-07-30）。
- **なぜ伸びそうか**：危険・防御、時事、社会的意義。
- **60秒の骨子**
  1. 災害直後は、AIで作った画像や過去の画像がよく拡散される。
  2. 見るポイントは「誰が最初に出したか」「報道機関や自治体の発表と合っているか」。
  3. 迷ったら拡散しない。
  4. 次の候補6のGeminiで確認する方法を補足に入れてもよい。
- **事実として言えること**
  - https://news.web.nhk/newsweb/na/nd-20260809de42999
  - https://news.web.nhk/newsweb/na/na-k10015189631000
  - https://piyolog.hatenadiary.jp/entry/2026/07/30/143946
- **模式図で描けるか**：○（SNSのタイムラインに偽画像 → チェックリスト）。
- **事実が変わるリスク**：低。
- **注意**：被災者本人を映さず、図解だけにすること。

### 6. 「この画像、AIで作った？」をGeminiに聞く
- **冒頭の問いかけ案**：「この写真AI？って聞ける機能あるで」
- **どこで話題か**
  - Geminiアプリの「SynthID」による検証機能。Googleの公式ヘルプと窓の杜が紹介。
  - SNSでの数値は不明。
- **なぜ伸びそうか**：実演、最小努力。
- **60秒の骨子**
  1. Geminiアプリに画像や動画を上げて「これはGoogle AIで生成されたもの？」と聞く。
  2. 目に見えない電子透かし（SynthID）を探して答えてくれる。
  3. 分かるのは**Google製AIの透かしだけ**。「出なかった＝本物」ではない。
- **事実として言えること**
  - Google公式ヘルプ：https://support.google.com/gemini/answer/16722517?hl=ja
  - 窓の杜：https://forest.watch.impress.co.jp/docs/news/2073112.html
  - 動画の上限（100MB・90秒）は二次情報のみなので、使うならヘルプで要確認。
- **模式図で描けるか**：○（チャット画面に画像 → 回答吹き出し）。
- **事実が変わるリスク**：中。

### 7. Xに上げた写真をGrokに改変させない
- **冒頭の問いかけ案**：「あなたの写真、Grokでいじられてない？」
- **どこで話題か**
  - 2026年1月、Grokの画像編集機能の悪用が問題になり、X日本法人が対策を公表（ITmedia 2026-01-20）。
  - 2026年3月、投稿画面に「Grokによる修正をブロック」が追加された（ITmedia NEWS、Social Media Today）。
  - X上にトレンドページあり（件数は不明）。
- **なぜ伸びそうか**：危険・防御、最小努力。
- **60秒の骨子**
  1. 画像を投稿するとき、詳細オプションにあるトグルでGrokの編集をブロックできる（当初はiOSのみ）。
  2. これで防げるのは「返信で@Grokに編集させる」経路だけ。保存やスクリーンショットまでは防げない。
  3. 投稿をGrokの学習に使わせない設定は「設定とプライバシー → プライバシーと安全 → データ共有とカスタマイズ → Grok」。
- **事実として言えること**
  - https://topics.smt.docomo.ne.jp/article/itmedia_news/trend/itmedia_news-20260309_075
  - https://www.socialmediatoday.com/news/x-formerly-twitter-adds-option-to-restrict-grok-image-variations/814140/
  - https://www.itmedia.co.jp/mobile/articles/2601/20/news075.html
  - 学習オフ設定（マイナビ）：https://news.mynavi.jp/article/20251024-3583847/
  - Android版・Web版の対応状況：**未確認**
- **模式図で描けるか**：○。
- **事実が変わるリスク**：高（Xは頻繁にUIを変える）。

### 8. インスタのAI合成機能が「3日で停止」。自分の公開設定を見直す
- **冒頭の問いかけ案**：「インスタの写真、勝手にAI素材に？」
- **どこで話題か**
  - Metaが2026年7月7日に、他人の公開投稿をAI合成に使える機能を**初期設定オン**で開始。批判を受けて7月10日に停止。日経、Impress Watch、ギズモードが報道。
  - Xで設定手順を投稿したユーザーあり（数値は不明）。
- **なぜ伸びそうか**：時事、危険・防御。
- **60秒の骨子**
  1. 7月に何が起きたか（初期設定がオンだった）。
  2. 機能は停止済み。
  3. 教訓：新機能は「初期設定がオン」のことがある。「設定 → 共有と再利用」を一度見ておく。
- **事実として言えること**
  - https://www.nikkei.com/article/DGXZQOGN111T80R10C26A7000000/
  - https://www.watch.impress.co.jp/docs/news/2124457.html
  - 「共有と再利用」のメニュー名は個人のX投稿が出典で、公式では**未確認**。
- **模式図で描けるか**：△（機能はもう無いので、見せられるのは教訓と設定画面だけ）。
- **事実が変わるリスク**：高。

### 9. 年末調整の疑問は国税庁のAI「ふたば」へ。チャッピーにマイナンバーは入れない
- **冒頭の問いかけ案**：「年末調整、チャッピーに聞いて大丈夫？」
- **どこで話題か**
  - 季節もの（10〜11月に書類が配られる）。
  - 国税庁は「年末調整がよくわかるページ（令和8年分）」を開設。
  - 今年は基礎控除の引上げなど変更点がある。
  - SNSでの数値は不明。
- **なぜ伸びそうか**：季節・時事、損失回避。
- **60秒の骨子**
  1. 令和8年分は基礎控除が58万円→62万円などに変わる。一般のAIは最新の改正を知らないことがある。
  2. 国税庁の税務相談チャットボット「ふたば」は年末調整の質問にも対応している。
  3. 書類の写真をAIに上げるときは、マイナンバーや保険証券の番号を隠す。
- **事実として言えること**
  - 国税庁 基礎控除の改正：https://www.nta.go.jp/users/gensen/2026kiso/index.htm
  - 国税庁パンフレット：https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/102.pdf
  - ふたば：https://www.nta.go.jp/taxes/shiraberu/chatbot/index.htm
  - 令和8年分の年末調整にふたばがいつから対応するか：**未確認**。公開時に国税庁のページで確認すること。
- **模式図で描けるか**：○。
- **事実が変わるリスク**：中（税額の説明は断定しないこと）。

### 10. 2027年（未年）の年賀状をAIで作るときの著作権の一線
- **冒頭の問いかけ案**：「年賀状のイラスト、AIで作ってOK？」
- **どこで話題か**
  - 季節もの（11月以降）。
  - ChatGPT Images 2.5が2026年9月に無料プランを含めて提供開始（OpenAI公式）。
  - 年賀状×AIの記事は多いが、SNSでの数値は不明。
- **なぜ伸びそうか**：季節、実演、損失回避。
- **60秒の骨子**
  1. 羊のイラストはAIで作れる。
  2. 有名キャラクターの名前や作品名をプロンプトに入れない。似すぎた画像は私的利用でも配るとリスクがある。
  3. 公募やコンテストには「AI作品は不可」のものもある。
- **事実として言えること**
  - Images 2.5：https://openai.com/index/introducing-chatgpt-images-2-5/
  - 著作権の考え方（文化庁の見解を解説した記事）：https://www.legalontech.com/jp/media/copyright-of-generative-ai
  - 文化庁の原文は今回直接確認していない（**未確認**）。
- **模式図で描けるか**：○。
- **事実が変わるリスク**：低。

### 11. 偽のChatGPTアプリ（高額サブスク）に注意
- **冒頭の問いかけ案**：「そのチャッピーアプリ、本物？」
- **どこで話題か**：解説記事は多いが、2026年7〜9月の報道は見つからなかった。数値は不明。
- **なぜ伸びそうか**：危険・防御、最小努力。
- **60秒の骨子**
  1. ストアで開発元が「OpenAI」になっているか確認する。
  2. 無料体験から高額の週額課金になる類似アプリがある。
  3. 契約中のサブスクをストアの画面で確認する。
- **事実として言えること**：一次情報は**未確認**。解説記事の例：https://aismiley.co.jp/ai_news/chatgpt-real-fake-point/
- **模式図で描けるか**：○。
- **事実が変わるリスク**：低。ただし時事性が弱い。

### 12. スマホが詐欺メッセージを自動で警告（Pixel／Galaxy）
- **冒頭の問いかけ案**：「スマホが『詐欺かも』って教えてくれる」
- **どこで話題か**
  - 2026年9月15日のPixel Dropで、チャット通知の詐欺検知が日本と日本語に対応（Google公式ブログ、Neowin、Android Authority）。
  - 通話の詐欺検知は2026年3月に日本で開始（ケータイ Watch）。
  - Galaxy S26シリーズにはAIの通話スクリーニングがある（Samsung公式）。
- **なぜ伸びそうか**：危険・防御、機種ユーザーに刺さる。
- **60秒の骨子**
  1. 通知の時点で「詐欺の可能性」と赤い警告が出る。
  2. 警告が出たらリンクを開かない。
  3. 機能をオンにしておく（設定の場所は機種による）。
- **事実として言えること**
  - https://blog.google/intl/ja-jp/feed/september-2026-pixel-drop/
  - https://k-tai.watch.impress.co.jp/docs/news/2141355.html
  - https://www.samsung.com/jp/support/mobile-devices/how-to-use-the-call-screening-feature-with-ai-assistant-on-the-samsung-galaxy-s26-series/
- **模式図で描けるか**：○。
- **事実が変わるリスク**：中（機種依存なので視聴者が限られる）。

### 13. iPhoneの新しいSiri（Siri AI）は日本語が10月から。使える機種を確認
- **冒頭の問いかけ案**：「新しいSiri、あなたのiPhoneで使える？」
- **どこで話題か**
  - iOS 27が2026年9月15日（日本時間）に配信開始（Apple Newsroom）。
  - Siri AIの日本語対応は10月予定（マイナビニュース、AppBank）。
- **なぜ伸びそうか**：時事、損失回避（使えない機種で探し回らない）。
- **60秒の骨子**
  1. iOS 27でSiri AIが登場。最初は英語のみ。
  2. 日本語は10月予定。
  3. 使えるのはiPhone 15 Pro以降（二次情報）。
- **事実として言えること**
  - https://www.apple.com/jp/newsroom/2026/09/the-next-generation-of-apple-intelligence-is-available-today/
  - https://news.mynavi.jp/article/20260910-4945370/
  - 対応機種はApple公式で要確認（今回は**未確認**）。
- **模式図で描けるか**：○。
- **事実が変わるリスク**：高（10月に実際に配信されてから作るのが安全）。

### 14. 就活のES、AIが書いた会社情報は必ず裏取り
- **冒頭の問いかけ案**：「AIが書いた志望動機、ウソ混じってない？」
- **どこで話題か**
  - レバレジーズ（キャリアチケット）の28卒調査（2026-07-02、140人）：
    - 就活中に生成AIの「ハルシネーション」を経験した人は約6割（60.5%）。
    - 企業研究でAIを使う人のうち、毎回公式情報で確認している人は46.0%。
  - マイナビニュースが報道。
- **なぜ伸びそうか**：損失回避、学生層に刺さる。
- **60秒の骨子**
  1. AIは会社の数字や制度をもっともらしく間違えることがある。
  2. 数字・制度・社名は公式サイトやIR資料で確認する。
  3. AIには添削を頼み、中身の事実は自分で埋める。
- **事実として言えること**
  - https://leverages.jp/news/2026/0702/5997/
  - https://news.mynavi.jp/article/20260702-4654161/
- **模式図で描けるか**：○。
- **事実が変わるリスク**：低。
- **注意**：没の「嘘を減らす一文」とは、対象と行動（公式で裏取り）が違う。

### 15. 資料をGemini Notebookで「60秒動画」にする
- **冒頭の問いかけ案**：「分厚い資料、60秒の動画にできるで」
- **どこで話題か**
  - Gemini Notebook（旧NotebookLM）の動画解説「短め」（最大60秒の縦型）が日本語に対応。jetstream（2026-09-02、09-16）、Google公式ヘルプ。
  - Xで比較図解の投稿あり（数値は不明）。
- **なぜ伸びそうか**：実演、最小努力、意外性。
- **60秒の骨子**
  1. PDFなどを入れる → 動画解説 →「短め」を選ぶ。
  2. 見た目のスタイル（ホワイトボード、カワイイ等）を選べる。
  3. 焦点を当ててほしい点を指示できる。
- **事実として言えること**
  - https://support.google.com/gemininotebook/answer/16454555?hl=ja
  - https://jetstream.blog/2026/09/02/gemini-notebook-short-video-overviews-expansion/
  - 無料プランで使えるかどうか：**未確認**
- **模式図で描けるか**：○。
- **事実が変わるリスク**：中。

### 16. TikTokの「AI生成」ラベル。付けないといけない動画は？
- **冒頭の問いかけ案**：「AIで作った動画、ラベル付けてる？」
- **どこで話題か**：TikTok公式ニュースルームとヘルプ。2026年の運用強化は二次情報のみ。数値は不明。
- **なぜ伸びそうか**：損失回避（削除やラベルの強制付与）。発信者と視聴者の両方に関係する。
- **60秒の骨子**
  1. 実在の人や出来事をリアルに見せるAI動画にはラベルが必要。
  2. 明らかに非現実的なアニメ風表現などは対象外の扱い。
  3. 投稿画面の詳細設定でオンにする。
- **事実として言えること**
  - https://newsroom.tiktok.com/ja-jp/new-labels-for-disclosing-aigc-jp
  - 2026年の義務化の具体的な内容：**未確認**
- **模式図で描けるか**：○。
- **事実が変わるリスク**：中。
- **注意**：「ためひろ」さん自身がアニメ調キャラで出ているので、動画の中で自分の運用を見せると説得力がある。

### 17. ChatGPTのカスタムGPTは12月11日に終了
- **冒頭の問いかけ案**：「お気に入りのGPTs、12月で消えるで」
- **どこで話題か**：OpenAI公式FAQ。2026年9月11日にリリースノートで発表。note解説が多数（数値は不明）。
- **なぜ伸びそうか**：時事、損失回避。ただし初心者には少しマニア向け。
- **60秒の骨子**
  1. 2026年12月11日に終了予定。
  2. 後継は「プラグイン」。指示文は「スキル」に移行される。
  3. 自分で作ったものは作成者が移行作業をする必要がある。他人が作ったGPTは、作者が移行しない限り引き継がれない。
- **事実として言えること**：https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq
- **模式図で描けるか**：○。
- **事実が変わるリスク**：中。

### 18. レシートを写真1枚で家計簿に
- **冒頭の問いかけ案**：「レシートの山、写真1枚で片付く？」
- **どこで話題か**：東洋経済オンライン（2026年7月、講師たてばやし淳氏）、Yahoo!ニュース転載。数値は不明。
- **なぜ伸びそうか**：最小努力、実演。
- **60秒の骨子**：撮影 → 表にしてもらう → 合計は電卓で検算する。
- **事実として言えること**：https://toyokeizai.net/articles/-/951012
  - 無料プランでの画像アップロードの回数制限：**未確認**
- **模式図で描けるか**：○。
- **事実が変わるリスク**：低。
- **注意**：採用済みの「学校プリントを写真1枚で予定表に」と**画像入力という点で重複が強い**ので、優先度は低くしています。

**参考（候補外）**：Google AIモードの使い方、家電のエラー表示を写真で質問、ふるさと納税（AIとのつながりが弱い）、宿題とAI（夏休みが終わって旬が過ぎた）、ChatGPTの「信頼できる連絡先」（メンタルヘルスの話題で扱いが難しい）は見送りました。

---

## おすすめ上位5つ

1. **ニセ警察の「ビデオ通話」は詐欺確定（候補1）**
   - 8月20日の新しい手口で、被害額507億円・27%増という公的な数字があります。
   - 「警察官がビデオ通話してきたら詐欺」と一言で言い切れて、60秒に収まります。
   - 模式図で描きやすく、家族への共有で拡散も見込めます。
2. **AIの共有リンク掃除（候補2）**
   - 7月の報道は大手メディアで裏が取れています。
   - 設定を1か所見るだけで済み、採用済みのデータコントロール回の続きとして自然につながります。
3. **ChatGPTの広告の見分け方と消し方（候補3）**
   - 日本では6月に始まったばかりで、無料ユーザー全員に関係します。
   - 公式ヘルプで操作を確かめられ、「知らなかった」系のフックが強いです。
4. **災害のAI偽画像 ＋ Geminiで確認（候補5と6を1本に）**
   - 熊本地震のNHK報道という強い事実から入り、最後に実演で締められます。
   - 「確認できるのはGoogle製AIだけ」という限界も言えるので、誠実さも出せます。
5. **年末調整×国税庁「ふたば」（候補9）**
   - 10月の書類配布の時期に出せる季節ネタで、公的な出典だけで作れます。
   - 「AIに番号は入れない」という防御の要素も入れられます。
   - 公開前に、令和8年分への対応開始日を国税庁のページで確認してください。

次点は候補4（家族の合言葉）です。1位と続けて「詐欺シリーズ」にすると相性が良いです。

---

## 参照URL一覧
- https://news.mynavi.jp/techplus/article/20260820-4843551/
- https://www.trendmicro.com/ja_jp/about/newsroom/press-releases/2026/pr-20260820-01.html
- https://news.yahoo.co.jp/articles/133179fd38ef061bad9bea02479bf1a086b2dc41
- https://www.npa.go.jp/bureau/safetylife/sos47/new-topics/
- https://techcrunch.com/2026/07/27/psa-your-claude-shared-chats-and-artifacts-may-have-ended-up-on-google/
- https://www.axios.com/2026/07/27/anthropic-claude-public-chats-google-search
- https://help.openai.com/ja-jp/articles/7925741-chatgpt-shared-links-faq
- https://help.openai.com/en/articles/20001047-ads-in-chatgpt
- https://www.watch.impress.co.jp/docs/news/2118443.html
- https://www.itmedia.co.jp/aiplus/article/2606/19/2000000107/
- https://www.itmedia.co.jp/news/article/2609/09/2000001303/
- https://prtimes.jp/main/html/rd/p/000000112.000069357.html
- https://news.yahoo.co.jp/articles/6a9766e58a594f17de67277d519dbdaf1ec53c7d
- https://news.web.nhk/newsweb/na/nd-20260809de42999
- https://news.web.nhk/newsweb/na/na-k10015189631000
- https://piyolog.hatenadiary.jp/entry/2026/07/30/143946
- https://support.google.com/gemini/answer/16722517?hl=ja
- https://forest.watch.impress.co.jp/docs/news/2073112.html
- https://topics.smt.docomo.ne.jp/article/itmedia_news/trend/itmedia_news-20260309_075
- https://www.socialmediatoday.com/news/x-formerly-twitter-adds-option-to-restrict-grok-image-variations/814140/
- https://www.itmedia.co.jp/mobile/articles/2601/20/news075.html
- https://news.mynavi.jp/article/20251024-3583847/
- https://www.nikkei.com/article/DGXZQOGN111T80R10C26A7000000/
- https://www.watch.impress.co.jp/docs/news/2124457.html
- https://www.nta.go.jp/users/gensen/2026kiso/index.htm
- https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/102.pdf
- https://www.nta.go.jp/taxes/shiraberu/chatbot/index.htm
- https://openai.com/index/introducing-chatgpt-images-2-5/
- https://www.legalontech.com/jp/media/copyright-of-generative-ai
- https://aismiley.co.jp/ai_news/chatgpt-real-fake-point/
- https://blog.google/intl/ja-jp/feed/september-2026-pixel-drop/
- https://k-tai.watch.impress.co.jp/docs/news/2141355.html
- https://www.samsung.com/jp/support/mobile-devices/how-to-use-the-call-screening-feature-with-ai-assistant-on-the-samsung-galaxy-s26-series/
- https://www.apple.com/jp/newsroom/2026/09/the-next-generation-of-apple-intelligence-is-available-today/
- https://news.mynavi.jp/article/20260910-4945370/
- https://leverages.jp/news/2026/0702/5997/
- https://news.mynavi.jp/article/20260702-4654161/
- https://support.google.com/gemininotebook/answer/16454555?hl=ja
- https://jetstream.blog/2026/09/02/gemini-notebook-short-video-overviews-expansion/
- https://newsroom.tiktok.com/ja-jp/new-labels-for-disclosing-aigc-jp
- https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq
- https://toyokeizai.net/articles/-/951012
- https://www.mext.go.jp/content/20241226-mxt_shuukyo02-000030823_001.pdf
- https://b.hatena.ne.jp/hotentry/all/20260915
