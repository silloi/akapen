/**
 * 用語集（data/glossary/）を作る。練習の画面で語をタップすると意味が出る、赤ペン・カンペの「ことば」の元。
 *
 *   vpx scripts/build-glossary.ts <yasashii-refs のディレクトリ> [--draft] [--i18n] [--langs en,vi]
 *
 * 1. 公的な用語集（yasashii-refs の data/。どれも出典を書けば再配布できる）
 *    - plain-japanese-rewrites: 在留支援のためのやさしい日本語ガイドライン 別冊「書き換え例」（やさしい日本語の意味）
 *    - mhlw-tagengo-yougo: 雇用管理に役立つ多言語用語集（やさしい日本語の説明と、9言語の公式の訳）
 *    - jlt-standard-dict: 法令用語日英標準対訳辞書（標準の英訳）。場面・評価の会話に出てくる3字以上の語だけ
 * 2. --draft: 場面の keyterms と電話・窓口の言い回しのうち、公的な用語集に無いものを、Claude が
 *    やさしい日本語で説明する（下書き。drafts.json に残し、作り手が確かめたら status を reviewed にする）。
 *    架空の店・人・地名、だれでも知っている語は外す。
 * 3. --i18n: 公式の訳が無いもの（書き換え例・下書き・対訳辞書）を、Claude が9言語に訳す（無いものだけ）。
 *
 * 出力: data/glossary/core.json（語・読み・やさしい日本語の説明・出典）、data/glossary/<言語>.json（訳）、
 *       data/glossary/drafts.json（下書きの記録）、data/glossary/meta.json（出典・件数）
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import plain from "../data/plain-japanese.json" with { type: "json" };
import { callJson } from "../shared/claude.ts";
import type { GlossCore, GlossEntry, GlossSource, GlossTr } from "../shared/glossary.ts";
import { SCENES } from "../shared/scenes.ts";
import { SAMPLE_TURNS } from "../src/lib/sample.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    draft: { type: "boolean", default: false },
    i18n: { type: "boolean", default: false },
    langs: { type: "string" },
  },
});
const refs = positionals[0];
if (!refs) {
  console.error(
    "使い方: vpx scripts/build-glossary.ts <yasashii-refs のディレクトリ> [--draft] [--i18n]",
  );
  process.exit(1);
}
const DATA = join(resolve(refs), "data");
const OUT = resolve(import.meta.dirname, "../data/glossary");
mkdirSync(OUT, { recursive: true });

/** 画面の言語（日本語・やさしい日本語のほか）と、厚労省の用語集の言語の名前 */
const LANGS = ["en", "zh", "vi", "tl", "ne", "id", "pt", "ko", "my"] as const;
type Lang = (typeof LANGS)[number];
const MHLW_LANG: Record<Lang, string> = {
  en: "en",
  zh: "zh-Hans",
  vi: "vi",
  tl: "tl",
  ne: "ne",
  id: "id",
  pt: "pt",
  ko: "ko",
  my: "my",
};
const LANG_NAME: Record<Lang, string> = {
  en: "英語",
  zh: "中国語（簡体字）",
  vi: "ベトナム語",
  tl: "フィリピノ語（タガログ語）",
  ne: "ネパール語",
  id: "インドネシア語",
  pt: "ポルトガル語（ブラジル）",
  ko: "韓国語",
  my: "ミャンマー語",
};

