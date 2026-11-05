import { describe, expect, test } from "vite-plus/test";
import { segment } from "./segments.ts";

describe("segment", () => {
  test("文字は変わらない", () => {
    const text = "あの、えっと、ごみを、大きいごみを、捨てたいです。";
    const segs = segment(text, [
      { quote: "大きいごみ", type: "mark", priority: 1 },
      { quote: "捨てたい", type: "good", priority: 0 },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.highlight).map((s) => s.text)).toEqual(["大きいごみ", "捨てたい"]);
  });

  test("重なるときは赤ペンを優先する", () => {
    const segs = segment("だいじょうぶです。", [
      { quote: "だいじょうぶです", type: "good", priority: 0 },
      { quote: "だいじょうぶ", type: "mark", priority: 1 },
    ]);
    expect(segs.filter((s) => s.highlight).map((s) => s.highlight?.type)).toEqual(["mark"]);
  });

  test("引用が見つからなければ、そのまま", () => {
    expect(segment("はい。", [{ quote: "いいえ", type: "mark", priority: 1 }])).toEqual([
      { text: "はい。" },
    ]);
  });
});
