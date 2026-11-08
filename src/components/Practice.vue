<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { randomStyle, STYLE_LABELS, type PartnerStyle, type Speed } from "../../shared/prompts.ts";
import type { Mark, Turn } from "../../shared/types.ts";
import { api, type Health, type SceneWithCando } from "../lib/api.ts";
import { fillPersona } from "../../shared/persona.ts";
import { furiganaReady, furiganaSegments, loadFurigana } from "../lib/furigana.ts";
import { glossary, loadGlossary, termById, termParts } from "../lib/glossary.ts";
import TermInfo from "./TermInfo.vue";
import { askTr, infoTr, isJa, lang, sceneTr, t } from "../lib/i18n.ts";
import {
  MIN_RECORDING_BYTES,
  Recorder,
  speak,
  stopSpeaking,
  unlockAudio,
  vlog,
  voiceLog,
} from "../lib/voice.ts";

const props = defineProps<{
  scene: SceneWithCando;
  health: Health;
  previous?: Mark[];
  attempt?: number;
}>();
const emit = defineEmits<{
  finish: [Turn[], PartnerStyle];
  /** 相手役が会話を終えた（読み上げの前）。赤ペンを裏で始めるために、会話の写しを渡す */
  ended: [Turn[]];
  back: [];
}>();

const turns = ref<Turn[]>([]);
const speed = ref<Speed>("slow");
/** 相手の様子。"random" は開始のたびに引く（本番の相手は選べない） */
const styleChoice = ref<PartnerStyle | "random">("random");
const style = ref<PartnerStyle>(randomStyle());
const state = ref<"idle" | "recording" | "transcribing" | "thinking" | "speaking">("idle");
const ended = ref(false);
const error = ref("");
const typed = ref("");
const showKeyboard = ref(!props.health.stt);
const logEl = ref<HTMLElement | null>(null);
const recorder = new Recorder();
/** マイクを開いている途中（許可の確認が出ている間に、もう一度押されても重ねて開かない） */
const starting = ref(false);
/** 端末が相手の声を流すのを断った（iPad などで、操作の前に鳴らそうとしたとき） */
const audioBlocked = ref(false);
/** ふりがな（Furifont）。はじめはオン。この端末に覚えておく */
const FURI_KEY = "akapen.furigana";
const furigana = ref(
  (() => {
    try {
      return localStorage.getItem(FURI_KEY) !== "0";
    } catch {
      return true;
    }
  })(),
);
watch(
  furigana,
  (on) => {
    try {
      localStorage.setItem(FURI_KEY, on ? "1" : "0");
    } catch {
      // 覚えられなくてもよい
    }
    if (on) void loadFurigana();
  },
  { immediate: true },
);
/** 文を、読みを選んだ漢字とそれ以外に分ける（送りがなの表を読み終えたら描き直す） */
function segs(text: string) {
  void furiganaReady.value;
  return furiganaSegments(text);
}

/**
 * 文をタップしたときの意味。日本語・やさしい日本語の画面では、やさしい日本語に言い換える。
 * 同じ文は覚えておき、取り直さない。
 */
const glossLang = computed(() =>
  lang.value === "ja" || lang.value === "easy" ? "easy" : lang.value,
);
const shown = ref<Record<number, boolean>>({});
const glosses = ref<Record<number, string>>({});
const glossCache = new Map<string, string>();
async function toggleGloss(i: number) {
  if (shown.value[i]) {
    shown.value[i] = false;
    return;
  }
  const text = turns.value[i]?.text;
  if (!text) return;
  shown.value[i] = true;
  const l = glossLang.value;
  const key = `${l}\n${text}`;
  const hit = glossCache.get(key);
  if (hit !== undefined) {
    glosses.value[i] = hit;
    return;
  }
  delete glosses.value[i];
  try {
    const [g] = await api.gloss(l, [text]);
    const v = g?.trim() || t("practice.glossError");
    if (g?.trim()) glossCache.set(key, v);
    if (glossLang.value === l) glosses.value[i] = v;
  } catch {
    glosses.value[i] = t("practice.glossError");
  }
}
// 画面の言語を変えたら、出している意味を閉じる（前の言語のままにしない）
watch(lang, () => {
  shown.value = {};
  glosses.value = {};
});

/**
 * 用語集の語（相手の言葉の中の、手続き・書類の語や電話の言い回し）。下線を引き、タップで意味を出す。
 * 文全体の意味（上）とは別に出す。
 */