function readJsonl<T>(name: string): T[] {
  return readFileSync(join(DATA, `${name}.jsonl`), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}
function readMeta(name: string) {
  return JSON.parse(readFileSync(join(DATA, `${name}.meta.json`), "utf8")) as {
    name: string;
    version: string;
    url: string;
    license: string;
    attribution: string;
  };
}
const readOut = <T>(name: string, empty: T): T =>
  existsSync(join(OUT, name)) ? (JSON.parse(readFileSync(join(OUT, name), "utf8")) as T) : empty;
const writeOut = (name: string, data: unknown) =>
  writeFileSync(join(OUT, name), `${JSON.stringify(data, null, 1)}\n`);

/** 「選考試験（せんこうしけん）」のような、漢字の後ろの読みがなを外す */
const stripFurigana = (s: string) => s.replace(/（[ぁ-んー]+）/g, "");
const KANJI = /[一-鿿々]/;

// ---- 1. 公的な用語集 ----
const entries: GlossEntry[] = [];
const official = new Map<Lang, GlossTr>(LANGS.map((l) => [l, {}]));

for (const r of readJsonl<{ no: number; term: string; reading?: string; plain: string }>(
  "plain-japanese-rewrites",
)) {
  entries.push({
    id: `pj${r.no}`,
    term: r.term,
    reading: r.reading,
    easy: r.plain.replace(/\(No\.\d+\)/g, ""),
    source: "plain-japanese-rewrites",
  });
}

type MhlwTr = { term?: string; definition?: string };
for (const r of readJsonl<{
  no: number;
  term: string;
  reading?: string;
  ja_easy?: { definition?: string };
  tr?: Record<string, MhlwTr>;
}>("mhlw-tagengo-yougo")) {
  const easy = r.ja_easy?.definition ? stripFurigana(r.ja_easy.definition) : undefined;
  if (!easy) continue;
  // 書き換え例と同じ語は、書き換え例を先にする（やさしい日本語の手本）。訳だけ厚労省のものを使う
  const same = entries.find((e) => e.term === r.term);
  const id = same?.id ?? `mh${r.no}`;
  if (!same) {
    entries.push({ id, term: r.term, reading: r.reading, easy, source: "mhlw-tagengo-yougo" });
  }
  for (const l of LANGS) {
    const t = r.tr?.[MHLW_LANG[l]];
    if (t?.term && t.definition && !same) official.get(l)![id] = [t.term, t.definition, "o"];
  }
}

// 対訳辞書は、場面・評価・見本の会話に出てくる語だけ（3字以上・漢字を含む・ひらがなで始まらない）
const corpus = [
  ...SCENES.flatMap((s) => [
    s.title,
    s.summary,
    s.opening,
    s.goal,
    ...s.asks.flatMap((a) => [a.label, a.example]),
    ...s.twists,
    ...s.notes,
  ]),
  ...SAMPLE_TURNS.map((t) => t.text),
  ...readdirSync("eval/cases")
    .filter((f) => f.endsWith(".json"))
    .flatMap(
      (f) =>
        (JSON.parse(readFileSync(join("eval/cases", f), "utf8")) as { turns: { text: string }[] })
          .turns,
    )
    .map((t) => t.text),
].join("\n");
const known = new Set(entries.map((e) => e.term));
/** 対訳辞書の語でも、ふつうの語で説明が役に立たないもの */
const JLT_SKIP = new Set([
  "外国人",
  "国の機関",
  "市町村",
  "自動車",
  "職業安定",
  "利用者",
  "申込み",
  "証明書",
]);
for (const r of readJsonl<{ term: string; reading?: string; translations: { en: string }[] }>(
  "jlt-standard-dict",
)) {
  if (r.term.length < 3 || !KANJI.test(r.term) || /^[ぁ-ん及又並若]/.test(r.term)) continue;
  if (known.has(r.term) || JLT_SKIP.has(r.term) || !corpus.includes(r.term)) continue;
  known.add(r.term);
  entries.push({
    id: `jl${r.term}`,
    term: r.term,
    reading: r.reading,
    en: r.translations
      .slice(0, 2)
      .map((t) => t.en)
      .join("; "),
    source: "jlt-standard-dict",
  });
}

// ---- 2. 場面の語・電話の言い回し（下書き） ----
/** 電話・窓口で受付の人がよく使う言い方（相手役の指示と、評価・見本の会話から） */
const PHRASES = [
  "少々お待ちください",
  "お待たせいたしました",
  "恐れ入りますが",
  "かしこまりました",
  "承知いたしました",
  "承ります",
  "折り返し",
  "お掛け直しください",
  "席を外しております",
  "あいにく",
  "申し訳ございません",
  "お手数ですが",
  "差し支えなければ",
  "ご用件",
  "復唱",
  "念のため",
  "よろしいでしょうか",
  "お伺いします",
  "失礼いたします",
  "お越しください",
  "お持ちください",
  "ご記入ください",
  "ご本人様",
  "フルネーム",
  "日中つながる",
  "ご連絡先",
  "お手元",
  "控え",
  "番号札",
  "窓口",
  "担当の者",
  "伝言",
  "お預かりします",
  "本人確認書類",
  "写し",
  "原本",
  "有効期限",
  "最短",
  "空き",
  "お申し込み",
  "お名前",
  "生年月日",
  "お電話番号",
];

type Draft = {
  skip: boolean;
  reading?: string;
  easy?: string;
  phrase?: boolean;
  alt?: string[];
  scenes: string[];
  status: "draft" | "reviewed";
};
const drafts = readOut<Record<string, Draft>>("drafts.json", {});

const candidates = new Map<string, { scenes: Set<string>; phrase: boolean }>();
for (const s of SCENES) {
  for (const k of s.keyterms ?? []) {
    if (k.includes("〔") || known.has(k)) continue;
    const c = candidates.get(k) ?? { scenes: new Set<string>(), phrase: false };
    c.scenes.add(s.id);
    candidates.set(k, c);
  }
}
for (const p of PHRASES) {
  if (known.has(p)) continue;
  const c = candidates.get(p) ?? { scenes: new Set<string>(), phrase: true };
  c.phrase = true;
  candidates.set(p, c);
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com",
});

