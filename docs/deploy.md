# デプロイ（Cloudflare Workers）

アカウント: `ni-hongo`（Account ID は `wrangler.jsonc`）。URL は `https://jaws.ni-hongo.workers.dev`（予定）。

## 仕組み

GitHub Actions（`.github/workflows/deploy.yml`）が、`main` か `claude/spec-plan` への push のたびにビルドして `wrangler deploy` する。手元や Claude のクラウド環境から直接 deploy しないのは、クラウド環境のプロキシが `api.cloudflare.com` 向けの `Authorization` ヘッダーをトークンで上書きするため、静的ファイルのアップロード（一時的な JWT を使う）だけが 401 になるから（11/7 に確かめた）。

## 一度だけすること（作り手）

1. Cloudflare で API トークンを作る（My Profile → API Tokens → テンプレート「Edit Cloudflare Workers」、アカウントは ni-hongo）。
2. GitHub の `silloi/akapen` → Settings → Secrets and variables → Actions に入れる:
   - `CLOUDFLARE_API_TOKEN`: 1 のトークン
   - `ELEVENLABS_API_KEY`: ElevenLabs のキー（文字起こしと読み上げ）
   - `ANTHROPIC_API_KEY`: Claude のキー（相手役・赤ペン・カンペ）
3. Actions の「deploy」を Run workflow で動かす（以後は push のたびに動く）。

キーは Worker のシークレットに入る（Cloudflare のダッシュボード → Workers & Pages → jaws → Settings → Variables and Secrets でも入れ替えられる）。リポジトリには入れない。

## 確かめ方

- `https://jaws.ni-hongo.workers.dev/api/health` の `claude`・`stt`・`tts` が true か。
- 声で通しで試す（マイクは https でだけ使える）。
- 公開した後は、Cloudflare のダッシュボードで Requests（無料枠 1日 10 万）と、Anthropic・ElevenLabs の使用量を見る。だれでも使える URL なので、使われすぎたら Worker の Rate Limiting を足すか、URL を変える。
