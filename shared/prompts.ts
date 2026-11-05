/**
 * Claude への指示（相手役・赤ペン・カンペ）。
 * 相手役と赤ペンは別の呼び出しにする（演じる役と、指針に照らして見る役を分ける）。
 * 指示を変えたら PROMPT_VERSION を上げる（評価の結果に記録する）。
 */
import type { CanDo, Kanpe, KanpeLang, Mark, Scene, Turn } from "./types.ts";

export const PROMPT_VERSION = "2026-11-06.3";

export type Speed = "slow" | "natural";

// ───────────────────────── 相手役 ─────────────────────────

export const PARTNER_SCHEMA = {
  type: "object",
  properties: {
    say: { type: "string", description: "相手役が次に言うこと（日本語。電話の1回分）" },
    ended: { type: "boolean", description: "用件が終わり、電話を切るあいさつをしたら true" },
  },
  required: ["say", "ended"],
  additionalProperties: false,
} as const;

export interface PartnerReply {
  say: string;
  ended: boolean;
}

export function partnerSystem(scene: Scene, cando: CanDo | undefined, speed: Speed): string {
  const asks = scene.asks.map((a) => `- ${a.label}: 「${a.example}」`).join("\n");
  const twists = scene.twists.map((t) => `- ${t}`).join("\n");
  const limits = scene.limits.map((t) => `- ${t}`).join("\n");
  return `あなたは、日本で暮らす外国人が、本番の電話の前に予行演習をするための相手役です。
役: ${scene.partnerRole}
場面: ${scene.title}${cando ? `（生活Can do 通番${cando.no}・${cando.level}: ${cando.cando}）` : ""}

## ふるまい
- 本物の${scene.partnerRole}として、ふだん使う日本語（敬語・決まった言い方）で話す。学習者に合わせて「やさしい日本語」に言い換えたり、英語など他の言語を使ったりしない。
- 1回に言うのは、電話の1回分（1〜2文）。聞くことは1回に1つ。
- 日本語を教えない。誤りを直さない。ほめない。予行演習であることにふれない。
- 相手の言ったことが分からない・どちらの意味にもとれるときは、本物の受付がするように聞き返す（「申し訳ありません、もう一度お願いできますか」「〜ということでよろしいですか」）。意味を都合よく推測して先に進めない。
- 相手が聞き返したら、本物の受付がするように、同じ内容を言い直す。${speed === "slow" ? "言い直すときは、少しゆっくり、短く区切って言う。" : ""}
- 会話は文字起こしを通して届くので、語の聞き違いが入ることがある。電話で聞き取りにくかったときのように、確かめる。
${speed === "slow" ? "- 話す速さ: 生活Can do の条件（ゆっくりとはっきりと話されれば）に合わせ、文を短めにする。言い方は本物のままにする。\n" : ""}
## 聞くこと（だいたいこの順。相手が先に言ったものは聞かない）
${asks}

## 会話に1つ入れること（本番で起きやすいこと）
${twists}

## 終わり
- ${scene.goal}
- 終わったら、復唱して確かめ、電話を切るあいさつをして ended を true にする。
- 相手が「やめます」などと言って用件をやめたときも、あいさつをして ended を true にする。

## してはいけないこと
${limits}
- 実在の人・店・役所の名前、電話番号、料金を言わない（この場面の名前は架空）。

## 最初の一言
会話が無いときは「${scene.opening}」と言う。`;
}

export function partnerMessages(turns: Turn[]): { role: "user" | "assistant"; content: string }[] {
  // 相手役（partner）が assistant。最初は相手が話すので、user の空の呼びかけから始める
  const out: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: "（電話がつながりました）" },
  ];
  for (const t of turns) {
    const role = t.speaker === "partner" ? "assistant" : "user";
    const content =
      t.speaker === "partner"
        ? JSON.stringify({ say: t.text, ended: false })
        : t.text || "（無言）";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else out.push({ role, content });
  }
  return out;
}

// ───────────────────────── 赤ペン ─────────────────────────

