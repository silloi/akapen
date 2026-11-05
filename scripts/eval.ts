/**
 * 評価: eval/cases の会話に Claude が赤ペンを入れ、作り手の赤ペン（正解）と比べる。
 *
 *   ANTHROPIC_API_KEY=... vpx scripts/eval.ts [--runs 1] [--effort medium]
 *
 * 結果は eval/results/<日時>.json に保存し、要約を表示する（docs/eval.md に写す）。
 * 会話はすべて架空。
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { findCando } from "../shared/cando.ts";
import { callJson, type Effort } from "../shared/claude.ts";
import { AKAPEN_SCHEMA, AKAPEN_SYSTEM, akapenUser, PROMPT_VERSION } from "../shared/prompts.ts";
import { findScene } from "../shared/scenes.ts";
import { normalizeAkapen, type RawAkapen } from "../shared/validate.ts";
import { scoreCase, summarize, type CaseScore, type EvalCase } from "../eval/score.ts";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "1" },
    effort: { type: "string", default: "medium" },
    model: { type: "string", default: "claude-opus-5-5" },
    only: { type: "string" },
  },
});

// ANTHROPIC_API_KEY が環境から消される場合に備え、AKAPEN_ANTHROPIC_API_KEY も読む
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
  // クラウド環境では ANTHROPIC_BASE_URL が別の所を指していることがあるので、明示する
  baseURL: "https://api.anthropic.com",
});
const dir = "eval/cases";
const cases = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as EvalCase)
  .filter((c) => !values.only || c.id === values.only);

const runs = Number(values.runs);
const scores: CaseScore[] = [];
const outputs: unknown[] = [];

for (let r = 0; r < runs; r++) {
  await Promise.all(
    cases.map(async (c) => {
      const scene = findScene(c.sceneId)!;
      const res = await callJson<RawAkapen>(client, {
        model: values.model,
        effort: values.effort as Effort,
        system: AKAPEN_SYSTEM,
        messages: [{ role: "user", content: akapenUser(scene, findCando(scene.candoNo), c.turns) }],
        schema: AKAPEN_SCHEMA,
      });
      const { akapen, dropped } = normalizeAkapen(res.data, c.turns);
      const s = scoreCase(c, akapen.marks);
      scores.push(s);
      outputs.push({ run: r, id: c.id, akapen, dropped, score: s, usage: res.usage });
      const marks = akapen.marks.map((m) => `${m.priority}.${m.kind}[${m.turn}]「${m.quote}」`);
      console.log(
        `${c.id} run${r}: 正解${s.gold} Claude${s.pred} 合う${s.hit} 入れすぎ${s.extra} 1番${s.top1 ? "○" : "×"} 禁止${s.forbidden}  ${marks.join(" ")}`,
      );
    }),
  );
}

const summary = summarize(scores);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("eval/results", { recursive: true });
writeFileSync(
  `eval/results/${stamp}.json`,
  JSON.stringify(
    {
      promptVersion: PROMPT_VERSION,
      model: values.model,
      effort: values.effort,
      runs,
      goldBy: [...new Set(cases.map((c) => c.goldBy))],
      summary,
      outputs,
    },
    null,
    2,
  ) + "\n",
);
const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(
  `\n${summary.cases}件（指示 ${PROMPT_VERSION}、${values.model}、effort ${values.effort}）` +
    `\n拾えた割合 ${pct(summary.recall)}・合っていた割合 ${pct(summary.precision)}・種類の一致 ${pct(summary.kindAgreement)}` +
    `・1番が合う ${pct(summary.top1)}・直さなくていい所への赤 ${summary.forbidden}`,
);
