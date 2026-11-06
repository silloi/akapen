<script setup lang="ts">
import { ref } from "vue";
import { t } from "../lib/i18n.ts";
import type { SharedKanpe } from "../lib/share.ts";
import KanpeSheet from "./KanpeSheet.vue";

defineProps<{ data: SharedKanpe }>();
const showYomi = ref(true);

const JUMPS = [
  { id: "k-asked", label: "kanpe.jump.asked" },
  { id: "k-say", label: "kanpe.jump.say" },
  { id: "k-help", label: "kanpe.jump.help" },
  { id: "k-memo", label: "kanpe.jump.memo" },
  { id: "k-know", label: "kanpe.jump.know" },
] as const;
function jump(id: string) {
  const el = document.getElementById(id);
  const fold = el?.querySelector<HTMLButtonElement>(".fold");
  if (fold && fold.getAttribute("aria-expanded") !== "true") fold.click();
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <nav class="jumps" :aria-label="t('kanpe.inside')">
    <button v-for="j in JUMPS" :key="j.id" type="button" @click="jump(j.id)">
      {{ t(j.label) }}
    </button>
    <label class="small yomi"
      ><input v-model="showYomi" type="checkbox" /> {{ t("kanpe.jump.yomi") }}</label
    >
  </nav>
  <KanpeSheet
    :title="data.title"
    :partner="data.partner"
    :kanpe="data.kanpe"
    :show-yomi="showYomi"
    live
  />
</template>

<style scoped>
.jumps {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  background: var(--bg);
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.jumps button {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 15px;
}
.yomi {
  margin-left: auto;
}
</style>
