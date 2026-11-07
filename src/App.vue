<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { Akapen, Mark, Turn } from "../shared/types.ts";
import KanpeView from "./components/KanpeView.vue";
import LiveKanpe from "./components/LiveKanpe.vue";
import Practice from "./components/Practice.vue";
import Review from "./components/Review.vue";
import SceneList from "./components/SceneList.vue";
import { api, type Health, type SceneWithCando } from "./lib/api.ts";
import { SAMPLE_AKAPEN, SAMPLE_SCENE_ID, SAMPLE_TURNS } from "./lib/sample.ts";
import { lang, setLang, t, UI_LANGS, type UiLang } from "./lib/i18n.ts";
import { decodeKanpe, type SharedKanpe } from "./lib/share.ts";
import type { PartnerStyle } from "../shared/prompts.ts";

type View = "scenes" | "practice" | "review" | "kanpe" | "live";

const view = ref<View>("scenes");
// 画面を切り替えたら上から見せる（前の画面のスクロール位置を引きずると、スマホでは赤ペンが下まで送られた状態で開く）
watch(view, () => window.scrollTo({ top: 0 }));
const scenes = ref<SceneWithCando[]>([]);
const health = ref<Health>({ claude: false, stt: false, tts: false });
const scene = ref<SceneWithCando | null>(null);
const turns = ref<Turn[]>([]);
const akapen = ref<Akapen | null>(null);
const fixes = ref<Pick<Mark, "quote" | "next">[]>([]);
const isSample = ref(false);
/** 前回の赤ペン（もう一度練習するとき） */
const previous = ref<Mark[]>([]);
const attempt = ref(1);
/** 今回の相手の様子（赤ペンの画面で明かす） */
const style = ref<PartnerStyle>("normal");
const loadError = ref("");
/** QR から開いた本番用のカンペ */
const shared = ref<SharedKanpe | null>(null);

onMounted(async () => {
  shared.value = await decodeKanpe(location.hash);
  if (shared.value) {
    view.value = "live";
    return;
  }
  try {
    [scenes.value, health.value] = await Promise.all([api.scenes(), api.health()]);
  } catch (e) {
    loadError.value = (e as Error).message;
  }
});

function choose(s: SceneWithCando) {
  scene.value = s;
  turns.value = [];
  akapen.value = null;
  fixes.value = [];
  isSample.value = false;
  previous.value = [];
  attempt.value = 1;
  view.value = "practice";
}

/** 赤ペンを見た後、同じ場面をもう一度練習する。前回の赤ペンを持って行く */
function retry() {
  previous.value = akapen.value?.marks ?? [];
  attempt.value += 1;
  turns.value = [];
  akapen.value = null;
  fixes.value = [];
  isSample.value = false;
  view.value = "practice";
}

function showSample() {
  scene.value = scenes.value.find((s) => s.id === SAMPLE_SCENE_ID) ?? null;
  turns.value = SAMPLE_TURNS;
  akapen.value = SAMPLE_AKAPEN;
  fixes.value = [];
  isSample.value = true;
  view.value = "review";
}

function finishPractice(t: Turn[], s: PartnerStyle) {
  turns.value = t;
  style.value = s;
  akapen.value = null;
  fixes.value = [];
  view.value = "review";
}

function toKanpe(f: Pick<Mark, "quote" | "next">[]) {
  fixes.value = f;
  view.value = "kanpe";
}

function home() {
  if (shared.value) history.replaceState(null, "", location.pathname);
  shared.value = null;
  view.value = "scenes";
  if (!scenes.value.length) {
    void Promise.all([api.scenes(), api.health()]).then(([s, h]) => {
      scenes.value = s;
      health.value = h;
    });
  }
}
</script>

<template>
  <header class="top no-print">
    <button class="brand" type="button" @click="home">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <path d="M7 25 L22 10 L25 13 L10 28 L6 29 Z" fill="var(--red)" />
        <path d="M22 10 L24.5 7.5 L27.5 10.5 L25 13 Z" fill="var(--ink)" />
      </svg>
      <span>赤ペン</span>
    </button>
    <nav v-if="scene && view !== 'scenes'" class="steps" :aria-label="t('nav.progress')">
      <span :class="{ on: view === 'practice' }">{{ t("step.practice") }}</span>
      <span :class="{ on: view === 'review' }">{{ t("step.review") }}</span>
      <span :class="{ on: view === 'kanpe' }">{{ t("step.kanpe") }}</span>
    </nav>
    <label class="langpick small">
      <span class="sr">{{ t("lang.label") }}</span>
      <select :value="lang" @change="setLang(($event.target as HTMLSelectElement).value as UiLang)">
        <option v-for="(name, code) in UI_LANGS" :key="code" :value="code">{{ name }}</option>
      </select>
    </label>
  </header>

  <main class="wrap">
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <SceneList
      v-if="view === 'scenes'"
      :scenes="scenes"
      :health="health"
      @choose="choose"
      @sample="showSample"
    />
    <Practice
      v-else-if="view === 'practice' && scene"
      :scene="scene"
      :health="health"
      :previous="previous"
      :attempt="attempt"
      @finish="finishPractice"
      @back="home"
    />
    <Review
      v-else-if="view === 'review' && scene"
      :scene="scene"
      :turns="turns"
      :initial="akapen"
      :is-sample="isSample"
      :previous="previous"
      :attempt="attempt"
      :style-label="isSample ? '' : t(`style.${style}`)"
      @update:akapen="akapen = $event"
      @kanpe="toKanpe"
      @retry="retry"
    />
    <LiveKanpe v-else-if="view === 'live' && shared" :data="shared" />
    <KanpeView
      v-else-if="view === 'kanpe' && scene"
      :scene="scene"
      :fixes="fixes"
      :is-sample="isSample"
      @back="view = 'review'"
    />
  </main>

  <footer v-if="view !== 'live'" class="foot no-print">
    <p class="small muted">{{ t("footer.source") }}</p>
  </footer>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px max(16px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--line);
  background: var(--paper);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  color: var(--ink);
  font-size: 20px;
  font-weight: 700;
  padding: 0;
}
.steps {
  display: flex;
  gap: 14px;
  font-size: 14px;
  color: var(--muted);
}
.steps .on {
  color: var(--red);
  font-weight: 700;
}
.langpick select {
  font: inherit;
  font-size: 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--paper);
  color: var(--ink);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.wrap {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px max(16px, env(safe-area-inset-left)) 48px;
}
.foot {
  max-width: 880px;
  margin: 0 auto;
  padding: 0 16px 32px;
}
</style>
