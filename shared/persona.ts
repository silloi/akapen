/**
 * 練習で名乗る架空の人物。画面の言語ごとに差し替える。
 *
 * 場面カードの練習用の情報（practiceInfo）と、文字起こしに渡す語（keyterms）には、名前を直接書かず
 * 〔名前〕〔子どもの名前〕〔配偶者の名前〕と書く。画面と Worker が、言語に合わせて埋める。
 * 名前以外（住所・電話番号・日付など）は、言語によらず共通。
 *
 * 名前はすべて架空。その言語を話す人に多い姓と名を、日本で名乗るときのカタカナで書く（姓・名の順）。
 * 作り手が変えてよい。
 */
export interface Persona {
  /** 本人（姓・名） */
  name: string;
  /** 子ども */
  child: string;
  /** 配偶者 */
  spouse: string;
}

export const PERSONAS: Record<string, Persona> = {
  ja: { name: "リン・メイ", child: "リン・ハオ", spouse: "リン・ジュン" },
  easy: { name: "リン・メイ", child: "リン・ハオ", spouse: "リン・ジュン" },
  en: { name: "ブラウン・サラ", child: "ブラウン・レオ", spouse: "ブラウン・ダニエル" },
  zh: { name: "リン・メイ", child: "リン・ハオ", spouse: "リン・ジュン" },
  "zh-TW": { name: "チェン・イーティン", child: "チェン・ユーシャン", spouse: "チェン・ジーハオ" },
  vi: { name: "グエン・ラン", child: "グエン・ミン", spouse: "グエン・ナム" },
  tl: { name: "サントス・アナ", child: "サントス・ミゲル", spouse: "サントス・ホセ" },
  ne: { name: "タパ・スニタ", child: "タパ・アニシュ", spouse: "タパ・ラメシュ" },
  id: { name: "ウィジャヤ・デウィ", child: "ウィジャヤ・ラフマ", spouse: "ウィジャヤ・ブディ" },
  pt: { name: "シルバ・マリア", child: "シルバ・ルーカス", spouse: "シルバ・ジョアン" },
  ko: { name: "キム・ミンジ", child: "キム・ジュノ", spouse: "キム・ジフン" },
  my: { name: "テッ・ウィン", child: "ミン・テッ", spouse: "チョー・ゾー" },
};

export const PERSONA_TOKENS = {
  "〔名前〕": "name",
  "〔子どもの名前〕": "child",
  "〔配偶者の名前〕": "spouse",
} as const satisfies Record<string, keyof Persona>;

export function personaOf(lang: string | null | undefined): Persona {
  return PERSONAS[lang ?? "ja"] ?? PERSONAS.ja!;
}

/** 〔名前〕などを、その言語の人物の名前に置き換える */
export function fillPersona(text: string, lang: string | null | undefined): string {
  const p = personaOf(lang);
  let out = text;
  for (const [token, key] of Object.entries(PERSONA_TOKENS)) out = out.split(token).join(p[key]);
  return out;
}
