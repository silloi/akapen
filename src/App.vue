<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Akapen, Mark, Turn } from "../shared/types.ts";
import KanpeView from "./components/KanpeView.vue";
import Practice from "./components/Practice.vue";
import Review from "./components/Review.vue";
import SceneList from "./components/SceneList.vue";
import { api, type Health, type SceneWithCando } from "./lib/api.ts";
import { SAMPLE_AKAPEN, SAMPLE_SCENE_ID, SAMPLE_TURNS } from "./lib/sample.ts";

type View = "scenes" | "practice" | "review" | "kanpe";

const view = ref<View>("scenes");
const scenes = ref<SceneWithCando[]>([]);
const health = ref<Health>({ claude: false, stt: false, tts: false });
const scene = ref<SceneWithCando | null>(null);
const turns = ref<Turn[]>([]);
const akapen = ref<Akapen | null>(null);
const fixes = ref<Pick<Mark, "quote" | "next">[]>([]);
const isSample = ref(false);
const loadError = ref("");

onMounted(async () => {
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

function finishPractice(t: Turn[]) {
  turns.value = t;
  akapen.value = null;
  fixes.value = [];
  view.value = "review";
}

function toKanpe(f: Pick<Mark, "quote" | "next">[]) {
  fixes.value = f;
  view.value = "kanpe";
}

function home() {
  view.value = "scenes";
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
    <nav v-if="scene && view !== 'scenes'" class="steps" aria-label="すすみぐあい">
      <span :class="{ on: view === 'practice' }">1 予行演習</span>
      <span :class="{ on: view === 'review' }">2 赤ペン</span>
      <span :class="{ on: view === 'kanpe' }">3 本番のカンペ</span>
    </nav>
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
      @finish="finishPractice"
      @back="home"
    />
    <Review
      v-else-if="view === 'review' && scene"
      :scene="scene"
      :turns="turns"
      :initial="akapen"
      :is-sample="isSample"
      @kanpe="toKanpe"
      @retry="choose(scene)"
    />
    <KanpeView
      v-else-if="view === 'kanpe' && scene"
      :scene="scene"
      :fixes="fixes"
      :is-sample="isSample"
      @back="view = 'review'"
    />
  </main>

  <footer class="foot no-print">
    <p class="small muted">
      場面は、文化審議会国語分科会「地域における日本語教育の在り方について」（報告）別冊「日本語教育の参照枠」に基づく「生活Can
      do」一覧（令和4年11月29日、文化庁）を加工して作成。会話の相手・店・地名・電話番号はすべて架空です。
    </p>
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