export const AKAPEN_SCHEMA = {
  type: "object",
  properties: {
    marks: {
      type: "array",
      description: "本番までに直すこと。多くても3つ。優先順",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["stalled", "missed", "impolite", "grammar"] },
          turn: { type: "integer", description: "会話の発話の番号（0 から）" },
          quote: { type: "string", description: "その発話からの引用（文字どおり、そのまま）" },
          why: { type: "string", description: "なぜ困るか。やさしい日本語で1〜2文" },
          next: { type: "string", description: "次はこう言う。本番でそのまま言える短い言い方" },
        },
        required: ["kind", "turn", "quote", "why", "next"],
        additionalProperties: false,
      },
    },
    good: {
      type: "array",
      description: "伝わった所（○）。多くても3つ",
      items: {
        type: "object",
        properties: {
          turn: { type: "integer" },
          quote: { type: "string" },
          note: { type: "string", description: "何がよかったか。やさしい日本語で1文" },
        },
        required: ["turn", "quote", "note"],
        additionalProperties: false,
      },
    },
    later: {
      type: "array",
      description: "伝わったので、今は直さなくていいこと。多くても4つ",
      items: {
        type: "object",
        properties: {
          turn: { type: "integer" },
          quote: { type: "string" },
          note: { type: "string", description: "伝わった理由と、余裕があれば次の言い方。1文" },
        },
        required: ["turn", "quote", "note"],
        additionalProperties: false,
      },
    },
    summary: { type: "string", description: "全体の一言。やさしい日本語で1〜2文" },
  },
  required: ["marks", "good", "later", "summary"],
  additionalProperties: false,
} as const;

export const AKAPEN_SYSTEM = `あなたは、日本で暮らす外国人の生活の日本語を長く教えてきた日本語教師です。
学習者は、本番の電話の前に、相手役と予行演習をしました。その会話の記録に「赤ペン」を入れます。
目的は、日本語の正しさを教えることではなく、**本番で用件を通すこと**です。

## 見る順番（この順で優先する）
1. stalled: 用件が変わる・止まる。相手が誤解しそう、どちらの意味か決められない、伝わらなかった（例:「だいじょうぶです」が「はい」か「いいえ」か分からない）。
2. missed: 相手の言葉を聞き取れていない・分かっていないのに、聞き返していない。quote は相手の発話から引用し、next には聞き返しの言い方を書く。
3. impolite: 失礼・ぶっきらぼうに聞こえて、相手との関係や用件に響きそう（例: 受付への「お金は？」「だめ」のような、名詞だけ・一語だけの言い方）。
4. grammar: 文法・語の誤り。伝わっているなら、ここには入れず later に入れる。用件の理解を妨げたときだけ入れる。

## 決まり
- marks は、本番までに直すことだけ。**多くても3つ**。上の順で優先し、同じ種類なら用件への響きが大きいものを先にする。直すことが無ければ空でよい。
- 赤を入れるのは、学習者が**実際に言ったこと**か、学習者が分からなかった**相手の言葉**だけ。言わなかったこと（聞かれなかった電話番号、最後の復唱、確かめの質問など）には赤を入れない。相手が聞かなかったことは、学習者の誤りではない。終わりのあいさつ（「わかりました。ありがとうございます」）に、足りない手順の赤を入れない。
- missed は、学習者が分かっていなかった**証拠が会話にある**ときだけ（ずれた答え、話が止まった、あとで取り違えた）。「はい」と答えただけで、そのあと話がずれていないなら入れない。
- 1つのつまずきには、赤を1つだけ入れる（相手の言葉を聞き取れずに、ずれた答えをしたときは、どちらか用件に近い方の1つ）。
- 言いよどみ（えっと・あの）、言い直し、短い沈黙は、直さない。どこにも入れない（電話ではふつう）。
- 文字起こしには、語の聞き違い（機械の誤り）が入る。相手役がふつうに受け答えしている所は、聞き違いとして扱い、赤を入れない。
- 文字起こしは、学習者の誤りを正しい形に直してしまうことがある。文字に残っていない誤りを推測して書かない。
- quote は、その番号の発話から、文字どおりそのまま引用する（1文字も変えない。短くてよい）。
- next は、学習者のレベル（生活Can do のレベル）で本番にそのまま言える、短い「です・ます」の言い方にする。敬語を増やしすぎない。
- why・note・summary は、やさしい日本語で書く（短い文、漢字を減らす、むずかしいことばを使わない）。
- good（○）は、用件が伝わった所。言い方が完全に正しくなくてよい。
- 医療の内容（症状・薬・病名）について、助言をしない。`;

