/**
 * 場面カードを Claude に下書きさせ、別の検査役で確かめて、data/scenes.generated.json に入れる。
 *
 *   ANTHROPIC_API_KEY=... vpx scripts/build-scenes.ts --nos 187,188,191 [--force]
 *   vpx scripts/build-scenes.ts --phone        # 電話の「やり取り」の Can do で、まだ場面が無いもの
 *   vpx scripts/build-scenes.ts --counter      # 窓口（対面）の場面（COUNTER_NOS）
 *
 * 1. 下書き: Can do の文・分類・小分類の「生活・文化・社会的情報」を渡し、手書きの場面カードと同じ型で書かせる
 * 2. 検査: 別の呼び出しが決まった項目で見る（実在の名前・料金・電話番号が無いか、医療の助言が無いか、
 *    聞くことが Can do に合っているか、notes が一般的で断定しすぎていないか、など）。通らなければ指摘を付けて1回だけ書き直す
 * 3. 通ったものを status: "draft" で保存する（作り手が確かめて reviewed にする）
 *
 * 人物・店・地名・電話番号はすべて架空にさせる。安全・生命にかかわる場面（SAFETY_CANDO_NOS）は作らない。
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { allCandos, findCando, findSocialByMinor } from "../shared/cando.ts";
import { callJson } from "../shared/claude.ts";
import { PROMPT_VERSION } from "../shared/prompts.ts";
import { HAND_SCENES, SAFETY_CANDO_NOS } from "../shared/scenes.ts";
import type { CanDo, Scene, SocialInfo } from "../shared/types.ts";

const { values } = parseArgs({
  options: {
    nos: { type: "string" },
    phone: { type: "boolean", default: false },
    counter: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    model: { type: "string", default: "claude-opus-5-5" },
  },
});

const OUT = "data/scenes.generated.json";
/** 窓口（対面）の場面にする Can do（やり取り・A1〜B1・生活の基盤になる小分類から選んだ） */
const COUNTER_NOS: number[] = [
  8, 77, 87, 95, 96, 101, 105, 110, 121, 128, 134, 143, 150, 151, 158, 161, 219, 266, 295, 316, 356,
  380, 563, 566, 569, 577, 639, 732, 735, 746, 763,
];
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com",
});

const existing = JSON.parse(readFileSync(OUT, "utf8")) as Scene[];
const handNos = new Set(HAND_SCENES.map((s) => s.candoNo));

let targets: number[] = [];
if (values.nos) targets = values.nos.split(",").map((n) => Number(n.trim()));
else if (values.phone) {
  targets = allCandos()
    .filter((c) => /電話(で|し|を)|に電話|電話による/.test(c.cando))
    .map((c) => c.no)
    .filter((no) => ![763, 770].includes(no));
}
if (values.counter) targets = COUNTER_NOS;
targets = targets.filter((no) => !handNos.has(no) && !SAFETY_CANDO_NOS.has(no));
if (!values.force) targets = targets.filter((no) => !existing.some((s) => s.candoNo === no));
if (targets.length === 0) {
  console.log("作る場面がありません");
  process.exit(0);
}

const STR = { type: "string" } as const;
const SCENE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      ...STR,
      description: "画面に出す場面の名前（15字まで。例: 粗大ごみの回収を電話で頼む）",
    },
    summary: { ...STR, description: "一言の説明（40字まで）" },
    partnerRole: {
      ...STR,
      description: "相手の役（例: みなと市粗大ごみ受付センターの受付（電話））。組織名は架空",
    },
    opening: { ...STR, description: "相手の最初の一言" },
    asks: {
      type: "array",
      description: "本番で聞かれること（4〜7個、順番どおり）",
      items: {
        type: "object",
        properties: {
          key: { ...STR, description: "英小文字の短い鍵（name, phone など）" },
          label: { ...STR, description: "例: 名前" },
          example: { ...STR, description: "相手の言い方の例（本物の受付が言いそうな形）" },
        },
        required: ["key", "label", "example"],
        additionalProperties: false,
      },
    },
    practiceInfo: {
      type: "array",
      description:
        "練習で使う架空の情報（3〜5個。名前・住所・電話番号は架空で、090-1234-5678 のような形）",
      items: {
        type: "object",
        properties: { label: STR, value: STR },
        required: ["label", "value"],
        additionalProperties: false,
      },
    },
    twists: {
      type: "array",
      description: "本番で起きやすいこと（1〜2個）。相手役が会話に1つ入れる",
      items: STR,
    },
    goal: { ...STR, description: "用件が終わったと言える条件（1文）" },
    limits: { type: "array", description: "相手役がしてはいけないこと（1〜3個）", items: STR },
    socialNos: {
      type: "array",
      description: "渡された生活・文化・社会的情報のうち、この場面に関係する番号（no）",
      items: { type: "integer" },
    },
    notes: {
      type: "array",
      description:
        "カンペに足す、場面に固有の知っておくこと（2〜4個）。日本で広く当てはまる一般的なことだけ。金額・日数・電話番号などの具体的な数字は書かない。「〜ことが多い」「自治体によって違う」のように断定しすぎない",
      items: STR,
    },
    keyterms: {
      type: "array",
      description: "文字起こしに前もって渡す語（6〜12個。場面の語と、練習用の固有名詞）",
      items: STR,
    },
    channel: {
      type: "string",
      enum: ["phone", "counter"],
      description: "電話なら phone、窓口・店で向かい合って話すなら counter",
    },
    office: { type: "boolean", description: "役所・学校・公共の窓口なら true" },
    medical: { type: "boolean", description: "医療機関の受付なら true" },
  },
  required: [
    "title",
    "summary",
    "partnerRole",
    "opening",
    "asks",
    "practiceInfo",
    "twists",
    "goal",
    "limits",
    "socialNos",
    "notes",
    "keyterms",
    "office",
    "medical",
  ],
  additionalProperties: false,
} as const;

