/**
 * ふりがな。Furifont（Anthony Fu、https://furifont.antfu.me 、フォントは SIL OFL 1.1）を使う。
 *
 * フォント（public/fonts/furifont/FurifontSansVF.woff2、src/style.css の @font-face）が、
 * 漢字の語に読みを付けた字形（合字）で表示する。文字は変えないので、コピーしても元の日本語のまま。
 * 送りがなの続く漢字（来ます・出し方）は、フォントだけでは読みが決まらないことがあるので、
 * Furifont の表（*.ivs.json・okurigana.json。CC BY-SA 4.0、JMdict など）で読みを選び、
 * その漢字に font-feature-settings: "salt" N をかけて、その読みの字形にする。
 * 読みを選ぶ処理は、Furifont のユーザースクリプト（MIT）の createOkuriganaReader を移したもの。
 *
 * 文脈で読みが変わる語は、まちがうことがある（フォントは前後の文を見られない）。
 */
import { ref } from "vue";

export interface Seg {
  text: string;
  /** その読みの字形にする（無ければフォントのまま） */
  salt?: number;
}

interface IvsData {
  kanji: Record<string, string[]>;
  words: Record<string, string[]>;
  lone: Record<string, string>;
  salt?: boolean;
}
type Pairs = Record<string, Record<string, string[]>>;
interface Found {
  at: number;
  length: number;
  salt: number;
}

const BASE = "/fonts/furifont";
/** 表を読み終えたら true（画面を描き直すため） */
export const furiganaReady = ref(false);
let reader: ((text: string) => Found[]) | null = null;
let loading: Promise<void> | null = null;

function createReader(d: IvsData, pairs: Pairs): (text: string) => Found[] {
  // 漢字の並び（前が漢字でなく、後ろがひらがな）
  const run = new RegExp("(?<!\\p{sc=Han})\\p{sc=Han}+(?=\\p{sc=Hiragana})", "gu");
  const cache = new Map<
    string,
    { reading: Map<string, string | null>; longest: number } | undefined
  >();
  const entry = (han: string) => {
    if (!cache.has(han)) {
      const reading = new Map<string, string | null>();
      for (const [r, okuri] of Object.entries(pairs[han] ?? {}))
        for (const o of okuri) reading.set(o, r || null);
      cache.set(
        han,
        reading.size
          ? { reading, longest: Math.max(...[...reading.keys()].map((k) => k.length)) }
          : undefined,
      );
    }
    return cache.get(han);
  };
  const saltOf = (han: string, reading: string) => {
    // 2字以上の語か（1字目がサロゲートペアの漢字でも数えられるよう、符号位置で見る）
    const multi = han.length > String.fromCodePoint(han.codePointAt(0) ?? 0).length;
    const list = multi
      ? d.words[han]?.map((w) => [...w.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).join(""))
      : d.kanji[han];
    const i = list?.indexOf(reading) ?? -1;
    return i >= +multi && i < 15 && d.lone[han] !== reading ? i + 1 : 0;
  };
  return (text) => {
    const out: Found[] = [];
    for (const m of text.matchAll(run)) {
      const han = m[0];
      const at = m.index ?? 0;
      const e = entry(han);
      const after = text.slice(at + han.length, at + han.length + (e?.longest ?? 0));
      let reading: string | null | undefined;
      for (let n = after.length; n > 0 && reading === undefined; n--)
        reading = e?.reading.get(after.slice(0, n));
      const salt = reading ? saltOf(han, reading) : 0;
      if (reading && salt) out.push({ at, length: han.length, salt });
    }
    return out;
  };
}

/** 送りがなの表を読む（ふりがなを出すときに一度だけ）。読めなくても、フォントだけで出る */
export function loadFurigana(): Promise<void> {
  if (!loading)
    loading = Promise.all([
      fetch(`${BASE}/FurifontSansVF.ivs.json`).then((r) => r.json() as Promise<IvsData>),
      fetch(`${BASE}/okurigana.json`).then((r) => r.json() as Promise<Pairs>),
    ])
      .then(([d, pairs]) => {
        if (d.salt !== true) return;
        reader = createReader(d, pairs);
        furiganaReady.value = true;
      })
      .catch(() => {
        // 古い端末（正規表現の後読みが無いなど）や通信の失敗。フォントだけで出す
        loading = null;
      });
  return loading;
}

/** 文を、読みを選んだ漢字とそれ以外に分ける */
export function furiganaSegments(text: string): Seg[] {
  if (!reader) return [{ text }];
  let found: Found[];
  try {
    found = reader(text);
  } catch {
    return [{ text }];
  }
  const out: Seg[] = [];
  let pos = 0;
  for (const f of found) {
    if (f.at > pos) out.push({ text: text.slice(pos, f.at) });
    out.push({ text: text.slice(f.at, f.at + f.length), salt: f.salt });
    pos = f.at + f.length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
