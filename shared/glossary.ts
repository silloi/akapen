/**
 * 用語集（ことばの意味）。電話・窓口の会話に出てくる語に、意味を付ける。
 *
 * データは scripts/build-glossary.ts が作る（data/glossary/）。
 * - 公的な用語集（yasashii-refs が公的な資料から取り込んだもの）: やさしい日本語書き換え例（入管庁・文化庁）、
 *   雇用管理に役立つ多言語用語集（厚労省。9言語の公式の訳つき）、法令用語日英標準対訳辞書（法務省。英訳）
 * - 場面の語・電話の言い回しで、公的な用語集に無いもの: Claude の下書き（作り手が確かめるまで draft）
 *
 * ここは、文の中から用語集の語を見つける（長い語を先に、重ならないように）。画面とテストで使う。
 */

export type GlossSourceId =
  | "plain-japanese-rewrites"
  | "mhlw-tagengo-yougo"
  | "jlt-standard-dict"
  | "draft";

export interface GlossEntry {
  /** 訳の表を引く鍵 */
  id: string;
  term: string;
  /** ひらがなの読み */
  reading?: string;
  /** やさしい日本語の説明（法令用語の対訳辞書には無い） */
  easy?: string;
  /** 標準の英訳（法令用語の対訳辞書だけ） */
  en?: string;
  source: GlossSourceId;
  /** 電話・窓口の決まった言い方（「折り返し」「少々お待ちください」など） */
  phrase?: boolean;
  /** 同じ語の別の書き方（見つけるときに使う） */
  alt?: string[];
  /** 下書き: 作り手が確かめたか */
  status?: "draft" | "reviewed";
}

export interface GlossSource {
  id: GlossSourceId;
  name: string;
  url: string;
  license: string;
  attribution: string;
}

export interface GlossCore {
  sources: GlossSource[];
  entries: GlossEntry[];
}

/** 訳: id → [語の訳, 説明の訳, 誰の訳（o: 公式の用語集、c: Claude）] */
export type GlossTr = Record<string, [string, string, "o" | "c"]>;

export interface GlossMatch {
  start: number;
  end: number;
  id: string;
}

export interface GlossIndex {
  byId: Map<string, GlossEntry>;
  /** 最初の字 → [書き方, id]（長い順） */
  byFirst: Map<string, [string, string][]>;
}

export function buildIndex(entries: GlossEntry[]): GlossIndex {
  const byId = new Map<string, GlossEntry>();
  const byFirst = new Map<string, [string, string][]>();
  for (const e of entries) {
    byId.set(e.id, e);
    for (const form of [e.term, ...(e.alt ?? [])]) {
      if (form.length < 2) continue;
      const k = form[0]!;
      const list = byFirst.get(k) ?? [];
      list.push([form, e.id]);
      byFirst.set(k, list);
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => b[0].length - a[0].length);
  return { byId, byFirst };
}

/** 文の中の用語集の語（左から、長い語を先に、重ならないように） */
export function findTerms(text: string, index: GlossIndex): GlossMatch[] {
  const out: GlossMatch[] = [];
  let i = 0;
  while (i < text.length) {
    const cands = index.byFirst.get(text[i]!);
    const hit = cands?.find(([form]) => text.startsWith(form, i));
    if (hit) {
      out.push({ start: i, end: i + hit[0].length, id: hit[1] });
      i += hit[0].length;
    } else {
      i += 1;
    }
  }
  return out;
}

/** 文を、用語集の語とそれ以外に分ける（画面で語に下線を引く） */
export function splitByTerms(text: string, index: GlossIndex): { text: string; id?: string }[] {
  const parts: { text: string; id?: string }[] = [];
  let at = 0;
  for (const m of findTerms(text, index)) {
    if (m.start > at) parts.push({ text: text.slice(at, m.start) });
    parts.push({ text: text.slice(m.start, m.end), id: m.id });
    at = m.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** いくつかの文に出てくる語（出てきた順、重ねない） */
export function termsIn(texts: string[], index: GlossIndex): GlossEntry[] {
  const seen = new Set<string>();
  const out: GlossEntry[] = [];
  for (const t of texts) {
    for (const m of findTerms(t, index)) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const e = index.byId.get(m.id);
      if (e) out.push(e);
    }
  }
  return out;
}
