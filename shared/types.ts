/** 生活Can do（data/cando.json。言語活動が「やり取り」のものだけ） */
export interface CanDo {
  /** 生活Can do 一覧の通番 */
  no: number;
  level: "A1" | "A2" | "B1" | "B2";
  category: string;
  cando: string;
  majorNo: string;
  major: string;
  minorNo: string;
  minor: string;
  /** 小分類の●（来日間もない人の生活に欠かせない、または安全にかかわる） */
  essential: boolean;
  case1: string;
  case2: string;
}

/** 生活・文化・社会的情報（小分類 minorNo で Can do とつながる） */
export interface SocialInfo {
  no: number;
  minorNo: string;
  text: string;
  /** ☆（来日間もないかどうかを問わず、知っておく必要がある） */
  mustKnow: boolean;
}

export interface CandoData {
  version: string;
  candos: CanDo[];
  social: SocialInfo[];
}

/** 本番で聞かれること（場面カード） */
export interface Ask {
  /** 例: name, phone, item */
  key: string;
  /** 例: 名前 */
  label: string;
  /** 相手の言い方の例（本物の受付が言いそうな形） */
  example: string;
}

/**
 * 場面カード。相手役のふるまいと、カンペの元になる。手で書き、作り手が確かめる。
 * 人物・店・地名・電話番号はすべて架空。
 */
export interface Scene {
  id: string;
  /** 生活Can do の通番 */
  candoNo: number;
  /** 画面に出す場面の名前 */
  title: string;
  /** 一言の説明（画面用） */
  summary: string;
  /** 相手の役（例: 粗大ごみ受付センターの受付） */
  partnerRole: string;
  /** 相手の最初の一言 */
  opening: string;
  /** 本番で聞かれること（順番どおり） */
  asks: Ask[];
  /** 練習で使う架空の情報（自分の本当の名前や電話番号を言わなくてよいように） */
  practiceInfo: { label: string; value: string }[];
  /** 本番で起きやすいこと（相手役が会話に1つ入れる） */
  twists: string[];
  /** 用件が終わったと言える条件 */
  goal: string;
  /** 相手役が言ってはいけないこと・しないこと（医療の助言など） */
  limits: string[];
  /** 前もって知っておくこと（生活・文化・社会的情報の番号） */
  socialNos: number[];
  /** カンペに足す、場面に固有の知っておくこと（手で書いたもの。出典がある場合は書く） */
  notes: string[];
  /** 文字起こしに前もって渡す語（場面の語・練習用の固有名詞。Scribe の keyterms） */
  keyterms: string[];
}

export type Speaker = "partner" | "me";

export interface Turn {
  speaker: Speaker;
  text: string;
}

/** 赤ペンの種類（優先順はこの並び） */
export type MarkKind =
  /** 用件が変わる・止まる（誤解されそう、伝わらなかった） */
  | "stalled"
  /** 相手の言葉を聞き取れていない（聞き返していない） */
  | "missed"
  /** 失礼・ぶっきらぼうに聞こえそう */
  | "impolite"
  /** 文法・語の誤り（伝わったが、直すと伝わりやすい） */
  | "grammar";

export interface Mark {
  /** 直す順番（1 から） */
  priority: number;
  kind: MarkKind;
  /** 会話の何番目の発話か（0 から） */
  turn: number;
  /** その発話からの引用（完全一致） */
  quote: string;
  /** なぜ困るか（やさしい日本語、1〜2文） */
  why: string;
  /** 次はこう言う（本番でそのまま言える形） */
  next: string;
}

/** 伝わった所（○）・今は直さなくていい所 */
export interface Note {
  turn: number;
  quote: string;
  note: string;
}

export interface Akapen {
  /** 本番までに直すこと（多くても3つ、優先順） */
  marks: Mark[];
  /** 伝わった所（○） */
  good: Note[];
  /** 伝わったので、今は直さなくていいこと（言いよどみは入れない） */
  later: Note[];
  /** 全体の一言（やさしい日本語） */
  summary: string;
}

/** カンペの言語 */
export type KanpeLang =
  | "zh"
  | "vi"
  | "en"
  | "ne"
  | "id"
  | "my"
  | "tl"
  | "pt"
  | "es"
  | "ko"
  | "easy";

export interface KanpeLine {
  /** 日本語 */
  ja: string;
  /** ひらがなの読み（漢字があるとき） */
  yomi: string;
  /** その人の言語（easy のときは、やさしい日本語の言い換え） */
  tr: string;
}

export interface Kanpe {
  lang: KanpeLang;
  /** 聞かれること（相手の言い方と意味） */
  asked: KanpeLine[];
  /** 言うこと（自分の答え。赤ペンで直した言い方を含む） */
  say: KanpeLine[];
  /** 困ったときの言い方 */
  help: KanpeLine[];
  /** 前もって知っておくこと（その人の言語で） */
  know: { text: string; source: string }[];
}

export interface ApiError {
  error: string;
  message: string;
}
