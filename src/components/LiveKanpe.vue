<script setup lang="ts">
import { ref } from "vue";
import type { SharedKanpe } from "../lib/share.ts";
import KanpeSheet from "./KanpeSheet.vue";

defineProps<{ data: SharedKanpe }>();
const showYomi = ref(true);

const JUMPS = [
  { id: "k-asked", label: "聞かれる" },
  { id: "k-say", label: "言う" },
  { id: "k-help", label: "困った" },
  { id: "k-know", label: "知る" },
];
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <nav class="jumps" aria-label="カンペの中">
    <button v-for="j in JUMPS" :key="j.id" type="button" @click="jump(j.id)">{{ j.label }}</button>
    <label class="small yomi"><input v-model="showYomi" type="checkbox" /> 読み</label>
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
