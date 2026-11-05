/**
 * 文字起こしの漢数字の並び（零九零一二三四五六七八）を算用数字に直す。
 * 電話番号・部屋番号・郵便番号のように、数字を1つずつ読んだ所だけが対象（2文字以上の並び）。
 * 「三丁目」「五の十二」のような位取りのある数は、そのまま残す（十・百・千を含む並びは触らない）。
 */
const DIGITS: Record<string, string> = {
  〇: "0",
  零: "0",
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
};

export function kanjiDigitsToAscii(text: string): string {
  return text.replace(/[〇零一二三四五六七八九]{2,}/gu, (run) =>
    run.replace(/./gu, (c) => DIGITS[c] ?? c),
  );
}
