/**
 * 正解を確かめる道具（/dev/gold）で書き出した JSON を、eval/cases に入れる。
 *
 *   vpx scripts/apply-gold.ts gold-2026-11-08.json [--dry]
 *
 * 引用が発話にそのまま無いなど、当てはめられない所があれば、何も書かずに止まる。
 * 入れたあと:
 *   vpx scripts/gold-sheet.ts > docs/eval-gold.md
 *   vpx scripts/eval.ts --runs 2      # docs/eval.md と README に結果を書く
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { applyGold, checkGold, type GoldExport } from "../eval/gold.ts";
import type { EvalCase } from "../eval/score.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { dry: { type: "boolean", default: false } },
});
const file = positionals[0];
if (!file) {
  console.error("使い方: vpx scripts/apply-gold.ts <書き出した JSON> [--dry]");
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8")) as GoldExport;
if (data.kind !== "akapen-gold" || data.version !== 1 || !Array.isArray(data.cases)) {
  console.error("正解を確かめる道具（/dev/gold）で書き出したファイルではありません");
  process.exit(1);
}

const updates: { path: string; next: EvalCase; line: string }[] = [];
let errors = 0;
for (const edit of data.cases) {
  const path = `eval/cases/${edit.id}.json`;
  let c: EvalCase;
  try {
    c = JSON.parse(readFileSync(path, "utf8")) as EvalCase;
  } catch {
    console.error(`${edit.id}: ${path} がありません`);
    errors++;
    continue;
  }
  const problems = checkGold(c, edit.gold);
  for (const p of problems) console.log(`${edit.id}: [${p.level}] ${p.message}`);
  if (problems.some((p) => p.level === "error")) {
    errors++;
    continue;
  }
  const next = applyGold(c, edit);
  if (JSON.stringify(next) === JSON.stringify(c)) continue;
  const marks = next.gold.marks.map((m) => `${m.rank}.${m.kind}[${m.turn}]「${m.quote}」`);
  updates.push({
    path,
    next,
    line: `${edit.id}: ${c.goldBy} → ${next.goldBy}、赤 ${c.gold.marks.length} → ${next.gold.marks.length}（${marks.join(" ") || "なし"}）、直さない ${c.gold.noMark.length} → ${next.gold.noMark.length}${next.goldNote ? "、メモあり" : ""}`,
  });
}

if (errors) {
  console.error(`\n当てはめられない会話が ${errors} 本あります。何も書いていません。`);
  process.exit(1);
}
for (const u of updates) {
  console.log(u.line);
  if (!values.dry) writeFileSync(u.path, JSON.stringify(u.next, null, 2) + "\n");
}
console.log(
  updates.length
    ? `\n${updates.length} 本を${values.dry ? "変える予定（--dry なので書いていない）" : "書きました"}`
    : "\n変わった会話はありません",
);
