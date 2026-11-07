# トップの動画の作り方

トップ（場面の一覧の上）の動画は、アプリの実際の画面を撮って、順に重ねたもの（約19秒、音なし）。
予行演習 → 会話の記録に入った赤ペン → 本番のカンペ（日本語の画面・ベトナム語の訳）と QR・スマホの本番用 →
いろいろなことばの赤ペンの画面、の順。区切りの時間は `src/lib/hero.json` の `segments`。

1. アプリを開く（`CI=1 vp dev`。赤ペンの訳とカンペに Claude を使うので `.dev.vars` にキーが要る）。
2. 撮る: 作業用のフォルダで `node <リポジトリ>/scripts/hero/capture.cjs all`（Playwright）。
   練習の画面は、相手役・文字起こし・声を台本の返事に差し替える（会話は `src/lib/sample.ts` の見本と同じ）。
3. QR を公開先のものにする: 手元のアプリで撮った QR は `localhost` を指すので、同じカンペを公開先の
   `/api/share` に置き、その URL の QR を画面の QR の位置に貼る（`cap/kanpe-ja-vi-qrprod.png` と、
   QR の位置 `qrimg` を足した JSON）。URL の欄は動画の枠に入れない。
4. つなぐ: `FPS=24 SCALE=660 python3 <リポジトリ>/scripts/hero/compose.py cap out 28 36`
5. `out/hero.{mp4,webm,webp}` を `public/media/hero-<中身のハッシュ10桁>.<拡張子>` に置き、
   `src/lib/hero.json` の名前と `segments` を書き換える。

配信: `/media/*` は Worker（`worker/media.ts`）を通して、Range に 206 で答える。Workers の静的ファイルは
Range に 200 で全部を返し、iPhone・iPad の Safari はそれだと動画を流さないため。名前にハッシュが入るので
1年置く（`cache-control: immutable`）。

画面の会話・人物・店・地名・電話番号はすべて架空（見本の会話と同じ）。
