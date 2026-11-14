/**
 * 場面に関係する公的な情報・手続きのページ（data/public-info.json。scripts/build-public-info.ts が作る）。
 * リンク先は yasashii-refs の目録にある公的なページだけ。
 */
export interface PublicResource {
  id: string;
  /** 目録の名前（日本語） */
  name: string;
  /** 名前が長いときに、日本語の画面で出す短い名前（目録の名前は小さく添える） */
  label?: string;
  publisher: string;
  url: string;
  /** そのページ（資料）がある言語（ISO 639-1。やさしい日本語は ja-easy、中国語は zh-Hans など） */
  languages: string[];
  /** 目録で確かめた日 */
  checked: string;
  /** やさしい日本語の説明 */
  desc: string;
}

export interface PublicInfoData {
  note: string;
  resources: PublicResource[];
  /** 生活・就労ガイドブックの章 */
  chapters: Record<number, string>;
  /** 場面 → ページ（出す順）と、ガイドブックの章 */
  scenes: Record<string, { ids: string[]; chapters: number[] }>;
  /** 言語 → ページの id → 名前と説明の訳 */
  tr: Record<string, Record<string, { name: string; desc: string }>>;
  /** 言語 → 章の番号 → 章の名前の訳 */
  chapterTr: Record<string, Record<number, string>>;
}

/** 画面の言語のコード → 目録の言語のコード */
export function catalogLang(uiLang: string): string {
  return uiLang === "zh"
    ? "zh-Hans"
    : uiLang === "zh-TW"
      ? "zh-Hant"
      : uiLang === "easy"
        ? "ja-easy"
        : uiLang;
}
