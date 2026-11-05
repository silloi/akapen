<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { Speed } from "../../shared/prompts.ts";
import type { Mark, Turn } from "../../shared/types.ts";
import { api, type Health, type SceneWithCando } from "../lib/api.ts";
import { Recorder, speak, stopSpeaking } from "../lib/voice.ts";

const props = defineProps<{
  scene: SceneWithCando;
  health: Health;
  previous?: Mark[];
  attempt?: number;
}>();
const emit = defineEmits<{ finish: [Turn[]]; back: [] }>();

const turns = ref<Turn[]>([]);
const speed = ref<Speed>("slow");
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
  state.value = "speaking";
  await speak(text, speed.value === "slow", props.health.tts);
  state.value = "idle";
}

async function partnerTurn() {
  state.value = "thinking";
  error.value = "";
  try {
    const r = await api.turn(props.scene.id, speed.value, turns.value);
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
      error.value = "マイクが使えません。キーボードで入力できます。";
      showKeyboard.value = true;
    }
    return;
  }
  const audio = await recorder.stop();
  state.value = "transcribing";
  try {
    const { text } = await api.stt(props.scene.id, audio);
    if (!text) {
      error.value = "声が聞き取れませんでした。もう一度話してください。";
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

const stateLabel: Record<string, string> = {
  idle: "",
  recording: "録音しています。話しおわったら、もう一度おしてください。",
  transcribing: "文字にしています…",
  thinking: "相手が考えています…",
  speaking: "相手が話しています…",
};
</script>

<template>
  <section class="head">
    <div>
      <p class="small muted">
        予行演習 ・ 生活Can do {{ scene.candoNo }}（{{ scene.cando?.level }}）
      </p>
      <h1>{{ scene.title }}</h1>
      <p class="muted">相手: {{ scene.partnerRole }}</p>
    </div>
    <div class="opts no-print">
      <label class="small">
        相手の話す速さ
        <select v-model="speed" :disabled="turns.length > 1">
          <option value="slow">ゆっくり、はっきり</option>
          <option value="natural">ふつう</option>
        </select>
      </label>
    </div>
  </section>

  <div class="layout">
    <aside class="info card">
      <h2 class="small">練習で使う情報（架空）</h2>
      <dl>
        <template v-for="i in scene.practiceInfo" :key="i.label">
          <dt>{{ i.label }}</dt>
          <dd>{{ i.value }}</dd>
        </template>
      </dl>
      <p class="small muted">自分の本当の名前や電話番号は言わなくて大丈夫です。</p>
      <div v-if="previous?.length" class="prev">
        <h2 class="small hand">前回の赤ペン ・ 今回はこう言う</h2>
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
          Claude につながっていないので、予行演習はできません。
        </p>
        <div v-for="(t, i) in turns" :key="i" :class="['turn', t.speaker]">
          <span class="who">{{ t.speaker === "partner" ? "相手" : "わたし" }}</span>
          <p>{{ t.text }}</p>
        </div>
        <p v-if="ended" class="ended hand">電話が終わりました。赤ペンを見てみましょう。</p>
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
          <span>{{ state === "recording" ? "話しおわった" : "話す" }}</span>
        </button>
        <button class="btn ghost" type="button" :disabled="!turns.length" @click="replayLast">
          もう一度聞く
        </button>
        <button class="btn ghost small" type="button" @click="showKeyboard = !showKeyboard">
          キーボード
        </button>
      </div>
      <form v-if="showKeyboard && !ended" class="typed no-print" @submit.prevent="sendTyped">
        <label class="small" for="typed">話すかわりに入力する</label>
        <div class="row">
          <input
            id="typed"
            v-model="typed"
            type="text"
            autocomplete="off"
            :disabled="!health.claude"
          />
          <button class="btn" type="submit" :disabled="!typed.trim() || state !== 'idle'">
            送る
          </button>
        </div>
      </form>
    </section>
  </div>

  <div class="foot no-print">
    <button class="btn ghost" type="button" @click="emit('back')">場面にもどる</button>
    <button
      class="btn red"
      type="button"
      :disabled="!turns.some((t) => t.speaker === 'me') || state !== 'idle'"
      @click="emit('finish', turns)"
    >
      {{ ended ? "赤ペンを見る" : "ここで終えて、赤ペンを見る" }}
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
