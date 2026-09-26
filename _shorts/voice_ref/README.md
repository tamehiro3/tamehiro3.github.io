# 声の素材（ためひろさんのクローン用）

ここに、ためひろさん本人が1人で話している音声を1つ置いてください。`.gitignore` 済みなので、GitHubには上がりません。

- 長さは10秒〜3分。30〜60秒くらいが扱いやすいです。
- BGMや他の人の声、効果音が入っていないもの。
- ショート動画と同じくらいのテンション（元気め）で話している部分だと、仕上がりが近くなります。
- 形式は wav / mp3 / m4a。
- Spotify アプリの音声は保護されていて取り出せません。ポッドキャストの**収録元のファイル**（Spotify for Creators にアップロードした元データ）か、スマホで新しく録音したものを使ってください。

置いたら次を実行します（`FAL_KEY` が環境変数に入っていること）。

    python3 tools/tts.py episodes/ep01 --engine fal
    python3 tools/render.py episodes/ep01
    python3 tools/qa.py episodes/ep01

初回だけ fal の `fal-ai/minimax/voice-clone` で声を作り、ID を `voice_ref/voice_id.json` に保存します。以降は、その声で1文ずつ読み上げます。MiniMax の仕様では、クローンした声は7日以内に一度も使わないと削除されます。
