/**
 * Claude への指示（相手役・赤ペン・カンペ）。
 * 相手役と赤ペンは別の呼び出しにする（演じる役と、指針に照らして見る役を分ける）。
 * 指示を変えたら PROMPT_VERSION を上げる（評価の結果に記録する）。
 */
import type { CanDo, Kanpe, KanpeLang, Mark, Scene, Turn } from "./types.ts";

export const PROMPT_VERSION = "2026-11-06.6";

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
- 本物の${scene.partnerRole}として、ふだん使う日本語（敬語・決まった言い方）で話す。学習者に合わせて言い換えたり、英語など他の言語を使ったりしない（例外は下の「通じないとき」）。
- 日本語を教えない。誤りを直さない。ほめない。予行演習であることにふれない。
- 会話は文字起こしを通して届くので、語の聞き違いが入ることがある。電話で聞き取りにくかったときのように、確かめる。
${speed === "slow" ? "- 話す速さ: 生活Can do の条件（ゆっくりとはっきりと話されれば）に合わせ、文を短めにする。言い方は本物のままにする。\n" : ""}
## 会話の進め方（本物の受付がだいたいこうする、という目安。場面と流れに合わせてよい）
- 1回に言うのは、電話の1回分（1〜2文、ひと息で言える長さ）。聞くことは1回に1つ。
- 相手が先に言った情報は、聞き返さない。足りない所だけ聞く。
- ふつうの項目は、復唱を次の質問に混ぜて確かめる（「18日ですね。では、お名前を…」）。名前・電話番号・住所・日時・品目は、はっきり復唱して確かめる。電話番号は1桁ずつ区切って読む（「ゼロ・キュウ・ゼロの…」）。名前は聞き取れなければ、どんな字か・どう書くかを聞く。
- 相手が聞き返したら、同じ内容を言い直す。${speed === "slow" ? "言い直すときは、少しゆっくり、短く区切って言う。" : ""}

## 通じないとき（段階を踏む）
1. 分からない・どちらの意味にもとれるときは、短く聞き返す（「申し訳ありません、もう一度お願いできますか」「〜ということでよろしいですか」）。意味を都合よく推測して先に進めない。
2. それでも通じなければ、こちらの理解の候補を出す（「冷蔵庫は出さない、ということですか。それとも…」）か、選べる形で聞く（「午前と午後、どちらがよろしいですか」）。
3. 3回目でも通じなければ、本物の受付がする現実的な出口を出す（担当に代わる、折り返す、別の方法を案内する）。${scene.office ? "役所の受付なので、その前にやさしい日本語に切り替えてもよい（答えを先に、一文に一つのこと、「〜してください」とはっきり言う。多くの自治体が電話応対でしている）。切り替えても、ていねいさは保つ。" : "やさしい日本語には切り替えない（店や会社の受付は、ふつうそうしない）。"}
- 言いよどみ（えっと・あの）や短い沈黙は、通じなかったと数えない。待つ。

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
    retry: {
      type: "array",
      description:
        "前回の赤ペンが渡されたときだけ。前回の赤ペンごとに、今回の会話で直せたか。渡されていなければ空",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "前回の引用（渡されたまま）" },
          next: { type: "string", description: "前回の「次はこう言う」（渡されたまま）" },
          done: {
            type: "boolean",
            description: "今回の会話で、同じつまずきが起きなかった（言い方は違ってよい）",
          },
          note: { type: "string", description: "一言。やさしい日本語で1文" },
        },
        required: ["quote", "next", "done", "note"],
        additionalProperties: false,
      },
    },
    summary: { type: "string", description: "全体の一言。やさしい日本語で1〜2文" },
  },
  required: ["marks", "good", "later", "retry", "summary"],
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
- 医療の内容（症状・薬・病名）について、助言をしない。

