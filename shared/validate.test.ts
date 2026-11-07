import { describe, expect, it } from "vite-plus/test";
import { matchRetry } from "./validate.ts";

const previous = [
  { quote: "だいじょうぶです。", next: "わかりました。いすだけ、お願いします。" },
  { quote: "お金は？", next: "料金はいくらですか。" },
];

describe("matchRetry（2回目の赤ペンと前回の対応づけ）", () => {
  it("文字どおり同じなら、その判定を使う", () => {
    const r = matchRetry(
      [
        {
          quote: "だいじょうぶです。",
          next: "わかりました。いすだけ、お願いします。",
          done: true,
          note: "言えた。",
        },
        { quote: "お金は？", next: "料金はいくらですか。", done: false, note: "出てこなかった。" },
      ],
      previous,
    );
    expect(r.map((x) => x.done)).toEqual([true, false]);
    expect(r[0]!.note).toBe("言えた。");
  });
  it("句点やかぎかっこが落ちても対応づく", () => {
    const r = matchRetry(
      [
        {
          quote: "「だいじょうぶです」",
          next: "わかりました。いすだけお願いします",
          done: true,
          note: "a",
        },
        { quote: "お金は", next: "料金はいくらですか", done: true, note: "b" },
      ],
      previous,
    );
    expect(r.map((x) => x.done)).toEqual([true, true]);
  });
  it("引用が変わっていても、数が同じなら順番で対応づく", () => {
    const r = matchRetry(
      [
        { quote: "大丈夫です", next: "いすだけで", done: true, note: "a" },
        { quote: "お金", next: "いくら", done: false, note: "b" },
      ],
      previous,
    );
    expect(r.map((x) => x.done)).toEqual([true, false]);
    expect(r[1]!.note).toBe("b");
  });
  it("対応が無いものは △ で、場面が出てこなかったと書く", () => {
    const r = matchRetry(
      [{ quote: "別の所", next: "別の言い方", done: true, note: "a" }],
      previous,
    );
    expect(r.map((x) => x.done)).toEqual([false, false]);
    expect(r[0]!.note).toContain("出てきませんでした");
  });
});
