<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { CanDo } from "../../shared/types.ts";
import { api, type Health, type SceneWithCando } from "../lib/api.ts";
import { sceneTr, t } from "../lib/i18n.ts";

const props = defineProps<{ scenes: SceneWithCando[]; health: Health }>();
/** 手書きの4つを先頭に、残りは大分類ごと */
const featured = computed(() => props.scenes.filter((s) => s.status !== "draft"));
/** 絞り込み（電話 / 窓口） */
const channel = ref<"all" | "phone" | "counter">("all");
const rest = computed(() => {
  const map = new Map<string, SceneWithCando[]>();
  for (const s of props.scenes.filter(
    (x) =>
      x.status === "draft" && (channel.value === "all" || (x.channel ?? "phone") === channel.value),
  )) {
    const key = s.cando?.major ?? "その他";
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map.entries()];
});
const emit = defineEmits<{ choose: [SceneWithCando]; sample: [] }>();

const others = ref<(CanDo & { safety: boolean })[]>([]);
onMounted(async () => {
  others.value = await api.phoneCandos().catch(() => []);
});
const groups = computed(() => {
  const map = new Map<string, (CanDo & { safety: boolean })[]>();
  for (const c of others.value) {
    const list = map.get(c.major) ?? [];
    list.push(c);
    map.set(c.major, list);
  }
  return [...map.entries()];
});
</script>

<template>
  <section class="intro">
    <h1>{{ t("home.title") }}</h1>
    <p>
      {{ t("home.lead1") }}<span class="hand">{{ t("home.lead.highlight") }}</span
      >{{ t("home.lead2") }}
    </p>
    <p class="small muted">{{ t("home.note") }}</p>
  </section>

  <section class="list">
    <h2 class="h">{{ t("home.choose") }}</h2>
    <div class="grid">
      <button
        v-for="s in featured"
        :key="s.id"
        class="scene"
        type="button"
        @click="emit('choose', s)"
      >
        <span class="meta">
          <span class="badge">{{ s.cando?.level }}</span>
          <span class="badge">生活Can do {{ s.candoNo }}</span>
          <span v-if="s.medical" class="badge">{{ t("common.receptionOnly") }}</span>
        </span>
        <span class="title">{{ s.title }}</span>
        <span v-if="sceneTr(s.id)" class="tr">{{ sceneTr(s.id)?.title }}</span>
        <span class="sum">{{ sceneTr(s.id)?.summary ?? s.summary }}</span>
      </button>
    </div>
    <h2 class="h drafts-h">
      {{ t("home.more") }} <span class="small muted">{{ scenes.length - featured.length }}</span>
    </h2>
    <div class="chips" role="group">
      <button type="button" :aria-pressed="channel === 'all'" @click="channel = 'all'">
        {{ t("home.filter.all") }}
      </button>
      <button type="button" :aria-pressed="channel === 'phone'" @click="channel = 'phone'">
        {{ t("common.phone") }}
      </button>
      <button type="button" :aria-pressed="channel === 'counter'" @click="channel = 'counter'">
        {{ t("common.counter") }}
      </button>
    </div>
    <div v-for="[major, list] in rest" :key="major" class="draft-group">
      <h3>{{ major }}</h3>
      <div class="grid">
        <button
          v-for="s in list"
          :key="s.id"
          class="scene"
          type="button"
          @click="emit('choose', s)"
        >
          <span class="meta">
            <span class="badge">{{ s.cando?.level }}</span>
            <span class="badge">{{
              t(s.channel === "counter" ? "common.counter" : "common.phone")
            }}</span>
            <span v-if="s.medical" class="badge">{{ t("common.receptionOnly") }}</span>
          </span>
          <span class="title">{{ s.title }}</span>
          <span v-if="sceneTr(s.id)" class="tr">{{ sceneTr(s.id)?.title }}</span>
          <span class="sum">{{ sceneTr(s.id)?.summary ?? s.summary }}</span>
        </button>
      </div>
    </div>
    <p class="sample">
      <button class="btn ghost" type="button" @click="emit('sample')">
        {{ t("home.sample") }}
      </button>
      <span class="small muted">{{ t("home.sampleNote") }}</span>
    </p>
    <p v-if="!health.claude" class="small muted">{{ t("home.noClaude") }}</p>
  </section>

  <section class="note card">
    <h2 class="h">{{ t("home.safety.title") }}</h2>
    <p>{{ t("home.safety.body") }}</p>
    <p class="small muted">{{ t("home.safety.note") }}</p>
  </section>

  <details v-if="groups.length" class="others">
    <summary>{{ t("home.others") }}</summary>
    <div v-for="[major, list] in groups" :key="major" class="group">
      <h3>{{ major }}</h3>
      <ul>
        <li v-for="c in list" :key="c.no">
          <span class="badge">{{ c.level }}</span>
          {{ c.case2 }}
          <span v-if="c.safety" class="safety">{{ t("home.others.safety") }}</span>
        </li>
      </ul>
    </div>
  </details>
</template>

<style scoped>
.intro {
  display: grid;
  gap: 10px;
  margin-bottom: 28px;
}
.intro h1 {
  font-size: clamp(24px, 4vw, 32px);
}
.h {
  font-size: 18px;
  margin-bottom: 12px;
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
.tr {
  font-size: 14px;
  font-weight: 500;
}
.drafts-h {
  margin-top: 28px;
}
.chips {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.chips button {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink);
  border-radius: 999px;
  padding: 2px 12px;
  font-size: 13px;
}
.chips button[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.draft-group h3 {
  font-size: 14px;
  color: var(--muted);
  margin: 12px 0 6px;
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
.sum {
  font-size: 14px;
  color: var(--muted);
}
.sample {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0 8px;
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
.group h3 {
  font-size: 15px;
  margin: 14px 0 4px;
}
.group ul {
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