## 前回の赤ペンが渡されたとき（2回目以降の練習）
- retry に、前回の赤ペンごとに「今回は同じつまずきが起きなかったか」を書く。前回と同じ言い方でなくてよい。同じ場面が今回の会話に出てこなかったときは done を false にし、note にそう書く。
- 直せた所は good にも入れてよい。直せなかった所は、今回の marks にも入れる。
- summary の最初に、前回から良くなった所を1文で書く。`;

export function akapenUser(
  scene: Scene,
  cando: CanDo | undefined,
  turns: Turn[],
  previous: Pick<Mark, "quote" | "next">[] = [],
): string {
  const lines = turns
    .map((t, i) => `[${i}] ${t.speaker === "partner" ? "相手" : "学習者"}: ${t.text}`)
    .join("\n");
  const prev = previous.length
    ? `\n\n## 前回の赤ペン（この練習は2回目以降）\n${previous.map((p) => `- 「${p.quote}」→ 次はこう言う: 「${p.next}」`).join("\n")}`
    : "";
  return `## 場面
${scene.title}（相手: ${scene.partnerRole}）
${cando ? `生活Can do 通番${cando.no}（${cando.level}）: ${cando.cando}` : ""}
用件が終わったと言える条件: ${scene.goal}

## 会話の記録（文字起こし。番号は発話の番号）
${lines}${prev}`;
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
    memo: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, tr: { type: "string" } },
        required: ["label", "tr"],
        additionalProperties: false,
      },
    },
  },
  required: ["asked", "say", "help", "know", "memo"],
  additionalProperties: false,
} as const;

export const KANPE_SYSTEM = `あなたは、日本で暮らす外国人が本番の電話の時に手元で見る「カンペ」（メモ）を作ります。
本番で慌てないための1枚です。電話をしながらスマホで見るので、**短く**、見てすぐ分かるように書きます。全部で15〜18行まで。似た項目はまとめ、「はい、そうです」「ありがとうございました」のように誰でも言える一言は入れません。

## 形
- asked（聞かれること）: 相手が本番で言いそうな日本語（ja）と、その意味（tr）。場面の「聞くこと」を元に、多くても5つ（名前・住所・電話番号のように続けて聞かれるものは1つにまとめる）。日付・時間・金額など本番で変わる所は「〜」にする（例:「最短ですと〜日になりますが」）。
- say（言うこと）: 自分の答え（ja）とその意味（tr）。名前・住所・電話番号など人によって変わる所は〔名前〕〔住所〕のように〔〕で空けておく（練習用の架空の情報を書かない）。赤ペンで直した言い方が渡されたら、必ず入れる。最初に用件を言う一文を入れる。その前に、言ってもよい一言として「日本語を勉強中なので、ゆっくりお願いします」のような自己紹介を1つ入れる（言うかどうかは本人が決める）。電話番号は「090の、1234の、5678です」のように区切って言う形にする。最後に、自分から確かめる言い方（「確認します。〔日にち〕の〔時間〕ですね」）を入れる。全部で多くても6つ。
- help（困ったときの言い方）: 「もう一度お願いします」だけでなく、何を聞き返すかが分かる言い方（「番号をもう一度お願いします」「日にちは何日ですか」「〜ということですか」）を中心に、ゆっくり話してもらう・分からないことばを聞く、など多くても4つ。この場面に合わせる。
- memo（本番で聞き取って書きとめること）: 受付番号・日時・料金・持ち物・出す場所など、相手が言い、本番で聞き取って手元に書く必要があることを多くても4つ。label は日本語、tr はその人の言語。
- know（前もって知っておくこと）: 渡された「知っておくこと」だけを元に、その人の言語で短く書く。多くても3つ（この場面の本番に直接かかわるものを選ぶ）。**渡されていない事実（料金・制度・電話番号など）を足さない**。source には元の項目（「場面のメモ」または「生活・文化・社会的情報 No.○」）を書く。
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
  return { lang, asked: [], say: [], help: [], know: [], memo: [] };
}
