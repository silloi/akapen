<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { randomStyle, STYLE_LABELS, type PartnerStyle, type Speed } from "../../shared/prompts.ts";
import type { Mark, Turn } from "../../shared/types.ts";
import { api, type Health, type SceneWithCando } from "../lib/api.ts";
import { askTr, sceneTr, t } from "../lib/i18n.ts";
import { Recorder, speak, stopSpeaking } from "../lib/voice.ts";

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
  state.value = "speaking";
  await speak(text, speed.value === "slow", props.health.tts);
  state.value = "idle";
}

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

async function toggleMic() {
  error.value = "";
  if (state.value === "speaking") stopSpeaking();
  if (state.value !== "recording") {
    try {
      await recorder.start();
      state.value = "recording";
    } catch {
      error.value = t("practice.micError");
      showKeyboard.value = true;
    }
    return;
  }
  const audio = await recorder.stop();
  state.value = "transcribing";
  try {
    const { text } = await api.stt(props.scene.id, audio);
    if (!text) {
      error.value = t("practice.noVoice");
      state.value = "idle";
      return;
    }
    await addMine(text);
  } catch (e) {
    error.value = (e as Error).message;
    state.value = "idle";
  }
}

async function sendTyped() {
  const text = typed.value.trim();
  if (!text || state.value !== "idle") return;
  typed.value = "";
  await addMine(text);
}

function replayLast() {
  const last = [...turns.value].reverse().find((t) => t.speaker === "partner");
  if (last) void speak(last.text, true, props.health.tts);
}

onMounted(async () => {
  if (props.health.claude) await partnerTurn();
});
onBeforeUnmount(stopSpeaking);

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
    value: props.scene.practiceInfo.find((i) => matches(a.label, i.label))?.value ?? "",
  })),
);
/** どの「聞かれること」にも付かなかった練習用の情報（下にそのまま出す） */
const restInfo = computed(() =>
  props.scene.practiceInfo.filter((i) => !props.scene.asks.some((a) => matches(a.label, i.label))),
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
    </div>
  </section>

  <div class="layout">
    <aside class="info card">
      <h2 class="small">{{ t("practice.asks") }}</h2>
      <ol class="asks">
        <li v-for="a in askRows" :key="a.key">
          <span class="al">
            {{ a.label }}
            <span v-if="a.tr" class="atr tx">{{ a.tr }}</span>
          </span>
          <span v-if="a.value" class="av">{{ a.value }}</span>
        </li>
      </ol>
      <h2 v-if="restInfo.length" class="small rest">{{ t("practice.info") }}</h2>
      <dl v-if="restInfo.length">
        <template v-for="i in restInfo" :key="i.label">
          <dt>{{ i.label }}</dt>
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
      <div ref="logEl" class="log" aria-live="polite">
        <p v-if="!health.claude" class="muted">
          {{ t("practice.noClaude") }}
        </p>
        <div v-for="(tn, i) in turns" :key="i" :class="['turn', tn.speaker]">
          <span class="who">{{
            t(tn.speaker === "partner" ? "common.partner" : "common.me")
          }}</span>
          <p>{{ tn.text }}</p>
        </div>
        <p v-if="ended" class="ended hand tx">
          {{ t(scene.channel === "counter" ? "practice.endedCounter" : "practice.ended") }}
        </p>
      </div>

      <p class="status small muted" aria-live="polite">{{ stateLabel[state] }}</p>
      <p v-if="error" class="error small">{{ error }}</p>

      <div class="controls no-print">
        <button
          v-if="health.stt && !ended"
          :class="['mic', { rec: state === 'recording' }]"
          type="button"
          :disabled="!health.claude || state === 'transcribing' || state === 'thinking'"
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
          <span>{{ t(state === "recording" ? "practice.talkDone" : "practice.talk") }}</span>
        </button>
        <button class="btn ghost" type="button" :disabled="!turns.length" @click="replayLast">
          {{ t("practice.replay") }}
        </button>
        <button class="btn ghost small" type="button" @click="showKeyboard = !showKeyboard">
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
    <button class="btn ghost" type="button" @click="emit('back')">{{ t("practice.back") }}</button>
    <button
      class="btn red"
      type="button"
      :disabled="!turns.some((t) => t.speaker === 'me') || state !== 'idle'"
      @click="emit('finish', turns, style)"
    >
      {{ t(ended ? "practice.toReview" : "practice.toReviewEarly") }}
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
.asks .atr {
  font-weight: 500;
  color: var(--muted);
  margin-left: 4px;
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
.turn p {
  border-radius: 12px;
  padding: 8px 12px;
}
.turn.partner p {
  background: var(--other);
}
.turn.me {
  justify-self: end;
}
.turn.me p {
  border: 1px solid var(--line);
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
