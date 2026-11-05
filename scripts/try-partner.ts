/**
 * 相手役を試す: 評価の会話から学習者の発話だけを取り出して順に渡し、相手役（Claude）がどう返すかを表示する。
 *
 *   ANTHROPIC_API_KEY=... vpx scripts/try-partner.ts sodai-1 [--speed slow|natural]
 *
 * 見ること: 本物の受付らしいか / 日本語を教えたり直したりしていないか / あいまいな答えを聞き返すか /
 *           1回に聞くことが1つか / 医療の助言をしないか / 用件が終わると ended になるか
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { findCando } from "../shared/cando.ts";
import { callJson } from "../shared/claude.ts";
import {
  PARTNER_SCHEMA,
  partnerMessages,
  partnerSystem,
  type PartnerReply,
  type Speed,
} from "../shared/prompts.ts";
import { findScene } from "../shared/scenes.ts";
import type { Turn } from "../shared/types.ts";
import type { EvalCase } from "../eval/score.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { speed: { type: "string", default: "slow" } },
});
const c = JSON.parse(
  readFileSync(`eval/cases/${positionals[0] ?? "sodai-1"}.json`, "utf8"),
) as EvalCase;
const scene = findScene(c.sceneId)!;
// ANTHROPIC_API_KEY が環境から消される場合に備え、AKAPEN_ANTHROPIC_API_KEY も読む
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
  // クラウド環境では ANTHROPIC_BASE_URL が別の所を指していることがあるので、明示する
  baseURL: "https://api.anthropic.com",
});
const mine = c.turns.filter((t) => t.speaker === "me").map((t) => t.text);

const turns: Turn[] = [{ speaker: "partner", text: scene.opening }];
console.log(`相手: ${scene.opening}`);
for (const text of mine) {
  turns.push({ speaker: "me", text });
  console.log(`わたし: ${text}`);
  const t0 = Date.now();
  const r = await callJson<PartnerReply>(client, {
    model: "claude-opus-5-5",
    effort: "low",
    system: partnerSystem(scene, findCando(scene.candoNo), values.speed as Speed),
    messages: partnerMessages(turns),
    schema: PARTNER_SCHEMA,
    maxTokens: 4000,
  });
  turns.push({ speaker: "partner", text: r.data.say });
  console.log(`相手: ${r.data.say}${r.data.ended ? "（終わり）" : ""}  [${Date.now() - t0}ms]`);
  if (r.data.ended) break;
}
