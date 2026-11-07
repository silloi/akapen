# JAWS 日本語じょうず（リポジトリ名 akapen）

生活の電話を本番の前に声で予行演習し、赤ペン（先生の添削）とカンペを出す Web アプリ。アプリの名前は「JAWS 日本語じょうず」（英語では「JAWS: Nihongo Jozu」）。「赤ペン」は機能の呼び名としてだけ使う。公開先は Cloudflare Workers（`jaws.ni-hongo.workers.dev`、`docs/deploy.md`）。Built with Claude: Japan 2026 の作品。仕様は `docs/spec.md`、計画と進み具合は `docs/plan.md`。作り手は日本語教師。作り手とは日本語で、短く話す。決めることは作り手に聞く。

## 守ること

- 学習用の会話相手（AI for Education のチャットボット）に見せない。本番を通すための予行演習とカンペとして作る。
- 医療の助言はしない。病院の場面でも、相手役は受付として名前・日時・用件を聞くだけ。デモの主な場面は医療以外（粗大ごみ）。
- 安全・生命にかかわる場面（`SAFETY_CANDO_NOS`）は予行演習にしない。
- リポジトリは公開。実在の人の録音・録画・文字起こし・名前は入れない（`local/`、git 管理外）。キーも入れない。作り手の個人の情報も、書く前に作り手に聞く。
- 場面・評価・見本の会話の人物・店・地名・電話番号はすべて架空。Claude が下書きした場面は、検査役を通しても `status: "draft"` のままにし、作り手が確かめてから `reviewed` にする。
- データの出典を書く（`data/cando.meta.json`、README の出典）。
- 赤ペンは相手役と別の呼び出し。言いよどみは直さない。多くても3つ。優先順は `shared/validate.ts` の `KIND_ORDER`。
- カンペの「知っておくこと」は、場面カードの `notes` と生活・文化・社会的情報だけを元にする（Claude に事実を足させない）。
- `shared/prompts.ts` を変えたら `PROMPT_VERSION` を上げ、`vpx scripts/eval.ts` を回して `docs/eval.md` に結果を書く。
- Claude API は `claude-opus-5-5`、構造化出力（`output_config.format`）、`fallbacks: "default"`（beta `server-side-fallback-2026-07-01`）。

## 構成

- `shared/` 共通: `types.ts`、`scenes.ts`（手書きの場面カード＋`data/scenes.generated.json` の下書き。`keyterms` は文字起こしに渡す語、`status` は先生が確かめたか）、`prompts.ts`（相手役・赤ペン・カンペの指示とスキーマ）、`claude.ts`（呼び出し）、`validate.ts`（赤ペンの引用の照合・並べ替え・前回の赤ペンとの対応）、`numbers.ts`（漢数字→算用数字）、`cando.ts`
- `worker/` Cloudflare Worker: `/api/scenes`、`/api/phone-candos`、`/api/turn`、`/api/akapen`、`/api/kanpe`、`/api/stt`（ElevenLabs Scribe）、`/api/tts`、`/api/share`（カンペを KV に置く・取り出す）
- `src/` Vue 3: `SceneList.vue` → `Practice.vue` → `Review.vue`（赤ペン、案A の添削。2回目以降は前回の赤ペンの ○△）→ `KanpeView.vue`（QR）。`KanpeSheet.vue` はカンペの表示、`LiveKanpe.vue` は QR から開く本番用（`/k/<ID>`。`lib/share.ts` が `/api/share` で KV に30日置く）。`lib/sample.ts` は手で作った見本
- `eval/` 評価の会話（`cases/*.json`、正解は作り手が入れる。`draft` は仮）と比べ方（`score.ts`）
- `scripts/` `build-data.ts`（データの取り込み）、`build-scenes.ts`（場面の下書き → 検査役）、`scene-sheet.ts`（場面の一覧 `docs/scenes.md`）、`eval.ts`（評価）、`try-partner.ts`（相手役を試す）、`simulate.ts`（学習者役も Claude にした通し）、`gold-sheet.ts`（正解を読む表）
- `docs/` 仕様・計画・評価・文字起こしの確かめ・デモの流れ。`docs/research/` は調査の報告

## 開発メモ

- root で動くコンテナでは `CI=1 vp dev`。
- このクラウド環境では、ElevenLabs のキーはネットワークシークレット（プロキシが `xi-api-key` を付ける）なので、スクリプトや curl からは届くが、ローカルの workerd の fetch はプロキシを通らない。Worker で文字起こしを試すときは `.dev.vars` に `ELEVENLABS_API_KEY` が要る。
- `ANTHROPIC_API_KEY` は環境変数（`api.anthropic.com` はプロキシを通らない）。
- `wrangler.jsonc` を変えたら `vp exec wrangler types`。
- 確認は `vp check`、`vp exec vue-tsc -b`、`vp test`。

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command. Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

- `vp <name>` runs a built-in command; `vp run <name>` runs a `package.json` script.
- Run TypeScript files with `vpx <file>`.
- Run `vp install` after pulling, and `vp check` / `vp test` before committing.

<!--VITE PLUS END-->
