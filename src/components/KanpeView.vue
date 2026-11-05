<script setup lang="ts">
import { onMounted, ref } from "vue";
import { LANG_NAMES } from "../../shared/prompts.ts";
import type { Kanpe, KanpeLang, Mark } from "../../shared/types.ts";
import { api, type SceneWithCando } from "../lib/api.ts";
import { SAMPLE_KANPE } from "../lib/sample.ts";

const props = defineProps<{
  scene: SceneWithCando;
  fixes: Pick<Mark, "quote" | "next">[];
  isSample: boolean;
}>();
const emit = defineEmits<{ back: [] }>();

const lang = ref<KanpeLang>("zh");
const kanpe = ref<Kanpe | null>(null);
const loading = ref(false);
const error = ref("");
const showYomi = ref(true);
const fromSample = ref(false);

async function make() {
  loading.value = true;
  error.value = "";
  fromSample.value = false;
  try {
    kanpe.value = await api.kanpe(props.scene.id, lang.value, props.fixes);
  } catch (e) {
    if (props.isSample && lang.value === SAMPLE_KANPE.lang) {
      kanpe.value = SAMPLE_KANPE;
      fromSample.value = true;
    } else {
      error.value = (e as Error).message;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(make);

const SECTIONS = [
  { key: "asked", title: "聞かれること", hint: "相手はこう言います" },
  { key: "say", title: "言うこと", hint: "〔 〕は自分のことを入れる" },
  { key: "help", title: "困ったとき", hint: "聞き返すのは失礼ではありません" },
] as const;
</script>

<template>
  <section class="head no-print">
    <div>
      <p class="small muted">
        本番のカンペ ・ {{ scene.title }}
        <span v-if="fromSample" class="badge">見本（手で作った例）</span>
      </p>
      <h1>本番で手元に置くメモ</h1>
    </div>
    <div class="opts">
      <label class="small"
        >ことば
        <select v-model="lang" :disabled="loading" @change="make">
          <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
        </select>
      </label>
      <label class="small"><input v-model="showYomi" type="checkbox" /> ひらがなの読み</label>
    </div>
  </section>

  <p v-if="loading" class="muted">カンペを作っています…</p>
  <p v-if="error" class="error">{{ error }}</p>

  <article v-if="kanpe" class="kanpe">
    <header class="kh">
      <h2>{{ scene.title }}</h2>
      <p class="small muted">相手: {{ scene.partnerRole.replace(/（.*$/, "") }}</p>
    </header>

    <section v-for="sec in SECTIONS" :key="sec.key" class="sec">
      <h3>
        {{ sec.title }} <span class="small muted">{{ sec.hint }}</span>
      </h3>
      <ul>
        <li
          v-for="(l, i) in kanpe[sec.key]"
          :key="i"
          :class="{ fixed: sec.key === 'say' && fixes.some((f) => f.next === l.ja) }"
        >
          <span class="ja">{{ l.ja }}</span>
          <span v-if="showYomi && l.yomi" class="yomi">{{ l.yomi }}</span>
          <span class="tr">{{ l.tr }}</span>
        </li>
      </ul>
    </section>

    <section class="sec know">
      <h3>前もって知っておくこと</h3>
      <ul>
        <li v-for="(k, i) in kanpe.know" :key="i">
          {{ k.text }} <span class="src">（{{ k.source }}）</span>
        </li>
      </ul>
    </section>
  </article>

  <div class="foot no-print">
    <button class="btn ghost" type="button" @click="emit('back')">赤ペンにもどる</button>
    <p class="small muted">印刷するか、スマホの画面を写真にとっておくと、本番で見られます。</p>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.head h1 {
  font-size: 24px;
}
.opts {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
select {
  font: inherit;
  margin-left: 6px;
}
.kanpe {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px;
  display: grid;
  gap: 18px;
}
.kh h2 {
  font-size: 20px;
}
.sec h3 {
  font-size: 16px;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 2px;
  margin-bottom: 8px;
}
.sec ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.sec li {
  display: grid;
  gap: 0;
}
.ja {
  font-size: 18px;
  font-weight: 500;
}
.yomi {
  font-size: 12px;
  color: var(--muted);
}
.tr {
  font-size: 15px;
}
.fixed .ja {
  color: var(--red);
}
.fixed .ja::before {
  content: "赤ペン ";
  font-family: var(--hand);
  font-size: 13px;
}
.know li {
  font-size: 15px;
}
.src {
  font-size: 12px;
  color: var(--muted);
}
.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}
@media print {
  .kanpe {
    border: 0;
    padding: 0;
  }
}
</style>
