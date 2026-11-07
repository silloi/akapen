import { describe, expect, it } from "vite-plus/test";
import { applyGold, checkGold } from "./gold.ts";
import type { EvalCase } from "./score.ts";

const c: EvalCase = {
  id: "t",
  sceneId: "sodai-gomi",
  note: "",
  goldBy: "draft",
  turns: [
    { speaker: "partner", text: "処理券を400円分お買い求めください。" },
    { speaker: "me", text: "はい。お金は？" },
  ],
  gold: { marks: [], noMark: [] },
};

describe("checkGold", () => {
  it("引用が発話にそのまま無ければ error", () => {
    const p = checkGold(c, {
      marks: [{ rank: 1, kind: "impolite", turn: 1, quote: "お金は?" }],
      noMark: [],
    });
    expect(p.some((x) => x.level === "error")).toBe(true);
  });
  it("赤が4つ以上・種類と発話の向きのずれは warn", () => {
    const mark = { rank: 1, kind: "impolite" as const, turn: 1, quote: "お金は？" };
    const p = checkGold(c, {
      marks: [mark, mark, mark, { rank: 4, kind: "missed", turn: 1, quote: "はい" }],
      noMark: [],
    });
    expect(p.filter((x) => x.level === "error")).toHaveLength(0);
    expect(p.map((x) => x.message).join()).toContain("4 つ");
    expect(p.map((x) => x.message).join()).toContain("相手の発話から");
  });
  it("問題が無ければ空", () => {
    expect(
      checkGold(c, {
        marks: [{ rank: 1, kind: "missed", turn: 0, quote: "処理券" }],
        noMark: [{ turn: 1, quote: "はい", reason: "伝わった" }],
      }),
    ).toEqual([]);
  });
});

describe("applyGold", () => {
  it("並びどおりに順位を振り直し、作り手とメモを入れる", () => {
    const next = applyGold(c, {
      id: "t",
      goldBy: "teacher",
      gold: {
        marks: [
          { rank: 2, kind: "impolite", turn: 1, quote: "お金は？" },
          { rank: 1, kind: "missed", turn: 0, quote: "処理券" },
        ],
        noMark: [],
      },
      goldNote: " 処理券が分からないと当日出せない ",
    });
    expect(next.gold.marks.map((m) => [m.rank, m.quote])).toEqual([
      [1, "お金は？"],
      [2, "処理券"],
    ]);
    expect(next.goldBy).toBe("teacher");
    expect(next.goldNote).toBe("処理券が分からないと当日出せない");
    expect(next.turns).toBe(c.turns);
  });
});
