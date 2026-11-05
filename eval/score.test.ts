import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { SCENES } from "../shared/scenes.ts";
import { scoreCase, summarize, type EvalCase } from "./score.ts";

const dir = join(import.meta.dirname, "cases");
const cases = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as EvalCase);

describe("評価の会話", () => {
  test.each(cases.map((c) => [c.id, c] as const))("%s: 正解の引用が発話にある", (_, c) => {
    expect(SCENES.some((s) => s.id === c.sceneId)).toBe(true);
    for (const m of [...c.gold.marks, ...c.gold.noMark]) {
      expect(c.turns[m.turn]?.text).toContain(m.quote);
    }
  });
});

describe("scoreCase", () => {
  const c = cases.find((x) => x.id === "sodai-1")!;

  test("正解と同じなら全部合う", () => {
    const pred = c.gold.marks.map((m) => ({ ...m, priority: m.rank }));
    const s = scoreCase(c, pred);
    expect(s).toMatchObject({ hit: 3, kindHit: 3, extra: 0, top1: true, forbidden: 0 });
  });

  test("引用が短くても重なれば合う。言いよどみに赤を入れたら数える", () => {
    const s = scoreCase(c, [
      { priority: 1, kind: "stalled", turn: 9, quote: "だいじょうぶ" },
      { priority: 2, kind: "grammar", turn: 1, quote: "えっと" },
    ]);
    expect(s).toMatchObject({ hit: 1, extra: 1, top1: true, forbidden: 1 });
  });

  test("赤の無い会話に赤を入れなければ 1番が合う", () => {
    const clean = cases.find((x) => x.gold.marks.length === 0)!;
    expect(scoreCase(clean, []).top1).toBe(true);
    expect(summarize([scoreCase(clean, [])]).precision).toBe(1);
  });
});
