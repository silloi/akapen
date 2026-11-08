<script setup lang="ts">
/**
 * 場面に関係する公的な情報・手続きのページ（カンペの画面の下）。
 * リンク先は yasashii-refs の目録にある公的なページだけ（data/public-info.json、scripts/build-public-info.ts）。
 * カンペを作っている間も出しておく（作り終えると、カンペの下に残る）。
 */
import { computed, onMounted, shallowRef } from "vue";
import { catalogLang, type PublicInfoData } from "../../shared/public-info.ts";
import { lang, t, UI_LANGS, type UiLang } from "../lib/i18n.ts";

const props = defineProps<{ sceneId: string }>();

const data = shallowRef<PublicInfoData | null>(null);
onMounted(async () => {
  data.value = (await import("../../data/public-info.json")).default as unknown as PublicInfoData;
});

const items = computed(() => {
  const d = data.value;
  const s = d?.scenes[props.sceneId];
  if (!d || !s) return [];
  const l = lang.value;
  const tr = l === "ja" ? undefined : d.tr[l];
  const want = catalogLang(l);
  return s.ids
    .map((id) => d.resources.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      ...r,
      trName: tr?.[r.id]?.name,
      trDesc: tr?.[r.id]?.desc,
      // その人の言語の版があるか（日本語の画面ではやさしい日本語の版）
      has: l === "ja" ? r.languages.includes("ja-easy") : r.languages.includes(want),
      chapters:
        r.id === "life-work-guidebook"
          ? s.chapters.map((n) => ({
              n,
              name: (l === "ja" ? undefined : d.chapterTr[l]?.[n]) ?? d.chapters[n] ?? "",
            }))
          : [],
    }));
});
const langName = computed(() =>
  lang.value === "ja" ? UI_LANGS.easy : UI_LANGS[lang.value as UiLang],
);
</script>

<template>
  <section v-if="items.length" class="public-info no-print">
    <h2 class="tx">{{ t("info.title") }}</h2>
    <p class="small muted tx">{{ t("info.note") }}</p>
    <ul>
      <li v-for="r in items" :key="r.id">
        <a :href="r.url" target="_blank" rel="noopener" class="name">
          <span class="tx">{{ r.trName ?? r.label ?? r.name }}</span>
          <span aria-hidden="true" class="ext">↗</span>
        </a>
        <span v-if="(r.trName || r.label) && lang !== 'easy'" class="ja small muted">{{
          r.name
        }}</span>
        <p class="desc tx">{{ r.trDesc ?? r.desc }}</p>
        <p v-if="r.chapters.length" class="small chapters tx">
          {{ t("info.chapters") }}:
          <span v-for="c in r.chapters" :key="c.n" class="badge">{{ c.n }} {{ c.name }}</span>
        </p>
        <p class="small muted meta">
          <span>{{ r.publisher }}</span>
          <span>・{{ t("info.langs").replace("{n}", String(r.languages.length)) }}</span>
          <span v-if="r.has" class="has tx"
            >・{{ t("info.hasLang").replace("{lang}", langName) }}</span
          >
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.public-info {
  margin-top: 28px;
  display: grid;
  gap: 8px;
  border-top: 2px solid var(--ink);
  padding-top: 14px;
}
.public-info h2 {
  font-size: 18px;
}
ul {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
li {
  display: grid;
  gap: 2px;
}
.name {
  font-weight: 700;
  color: var(--term);
  text-underline-offset: 3px;
}
.ext {
  font-size: 12px;
  margin-left: 4px;
}
.desc {
  font-size: 14px;
}
.chapters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.meta {
  display: flex;
  flex-wrap: wrap;
}
.has {
  color: var(--ok);
}
</style>
