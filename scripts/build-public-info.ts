/**
 * 場面ごとの「関係する公的な情報・手続き」（data/public-info.json）を作る。カンペの画面の下に出す。
 *
 *   vpx scripts/build-public-info.ts <yasashii-refs のディレクトリ> [--i18n]
 *
 * - リンク先は yasashii-refs の目録（catalog/）にある公的なページだけ（正式な配布ページで、確かめた日つき）。
 *   Claude にリンクを作らせない。名前・発行元・URL・言語は目録のまま。
 * - どの場面にどのページを出すかは、下の RULES（場面の文に出てくる語 → ページと「生活・就労ガイドブック」の章）。
 *   Claude Code が決めた。作り手が確かめる（docs/public-info.md）。
 * - 説明（desc）は、目録の本文を元に Claude Code がやさしい日本語で書いた。--i18n で、名前と説明を Claude が9言語に訳す。
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { callJson } from "../shared/claude.ts";
import type { PublicInfoData, PublicResource } from "../shared/public-info.ts";
import { SCENES } from "../shared/scenes.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { i18n: { type: "boolean", default: false }, langs: { type: "string" } },
});
const refs = positionals[0];
if (!refs) {
  console.error("使い方: vpx scripts/build-public-info.ts <yasashii-refs のディレクトリ> [--i18n]");
  process.exit(1);
}
const CATALOG = join(resolve(refs), "catalog");
const OUT = resolve(import.meta.dirname, "../data/public-info.json");

/** 目録の前付け（YAML の1行の値だけ読む） */
function front(path: string): Record<string, string> {
  const text = readFileSync(join(CATALOG, `${path}.md`), "utf8");
  const fm = text.split("---")[1] ?? "";
  return Object.fromEntries(
    fm
      .split("\n")
      .map((l) => /^([a-z_]+):\s*(.*?)\s*(#.*)?$/.exec(l))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
}
const list = (v = "") =>
  v
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** 出すページと、やさしい日本語の説明（目録の本文から） */
const RESOURCES: { path: string; desc: string; label?: string }[] = [
  {
    path: "life-info/life-work-guidebook",
    desc: "日本で生活するときと働くときの、基本の情報のガイドブックです。章ごとに分かれています。",
  },
  {
    path: "life-info/soumu-foreign-resident-register",
    desc: "引っこしたときの住所の届け出や、住民票のことが、いろいろなことばで書いてあります。",
  },
  {
    path: "life-info/digital-mynumber",
    desc: "マイナンバー（個人番号）とマイナンバーカードの説明です。",
  },
  {
    path: "life-info/jlis-mynumber-card",
    desc: "マイナンバーカードの作り方や使い方のサイトです。",
  },
  {
    path: "life-info/jps-foreign-residents",
    desc: "年金の説明が、やさしい日本語と、いろいろなことばであります。",
  },
  {
    path: "life-info/soumu-inhabitant-tax-foreigners",
    desc: "住民税（住んでいるまちに払う税金）の説明です。",
  },
  { path: "life-info/nta-english", desc: "国の税金（所得税など）の、英語の説明です。" },
  {
    path: "life-info/mlit-heya-sagashi",
    desc: "部屋をさがすときと、部屋を借りるときのガイドブックです。いろいろなことばであります。",
  },
  {
    path: "life-info/mlit-chintai-guideline",
    desc: "部屋を借りるときの契約書などの見本が、いろいろなことばであります。",
  },
  {
    path: "life-info/fsa-bank-account-guide",
    desc: "銀行の口座の作り方・使い方と、海外へお金を送るときの注意です。",
  },
  { path: "life-info/npa-traffic-foreign", desc: "日本の交通のルールと、運転免許の案内です。" },
  {
    path: "life-info/mlit-jibaiseki-portal",
    desc: "車やバイクに必ず入る保険（自賠責保険）の説明です。",
  },
  {
    path: "life-info/cfa-boshi-techou-multilingual",
    desc: "母子健康手帳（子どもが生まれる前からもらう手帳）の、いろいろなことばの版です。",
  },
  {
    path: "life-info/mext-shugaku-guidebook",
    desc: "子どもが日本の学校に入るときの手続きと、学校の生活のガイドブックです。",
  },
  {
    path: "life-info/casta-net",
    desc: "学校からのお知らせの文書などを、いろいろなことばでさがせます。",
  },
  {
    path: "life-info/hellowork-foreign-language",
    desc: "通訳がいるハローワークと、外国語で相談できる電話の案内です。",
  },
  {
    path: "life-info/mhlw-model-labor-conditions-notice",
    desc: "働く条件（給料・時間など）を書く紙の見本が、いろいろなことばであります。",
  },
  {
    path: "life-info/mhlw-foreign-worker-consultation",
    desc: "仕事で困ったときに、自分のことばで相談できる電話の案内です。",
  },
  { path: "levels/tsunahiro", desc: "生活の場面の日本語を、動画で勉強できるサイトです。" },
  {
    path: "life-info/isa-ichigen-soudan",
    label: "外国人のための相談窓口の一覧（都道府県・市区町村）",
    desc: "住んでいるまちの、外国人のための相談窓口の一覧です。困ったときに、いろいろなことばで相談できます。",
  },
];

/** 生活・就労ガイドブックの章 */
const CHAPTERS: Record<number, string> = {
  1: "入国・在留手続",
  2: "市区町村での手続",
  3: "雇用・労働",
  4: "出産・子育て",
  5: "教育",
  6: "医療",
  7: "年金・福祉",
  8: "税金",
  9: "交通",
  10: "緊急・災害",
  11: "住居",
  12: "日常生活のルール・習慣",
};

/** 場面の文（名前・一言・相手の言い方・notes・語）に出てくる語 → ページと章 */
const RULES: { re: RegExp; ids: string[]; ch: number[] }[] = [
  // 「転居届」は郵便局の届けもあるので、市役所の手続きは転入・転出・住民票で見る
  { re: /転入|転出|住民票|住民基本台帳|世帯主/, ids: ["soumu-foreign-resident-register"], ch: [2] },
  { re: /マイナンバー/, ids: ["digital-mynumber", "jlis-mynumber-card"], ch: [2] },
  { re: /印鑑登録/, ids: [], ch: [2] },
  { re: /国民健康保険|保険年金課|資格喪失/, ids: [], ch: [6, 7] },
  { re: /年金/, ids: ["jps-foreign-residents"], ch: [7] },
  { re: /住民税|税務課|納付書/, ids: ["soumu-inhabitant-tax-foreigners", "nta-english"], ch: [8] },
  {
    re: /不動産|賃貸|入居|内見|敷金|礼金|大家|保証会社|管理会社/,
    ids: ["mlit-heya-sagashi", "mlit-chintai-guideline"],
    ch: [11],
  },
  { re: /ガス|開栓|光回線|プロバイダー|開通工事/, ids: [], ch: [11] },
  { re: /粗大ごみ|クリーンセンター|家電リサイクル/, ids: [], ch: [12] },
  { re: /送金|口座を開|口座の開設|銀行口座/, ids: ["fsa-bank-account-guide"], ch: [12] },
  { re: /運転免許|免許更新|自動車学校|教習/, ids: ["npa-traffic-foreign"], ch: [9] },
  {
    re: /自賠責|任意保険|損害保険/,
    ids: ["mlit-jibaiseki-portal", "npa-traffic-foreign"],
    ch: [9],
  },
  { re: /タクシー|乗車券|特急|鉄道/, ids: [], ch: [9] },
  {
    re: /母子健康手帳|妊婦|乳幼児健診|予防接種/,
    ids: ["cfa-boshi-techou-multilingual"],
    ch: [4, 6],
  },
  { re: /出生届/, ids: [], ch: [1, 4] },
  { re: /保育園|保育所|保育課|入園/, ids: [], ch: [4] },
  {
    re: /小学校|中学校|就学|教育委員会|特別支援|給食費|日本語学級/,
    ids: ["mext-shugaku-guidebook", "casta-net"],
    ch: [5],
  },
  {
    re: /公共職業安定所|ハローワーク|求人|求職|資格外活動|雇用形態/,
    ids: [
      "hellowork-foreign-language",
      "mhlw-model-labor-conditions-notice",
      "mhlw-foreign-worker-consultation",
    ],
    ch: [3],
  },
  { re: /在留資格|入管|在留期間/, ids: [], ch: [1] },
  { re: /(?<!動物)病院|クリニック|内科|初診|問診票|診察/, ids: [], ch: [6] },
  { re: /日本語教室|国際交流協会/, ids: ["tsunahiro"], ch: [] },
  { re: /犬の登録|狂犬病|鑑札/, ids: [], ch: [12] },
];

const resources: PublicResource[] = RESOURCES.map(({ path, desc, label }) => {
  const f = front(path);
  return {
    id: f.id ?? path.split("/").pop()!,
    name: f.name ?? "",
    publisher: f.publisher ?? "",
    url: f.url ?? "",
    languages: list(f.languages),
    checked: f.checked ?? "",
    desc,
    ...(label ? { label } : {}),
  };
});
for (const r of resources) {
  if (!r.url.startsWith("https://")) throw new Error(`URL が https でない: ${r.id} ${r.url}`);
}

const scenes: PublicInfoData["scenes"] = {};
for (const s of SCENES) {
  const text = [
    s.title,
    s.summary,
    s.goal,
    ...s.notes,
    ...s.asks.flatMap((a) => [a.label, a.example]),
    ...(s.keyterms ?? []),
  ].join("\n");
  const ids: string[] = [];
  const ch = new Set<number>();
  for (const r of RULES) {
    if (!r.re.test(text)) continue;
    for (const id of r.ids) if (!ids.includes(id)) ids.push(id);
    for (const c of r.ch) ch.add(c);
  }
  // どの場面にも: ガイドブック（関係する章）と、困ったときの相談窓口
  scenes[s.id] = {
    ids: ["life-work-guidebook", ...ids, "isa-ichigen-soudan"],
    chapters: [...ch].sort((a, b) => a - b),
  };
}

// ---- 訳（名前と説明） ----
const prev: PublicInfoData | null = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, "utf8")) as PublicInfoData)
  : null;
