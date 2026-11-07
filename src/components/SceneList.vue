<script lang="ts">
import { ref } from "vue";

/** 絞り込み（一覧に戻ってきても残す。ページを開き直すと戻る） */
const major = ref<string>("all");
const channel = ref<"" | "phone" | "counter">("");
const level = ref<"" | "A1" | "A2" | "B1" | "B2">("");
const checkedOnly = ref(false);
</script>

<script setup lang="ts">
// ref は上の script から（同じモジュール）
import { computed, onMounted } from "vue";
import type { CanDo } from "../../shared/types.ts";
import { api, type Health, type SceneWithCando } from "../lib/api.ts";
import { sceneTr, t, type UiKey } from "../lib/i18n.ts";
import HeroVideo from "./HeroVideo.vue";

const props = defineProps<{ scenes: SceneWithCando[]; health: Health }>();
const emit = defineEmits<{ choose: [SceneWithCando]; sample: [] }>();

/** 生活Can do の大分類（Ⅰ〜Ⅹ）。場面はこの順に、大分類ごとに並べる */
const MAJORS = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];
const LEVELS = ["A1", "A2", "B1", "B2"] as const;

function majorLabel(no: string, fallback = ""): string {
  const i = MAJORS.indexOf(no);
  return i < 0 ? fallback : t(`major.${i + 1}` as UiKey);
}
const channelOf = (s: SceneWithCando) => s.channel ?? "phone";
const checked = (s: SceneWithCando) => s.status !== "draft";

/** 絞り込みに合うか（分野のボタンの数を出すときは、分野だけ外して数える） */
function passes(s: SceneWithCando, ignoreMajor = false): boolean {
  return (
    (ignoreMajor || major.value === "all" || s.cando?.majorNo === major.value) &&
    (!channel.value || channelOf(s) === channel.value) &&
    (!level.value || s.cando?.level === level.value) &&
    (!checkedOnly.value || checked(s))
  );
}

const majors = computed(() =>
  MAJORS.filter((no) => props.scenes.some((s) => s.cando?.majorNo === no)).map((no) => ({
    no,
    count: props.scenes.filter((s) => s.cando?.majorNo === no && passes(s, true)).length,
  })),
);
const allCount = computed(() => props.scenes.filter((s) => passes(s, true)).length);

/** 先生が確かめた場面 → 電話 → 窓口、レベルの低い順 */
function sortKey(s: SceneWithCando): number {
  const lv = LEVELS.indexOf(s.cando?.level ?? "B2");
  return (checked(s) ? 0 : 100) + (channelOf(s) === "phone" ? 0 : 10) + lv;
}
const groups = computed(() => {
  const shown = props.scenes.filter((s) => passes(s));
  const keys = [...MAJORS, ""];
  return keys
    .map((no) => ({
      no,
      list: shown
        .filter(
          (s) =>
            (s.cando?.majorNo && MAJORS.includes(s.cando.majorNo) ? s.cando.majorNo : "") === no,
        )
        .sort((a, b) => sortKey(a) - sortKey(b)),
    }))
    .filter((g) => g.list.length);
});
const shownCount = computed(() => groups.value.reduce((n, g) => n + g.list.length, 0));
const filtered = computed(
  () => major.value !== "all" || !!channel.value || !!level.value || checkedOnly.value,
);
function reset() {
  major.value = "all";
  channel.value = "";
  level.value = "";
  checkedOnly.value = false;
}
const toggleChannel = (c: "phone" | "counter") => (channel.value = channel.value === c ? "" : c);
const toggleLevel = (l: (typeof LEVELS)[number]) => (level.value = level.value === l ? "" : l);

