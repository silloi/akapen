/**
 * 作り手が確かめた下書きの場面を reviewed にする（直す所があれば JSON を直してから）。
 *
 *   vpx scripts/mark-reviewed.ts 95 563 [--draft]   # --draft で draft に戻す
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Scene } from "../shared/types.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { draft: { type: "boolean", default: false } },
});
const OUT = "data/scenes.generated.json";
const scenes = JSON.parse(readFileSync(OUT, "utf8")) as Scene[];
const nos = positionals.map(Number);
for (const s of scenes) {
  if (nos.includes(s.candoNo)) {
    s.status = values.draft ? "draft" : "reviewed";
    console.log(`${s.candoNo} ${s.title}: ${s.status}`);
  }
}
writeFileSync(OUT, JSON.stringify(scenes, null, 2) + "\n");
