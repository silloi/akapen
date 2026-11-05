import { expect, test } from "vite-plus/test";
import { forSpeech } from "./reading.ts";

test("部屋番号・受付番号・電話番号は1桁ずつ読む", () => {
  expect(forSpeech("さくらハイツ201号室ですね。")).toBe("さくらハイツニーゼロイチ号室ですね。");
  expect(forSpeech("受付番号は0588番です。")).toBe("受付番号はゼロゴーハチハチ番です。");
  expect(forSpeech("お電話番号は090-1234-5678ですね。")).toBe(
    "お電話番号はゼロキューゼロ、イチニーサンヨン、ゴーロクナナハチですね。",
  );
  expect(forSpeech("09012345678です")).toBe("ゼロキューゼロイチニーサンヨンゴーロクナナハチです");
});

test("日付・金額・数量はそのまま", () => {
  const t = "最短ですと11月18日の火曜日です。処理券は400円、3丁目5の12、いす1脚です。";
  expect(forSpeech(t)).toBe(t);
});
