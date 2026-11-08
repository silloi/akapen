/**
 * 画面の言葉。日本語が元で、ほかの言語は data/ui.i18n.json（scripts/build-i18n.ts が Claude で作る）。
 * 場面の名前と一言は data/scenes.i18n.json。会話の中身（相手役・赤ペンの引用・カンペの日本語）は訳さない。
 */
import { computed, ref } from "vue";
import scenesI18n from "../../data/scenes.i18n.json" with { type: "json" };
import uiI18n from "../../data/ui.i18n.json" with { type: "json" };
import type { KanpeLang } from "../../shared/types.ts";

/** 画面の言語（yasashii-refs の第1群の9言語＋日本語） */
export type UiLang = "ja" | "easy" | "en" | "zh" | "vi" | "tl" | "ne" | "id" | "pt" | "ko" | "my";

export const UI_LANGS: Record<UiLang, string> = {
  ja: "日本語",
  easy: "やさしい日本語",
  en: "English",
  zh: "中文",
  vi: "Tiếng Việt",
  tl: "Filipino",
  ne: "नेपाली",
  id: "Bahasa Indonesia",
  pt: "Português",
  ko: "한국어",
  my: "မြန်မာ",
};

/** 日本語の元の文。鍵は変えない（訳はこの鍵で引く） */
export const JA = {
  // 共通
  "app.name": "JAWS 日本語じょうず",
  "step.practice": "1 予行演習",
  "step.review": "2 赤ペン",
  "step.kanpe": "3 本番のカンペ",
  "nav.progress": "すすみぐあい",
  "footer.source":
    "場面は、文化審議会国語分科会「地域における日本語教育の在り方について」（報告）別冊「日本語教育の参照枠」に基づく「生活Can do」一覧（令和4年11月29日、文化庁）を加工して作成。会話の相手・店・地名・電話番号はすべて架空です。",
  "lang.label": "ことば",
  "common.partner": "相手",
  "common.me": "わたし",
  "common.phone": "電話",
  "common.counter": "窓口",
  "common.receptionOnly": "受付と話すだけ",
  "common.retry": "もう一度",
  // 場面の一覧
  "home.title": "本番の電話の前に、声で予行演習。",
  "home.lead1": "相手役と電話で話してみて、",
  "home.lead.highlight": "伝わらなかった所",
  "home.lead2": "に赤ペンを入れます。最後に、本番で手元に置くカンペを作ります。",
  "home.note": "日本語のテストではありません。文法の正しさより、用件が伝わったかを先に見ます。",
  "home.choose": "場面をえらぶ",
  "home.filter.all": "すべて",
  "home.filter.topic": "分野",
  "home.filter.level": "レベル",
  "home.filter.checked": "先生が確かめた場面だけ",
  "home.filter.reset": "しぼりこみをやめる",
  "home.empty": "この組み合わせの場面は、まだありません。",
  "home.checked": "先生が確かめた",
  "home.draftNote":
    "「先生が確かめた」の付いていない場面は、Claude が生活Can do から下書きし、検査役の Claude が確かめたものです。日本語教師は、まだ確かめていません。",
  // 生活Can do の大分類（場面の分け方。元の言葉のまま）
  "major.1": "健康・安全に暮らす",
  "major.2": "住居を確保・維持する",
  "major.3": "消費活動を行う",
  "major.4": "目的地に移動する",
  "major.5": "子育て・教育を行う",
  "major.6": "働く",
  "major.7": "人とかかわる",
  "major.8": "社会の一員となる",
  "major.9": "自身を豊かにする",
  "major.10": "情報を収集・発信する",
  // 用語集（ことば）。公的な用語集と、Claude の下書き
  "glossary.word": "ことば",
  "glossary.tapHint": "下線のことばをタップすると、意味が出ます",
  "glossary.source": "出典",
  "glossary.draft": "Claude の下書き（日本語教師がまだ確かめていない）",
  "glossary.trByClaude": "訳: Claude",
  "glossary.draftShort": "下書き",
  "glossary.official": "公的な用語集",
  "glossary.legend":
    "「公的な用語集」は国の用語集の説明です。「下書き」は Claude が書いた説明で、日本語教師はまだ確かめていません。",
  "review.words": "この会話に出てきたことば",
  "review.wordsHint": "電話や窓口でよく聞くことばの意味です",
  "kanpe.words": "ことば",
  "kanpe.wordsHint": "カンペに出てくることばの意味",
  "kanpe.jump.words": "ことば",
  // 場面に関係する公的な情報（カンペの画面の下）
  "info.title": "この場面に関係する公的な情報",
  "info.note":
    "国などの公的なページです（Claude が書いたものではありません）。手続きのくわしいことは、住んでいるまちの役所などで確かめてください。",
  "info.chapters": "関係する章",
  "info.langs": "{n}のことば",
  "info.hasLang": "{lang}あり",
  // トップの動画（実際の画面を順に見せる）
  "hero.langs": "11のことば",
  "hero.alt":
    "アプリの画面の動画。電話の予行演習、会話の記録に入った赤ペン、本番のカンペ、いろいろなことばの画面を順に見せます。",
  "hero.pause": "動画を止める",
  "hero.play": "動画を再生する",
  "home.sample": "見本の赤ペンを見る",
  "home.sampleNote": "手で作った見本の会話です",
  "home.noClaude":
    "この環境では Claude につながっていないので、予行演習はできません。見本だけ見られます。",
  "home.safety.title": "いのちや安全にかかわる時は",
  "home.safety.body":
    "110番・119番や、急な病気・けがのときは、予行演習より、多言語の窓口を使ってください。119番は多くの地域で通訳につないでもらえます。",
  "home.safety.note":
    "「生活Can do」は、「できるようにならなければならない一覧」ではありません。医療・防災など安全や生命にかかわる場面は、日本語の学習より、多言語での情報が大切なものもあります。",
  "home.others": "まだ場面になっていない電話の Can do",
  "home.others.safety": "予行演習にしない（多言語の窓口へ）",
  // 予行演習
  "practice.title": "予行演習",
  "practice.attempt": "回目",
  "practice.partner": "相手",
  "practice.speed": "相手の話す速さ",
  "practice.speed.slow": "ゆっくり、はっきり",
  "practice.speed.natural": "ふつう",
  "practice.style": "相手の様子",
  "practice.style.random": "おまかせ（毎回ちがう）",
  "style.warm": "ていねいで、ゆっくり",
  "style.normal": "ふつう（友好的だが本物）",
  "style.busy": "急いでいる",
  "style.curt": "気むずかしい",
  "practice.asks": "本番で聞かれること（この順）",
  "practice.info": "練習で使う情報（架空）",
  "practice.infoNote": "自分の本当の名前や電話番号は言わなくて大丈夫です。",
  "practice.previous": "前回の赤ペン ・ 次はどう言う？",
  "practice.noClaude": "Claude につながっていないので、予行演習はできません。",
  "practice.ended": "電話が終わりました。赤ペンを見てみましょう。",
  "practice.endedCounter": "用件が終わりました。赤ペンを見てみましょう。",
  "practice.recording": "録音しています。話しおわったら、もう一度おしてください。",
  "practice.transcribing": "文字にしています…",
  "practice.thinking": "相手が考えています…",
  "practice.speaking": "相手が話しています…",
  "practice.micError": "マイクが使えません。キーボードで入力できます。",
  "practice.sttError": "声の文字起こしが使えません。キーボードで入力してください。",
  "practice.noVoice": "声が聞き取れませんでした。もう一度話してください。",
  "practice.talk": "話す",
  "practice.furigana": "ふりがな",
  "practice.tapToTranslate": "文をタップすると、意味が出ます",
  "practice.tapToEasy": "文をタップすると、やさしい日本語が出ます",
  "practice.glossError": "意味を出せませんでした。もう一度タップしてください。",
  "practice.backConfirm": "この練習は消えます。場面の一覧にもどりますか？",
  "practice.talkInterrupt": "止めて話す",
  "practice.audioBlocked": "相手の声が出ませんでした。「もう一度聞く」を押してください。",
  "practice.talkDone": "話しおわった",
  "practice.replay": "もう一度聞く",
  "practice.keyboard": "キーボード",
  "practice.typed": "話すかわりに入力する",
  "practice.send": "送る",
  "practice.back": "場面にもどる",
  "practice.toReview": "赤ペンを見る",
  "practice.toReviewEarly": "ここで終えて、赤ペンを見る",
  // 赤ペン
  "review.title": "赤ペン",
  "review.sample": "見本（手で作った例）",
  "review.todaysPartner": "今日の相手",
  "review.fixBefore": "本番の前に直すのは",
  // {n} に数が入る（英語などは単数と複数で形が違う）
  "review.countOne": "{n}つ",
  "review.countMany": "{n}つ",
  "review.attempt": "（{n}回目）",
  "review.loading": "先生が赤ペンを入れています…（30秒ほど）",
  "review.fromTeacher": "先生から",
  "review.where": "どこでつまずく？",
  "review.next": "次はどう言う？",
  "review.previous": "前回の赤ペン",
  "review.fixed": "直せた。",
  "review.notYet": "まだ。",
  "kind.stalled": "話が止まった・誤解されそう",
  "kind.missed": "聞き取れなかった",
  "kind.impolite": "ぶっきらぼうに聞こえそう",
  "kind.grammar": "ことばの誤り",
  "review.transcript": "会話の記録と赤ペン",
  "review.good": "伝わった",
  "review.toKanpe": "カンペに入れる",
  "review.notToKanpe": "カンペに入れない",
  "review.later": "伝わったので、今は直さなくていいこと",
  "review.fillers": "言いよどみ（えっと・あの）や言い直し → 電話ではふつうです。",
  "review.retry": "もう一度練習する",
  "review.makeKanpe": "本番のカンペを作る",
  "review.translating": "訳しています…",
  // カンペ
  "kanpe.title": "本番のカンペ",
  "kanpe.heading": "本番で手元に置くメモ",
  "kanpe.yomi": "ひらがなの読み",
  "kanpe.loading": "カンペを作っています…",
  "kanpe.qr": "スマホで開く（QR）",
  "kanpe.qrNote":
    "本番の電話のとき、スマホで大きい文字で見られます。URL を知っている人だけが開けます。30日で消えます。",
  "kanpe.gone": "このカンペは見つかりません（30日で消えます）。もう一度作ってください。",
  "kanpe.qrAlt": "カンペを開く QR コード",
  "kanpe.url": "カンペの URL",
  "kanpe.copy": "URL をコピー",
  "kanpe.copied": "コピーした",
  "kanpe.back": "赤ペンにもどる",
  "kanpe.print": "印刷もできます。",
  "kanpe.asked": "聞かれること",
  "kanpe.askedHint": "相手はこう言います",
  "kanpe.say": "言うこと",
  "kanpe.sayHint": "〔 〕は自分のことを入れる",
  "kanpe.help": "困ったとき",
  "kanpe.helpHint": "聞き返すのは失礼ではありません",
  "kanpe.memo": "聞き取って書くこと",
  "kanpe.memoHint": "本番で相手が言うので、ここに書く",
  "kanpe.know": "前もって知っておくこと",
  "kanpe.jump.asked": "聞かれる",
  "kanpe.jump.say": "言う",
  "kanpe.jump.help": "困った",
  "kanpe.jump.memo": "書く",
  "kanpe.jump.know": "知る",
  "kanpe.jump.yomi": "読み",
  "kanpe.inside": "カンペの中",
} as const;

