import { describe, expect, it } from "vite-plus/test";
import { buildIndex, findTerms, splitByTerms, termsIn, type GlossEntry } from "./glossary.ts";

const entries: GlossEntry[] = [
  { id: "a", term: "国民健康保険", source: "plain-japanese-rewrites" },
  { id: "b", term: "健康保険", source: "plain-japanese-rewrites" },
  { id: "c", term: "処理券", source: "draft" },
  { id: "d", term: "折り返し", alt: ["折返し"], source: "draft", phrase: true },
  { id: "e", term: "券", source: "draft" },
];
const index = buildIndex(entries);

describe("findTerms", () => {
  it("長い語を先に取る（国民健康保険の中の健康保険は取らない）", () => {
    expect(findTerms("国民健康保険に入ります", index)).toEqual([{ start: 0, end: 6, id: "a" }]);
    expect(findTerms("会社の健康保険です", index)).toEqual([{ start: 3, end: 7, id: "b" }]);
  });
  it("別の書き方でも見つける・1字の語は使わない", () => {
    expect(findTerms("折返しお電話します。処理券を買う", index).map((m) => m.id)).toEqual([
      "d",
      "c",
    ]);
  });
});

describe("splitByTerms", () => {
  it("語とそれ以外に分けても、つなげると元の文", () => {
    const text = "処理券をコンビニで買って、折り返しお電話ください。";
    const parts = splitByTerms(text, index);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.id).map((p) => p.text)).toEqual(["処理券", "折り返し"]);
  });
});

describe("termsIn", () => {
  it("出てきた順に、1回ずつ", () => {
    expect(termsIn(["処理券と健康保険", "処理券です"], index).map((e) => e.id)).toEqual(["c", "b"]);
  });
});