const LANGS = ["en", "zh", "zh-TW", "vi", "tl", "ne", "id", "pt", "ko", "my", "easy"] as const;
const LANG_NAME: Record<(typeof LANGS)[number], string> = {
  en: "英語",
  zh: "中国語（簡体字）",
  "zh-TW":
    "中国語の正體字（繁體字）。臺灣でふつうに使う語彙・言い方で（簡体字や中国大陸の語彙を使わない）",
  vi: "ベトナム語",
  tl: "フィリピノ語（タガログ語）",
  ne: "ネパール語",
  id: "インドネシア語",
  pt: "ポルトガル語（ブラジル）",
  ko: "韓国語",
  my: "ミャンマー語",
  easy: "やさしい日本語（名前だけ、やさしく言い換える。説明はそのまま写す）",
};
const tr: PublicInfoData["tr"] = prev?.tr ?? {};
const chapterTr: PublicInfoData["chapterTr"] = prev?.chapterTr ?? {};
if (values.i18n) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
    baseURL: "https://api.anthropic.com",
  });
  const SCHEMA = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            desc: { type: "string" },
          },
          required: ["id", "name", "desc"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  } as const;
  const only = values.langs ? values.langs.split(",") : null;
  await Promise.all(
    LANGS.filter((l) => !only || only.includes(l)).map(async (l) => {
      const items = [
        ...resources.map((r) => ({ id: r.id, name: r.label ?? r.name, desc: r.desc })),
        ...Object.entries(CHAPTERS).map(([n, name]) => ({ id: `ch${n}`, name, desc: "" })),
      ];
      const r = await callJson<{ items: { id: string; name: string; desc: string }[] }>(client, {
        model: "claude-opus-5-5",
        effort: "low",
        system: `日本で暮らす外国人向けのアプリで、国などの公的なページの名前と説明を訳します。名前は、その言語で分かる短い言い方にする（正式な名前があればそれ）。説明は、やさしい日本語の文を元に、短く自然に訳す。id は変えない。説明が空なら空のまま。`,
        messages: [
          {
            role: "user",
            content: `${LANG_NAME[l]}に訳してください。\n\n${items.map((x) => `- id: ${x.id}\n  name: ${x.name}\n  desc: ${x.desc}`).join("\n")}`,
          },
        ],
        schema: SCHEMA,
        maxTokens: 16000,
      });
      tr[l] = {};
      chapterTr[l] = {};
      for (const it of r.data.items) {
        if (it.id.startsWith("ch")) chapterTr[l]![Number(it.id.slice(2))] = it.name;
        else tr[l]![it.id] = { name: it.name, desc: it.desc };
      }
      console.log(`訳 ${l}: ${Object.keys(tr[l]!).length}`);
    }),
  );
}

const data: PublicInfoData = {
  note: "リンク先は yasashii-refs（https://github.com/silloi/yasashii-refs）の目録にある公的なページ。場面との対応と説明は Claude Code が作った（scripts/build-public-info.ts）。名前と説明の訳は Claude。",
  resources,
  chapters: CHAPTERS,
  scenes,
  tr,
  chapterTr,
};
writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
const counts = Object.values(scenes).map((x) => x.ids.length);
console.log(
  `ページ ${resources.length}、場面 ${Object.keys(scenes).length}（1場面あたり ${Math.min(...counts)}〜${Math.max(...counts)}）`,
);