const DRAFT_SYSTEM = `あなたは日本語教師です。日本で暮らす外国人が、生活の電話や窓口で聞く語の意味を、やさしい日本語で短く説明します。説明は、アプリで語をタップしたときに出ます。

語ごとに、次を決めてください。
- skip: 説明しない語なら true。
  - 架空の固有名詞（店・会社・学校・病院・駅・町・建物・人・ペットの名前。「みなと市」「さくら町」「かもめタクシー」「山下」など）
  - だれでも知っているやさしい語（「いす」「子ども」「テーブル」など）、色・サイズ・数だけの語
  - 外来語の商品名など、説明しても役に立たない語
- reading: ひらがなの読み（カタカナの語はカタカナのまま）
- easy: やさしい日本語の説明。1〜2文、60字くらいまで。「〜のこと。」「〜という意味です。」の形でよい。
  - 在留支援のためのやさしい日本語ガイドラインに合わせる: 短い文、「です・ます」、むずかしい語は言い換える。
  - 決まった言い方（電話・窓口の言い回し）は、本当の意味と、何をすればよいかを書く（例: 「折り返し」→「あとで、相手からもう一度電話をかけることです。電話を切って、待ちます。」）。
  - 料金・期限・持ち物など、町や会社でちがう細かい決まりは書かない。一般的な意味だけ。
  - 下の場面の説明（notes）にあることは使ってよい。それ以外の事実を足さない。
- phrase: 電話・窓口の決まった言い方なら true（手続き・書類・サービスの名前は false）
- alt: 同じ語の別の書き方（送りがな・ていねいな形。会話の中で見つけるため）。無ければ空。

## 用語集の説明の言い方（別冊「やさしい日本語書き換え例」）
${(plain as { term: string; plain: string }[])
  .slice(0, 40)
  .map((p) => `- ${p.term}: ${p.plain}`)
  .join("\n")}`;

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          skip: { type: "boolean" },
          reading: { type: "string" },
          easy: { type: "string" },
          phrase: { type: "boolean" },
          alt: { type: "array", items: { type: "string" } },
        },
        required: ["term", "skip", "reading", "easy", "phrase", "alt"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

function contextOf(scenes: Set<string>): string {
  return [...scenes]
    .slice(0, 2)
    .map((id) => {
      const s = SCENES.find((x) => x.id === id);
      if (!s) return "";
      return `場面「${s.title}」（相手: ${s.partnerRole}）。notes: ${s.notes.join(" / ")}`;
    })
    .join("\n    ");
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let x = q.shift(); x !== undefined; x = q.shift()) await f(x);
    }),
  );
}
const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

if (values.draft) {
  const todo = [...candidates.keys()].filter((k) => !drafts[k]);
  console.log(`下書き: ${todo.length} 語（候補 ${candidates.size}）`);
  await pool(chunks(todo, 30), 4, async (batch) => {
    const user = batch
      .map((k) => {
        const c = candidates.get(k)!;
        return `- ${k}${c.phrase ? "（電話・窓口の言い回しの候補）" : ""}\n    ${contextOf(c.scenes) || "（電話・窓口でよく聞く言い方）"}`;
      })
      .join("\n");
    const r = await callJson<{
      items: {
        term: string;
        skip: boolean;
        reading: string;
        easy: string;
        phrase: boolean;
        alt: string[];
      }[];
    }>(client, {
      model: "claude-opus-5-5",
      effort: "medium",
      system: DRAFT_SYSTEM,
      messages: [{ role: "user", content: `次の語を、順に答えてください。\n\n${user}` }],
      schema: DRAFT_SCHEMA,
      maxTokens: 16000,
    });
    for (const it of r.data.items) {
      const c = candidates.get(it.term);
      if (!c) continue;
      drafts[it.term] = {
        skip: it.skip,
        ...(it.skip
          ? {}
          : {
              reading: it.reading,
              easy: it.easy,
              phrase: it.phrase || c.phrase,
              alt: it.alt.filter((a) => a && a !== it.term),
            }),
        scenes: [...c.scenes],
        status: "draft",
      };
    }
    writeOut("drafts.json", drafts);
    console.log(`  ${Object.keys(drafts).length} 語`);
  });
}

