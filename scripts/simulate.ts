/**
 * 通しの試し: Claude に「学習者役」をさせ、相手役と最後まで会話させてから、赤ペンを入れる。
 * 学習者役は、生活の電話でつまずきやすい言い方（あいまいな「だいじょうぶです」、一語だけの質問、
 * 分からない語に「はい」とだけ答える、など）をわざと入れる。会話はすべて架空。
 *
 *   ANTHROPIC_API_KEY=... vpx scripts/simulate.ts sodai-gomi
 *
 * 結果は eval/sim/<場面>-<日時>.json に保存する（相手役の終わり方・赤ペンの入り方を見るため）。
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { findCando } from "../shared/cando.ts";
import { callJson } from "../shared/claude.ts";
import {
  AKAPEN_SCHEMA,
  AKAPEN_SYSTEM,
  akapenUser,
  PARTNER_SCHEMA,
  partnerMessages,
  partnerSystem,
  PROMPT_VERSION,
  type PartnerReply,
} from "../shared/prompts.ts";
import { findScene } from "../shared/scenes.ts";
import type { Turn } from "../shared/types.ts";
import { normalizeAkapen, type RawAkapen } from "../shared/validate.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { max: { type: "string", default: "12" } },
});
const scene = findScene(positionals[0] ?? "sodai-gomi");
if (!scene) throw new Error("場面が見つかりません");
const cando = findCando(scene.candoNo);
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com",
});

const LEARNER_SCHEMA = {
  type: "object",
  properties: { say: { type: "string" } },
  required: ["say"],
  additionalProperties: false,
} as const;

const learnerSystem = `あなたは、日本語を勉強中の外国人（${cando?.level ?? "A2"}くらい）の役をします。日本語の教材を作るための、架空の練習の会話です。
電話の相手は「${scene.partnerRole}」です。用件: ${scene.summary}
使う情報（架空）: ${scene.practiceInfo.map((i) => `${i.label}=${i.value}`).join("、")}

- 学習者らしく、短い文で話す。「えっと」「あの」などの言いよどみや、言い直しを、ときどき入れる。
- 会話の中で、次のつまずきを1つか2つ、自然に入れる: あいまいな「だいじょうぶです」「いいです」/ 名詞だけの質問（「お金は？」）/ 分からない語に「はい」とだけ答える / 聞かれたことと少しずれた答え。
- 文法の小さな誤り（活用・助詞）を少し入れてよい。
- 1回に言うのは1〜2文。相手が電話を終えようとしたら、お礼を言って終わる。`;

function learnerMessages(turns: Turn[]) {
  // 学習者役から見ると、相手（partner）が user、自分（me）が assistant
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    const role = t.speaker === "partner" ? "user" : "assistant";
    const content = t.speaker === "me" ? JSON.stringify({ say: t.text }) : t.text;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else out.push({ role, content });
  }
  return out;
}

const turns: Turn[] = [{ speaker: "partner", text: scene.opening }];
console.log(`相手: ${scene.opening}`);
let ended = false;
for (let i = 0; i < Number(values.max) && !ended; i++) {
  const me = await callJson<{ say: string }>(client, {
    model: "claude-opus-5-5",
    effort: "low",
    system: learnerSystem,
    messages: learnerMessages(turns),
    schema: LEARNER_SCHEMA,
    maxTokens: 4000,
  });
  turns.push({ speaker: "me", text: me.data.say });
  console.log(`わたし: ${me.data.say}`);
  const p = await callJson<PartnerReply>(client, {
    model: "claude-opus-5-5",
    effort: "low",
    system: partnerSystem(scene, cando, "slow"),
    messages: partnerMessages(turns),
    schema: PARTNER_SCHEMA,
    maxTokens: 4000,
  });
  turns.push({ speaker: "partner", text: p.data.say });
  ended = p.data.ended;
  console.log(`相手: ${p.data.say}${ended ? "（終わり）" : ""}`);
}

const r = await callJson<RawAkapen>(client, {
  model: "claude-opus-5-5",
  effort: "medium",
  system: AKAPEN_SYSTEM,
  messages: [{ role: "user", content: akapenUser(scene, cando, turns) }],
  schema: AKAPEN_SCHEMA,
});
const { akapen, dropped } = normalizeAkapen(r.data, turns);
console.log(`\n赤ペン: ${akapen.summary}`);
for (const m of akapen.marks) {
  console.log(`  ${m.priority}. ${m.kind} [${m.turn}]「${m.quote}」 ${m.why} → ${m.next}`);
}
for (const g of akapen.good) console.log(`  ○ [${g.turn}]「${g.quote}」 ${g.note}`);
if (dropped.length) console.log("  捨てた赤:", JSON.stringify(dropped));

mkdirSync("eval/sim", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(
  `eval/sim/${scene.id}-${stamp}.json`,
  JSON.stringify(
    { promptVersion: PROMPT_VERSION, sceneId: scene.id, ended, turns, akapen, dropped },
    null,
    2,
  ) + "\n",
);