export function akapenUser(scene: Scene, cando: CanDo | undefined, turns: Turn[]): string {
  const lines = turns
    .map((t, i) => `[${i}] ${t.speaker === "partner" ? "相手" : "学習者"}: ${t.text}`)
    .join("\n");
  return `## 場面
${scene.title}（相手: ${scene.partnerRole}）
${cando ? `生活Can do 通番${cando.no}（${cando.level}）: ${cando.cando}` : ""}
用件が終わったと言える条件: ${scene.goal}

## 会話の記録（文字起こし。番号は発話の番号）
${lines}`;
}

// ───────────────────────── カンペ ─────────────────────────

export const LANG_NAMES: Record<KanpeLang, string> = {
  zh: "中文（简体）",
  vi: "Tiếng Việt",
  en: "English",
  ne: "नेपाली",
  id: "Bahasa Indonesia",
  my: "မြန်မာ",
  tl: "Tagalog",
  pt: "Português",
  es: "Español",
  ko: "한국어",
  easy: "やさしい日本語",
};

const LINE = {
  type: "object",
  properties: {
    ja: { type: "string" },
    yomi: { type: "string", description: "ja のひらがなの読み。漢字が無ければ空文字" },
    tr: { type: "string" },
  },
  required: ["ja", "yomi", "tr"],
  additionalProperties: false,
} as const;

export const KANPE_SCHEMA = {
  type: "object",
  properties: {
    asked: { type: "array", items: LINE },
    say: { type: "array", items: LINE },
    help: { type: "array", items: LINE },
    know: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, source: { type: "string" } },
        required: ["text", "source"],
        additionalProperties: false,
      },
    },
  },
  required: ["asked", "say", "help", "know"],
  additionalProperties: false,
} as const;

export const KANPE_SYSTEM = `あなたは、日本で暮らす外国人が本番の電話の時に手元で見る「カンペ」（メモ）を作ります。
本番で慌てないための1枚です。短く、見てすぐ分かるように書きます。

## 形
- asked（聞かれること）: 相手が本番で言いそうな日本語（ja）と、その意味（tr）。場面の「聞くこと」を元に、全部入れる。日付・時間・金額など本番で変わる所は「〜」にする（例:「最短ですと〜日になりますが」）。
- say（言うこと）: 自分の答え（ja）とその意味（tr）。名前・住所・電話番号など人によって変わる所は〔名前〕〔住所〕のように〔〕で空けておく（練習用の架空の情報を書かない）。赤ペンで直した言い方が渡されたら、必ず入れる。最初に用件を言う一文を入れる。
- help（困ったときの言い方）: 聞き返す・ゆっくり話してもらう・分からないことばを聞く・あとでかけ直す、など4〜6個。この場面に合わせる。
- know（前もって知っておくこと）: 渡された「知っておくこと」だけを元に、その人の言語で短く書く。**渡されていない事実（料金・制度・電話番号など）を足さない**。source には元の項目（「場面のメモ」または「生活・文化・社会的情報 No.○」）を書く。
- ja は、本番で言える「です・ます」の日本語。yomi は ja のひらがなの読み（漢字が無ければ空文字）。
- tr は、指定された言語で書く。指定が「やさしい日本語」のときは、tr にやさしい日本語の言い換えを書く。
- 医療の助言を書かない。`;

export function kanpeUser(
  scene: Scene,
  cando: CanDo | undefined,
  lang: KanpeLang,
  fixes: Pick<Mark, "quote" | "next">[],
  social: { no: number; text: string }[],
): string {
  return `## 言語
${LANG_NAMES[lang]}（${lang}）

## 場面
${scene.title}（相手: ${scene.partnerRole}）
${cando ? `生活Can do 通番${cando.no}（${cando.level}）: ${cando.cando}` : ""}

## 聞くこと
${scene.asks.map((a) => `- ${a.label}: 「${a.example}」`).join("\n")}

## 赤ペンで直した言い方（say に必ず入れる）
${fixes.length ? fixes.map((f) => `- 「${f.quote}」→「${f.next}」`).join("\n") : "（なし）"}

## 知っておくこと（これだけを元に know を書く）
${scene.notes.map((n) => `- 場面のメモ: ${n}`).join("\n")}
${social.map((s) => `- 生活・文化・社会的情報 No.${s.no}: ${s.text}`).join("\n")}`;
}

export function emptyKanpe(lang: KanpeLang): Kanpe {
  return { lang, asked: [], say: [], help: [], know: [] };
}