export type UiKey = keyof typeof JA;

type Table = Partial<Record<UiKey, string>>;
const UI = uiI18n as Record<string, Table>;
const SCENES = scenesI18n as Record<string, Record<string, SceneText>>;

const STORAGE = "akapen.lang";

function detect(): UiLang {
  try {
    const saved = localStorage.getItem(STORAGE) as UiLang | null;
    if (saved && saved in UI_LANGS) return saved;
  } catch {
    // 読めない環境（プライベートウィンドウなど）
  }
  const nav = (navigator.language || "ja").toLowerCase();
  const code = nav.startsWith("zh") ? "zh" : nav.startsWith("fil") ? "tl" : nav.slice(0, 2);
  return (code in UI_LANGS && code !== "easy" ? code : "ja") as UiLang;
}

export const lang = ref<UiLang>(detect());

/**
 * 言語ごとに足す Web フォント（Google Fonts）。
 * 日本語の Zen Kaku Gothic New には、ベトナム語の声調つき文字、ハングル、デーヴァナーガリー、
 * ミャンマー文字、簡体字の一部が無い。無い字だけが別のフォントに落ちると1行の中で混ざるので、
 * その言語の本文の書体を足す（style.css の [data-lang]）。手書きの書体（Klee One）は日本語の赤ペンだけに使う。
 */
