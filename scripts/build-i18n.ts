/**
 * 画面の言葉（src/lib/i18n.ts の JA）と、場面の名前・一言を、2段階で多言語にする。
 *
 *   1. やさしい日本語に書き換える（出入国在留管理庁・文化庁のガイドラインの決まりと、
 *      別冊「やさしい日本語書き換え例」の用語集 data/plain-japanese.json を手がかりに）
 *   2. やさしい日本語を元に、第1群の9言語に訳す（元の日本語も参考として渡す）
 *
 * やさしい日本語を先にするのは、行政語・敬語・長い文を先にほどいておくと、どの言語にも同じ意味で訳せるから。
 * やさしい日本語そのものも、画面の言語の1つ（easy）として使う。
 *
 *   ANTHROPIC_API_KEY=... vpx scripts/build-i18n.ts [--langs en,vi] [--ui] [--scenes] [--force]
 *
 * 出力: data/ui.i18n.json（{lang: {key: text}}。easy を含む）、
 *       data/scenes.i18n.json（{lang: {sceneId: {title, summary, asks: {askKey: 見出しの訳}}}}。
 *       asks は「本番で聞かれること」の見出し。練習の画面で、聞かれる順に見せる）
 * 既にある訳は残し、無い鍵・無い場面だけ足す（--force で全部作り直す）。
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import plain from "../data/plain-japanese.json" with { type: "json" };
import { callJson } from "../shared/claude.ts";
import { SCENES } from "../shared/scenes.ts";
import { JA, UI_LANGS, type UiLang } from "../src/lib/i18n.ts";

const { values } = parseArgs({
  options: {
    langs: { type: "string" },
    ui: { type: "boolean", default: false },
    scenes: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});
const doUi = values.ui || !values.scenes;
const doScenes = values.scenes || !values.ui;
const TARGET_LANGS = (
  values.langs
    ? values.langs.split(",")
    : Object.keys(UI_LANGS).filter((l) => l !== "ja" && l !== "easy")
) as UiLang[];

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com",
});

const UI_OUT = "data/ui.i18n.json";
const SC_OUT = "data/scenes.i18n.json";
const load = (p: string) =>
  existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, Record<string, unknown>>)
    : {};

const APP = `アプリ: 日本で暮らす外国人が、生活の電話や窓口の会話を、本番の前に AI の相手役と予行演習し、伝わらなかった所に日本語教師の「赤ペン」を入れ、本番で見る「カンペ」（メモ）を作る。`;

/** 出入国在留管理庁・文化庁「在留支援のためのやさしい日本語ガイドライン」の決まり（要点） */
const EASY_SYSTEM = `あなたは、日本で暮らす外国人向けのアプリの画面の言葉を「やさしい日本語」に書き換える人です。
${APP}

## やさしい日本語の決まり（在留支援のためのやさしい日本語ガイドライン）
- 一文を短くする。一文に一つのことだけ。
- 「です・ます」で書く。尊敬語・謙譲語は使わない。
- むずかしい語（行政の語・漢語・外来語）は、やさしい語に言い換えるか、説明を足す。用語集にある語は、その説明の言い方にそろえる。
- 二重否定、受け身、あいまいな言い方（「〜など」「〜場合がある」）はさける。
- 漢字は少なく。数字はアラビア数字。
- 大切なことを先に書く。

## 変えないもの
- 「赤ペン」「カンペ」「生活Can do」「Claude」「QR」「URL」「110番」「119番」はそのまま（「赤ペン」は、先生が直すときに入れる赤い書き込み。「カンペ」は、本番で見るメモ）。
- 「〔 〕」「○」「△」「→」「…」などの記号はそのまま。
- 鍵（key）や id は変えない。
- 画面のボタンの言葉は短いまま。

## 用語集（別冊「やさしい日本語書き換え例」。語 → やさしい意味）
${(plain as { term: string; plain: string }[]).map((p) => `- ${p.term}: ${p.plain}`).join("\n")}`;

const TRANSLATE_SYSTEM = `あなたは、日本で暮らす外国人向けのアプリの画面を訳す翻訳者です。
${APP}
- **やさしい日本語**の文を元に訳す。元の日本語は、意味を確かめるための参考。
- その言語でふだん使う自然で短い言い方にする。画面のボタンは短く。
- 「赤ペン」は、先生が作文に入れる赤い書き込みのこと。その言語で通じる言い方にする（必要なら「赤ペン（先生の直し）」のように補う）。「カンペ」は、本番で手元に置くメモ。
- 「生活Can do」「Claude」「QR」「URL」「110番・119番」などの固有名・数字はそのまま。
- 「〔 〕」「○」「△」「→」などの記号はそのまま残す。
- 鍵（key）や id は変えない。`;

