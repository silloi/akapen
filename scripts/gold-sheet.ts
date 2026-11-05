/**
 * 評価の会話と正解の赤ペンを、作り手が読んで直しやすい Markdown にする。
 *
 *   vpx scripts/gold-sheet.ts > docs/eval-gold.md
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findScene } from "../shared/scenes.ts";
import type { MarkKind } from "../shared/types.ts";
import type { EvalCase } from "../eval/score.ts";

const KIND: Record<MarkKind, string> = {
  stalled: "用件が変わる・止まる",
  missed: "聞き取れていない",
  impolite: "失礼に聞こえそう",
  grammar: "文法・語",
};

const dir = "eval/cases";
const cases = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as EvalCase);

const out: string[] = [
  "# 評価の会話と正解の赤ペン",
  "",
  "`eval/cases/*.json` から作った読みやすい形（`vpx scripts/gold-sheet.ts > docs/eval-gold.md`）。会話はすべて架空。",
  "正解の「誰が入れたか」が `draft` のものは、Claude Code が作った**仮**の正解で、作り手（日本語教師）が確かめて直す。直すときは JSON を直す。",
  "",
];
for (const c of cases) {
  const scene = findScene(c.sceneId);
  out.push(
    `## ${c.id}（${scene?.title ?? c.sceneId}）`,
    "",
    c.note,
    "",
    `正解を入れた人: ${c.goldBy}`,
    "",
  );
  c.turns.forEach((t, i) => {
    out.push(`${i}. ${t.speaker === "partner" ? "相手" : "**学習者**"}: ${t.text}`);
  });
  out.push("", "| 順 | 種類 | 発話 | 引用 |", "| --- | --- | --- | --- |");
  if (c.gold.marks.length === 0) out.push("| - | 赤なし | - | - |");
  for (const m of c.gold.marks)
    out.push(`| ${m.rank} | ${KIND[m.kind]} | ${m.turn} | ${m.quote} |`);
  if (c.gold.noMark.length) {
    out.push("", "直さなくていい所（赤を入れたら減点）:");
    for (const n of c.gold.noMark) out.push(`- ${n.turn}「${n.quote}」: ${n.reason}`);
  }
  out.push("");
}
console.log(out.join("\n"));