onMounted(() => void loadGlossary());
const termOpen = ref<Record<number, string>>({});
function toggleTerm(i: number, id: string) {
  termOpen.value = { ...termOpen.value, [i]: termOpen.value[i] === id ? "" : id };
  // 会話の欄の下の方でも、出した意味が見えるようにする
  void nextTick(() =>
    document
      .querySelector(`[data-termbox="${i}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
  );
}
/** 文を、用語集の語とそれ以外に分け、ふりがなを出すときはさらに読みの単位に分ける */
function lineParts(text: string, speaker: Turn["speaker"]) {
  void glossary.value;
  const parts = speaker === "partner" ? termParts(text) : [{ text }];
  return parts.map((p) => ({ ...p, segs: furigana.value ? segs(p.text) : null }));
}
const hasTerms = computed(
  () =>
    !!glossary.value &&
    turns.value.some((x) => x.speaker === "partner" && termParts(x.text).some((p) => p.id)),
);

/** URL に #debug を付けて開くと、声の入出力の記録を出す（実機の不具合を調べるため） */
const debug = (() => {
  try {
    return location.hash.includes("debug") || localStorage.getItem("akapen.debug") === "1";
  } catch {
    return false;
  }
})();

async function scrollDown() {
  await nextTick();
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight, behavior: "smooth" });
}

async function partnerSays(text: string) {
  turns.value.push({ speaker: "partner", text });
  await scrollDown();
  if (ended.value)
    emit(
      "ended",
      turns.value.map((t) => ({ ...t })),
    );
  await say(text, speed.value === "slow");
}

/**
 * 相手の声を流す。途中で止められた（「止めて話す」や「もう一度聞く」が押された）ときは、
 * 状態はそちらが決めるので触らない（触ると、録音中なのに「話す」に戻ってしまう）。
 * 流し終えたら、そのまま聞き取りに入る（電話と同じく、相手が話し終えたら自分の番）。
 */
async function say(text: string, slow: boolean) {
  state.value = "speaking";
  audioBlocked.value = false;
  const r = await speak(text, slow, props.health.tts);
  if (r === "stopped") return;
  state.value = "idle";
  audioBlocked.value = r === "blocked";
  if (r === "done" && autoListen.value) {
    // 声が終わってすぐは端末の音の切り替えの途中のことがあるので、少しだけ待つ
    await new Promise((x) => setTimeout(x, 250));
    if (state.value === "idle" && autoListen.value) await startRecording();
  }
}

/**
 * 相手が話し終えたら、自動で聞き取りに入るか。声で練習しているときだけ
 * （キーボードを開いているとき・相手が電話を終えたときは入らない。声が流れなかったときは say で除く）
 */
const autoListen = computed(
  () => props.health.stt && props.health.claude && !showKeyboard.value && !ended.value,
);

async function partnerTurn() {
  state.value = "thinking";
  error.value = "";
  try {
    const r = await api.turn(props.scene.id, speed.value, style.value, turns.value);
    ended.value = r.ended;
    await partnerSays(r.say);
  } catch (e) {
    error.value = (e as Error).message;
    state.value = "idle";
  }
}

async function addMine(text: string) {
  turns.value.push({ speaker: "me", text });
  await scrollDown();
  await partnerTurn();
}

/** 練習の画面を出たか（出た後に、自動の聞き取りでマイクを開き直さない） */
let alive = true;
/** 録音の長さの上限（押し忘れても、ずっと録り続けない） */
const RECORD_LIMIT_MS = 60_000;
let limitTimer = 0;

async function startRecording() {
  if (starting.value || state.value === "recording" || !alive) return;
  starting.value = true;
  try {
    await recorder.start();
    if (!alive) {
      recorder.release();
      return;
    }
    state.value = "recording";
    limitTimer = window.setTimeout(() => {
      if (state.value === "recording") void finishRecording();
    }, RECORD_LIMIT_MS);
  } catch {
    error.value = t("practice.micError");
    showKeyboard.value = true;
  } finally {
    starting.value = false;
  }
}

/** 録り終えて、文字にして送る */
async function finishRecording() {
  clearTimeout(limitTimer);
  const audio = await recorder.stop();
  // 録れていない（入れ物だけ）なら、文字起こしに送らない。次からはマイクを開き直す
  if (audio.size < MIN_RECORDING_BYTES) {
    recorder.failed();
    error.value = t("practice.noVoice");
    state.value = "idle";
    return;
  }
  state.value = "transcribing";
  try {
    const { text } = await api.stt(props.scene.id, audio, lang.value);
    vlog(`stt ${text.length} chars`);
    if (!text) {
      // 声が届いていなかったかもしれない。次からはマイクを開き直す（1回目と同じやり方）
      recorder.failed();
      error.value = t("practice.noVoice");
      state.value = "idle";
      return;
    }
    await addMine(text);
  } catch (e) {
    // 文字起こしが使えないとき（クレジット切れなど）は、キーボードを開いて続けられるようにする
    if (state.value === "transcribing") {
      error.value = t("practice.sttError");
      showKeyboard.value = true;
    } else {
      error.value = (e as Error).message;
    }
    state.value = "idle";
  }
}

/** 録っている分を捨てる（もう一度聞く・キーボードに切り替えるとき） */
async function discardRecording() {
  clearTimeout(limitTimer);
  await recorder.stop();
  state.value = "idle";
}

async function toggleMic() {
  unlockAudio();
  if (starting.value) return;
  error.value = "";
  audioBlocked.value = false;
  if (state.value === "speaking") {
    stopSpeaking();
    state.value = "idle";
  }
  if (state.value === "recording") await finishRecording();
  else await startRecording();
}

async function sendTyped() {
  unlockAudio();
  const text = typed.value.trim();
  if (!text || state.value !== "idle") return;
  typed.value = "";
  await addMine(text);
}

/**
 * 最後の相手の言葉を、ゆっくり流し直す。流れている途中なら、止めて最初から（重ねない）。
 * 聞き取りに入っていたら、録った分は捨てて聞き直す（聞き終えたら、また聞き取りに入る）。
 */
async function replayLast() {
  unlockAudio();
  const last = [...turns.value].reverse().find((t) => t.speaker === "partner");
  if (!last) return;
  if (state.value === "recording") await discardRecording();
  await say(last.text, true);
}

/** 赤ペンへ進めるか（文字にしている途中・相手が考えている途中は待つ） */
const canFinish = computed(
  () =>
    turns.value.some((x) => x.speaker === "me") &&
    !starting.value &&
    state.value !== "transcribing" &&
    state.value !== "thinking",
);
/** 赤ペンへ。相手が話している途中でも、聞き取りの途中でも進める（声は止め、録った分は捨てる） */
async function finish() {
  if (!canFinish.value) return;
  stopSpeaking();
  if (state.value === "recording") await discardRecording();
  state.value = "idle";
  emit("finish", turns.value, style.value);
}
/** 場面の一覧へ。話した後なら、練習が消えることを確かめる */
function back() {
  if (turns.value.some((x) => x.speaker === "me") && !window.confirm(t("practice.backConfirm")))
    return;
  emit("back");
}

/** キーボードに切り替えたら、聞き取りはやめる */
function toggleKeyboard() {
  showKeyboard.value = !showKeyboard.value;
  if (showKeyboard.value && state.value === "recording") void discardRecording();
}

onMounted(async () => {
  if (props.health.claude) await partnerTurn();
});
onBeforeUnmount(() => {
  alive = false;
  clearTimeout(limitTimer);
  stopSpeaking();
  recorder.release();
});

/**
 * 「本番で聞かれること」（asks。Can do の文に書かれた伝えることを、受付が聞く順に並べたもの）の横に、
 * 練習用の答え（practiceInfo）を付ける。見出しが同じか、片方が片方を含むか、「・」で区切った語が重なれば同じ項目とみなす。
 */
const bare = (s: string) => s.replace(/[（(].*?[）)]/g, "").trim();
const words = (s: string) =>
  bare(s)
    .split(/[・、/／]/)
    .filter(Boolean);
function matches(askLabel: string, infoLabel: string): boolean {
  const a = bare(askLabel);
  const b = bare(infoLabel);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a) || askLabel.includes(b)) return true;
  const wa = words(askLabel);
  return words(infoLabel).some((w) => wa.includes(w));
}
const askRows = computed(() =>
  props.scene.asks.map((a) => ({
    key: a.key,
    label: a.label,
    tr: askTr(props.scene.id, a.key),
    // 名前（〔名前〕など）は、画面の言語ごとの架空の人物に差し替える
    value: fillPersona(
      props.scene.practiceInfo.find((i) => matches(a.label, i.label))?.value ?? "",
      lang.value,
    ),
  })),
);
/** どの「聞かれること」にも付かなかった練習用の情報（下にそのまま出す） */
const restInfo = computed(() =>
  props.scene.practiceInfo
    .filter((i) => !props.scene.asks.some((a) => matches(a.label, i.label)))
    .map((i) => ({
      label: i.label,
      tr: infoTr(props.scene.id, i.label),
      value: fillPersona(i.value, lang.value),
    })),
);

const stateLabel = computed<Record<string, string>>(() => ({
  idle: "",
  recording: t("practice.recording"),
  transcribing: t("practice.transcribing"),
  thinking: t("practice.thinking"),
  speaking: t("practice.speaking"),
}));
</script>

<template>
  <section class="head">
    <div>
      <p class="small muted">
        予行演習 ・ 生活Can do {{ scene.candoNo }}（{{ scene.cando?.level }}）
      </p>
      <h1>{{ scene.title }}</h1>
      <p v-if="sceneTr(scene.id)" class="tr">{{ sceneTr(scene.id)?.title }}</p>
      <p class="muted">{{ t("practice.partner") }}: {{ scene.partnerRole }}</p>
    </div>
    <div class="opts no-print">
      <label class="small">
        {{ t("practice.speed") }}
        <select v-model="speed" :disabled="turns.length > 1">
          <option value="slow">{{ t("practice.speed.slow") }}</option>
          <option value="natural">{{ t("practice.speed.natural") }}</option>
        </select>
      </label>
      <label class="small">
        {{ t("practice.style") }}
        <select
          v-model="styleChoice"
          :disabled="turns.length > 1"
          @change="style = styleChoice === 'random' ? randomStyle() : styleChoice"
        >
          <option value="random">{{ t("practice.style.random") }}</option>
          <option v-for="(_label, key) in STYLE_LABELS" :key="key" :value="key">
            {{ t(`style.${key}`) }}
          </option>
        </select>
      </label>
      <label class="small check">
        <input v-model="furigana" type="checkbox" />
        {{ t("practice.furigana") }}
      </label>
    </div>
  </section>

  <div class="layout">
    <aside class="info card">
      <h2 class="small">{{ t("practice.asks") }}</h2>
      <ol class="asks">
        <li v-for="a in askRows" :key="a.key">
          <!-- 日本語以外（やさしい日本語も）では、訳だけを見出しにする。答え（言うこと）は日本語のまま -->
          <span class="al tx">{{ a.tr || a.label }}</span>
          <span v-if="a.value" class="av">{{ a.value }}</span>
        </li>
      </ol>
      <h2 v-if="restInfo.length" class="small rest">{{ t("practice.info") }}</h2>
      <dl v-if="restInfo.length">
        <template v-for="i in restInfo" :key="i.label">
          <dt class="tx">{{ i.tr || i.label }}</dt>
          <dd>{{ i.value }}</dd>
        </template>
      </dl>
      <p class="small muted">{{ t("practice.infoNote") }}</p>
      <div v-if="previous?.length" class="prev">
        <h2 class="small hand tx">{{ t("practice.previous") }}</h2>
        <ol>
          <li v-for="m in previous" :key="m.priority">
            <span class="was">「{{ m.quote }}」</span>
            <span class="hand next">→ {{ m.next }}</span>
          </li>
        </ol>
      </div>
    </aside>

    <section class="call card">
      <p v-if="turns.length" class="small muted tap-hint tx">
        {{ t(isJa ? "practice.tapToEasy" : "practice.tapToTranslate") }}
      </p>
      <p v-if="hasTerms" class="small tap-hint terms-hint tx">
        <span class="term-sample">{{ t("glossary.word") }}</span> {{ t("glossary.tapHint") }}
      </p>
      <div ref="logEl" class="log" aria-live="polite">
        <p v-if="!health.claude" class="muted">
          {{ t("practice.noClaude") }}
        </p>
        <div v-for="(tn, i) in turns" :key="i" :class="['turn', tn.speaker]">
          <span class="who">{{
            t(tn.speaker === "partner" ? "common.partner" : "common.me")
          }}</span>
          <!-- タップすると意味が出る。ふりがなは Furifont（読みを選んだ漢字には salt をかける） -->
          <p
            :class="['line', { furi: furigana }]"
            role="button"
            tabindex="0"
            :aria-expanded="shown[i] ? 'true' : 'false'"
            @click="toggleGloss(i)"
            @keydown.enter.prevent="toggleGloss(i)"
          >
            <template v-for="(pt, k) in lineParts(tn.text, tn.speaker)" :key="k">
              <!-- 用語集の語: 下線を引き、タップで意味（文全体の意味とは別） -->
              <span
                v-if="pt.id"
                class="term"
                role="button"
                tabindex="0"
                :aria-expanded="termOpen[i] === pt.id ? 'true' : 'false'"
                @click.stop="toggleTerm(i, pt.id)"
                @keydown.enter.stop.prevent="toggleTerm(i, pt.id)"
                ><template v-if="pt.segs"
                  ><span
                    v-for="(sg, j) in pt.segs"
                    :key="j"
                    :style="sg.salt ? { fontFeatureSettings: `'salt' ${sg.salt}` } : undefined"
                    >{{ sg.text }}</span
                  ></template
                ><template v-else>{{ pt.text }}</template></span
              >
              <template v-else-if="pt.segs"
                ><span
                  v-for="(sg, j) in pt.segs"
                  :key="j"
                  :style="sg.salt ? { fontFeatureSettings: `'salt' ${sg.salt}` } : undefined"
                  >{{ sg.text }}</span
                ></template
              >
              <template v-else>{{ pt.text }}</template>
            </template>
          </p>
          <p v-if="shown[i]" :class="['gloss', glossLang === 'easy' ? { furi: furigana } : 'tx']">
            {{ glosses[i] ?? "…" }}
          </p>
          <div v-if="termOpen[i] && termById(termOpen[i]!)" class="termbox" :data-termbox="i">
            <TermInfo :entry="termById(termOpen[i]!)!" :lang="lang" />
          </div>
        </div>
        <p v-if="ended" class="ended hand tx">
          {{ t(scene.channel === "counter" ? "practice.endedCounter" : "practice.ended") }}
        </p>
      </div>

      <p v-if="audioBlocked" class="status small blocked" aria-live="polite">
        {{ t("practice.audioBlocked") }}
      </p>
      <p v-else class="status small muted" aria-live="polite">{{ stateLabel[state] }}</p>
      <p v-if="error" class="error small">{{ error }}</p>
      <pre v-if="debug" class="debug">{{ voiceLog.join("\n") }}</pre>

      <!-- 電話が終わったら、すぐ赤ペンへ進めるボタンだけにする（「もう一度聞く」の押しまちがいを防ぐ） -->
      <div v-if="ended" class="done no-print">
        <button class="btn red" type="button" :disabled="!canFinish" @click="finish">
          {{ t("practice.toReview") }}
        </button>
      </div>
      <div v-else class="controls no-print">
        <button
          v-if="health.stt"
          :class="['mic', { rec: state === 'recording' }]"
          type="button"
          :disabled="!health.claude || starting || state === 'transcribing' || state === 'thinking'"
          :aria-pressed="state === 'recording'"
          @click="toggleMic"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path
              d="M5 11a7 7 0 0 0 14 0M12 18v3"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
            />
          </svg>
          <!-- 相手が話している間は「話す」と出さない（自分の番に見えてしまう）。押せば止めて話せる -->
          <span>{{
            t(
              state === "recording"
                ? "practice.talkDone"
                : state === "speaking"
                  ? "practice.talkInterrupt"
                  : "practice.talk",
            )
          }}</span>
        </button>
        <button
          :class="['btn', audioBlocked ? 'red' : 'ghost']"
          type="button"
          :disabled="!turns.length || starting || state === 'transcribing' || state === 'thinking'"
          @click="replayLast"
        >
          {{ t("practice.replay") }}
        </button>
        <button class="btn ghost small" type="button" @click="toggleKeyboard">
          {{ t("practice.keyboard") }}
        </button>
      </div>
      <form v-if="showKeyboard && !ended" class="typed no-print" @submit.prevent="sendTyped">
        <label class="small" for="typed">{{ t("practice.typed") }}</label>
        <div class="row">
          <input
            id="typed"
            v-model="typed"
            type="text"
            autocomplete="off"
            :disabled="!health.claude"
          />
          <button class="btn" type="submit" :disabled="!typed.trim() || state !== 'idle'">
            {{ t("practice.send") }}
          </button>
        </div>
      </form>
    </section>
  </div>

  <div class="foot no-print">
    <button class="btn ghost" type="button" @click="back">{{ t("practice.back") }}</button>
    <button v-if="!ended" class="btn red" type="button" :disabled="!canFinish" @click="finish">
      {{ t("practice.toReviewEarly") }}
    </button>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.head h1 {
  font-size: 24px;
}
.tr {
  font-size: 16px;
  font-weight: 500;
}
select {
  font: inherit;
  margin-left: 6px;
}
.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 720px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
.asks {
  margin: 8px 0 4px;
  padding: 0;
  list-style: none;
  counter-reset: ask;
  display: grid;
  gap: 6px;
  font-size: 14px;
}
.asks li {
  counter-increment: ask;
  display: grid;
  gap: 1px;
}
.asks .al {
  font-weight: 700;
}
.asks .al::before {
  content: counter(ask) " ";
  color: var(--red);
  font-weight: 700;
}
/* スマホでは、聞かれることの下に会話が来るので、1行にまとめて高さを抑える */
@media (max-width: 720px) {
  .asks li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
    align-items: baseline;
  }
}
.asks .av {
  color: var(--ink);
}
.rest {
  margin-top: 10px;
}
.info dl {
  margin: 8px 0;
  display: grid;
  gap: 2px;
}
.info dt {
  font-size: 12px;
  color: var(--muted);
}
.info dd {
  margin: 0 0 6px;
}
.prev {
  border-top: 1px dashed var(--red);
  margin-top: 12px;
  padding-top: 8px;
}
.prev ol {
  margin: 6px 0 0;
  padding-left: 1.2em;
  display: grid;
  gap: 8px;
  font-size: 14px;
}
.prev li {
  display: grid;
}
.prev .was {
  color: var(--muted);
  text-decoration: line-through;
}
.prev .next {
  font-size: 16px;
}
.call {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.log {
  display: grid;
  gap: 10px;
  max-height: 52vh;
  overflow-y: auto;
  padding-right: 4px;
}
.turn {
  display: grid;
  gap: 2px;
  max-width: 85%;
}
.turn .line {
  border-radius: 12px;
  padding: 8px 12px;
  cursor: pointer;
}
.turn.partner .line {
  background: var(--other);
}
.turn.me {
  justify-self: end;
}
.turn.me .line {
  border: 1px solid var(--line);
}
/* タップしたときの意味（吹き出しの下に小さく） */
.gloss {
  font-size: 14px;
  color: var(--muted);
  margin: 2px 6px 0;
}
.turn.me .gloss {
  text-align: right;
}
/* 用語集の語: 点線の下線（赤ペンの赤・波線とは別の色と形） */
.term {
  text-decoration: underline dotted var(--term) 2px;
  text-underline-offset: 5px;
  cursor: help;
}
.term[aria-expanded="true"] {
  background: var(--term-soft);
  border-radius: 4px;
}
.termbox {
  margin: 4px 0 2px;
  padding: 8px 10px;
  border-left: 3px solid var(--term);
  background: var(--term-soft);
  border-radius: 0 8px 8px 0;
}
.terms-hint {
  margin: 0;
  color: var(--muted);
}
.term-sample {
  text-decoration: underline dotted var(--term) 2px;
  text-underline-offset: 4px;
}
.tap-hint {
  margin: 0;
}
.check {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.done {
  display: flex;
  justify-content: center;
}
.done .btn {
  font-size: 18px;
  padding: 12px 32px;
}
.who {
  font-size: 11px;
  color: var(--muted);
}
.turn.me .who {
  text-align: right;
}
.ended {
  text-align: center;
  font-size: 18px;
}
.status {
  min-height: 1.5em;
}
.debug {
  font-size: 11px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  background: var(--other);
  border-radius: 6px;
  padding: 6px 8px;
}
.status.blocked {
  color: var(--red);
  font-weight: 700;
}
.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.mic {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 999px;
  background: var(--red);
  color: var(--paper);
  padding: 12px 24px;
  font-size: 18px;
  font-weight: 700;
}
.mic.rec {
  animation: pulse 1.2s ease-in-out infinite;
}
.mic:disabled {
  opacity: 0.5;
}
@keyframes pulse {
  50% {
    box-shadow: 0 0 0 10px var(--red-soft);
  }
}
@media (prefers-reduced-motion: reduce) {
  .mic.rec {
    animation: none;
    outline: 3px solid var(--red-soft);
  }
}
.typed .row {
  display: flex;
  gap: 8px;
}
.typed input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink);
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}
</style>
