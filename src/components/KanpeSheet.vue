<script setup lang="ts">
import type { Kanpe, Mark } from "../../shared/types.ts";

defineProps<{
  title: string;
  partner: string;
  kanpe: Kanpe;
  /** 赤ペンで直した言い方（say の中で目立たせる） */
  fixes?: Pick<Mark, "quote" | "next">[];
  showYomi: boolean;
  /** 本番用（スマホで電話しながら見る。文字を大きく、「言うこと」以外はたたむ） */
  live?: boolean;
}>();

import { ref } from "vue";
/** 本番用でたたむ（開いているものだけ true） */
const open = ref<Record<string, boolean>>({
  asked: false,
  say: true,
  help: false,
  memo: true,
  know: false,
});
function toggle(key: string) {
  open.value[key] = !open.value[key];
}

const SECTIONS = [
  { key: "asked", title: "聞かれること", hint: "相手はこう言います" },
  { key: "say", title: "言うこと", hint: "〔 〕は自分のことを入れる" },
  { key: "help", title: "困ったとき", hint: "聞き返すのは失礼ではありません" },
] as const;
</script>

<template>
  <article :class="['kanpe', { live }]">
    <header class="kh">
      <h2>{{ title }}</h2>
      <p class="small muted">相手: {{ partner }}</p>
    </header>

    <section v-for="sec in SECTIONS" :id="`k-${sec.key}`" :key="sec.key" class="sec">
      <h3>
        <button
          v-if="live"
          type="button"
          class="fold"
          :aria-expanded="open[sec.key]"
          @click="toggle(sec.key)"
        >
          {{ sec.title }} <span class="count">{{ kanpe[sec.key].length }}</span>
        </button>
        <template v-else
          >{{ sec.title }} <span class="small muted">{{ sec.hint }}</span></template
        >
      </h3>
      <ul v-show="!live || open[sec.key]">
        <li
          v-for="(l, i) in kanpe[sec.key]"
          :key="i"
          :class="{ fixed: sec.key === 'say' && fixes?.some((f) => f.next === l.ja) }"
        >
          <span class="ja">{{ l.ja }}</span>
          <span v-if="showYomi && l.yomi" class="yomi">{{ l.yomi }}</span>
          <span class="tr">{{ l.tr }}</span>
        </li>
      </ul>
    </section>

    <section v-if="kanpe.memo?.length" id="k-memo" class="sec memo">
      <h3>
        <button
          v-if="live"
          type="button"
          class="fold"
          :aria-expanded="open.memo"
          @click="toggle('memo')"
        >
          聞き取って書くこと <span class="count">{{ kanpe.memo.length }}</span>
        </button>
        <template v-else
          >聞き取って書くこと
          <span class="small muted">本番で相手が言うので、ここに書く</span></template
        >
      </h3>
      <ul v-show="!live || open.memo">
        <li v-for="(m, i) in kanpe.memo" :key="i">
          <span class="ja">{{ m.label }}</span>
          <span class="tr">{{ m.tr }}</span>
          <span class="blank" aria-hidden="true"></span>
        </li>
      </ul>
    </section>

    <section id="k-know" class="sec know">
      <h3>
        <button
          v-if="live"
          type="button"
          class="fold"
          :aria-expanded="open.know"
          @click="toggle('know')"
        >
          前もって知っておくこと <span class="count">{{ kanpe.know.length }}</span>
        </button>
        <template v-else>前もって知っておくこと</template>
      </h3>
      <ul v-show="!live || open.know">
        <li v-for="(k, i) in kanpe.know" :key="i">
          {{ k.text }} <span class="src">（{{ k.source }}）</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
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
.memo li {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas: "ja blank" "tr blank";
  column-gap: 12px;
  align-items: end;
}
.memo .ja {
  grid-area: ja;
}
.memo .tr {
  grid-area: tr;
}
.memo .blank {
  grid-area: blank;
  border-bottom: 1.5px solid var(--ink);
  min-height: 2.2em;
}
.src {
  font-size: 12px;
  color: var(--muted);
}
.fold {
  display: flex;
  justify-content: flex-start;
  gap: 6px;
  align-items: center;
  width: 100%;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  padding: 0;
  text-align: left;
}
.fold::before {
  content: "▸ ";
  color: var(--muted);
}
.fold[aria-expanded="true"]::before {
  content: "▾ ";
}
.count {
  margin-left: auto;
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
}

/* 本番用: 文字を大きく、行の間を広く。片手で持って読む */
.live {
  border: 0;
  border-radius: 0;
  padding: 8px 0 40px;
  gap: 28px;
  background: transparent;
}
.live .kh h2 {
  font-size: 22px;
}
.live .sec h3 {
  font-size: 18px;
  position: sticky;
  top: 44px;
  background: var(--bg);
  padding-top: 6px;
  z-index: 1;
}
.live .sec ul {
  gap: 16px;
}
.live .ja {
  font-size: 22px;
  line-height: 1.5;
}
.live .yomi {
  font-size: 14px;
}
.live .tr {
  font-size: 18px;
}
.live .know li {
  font-size: 17px;
}
@media print {
  .kanpe {
    border: 0;
    padding: 0;
  }
}
</style>