type Draft = Omit<Scene, "id" | "candoNo" | "status">;

const DRAFT_SYSTEM = `あなたは、日本で暮らす外国人の生活の日本語を教えてきた日本語教師で、電話の予行演習の「場面カード」を書きます。
場面カードは、相手役（Claude）のふるまいと、本番のカンペの元になります。手で書いた見本と同じ型で書いてください。

## 決まり
- 人物・店・会社・役所・地名・電話番号は**すべて架空**にする（例: みなと市、さくら町、かもめタクシー、リン・メイ、090-1234-5678）。実在の組織名・サービス名・制度の固有名は出さない（法律の名前は可）。
- 相手役は、本物の受付・担当者としてふるまう。学習者に日本語を教えない。
- 医療機関の場面では、相手役は受付として名前・日時・用件だけを聞く。症状について質問を重ねず、医療の助言（薬・病名・緊急度）はしない。limits に必ず書き、急に具合が悪いと言われたら119番か#7119を案内して予約の話をやめる、と書く。medical を true にする。
- 役所・学校・公共の窓口の場面は office を true にする。
- Can do が電話の場面なら channel を phone、窓口・店・学校などで向かい合って話す場面なら counter にする。counter のとき、partnerRole の末尾は（窓口）のようにし、opening は学習者が窓口に来たときの相手の最初の一言にする。相手は学習者の書類や持ち物を見られる。
- asks は、Can do の文に書かれた「聞かれること」を元に、本物の受付が聞く順に。相手の言い方の例は、本物の敬語で。
- practiceInfo は、学習者が自分の本当の情報を言わなくて済むための架空の情報。
- twists は、その場面で本番に起きやすいこと（希望の日が埋まっている、対象外のものがある、書類が足りない、担当が不在で折り返し、など）。
- notes は、カンペの「前もって知っておくこと」になる。日本で広く当てはまる一般的なことだけを、断定しすぎずに書く。金額・日数・時間・電話番号などの具体的な数字は書かない（地域や店で違うため）。制度の説明は、法律で決まっていることだけ。
- 生活・文化・社会的情報が渡されたら、関係するものの番号を socialNos に入れる（無ければ空）。
- 言葉は、やさしすぎなくてよい。本物の場面に合わせる。`;

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    problems: {
      type: "array",
      description: "直すべき点（無ければ空）。どの項目の何が問題かを具体的に",
      items: STR,
    },
  },
  required: ["ok", "problems"],
  additionalProperties: false,
} as const;

