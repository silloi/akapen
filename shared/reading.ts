/**
 * 読み上げ（TTS）に渡す前に、数字の読みを固定する。
 * 「201号室」を「ニセンイチ」「ニジュウイチ」と読まれないように、部屋番号・受付番号・電話番号は1桁ずつカタカナにする。
 * 「11月18日」「400円」「3丁目」のような数量・日付はそのまま（読み上げが正しく読む）。
 */
const KANA: Record<string, string> = {
  "0": "ゼロ",
  "1": "イチ",
  "2": "ニー",
  "3": "サン",
  "4": "ヨン",
  "5": "ゴー",
  "6": "ロク",
  "7": "ナナ",
  "8": "ハチ",
  "9": "キュー",
};

function digitsToKana(digits: string): string {
  return digits.replace(/\d/g, (d) => KANA[d] ?? d);
}

export function forSpeech(text: string): string {
  return (
    text
      // 電話番号（090-1234-5678、03-1234-5678、0120-123-456）: 区切りごとに読む
      .replace(/\d{2,4}-\d{2,4}-\d{3,4}/g, (m) => m.split("-").map(digitsToKana).join("、"))
      // ハイフン無しの電話番号（10〜11桁）
      .replace(/(?<!\d)\d{10,11}(?!\d)/g, (m) => digitsToKana(m))
      // 部屋番号・受付番号・番号: 201号室、0588番、12号
      .replace(/(\d{2,})(号室|号|番)/g, (_, d: string, unit: string) => digitsToKana(d) + unit)
  );
}