for (const [term, d] of Object.entries(drafts)) {
  if (d.skip || !d.easy || known.has(term)) continue;
  known.add(term);
  entries.push({
    id: `dr${term}`,
    term,
    reading: d.reading,
    easy: d.easy,
    source: "draft",
    ...(d.phrase ? { phrase: true } : {}),
    ...(d.alt?.length ? { alt: d.alt } : {}),
    status: d.status,
  });
}

// ---- 3. 訳 ----
const TR_SYSTEM = `あなたは、日本で暮らす外国人向けのアプリの用語集を訳す翻訳者です。語をタップすると、語の訳と意味が出ます。
- 語（term）は、その言語でふつうに使う言い方に訳す。役所・会社の正式な言い方があればそれにする。訳しにくい語は、短い説明の形でよい。
- 意味（def）は、やさしい日本語の説明を元に、短く自然に訳す。英訳（en）があれば参考にする。
- 固有名・数字・記号はそのまま。id は変えない。`;
const TR_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, term: { type: "string" }, def: { type: "string" } },
        required: ["id", "term", "def"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const targetLangs = (values.langs ? values.langs.split(",") : LANGS) as Lang[];
await Promise.all(
  LANGS.map(async (l) => {
    const prev = readOut<GlossTr>(`${l}.json`, {});
    const tr: GlossTr = { ...official.get(l)! };
    // Claude の訳は、今もある語のものだけ残す
    for (const [id, v] of Object.entries(prev)) if (v[2] === "c" && !tr[id]) tr[id] = v;
    const need = entries.filter((e) => !tr[e.id]);
    if (values.i18n && targetLangs.includes(l) && need.length) {
      console.log(`訳 ${l}: ${need.length} 語`);
      await pool(chunks(need, 80), 3, async (batch) => {
        const user = batch
          .map(
            (e) =>
              `- id: ${e.id}\n  term: ${e.term}${e.reading ? `（${e.reading}）` : ""}\n  easy: ${e.easy ?? ""}${e.en ? `\n  en: ${e.en}` : ""}`,
          )
          .join("\n");
        const r = await callJson<{ items: { id: string; term: string; def: string }[] }>(client, {
          model: "claude-opus-5-5",
          effort: "low",
          system: TR_SYSTEM,
          messages: [{ role: "user", content: `${LANG_NAME[l]}に訳してください。\n\n${user}` }],
          schema: TR_SCHEMA,
          maxTokens: 32000,
        });
        const ids = new Set(batch.map((e) => e.id));
        for (const it of r.data.items) if (ids.has(it.id)) tr[it.id] = [it.term, it.def, "c"];
        writeOut(`${l}.json`, tr);
      });
    }
    writeOut(`${l}.json`, tr);
    console.log(`${l}: ${Object.keys(tr).length} / ${entries.length}`);
  }),
);

// ---- 出力 ----
const SRC_IDS = ["plain-japanese-rewrites", "mhlw-tagengo-yougo", "jlt-standard-dict"] as const;
const sources: GlossSource[] = [
  ...SRC_IDS.map((id) => {
    const m = readMeta(id);
    return { id, name: m.name, url: m.url, license: m.license, attribution: m.attribution };
  }),
  {
    id: "draft",
    name: "Claude の下書き（日本語教師がまだ確かめていない）",
    url: "",
    license: "",
    attribution: "場面の語と電話の言い回しの説明は、Claude が下書きしたもの",
  },
];
const core: GlossCore = { sources, entries };
writeOut("core.json", core);
const counts = Object.fromEntries(
  [...SRC_IDS, "draft"].map((id) => [id, entries.filter((e) => e.source === id).length]),
);
writeOut("meta.json", {
  note: "yasashii-refs（https://github.com/silloi/yasashii-refs）の公的な用語集を加工し、場面の語と電話の言い回しの説明（Claude の下書き）を足したもの。訳は、厚生労働省の用語集の語は公式の訳、ほかは Claude の訳。scripts/build-glossary.ts",
  sources: sources.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    license: s.license,
    attribution: s.attribution,
  })),
  counts,
  generated: new Date().toISOString().slice(0, 10),
});
console.log(`${entries.length} 語`, counts);
