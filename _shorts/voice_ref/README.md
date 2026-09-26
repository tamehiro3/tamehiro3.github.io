# 声の素材（ためひろさんのクローン用）

ここに、ためひろさん本人が1人で話している音声を1つ置いてください。`.gitignore` 済みなので、GitHubには上がりません。

- 長さは10秒〜3分。30〜60秒くらいが扱いやすいです。
- BGMや他の人の声、効果音が入っていないもの。
- ショート動画と同じくらいのテンション（元気め）で話している部分だと、仕上がりが近くなります。
- 形式は wav / mp3 / m4a。
- Spotify アプリの音声は保護されていて取り出せません。ポッドキャストの**収録元のファイル**（Spotify for Creators にアップロードした元データ）か、スマホで新しく録音したものを使ってください。

fal の APIキーは `assets/.fal_key` に1行で保存してください（`.gitignore` 済み。`chmod 600` 推奨）。置いたら次を実行します。

    python3 tools/fal_api.py check                                   # キーが読めるか
    python3 tools/fal_api.py clone voice_ref/<ファイル名> --start 60 --seconds 90   # 声だけの区間を指定してクローン
    python3 tools/tts.py episodes/ep01 --engine fal
    python3 tools/render.py episodes/ep01
    python3 tools/qa.py episodes/ep01                                # Whisper の文字起こし照合も自動で実施

クローンは fal 経由の MiniMax（`fal-ai/minimax/voice-clone`）で行い、声のIDを `voice_ref/voice_id.json` に保存します。作り直すときは `clone ... --force` を付けます。MiniMax の仕様では、クローンした声は7日以内に一度も使わないと削除されます。
