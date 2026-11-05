import { expect, test } from "vite-plus/test";
import { kanjiDigitsToAscii } from "./numbers.ts";

test("1つずつ読んだ数字は算用数字にする", () => {
  expect(kanjiDigitsToAscii("あ、はい。零九零一二三四五六七八ですね。")).toBe(
    "あ、はい。09012345678ですね。",
  );
  expect(kanjiDigitsToAscii("さくらハイツの二〇一です")).toBe("さくらハイツの201です");
});

test("位取りのある数と1文字の数はそのまま", () => {
  expect(kanjiDigitsToAscii("三丁目五の十二")).toBe("三丁目五の十二");
  expect(kanjiDigitsToAscii("一つだけ")).toBe("一つだけ");
});