// 鍵ごとの property にすると文法が大きすぎると断られるので、{key, text} の配列で受ける
const PAIRS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, text: { type: "string" } },
        required: ["key", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;
const SCENE_PAIRS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
        },
        required: ["id", "title", "summary"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

type Pairs = { items: { key: string; text: string }[] };
type ScenePairs = { items: { id: string; title: string; summary: string }[] };
type SceneText = {
  title: string;
  summary: string;
  asks?: Record<string, string>;
  info?: Record<string, string>;
};

/** 「本番で聞かれること」の見出しを {sceneId/askKey: 見出し} の形に（鍵の配列として訳すため） */
const askKeyOf = (sceneId: string, askKey: string) => `${sceneId}/${askKey}`;
function missingAsks(have: Record<string, SceneText>): Record<string, string> {
  const src: Record<string, string> = {};
  for (const s of SCENES)
    for (const a of s.asks)
      if (values.force || !have[s.id]?.asks?.[a.key]) src[askKeyOf(s.id, a.key)] = a.label;
  return src;
}
/** 練習用の情報（practiceInfo）の見出しを {sceneId|見出し: 見出し} の形に */
const infoKeyOf = (sceneId: string, label: string) => `${sceneId}|${label}`;
function missingInfo(have: Record<string, SceneText>): Record<string, string> {
  const src: Record<string, string> = {};
  for (const s of SCENES)
    for (const i of s.practiceInfo)
      if (values.force || !have[s.id]?.info?.[i.label]) src[infoKeyOf(s.id, i.label)] = i.label;
  return src;
}
function putInfo(out: Record<string, SceneText>, got: Record<string, string>): void {
  for (const [k, text] of Object.entries(got)) {
    const at = k.indexOf("|");
    if (at < 0) continue;
    const sceneId = k.slice(0, at);
    const label = k.slice(at + 1);
    const s = SCENES.find((x) => x.id === sceneId);
    if (!s || !label) continue;
    out[sceneId] ??= { title: s.title, summary: s.summary };
    out[sceneId].info ??= {};
    out[sceneId].info[label] = text;
  }
}
function putAsks(out: Record<string, SceneText>, got: Record<string, string>): void {
  for (const [k, text] of Object.entries(got)) {
    const [sceneId, askKey] = k.split("/");
    if (!sceneId || !askKey) continue;
    const s = SCENES.find((x) => x.id === sceneId);
    out[sceneId] ??= { title: s?.title ?? sceneId, summary: s?.summary ?? "" };
    out[sceneId].asks ??= {};
    out[sceneId].asks[askKey] = text;
  }
}

async function askPairs(
  system: string,
  user: string,
  keys: string[],
): Promise<Record<string, string>> {
  const r = await callJson<Pairs>(client, {
    model: "claude-opus-5-5",
    effort: "low",
    system,
    messages: [{ role: "user", content: user }],
    schema: PAIRS_SCHEMA,
    maxTokens: 16000,
  });
  const got = Object.fromEntries(
    r.data.items.filter((x) => keys.includes(x.key)).map((x) => [x.key, x.text]),
  );
  const missing = keys.filter((k) => !got[k]);
  if (missing.length) console.log(`  無い鍵 ${missing.length}: ${missing.slice(0, 5).join(", ")}`);
  return got;
}

async function askScenes(
  system: string,
  user: string,
  ids: string[],
): Promise<Record<string, SceneText>> {
  const r = await callJson<ScenePairs>(client, {
    model: "claude-opus-5-5",
    effort: "low",
    system,
    messages: [{ role: "user", content: user }],
    schema: SCENE_PAIRS_SCHEMA,
    maxTokens: 16000,
  });
  const set = new Set(ids);
  return Object.fromEntries(
    r.data.items
      .filter((x) => set.has(x.id))
      .map((x) => [x.id, { title: x.title, summary: x.summary }]),
  );
}

// ───────── 画面の言葉 ─────────
if (doUi) {
  const out = load(UI_OUT);
  const allKeys = Object.keys(JA) as (keyof typeof JA)[];

  // 1. やさしい日本語
  const easy = (out.easy ?? {}) as Record<string, string>;
  const easyKeys = allKeys.filter((k) => values.force || !easy[k]);
  if (easyKeys.length) {
    const src = Object.fromEntries(easyKeys.map((k) => [k, JA[k]]));
    const got = await askPairs(
      EASY_SYSTEM,
      `## 日本語（鍵: 文）\n${JSON.stringify(src, null, 1)}\n\nすべての鍵について、{key, text} の形でやさしい日本語を返してください。`,
      easyKeys,
    );
    out.easy = { ...easy, ...got };
    writeFileSync(UI_OUT, JSON.stringify(out, null, 2) + "\n");
    console.log(`ui easy: ${easyKeys.length} 件`);
  }

  // 2. 各言語（やさしい日本語を元に）
  const easyAll = (out.easy ?? {}) as Record<string, string>;
  for (const l of TARGET_LANGS) {
    const have = (out[l] ?? {}) as Record<string, string>;
    const keys = allKeys.filter((k) => values.force || !have[k]);
    if (keys.length === 0) continue;
    const src = Object.fromEntries(keys.map((k) => [k, { easy: easyAll[k] ?? JA[k], ja: JA[k] }]));
    const got = await askPairs(
      TRANSLATE_SYSTEM,
      `## 言語\n${UI_LANGS[l]}（${l}）\n\n## 鍵: {easy: やさしい日本語, ja: 元の日本語}\n${JSON.stringify(src, null, 1)}\n\nすべての鍵について、{key, text} の形で訳を返してください。`,
      keys,
    );
    out[l] = { ...have, ...got };
    writeFileSync(UI_OUT, JSON.stringify(out, null, 2) + "\n");
    console.log(`ui ${l}: ${keys.length} 件`);
  }
}

// ───────── 場面の名前と一言 ─────────
if (doScenes) {
  const out = load(SC_OUT);

  // 1. やさしい日本語
  const easy = (out.easy ?? {}) as Record<string, SceneText>;
  const targets = SCENES.filter((s) => values.force || !easy[s.id]);
  if (targets.length) {
    const src = Object.fromEntries(
      targets.map((s) => [s.id, { title: s.title, summary: s.summary }]),
    );
    const got = await askScenes(
      EASY_SYSTEM,
      `## 場面の名前（title）と一言（summary）。人物・店・地名は架空\n${JSON.stringify(src, null, 1)}\n\nすべての id について、{id, title, summary} の形でやさしい日本語を返してください。title は短く（画面のカードの題名）。`,
      targets.map((s) => s.id),
    );
    out.easy = { ...easy, ...got };
    writeFileSync(SC_OUT, JSON.stringify(out, null, 2) + "\n");
    console.log(`scenes easy: ${targets.length} 件`);
  }
  // 1b. 「本番で聞かれること」の見出し（やさしい日本語）
  {
    const easyNow = (out.easy ?? {}) as Record<string, SceneText>;
    const src = missingAsks(easyNow);
    const keys = Object.keys(src);
    if (keys.length) {
      const got = await askPairs(
        EASY_SYSTEM,
        `## 「本番で聞かれること」の見出し（鍵: 見出し）。鍵は「場面の id/項目」。見出しは、電話や窓口で相手が聞いてくる項目の名前（名前・住所・用件 など）\n${JSON.stringify(src, null, 1)}\n\nすべての鍵について、{key, text} の形でやさしい日本語の見出しを返してください。見出しは短く（語か、短い句）。`,
        keys,
      );
      putAsks(easyNow, got);
      out.easy = easyNow;
      writeFileSync(SC_OUT, JSON.stringify(out, null, 2) + "\n");
      console.log(`asks easy: ${keys.length} 件`);
    }
  }
  // 1c. 練習用の情報の見出し（やさしい日本語）
  {
    const easyNow = (out.easy ?? {}) as Record<string, SceneText>;
    const src = missingInfo(easyNow);
    const keys = Object.keys(src);
    if (keys.length) {
      const got = await askPairs(
        EASY_SYSTEM,
        `## 練習で使う架空の情報の見出し（鍵: 見出し）。鍵は「場面の id|見出し」。見出しは、本番で言う自分の情報の項目名（名前・住所・子どもの名前 など）\n${JSON.stringify(src, null, 1)}\n\nすべての鍵について、{key, text} の形でやさしい日本語の見出しを返してください。見出しは短く（語か、短い句）。`,
        keys,
      );
      putInfo(easyNow, got);
      out.easy = easyNow;
      writeFileSync(SC_OUT, JSON.stringify(out, null, 2) + "\n");
      console.log(`info easy: ${keys.length} 件`);
    }
  }

  // 2. 各言語（やさしい日本語を元に）
  const easyAll = (out.easy ?? {}) as Record<string, SceneText>;
  for (const l of TARGET_LANGS) {
    const have = (out[l] ?? {}) as Record<string, SceneText>;
    const ts = SCENES.filter((s) => values.force || !have[s.id]);
    if (ts.length === 0) continue;
    const src = Object.fromEntries(
      ts.map((s) => [
        s.id,
        {
          easy: easyAll[s.id] ?? { title: s.title, summary: s.summary },
          ja: { title: s.title, summary: s.summary },
        },
      ]),
    );
    const got = await askScenes(
      TRANSLATE_SYSTEM,
      `## 言語\n${UI_LANGS[l]}（${l}）\n\n## id: {easy: やさしい日本語, ja: 元の日本語}。人物・店・地名は架空\n${JSON.stringify(src, null, 1)}\n\nすべての id について、{id, title, summary} の形で訳を返してください。title は短く。`,
      ts.map((s) => s.id),
    );
    out[l] = { ...have, ...got };
    writeFileSync(SC_OUT, JSON.stringify(out, null, 2) + "\n");
    console.log(`scenes ${l}: ${ts.length} 件`);
  }

  // 2b. 「本番で聞かれること」の見出し（各言語。やさしい日本語を元に）
  const easyAsks = (out.easy ?? {}) as Record<string, SceneText>;
  for (const l of TARGET_LANGS) {
    const have = (out[l] ?? {}) as Record<string, SceneText>;
    const ja = missingAsks(have);
    const keys = Object.keys(ja);
    if (keys.length === 0) continue;
    const src = Object.fromEntries(
      keys.map((k) => {
        const [sceneId, askKey] = k.split("/");
        return [k, { easy: easyAsks[sceneId ?? ""]?.asks?.[askKey ?? ""] ?? ja[k], ja: ja[k] }];
      }),
    );
    const got = await askPairs(
      TRANSLATE_SYSTEM,
      `## 言語\n${UI_LANGS[l]}（${l}）\n\n## 「本番で聞かれること」の見出し。鍵は「場面の id/項目」。鍵: {easy: やさしい日本語, ja: 元の日本語}。電話や窓口で相手が聞いてくる項目の名前（名前・住所・用件 など）\n${JSON.stringify(src, null, 1)}\n\nすべての鍵について、{key, text} の形で訳を返してください。見出しは短く（語か、短い句）。`,
      keys,
    );
    putAsks(have, got);
    out[l] = have;
    writeFileSync(SC_OUT, JSON.stringify(out, null, 2) + "\n");
    console.log(`asks ${l}: ${keys.length} 件`);
  }

  // 2c. 練習用の情報の見出し（各言語。やさしい日本語を元に）
  const easyInfo = (out.easy ?? {}) as Record<string, SceneText>;
  for (const l of TARGET_LANGS) {
    const have = (out[l] ?? {}) as Record<string, SceneText>;
    const ja = missingInfo(have);
    const keys = Object.keys(ja);
    if (keys.length === 0) continue;
    const src = Object.fromEntries(
      keys.map((k) => {
        const at = k.indexOf("|");
        const sceneId = k.slice(0, at);
        const label = k.slice(at + 1);
        return [k, { easy: easyInfo[sceneId]?.info?.[label] ?? ja[k], ja: ja[k] }];
      }),
    );
    const got = await askPairs(
      TRANSLATE_SYSTEM,
      `## 言語\n${UI_LANGS[l]}（${l}）\n\n## 練習で使う架空の情報の見出し。鍵は「場面の id|見出し」。鍵: {easy: やさしい日本語, ja: 元の日本語}。本番で言う自分の情報の項目名（名前・住所・子どもの名前 など）\n${JSON.stringify(src, null, 1)}\n\nすべての鍵について、{key, text} の形で訳を返してください。見出しは短く（語か、短い句）。`,
      keys,
    );
    putInfo(have, got);
    out[l] = have;
    writeFileSync(SC_OUT, JSON.stringify(out, null, 2) + "\n");
    console.log(`info ${l}: ${keys.length} 件`);
  }
}