function toScenes() {
  document.getElementById("scenes")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const others = ref<(CanDo & { safety: boolean })[]>([]);
onMounted(async () => {
  others.value = await api.phoneCandos().catch(() => []);
});
const otherGroups = computed(() => {
  const map = new Map<string, (CanDo & { safety: boolean })[]>();
  for (const c of others.value) map.set(c.majorNo, [...(map.get(c.majorNo) ?? []), c]);
  return [...map.entries()].map(([no, list]) => ({
    no,
    label: majorLabel(no, list[0]?.major ?? ""),
    list,
  }));
});
</script>

<template>
  <section class="hero">
    <div class="copy">
      <h1>{{ t("home.title") }}</h1>
      <p class="lead">
        {{ t("home.lead1") }}<span class="hand tx">{{ t("home.lead.highlight") }}</span
        >{{ t("home.lead2") }}
      </p>
      <p class="small muted">{{ t("home.note") }}</p>
      <div class="cta">
        <a class="btn red" href="#scenes" @click.prevent="toScenes">{{ t("home.choose") }} ↓</a>
        <button class="btn ghost" type="button" @click="emit('sample')">
          {{ t("home.sample") }}
        </button>
      </div>
      <p class="small muted">{{ t("home.sampleNote") }}</p>
    </div>
    <HeroVideo class="media" />
  </section>

  <section id="scenes" class="list">
    <h2 class="h">
      {{ t("home.choose") }}
      <span class="small muted count"
        >{{ filtered ? `${shownCount} / ` : "" }}{{ scenes.length }}</span
      >
    </h2>

    <div class="filters">
      <div class="chips topics" role="group" :aria-label="t('home.filter.topic')">
        <button type="button" :aria-pressed="major === 'all'" @click="major = 'all'">
          {{ t("home.filter.all") }} <span class="n">{{ allCount }}</span>
        </button>
        <button
          v-for="m in majors"
          :key="m.no"
          type="button"
          class="tx"
          :aria-pressed="major === m.no"
          :disabled="!m.count && major !== m.no"
          @click="major = major === m.no ? 'all' : m.no"
        >
          {{ majorLabel(m.no) }} <span class="n">{{ m.count }}</span>
        </button>
      </div>
      <div class="row">
        <div
          class="chips"
          role="group"
          :aria-label="`${t('common.phone')} / ${t('common.counter')}`"
        >
          <button type="button" :aria-pressed="channel === 'phone'" @click="toggleChannel('phone')">
            {{ t("common.phone") }}
          </button>
          <button
            type="button"
            :aria-pressed="channel === 'counter'"
            @click="toggleChannel('counter')"
          >
            {{ t("common.counter") }}
          </button>
        </div>
        <div class="chips" role="group" :aria-label="t('home.filter.level')">
          <span class="small muted lab">{{ t("home.filter.level") }}</span>
          <button
            v-for="l in LEVELS"
            :key="l"
            type="button"
            :aria-pressed="level === l"
            @click="toggleLevel(l)"
          >
            {{ l }}
          </button>
        </div>
        <label class="small check">
          <input v-model="checkedOnly" type="checkbox" />
          {{ t("home.filter.checked") }}
        </label>
        <button v-if="filtered" type="button" class="small reset" @click="reset">
          {{ t("home.filter.reset") }}
        </button>
      </div>
    </div>

    <div v-for="g in groups" :key="g.no" class="group">
      <h3 class="tx">
        {{ majorLabel(g.no, g.list[0]?.cando?.major ?? "") }}
        <span class="n">{{ g.list.length }}</span>
      </h3>
      <div class="grid">
        <button
          v-for="s in g.list"
          :key="s.id"
          :class="['scene', { checked: checked(s) }]"
          type="button"
          @click="emit('choose', s)"
        >
          <span class="meta">
            <span v-if="checked(s)" class="badge ok">✓ {{ t("home.checked") }}</span>
            <span class="badge">{{ s.cando?.level }}</span>
            <span class="badge">{{
              t(channelOf(s) === "counter" ? "common.counter" : "common.phone")
            }}</span>
            <span v-if="s.medical" class="badge">{{ t("common.receptionOnly") }}</span>
          </span>
          <span class="title">{{ s.title }}</span>
          <span v-if="sceneTr(s.id)" class="tr">{{ sceneTr(s.id)?.title }}</span>
          <span class="sum">{{ sceneTr(s.id)?.summary ?? s.summary }}</span>
        </button>
      </div>
    </div>
    <div v-if="scenes.length && !groups.length" class="empty">
      <p class="muted">{{ t("home.empty") }}</p>
      <button class="btn ghost" type="button" @click="reset">{{ t("home.filter.reset") }}</button>
    </div>
    <p class="small muted draft-note">{{ t("home.draftNote") }}</p>
    <p v-if="!health.claude" class="small muted">{{ t("home.noClaude") }}</p>
  </section>

  <section class="note card">
    <h2 class="h">{{ t("home.safety.title") }}</h2>
    <p>{{ t("home.safety.body") }}</p>
    <p class="small muted">{{ t("home.safety.note") }}</p>
  </section>

  <details v-if="otherGroups.length" class="others">
    <summary>{{ t("home.others") }}</summary>
    <div v-for="g in otherGroups" :key="g.no" class="group">
      <h3>{{ g.label }}</h3>
      <ul>
        <li v-for="c in g.list" :key="c.no">
          <span class="badge">{{ c.level }}</span>
          {{ c.case2 }}
          <span v-if="c.safety" class="safety">{{ t("home.others.safety") }}</span>
        </li>
      </ul>
    </div>
  </details>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
  gap: 32px;
  align-items: center;
  margin-bottom: 36px;
}
.copy {
  display: grid;
  gap: 12px;
}
.copy h1 {
  font-size: clamp(26px, 4vw, 34px);
  line-height: 1.35;
  /* 日本語を文節で折り返す（「前／に」のような切れ方をしない。対応していないブラウザはふつうに折り返す） */
  word-break: auto-phrase;
}
.lead {
  font-size: 17px;
}
.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}
.cta .btn {
  text-decoration: none;
  padding: 10px 22px;
}
@media (max-width: 760px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .media {
    width: min(100%, 420px);
    justify-self: center;
  }
}
.h {
  font-size: 20px;
  margin-bottom: 10px;
}
.count {
  font-weight: 400;
  margin-left: 4px;
}
.filters {
  display: grid;
  gap: 10px;
  margin-bottom: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.chips button {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink);
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 14px;
  line-height: 1.6;
  white-space: nowrap;
}
.chips button[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.chips button:disabled {
  opacity: 0.4;
  cursor: default;
}
.n {
  font-size: 12px;
  opacity: 0.7;
  margin-left: 2px;
}
/* スマホでは分野のボタンを1行にして横にすべらせる（縦に長くしない） */
@media (max-width: 560px) {
  .topics {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin: 0 -16px;
    padding: 0 16px 4px;
    scrollbar-width: none;
  }
  .topics::-webkit-scrollbar {
    display: none;
  }
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}
.lab {
  margin-right: 2px;
}
.check {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.reset {
  border: 0;
  background: none;
  color: var(--red);
  text-decoration: underline;
  padding: 0;
}
.group h3 {
  font-size: 15px;
  margin: 18px 0 8px;
}
.group h3 .n {
  font-weight: 400;
  color: var(--muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 560px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.scene {
  display: grid;
  gap: 6px;
  align-content: start;
  text-align: left;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
}
.scene:hover {
  border-color: var(--red);
}
.scene.checked {
  border-color: var(--ok);
}
.scene.checked:hover {
  border-color: var(--red);
}
.badge.ok {
  border-color: var(--ok);
  color: var(--ok);
  background: var(--ok-soft);
}
.meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.title {
  font-size: 18px;
  font-weight: 700;
}
.tr {
  font-size: 14px;
  font-weight: 500;
}
.sum {
  font-size: 14px;
  color: var(--muted);
}
.empty {
  display: grid;
  gap: 10px;
  justify-items: start;
  margin: 16px 0;
}
.draft-note {
  margin-top: 16px;
}
.note {
  display: grid;
  gap: 8px;
  margin: 28px 0 16px;
}
.others summary {
  cursor: pointer;
  color: var(--muted);
}
.others .group h3 {
  font-size: 15px;
  margin: 14px 0 4px;
}
.others ul {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: 2px;
  font-size: 14px;
}
.safety {
  color: var(--red);
  font-size: 12px;
  margin-left: 6px;
}
</style>