const FONTS: Partial<Record<UiLang, string>> = {
  vi: "Be+Vietnam+Pro:wght@400;500;700",
  zh: "Noto+Sans+SC:wght@400;500;700",
  ko: "Noto+Sans+KR:wght@400;500;700",
  ne: "Noto+Sans+Devanagari:wght@400;500;700",
  my: "Noto+Sans+Myanmar:wght@400;500;700",
};
const loaded = new Set<string>();
/**
 * その言語の書体を読み込む（無ければ何もしない）。画面の言語のほか、カンペの訳の言語にも使う
 * （日本語の画面でベトナム語のカンペを作ると、訳は日本語の書体では声調の記号が崩れる）
 */
export function loadFont(l: string): void {
  if (typeof document === "undefined") return;
  const f = FONTS[l as UiLang];
  if (!f || loaded.has(l)) return;
  loaded.add(l);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f}&display=swap`;
  document.head.appendChild(link);
}
function applyLang(l: UiLang): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = l === "easy" ? "ja" : l;
  document.documentElement.dataset.lang = l;
  loadFont(l);
}
applyLang(lang.value);

export function setLang(l: UiLang): void {
  lang.value = l;
  applyLang(l);
  try {
    localStorage.setItem(STORAGE, l);
  } catch {
    // 保存できなくてもよい
  }
}

/** 画面の言葉。訳が無ければ日本語 */
export function t(key: UiKey): string {
  if (lang.value === "ja") return JA[key];
  return UI[lang.value]?.[key] ?? JA[key];
}

/** 場面の訳。asks は「本番で聞かれること」の見出しの訳（ask の key → 訳） */
export interface SceneText {
  title: string;
  summary: string;
  asks?: Record<string, string>;
  /** 練習用の情報（practiceInfo）の見出しの訳（日本語の見出し → 訳） */
  info?: Record<string, string>;
}

/** 日本語でないとき、場面の名前の訳（無ければ空） */
export function sceneTr(sceneId: string): SceneText | null {
  if (lang.value === "ja") return null;
  return SCENES[lang.value]?.[sceneId] ?? null;
}

/** 日本語でないとき、「本番で聞かれること」の見出しの訳（無ければ空） */
export function askTr(sceneId: string, askKey: string): string {
  return sceneTr(sceneId)?.asks?.[askKey] ?? "";
}

/** 日本語でないとき、練習用の情報の見出しの訳（無ければ空） */
export function infoTr(sceneId: string, label: string): string {
  return sceneTr(sceneId)?.info?.[label] ?? "";
}

/** カンペの言語の初期値: 画面の言語（日本語のときはやさしい日本語） */
export const defaultKanpeLang = computed<KanpeLang>(() =>
  lang.value === "ja" || lang.value === "easy" ? "easy" : lang.value,
);

/** 赤ペンの説明文を訳す必要がないか（日本語・やさしい日本語。赤ペンの文はもともとやさしい日本語） */
export const isJa = computed(() => lang.value === "ja" || lang.value === "easy");
