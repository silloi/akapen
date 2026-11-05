# デプロイ（Cloudflare Workers）

まだしていない。Cloudflare の API トークンが要る。

1. Cloudflare で API トークンを作る（テンプレート「Edit Cloudflare Workers」）。
2. このクラウド環境のネットワークシークレットに入れる（ドメイン `api.cloudflare.com`、ヘッダー `Authorization`、プレフィックス `Bearer`）。または、手元のパソコンで `vp exec wrangler login`。
3. キーを Worker のシークレットに入れる（値は聞かれたときに入れる。リポジトリには入れない）:
   ```bash
   vp exec wrangler secret put ANTHROPIC_API_KEY
   vp exec wrangler secret put ELEVENLABS_API_KEY
   ```
4. `vp run deploy`（`vp build && wrangler deploy`）。
5. 公開された URL で、`/api/health` の `claude`・`stt`・`tts` が true か確かめ、声で通しで試す（マイクは https でだけ使える）。