const CHECK_SYSTEM = `あなたは、外国人向けの電話の予行演習アプリの場面カードを検査する係です。書いた人とは別の立場で、次の項目を1つずつ確かめ、1つでも外れていれば ok を false にして problems に書きます。

1. 実在の人・店・会社・役所・地名・電話番号・サービス名が入っていないか（架空のものだけか。法律の名前は可）。
2. 金額・日数・時間・電話番号などの具体的な数字が notes に入っていないか（練習用の practiceInfo と、asks の言い方の例は可）。
3. 医療の助言（薬・病名・緊急度の判断・症状への質問の重ね）が、asks・twists・notes・opening に無いか。医療機関の場面なら、limits に「受付として名前・日時・用件だけ」「急に具合が悪いと言われたら119番か#7119」があるか。
4. asks が Can do の文に合っているか（Can do に無いことを大量に聞いていないか、Can do にあることが抜けていないか）。
5. 相手役が学習者に日本語を教える・直す内容になっていないか。
6. notes が、日本で広く当てはまる一般的なことか（特定の地域・店にしか当てはまらないこと、誤り、断定しすぎがないか）。
7. 差別的・不適切な表現がないか。安全・生命にかかわる緊急の場面（110番・119番・急病・災害）になっていないか。
8. 日本語が自然か（title は15字まで、summary は40字まで）。

問題が無ければ ok を true にします。細かい好みは問題にしません。`;

function candoBlock(c: CanDo, social: SocialInfo[]): string {
  return `## 生活Can do
通番${c.no}（${c.level}・${c.category}）: ${c.cando}
大分類: ${c.major} / 小分類: ${c.minor} / 事例: ${c.case1} → ${c.case2}

## この小分類の生活・文化・社会的情報（関係するものだけ socialNos に）
${social.length ? social.map((s) => `- No.${s.no}: ${s.text}${s.mustKnow ? "（☆）" : ""}`).join("\n") : "（なし）"}`;
}

const sample = HAND_SCENES.find((s) => s.id === "sodai-gomi")!;
const { id: _id, candoNo: _no, status: _st, ...sampleDraft } = sample;
const SAMPLE_BLOCK = `## 手で書いた見本（型をそろえる）\n${JSON.stringify(sampleDraft, null, 1)}`;

const out: Scene[] = values.force
  ? existing.filter((s) => !targets.includes(s.candoNo))
  : [...existing];
let made = 0;
for (const no of targets) {
  const c = findCando(no);
  if (!c) {
    console.log(`${no}: Can do が見つかりません`);
    continue;
  }
  const social = findSocialByMinor(c.minorNo);
  const base = `${candoBlock(c, social)}\n\n${SAMPLE_BLOCK}`;
  let draft = (
    await callJson<Draft>(client, {
      model: values.model,
      effort: "medium",
      system: DRAFT_SYSTEM,
      messages: [
        { role: "user", content: `${base}\n\nこの Can do の場面カードを書いてください。` },
      ],
      schema: SCENE_SCHEMA,
    })
  ).data;
  let check = (
    await callJson<{ ok: boolean; problems: string[] }>(client, {
      model: values.model,
      effort: "medium",
      system: CHECK_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${candoBlock(c, social)}\n\n## 場面カード\n${JSON.stringify(draft, null, 1)}`,
        },
      ],
      schema: CHECK_SCHEMA,
    })
  ).data;
  if (!check.ok) {
    console.log(`${no}: 検査で指摘 → 書き直し\n  - ${check.problems.join("\n  - ")}`);
    draft = (
      await callJson<Draft>(client, {
        model: values.model,
        effort: "medium",
        system: DRAFT_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${base}\n\n## 前の下書き\n${JSON.stringify(draft, null, 1)}\n\n## 検査役の指摘（すべて直す）\n- ${check.problems.join("\n- ")}\n\n直した場面カードを書いてください。`,
          },
        ],
        schema: SCENE_SCHEMA,
      })
    ).data;
    check = (
      await callJson<{ ok: boolean; problems: string[] }>(client, {
        model: values.model,
        effort: "medium",
        system: CHECK_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${candoBlock(c, social)}\n\n## 場面カード\n${JSON.stringify(draft, null, 1)}`,
          },
        ],
        schema: CHECK_SCHEMA,
      })
    ).data;
  }
  if (!check.ok) {
    console.log(`${no}: 2回目も通らず、入れない\n  - ${check.problems.join("\n  - ")}`);
    continue;
  }
  const scene: Scene = {
    id: `cando-${no}`,
    candoNo: no,
    status: "draft",
    ...draft,
    socialNos: draft.socialNos.filter((n) => social.some((s) => s.no === n)),
  };
  out.push(scene);
  made++;
  console.log(
    `${no}: ${scene.title}（${scene.partnerRole}）${scene.office ? " 役所" : ""}${scene.medical ? " 医療" : ""}`,
  );
  writeFileSync(
    OUT,
    JSON.stringify(
      out.sort((a, b) => a.candoNo - b.candoNo),
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `\n${made} 件を ${OUT} に入れた（指示 ${PROMPT_VERSION}）。先生が確かめるまで status は draft`,
);
