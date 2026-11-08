<script setup lang="ts">
/**
 * 1つの語の意味（用語集）。語・読み・その言語の訳・やさしい日本語の説明・出典。
 * 公的な用語集のものは出典を、Claude の下書き・訳はそのことを、必ず書く。
 */
import { computed, watchEffect } from "vue";
import type { GlossEntry } from "../../shared/glossary.ts";
import { glossary, glossTrs, loadGlossTr } from "../lib/glossary.ts";
import { t } from "../lib/i18n.ts";

const props = defineProps<{
  entry: GlossEntry;
  /** 訳の言語（画面の言語か、カンペの言語）。ja・easy なら訳を出さない */
  lang: string;
  /** 出典を短く（カンペの中など） */
  compact?: boolean;
}>();

watchEffect(() => void loadGlossTr(props.lang));
const isJa = computed(() => props.lang === "ja" || props.lang === "easy");
const tr = computed(() => (isJa.value ? undefined : glossTrs.value[props.lang]?.[props.entry.id]));
/** 英語の画面で、対訳辞書の標準の英訳があればそれを先に */
const trTerm = computed(() =>
  props.lang === "en" && props.entry.en ? props.entry.en : tr.value?.[0],
);
const source = computed(() => glossary.value?.sources.get(props.entry.source));
/** 一覧の中で使う短い出典（公的な用語集を出した機関） */
const SHORT: Record<string, string> = {
  "plain-japanese-rewrites": "出入国在留管理庁・文化庁",
  "mhlw-tagengo-yougo": "厚生労働省",
  "jlt-standard-dict": "法務省",
};
const draft = computed(() => props.entry.source === "draft");
/** 訳が Claude のものか（厚労省の用語集の訳・対訳辞書の英訳は公式） */
const trByClaude = computed(
  () => !isJa.value && tr.value?.[2] === "c" && !(props.lang === "en" && props.entry.en),
);
</script>

<template>
  <div class="term-info">
    <p class="head">
      <b class="ja">{{ entry.term }}</b>
      <span v-if="entry.reading && entry.reading !== entry.term" class="reading">
        （{{ entry.reading }}）</span
      >
      <span v-if="trTerm" class="trterm tx" :lang="isJa ? undefined : lang">{{ trTerm }}</span>
    </p>
    <p v-if="tr?.[1]" class="def tx" :lang="lang">{{ tr[1] }}</p>
    <p v-if="entry.easy" :class="['easy', { sub: !isJa }]">{{ entry.easy }}</p>
    <p v-else-if="entry.en && lang !== 'en'" class="easy sub">English: {{ entry.en }}</p>
    <p v-if="compact" class="src">
      <span v-if="draft" class="tag draft">{{ t("glossary.draftShort") }}</span>
      <span v-else class="tag official">{{ t("glossary.official") }}: {{ SHORT[entry.source] }}</span>
      <template v-if="trByClaude"> ・ {{ t("glossary.trByClaude") }}</template>
    </p>
    <p v-else class="src">
      <template v-if="draft">{{ t("glossary.draft") }}</template>
      <template v-else-if="source">
        {{ t("glossary.source") }}:
        <a :href="source.url" target="_blank" rel="noopener">{{ source.name }}</a>
      </template>
      <template v-if="trByClaude"> ・ {{ t("glossary.trByClaude") }}</template>
    </p>
  </div>
</template>

<style scoped>
.term-info {
  display: grid;
  gap: 2px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
}
.ja {
  font-size: 16px;
}
.reading {
  font-size: 13px;
  color: var(--muted);
  margin-left: -8px;
}
.trterm {
  font-weight: 700;
  color: var(--term);
}
.def,
.easy {
  font-size: 14px;
}
.easy.sub {
  font-size: 13px;
  color: var(--muted);
}
.src {
  font-size: 11px;
  color: var(--muted);
}
.src a {
  color: inherit;
}
.tag {
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 4px;
}
.tag.official {
  border-color: var(--ok);
  color: var(--ok);
}
</style>
