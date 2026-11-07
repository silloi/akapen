<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { Akapen, Mark, MarkKind, Turn } from "../../shared/types.ts";
import { api, type SceneWithCando } from "../lib/api.ts";
import { isJa, lang, t } from "../lib/i18n.ts";
import { segment, type Highlight } from "../lib/segments.ts";

const props = defineProps<{
  scene: SceneWithCando;
  turns: Turn[];
  initial: Akapen | null;
  /** 練習の終わりに裏で始めた赤ペン（会話が同じときだけ渡される） */
  pending?: Promise<Akapen> | null;
  isSample: boolean;
  previous?: Mark[];
  attempt?: number;
  /** 今回の相手の様子（練習中は明かさない） */
  styleLabel?: string;
}>();
const emit = defineEmits<{
  kanpe: [Pick<Mark, "quote" | "next">[]];
  retry: [];
  "update:akapen": [Akapen];
}>();

const akapen = ref<Akapen | null>(props.initial);
const error = ref("");
const loading = ref(false);
/** カンペに入れる赤ペン（priority） */
const picked = ref<Set<number>>(new Set());

const KIND_KEY: Record<
  MarkKind,
  "kind.stalled" | "kind.missed" | "kind.impolite" | "kind.grammar"
> = {
  stalled: "kind.stalled",
  missed: "kind.missed",
  impolite: "kind.impolite",
  grammar: "kind.grammar",
};

/** 赤ペンの説明文の訳（画面の言語が日本語でないとき）。鍵は元の日本語 */
const tr = ref<Record<string, string>>({});
const translating = ref(false);
async function translate(a: Akapen) {
  if (isJa.value) return;
  const texts = [
    a.summary,
    ...a.marks.flatMap((m) => [m.why, m.next]),
    ...a.good.map((g) => g.note),
    ...a.later.map((l) => l.note),
    ...(a.retry ?? []).map((r) => r.note),
  ].filter((x, i, arr) => x && arr.indexOf(x) === i);
  translating.value = true;
  try {
    const out = await api.translate(lang.value, texts);
    tr.value = Object.fromEntries(texts.map((x, i) => [x, out[i] ?? ""]));
  } catch {
    tr.value = {};
  } finally {
    translating.value = false;
  }
}
watch(
  akapen,
  (a) => {
    if (a) void translate(a);
  },
  { immediate: true },
);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    akapen.value = props.pending
      ? await props.pending
      : (
          await api.akapen(
            props.scene.id,
            props.turns,
            (props.previous ?? []).map((m) => ({ quote: m.quote, next: m.next })),
          )
        ).akapen;
    emit("update:akapen", akapen.value);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!akapen.value) void load();
});

// 最初は全部の赤ペンをカンペに入れる
watch(
  akapen,
  (a) => {
    picked.value = new Set(a?.marks.map((m) => m.priority) ?? []);
  },
  { immediate: true },
);

function toggle(p: number) {
  const s = new Set(picked.value);
  if (s.has(p)) s.delete(p);
  else s.add(p);
  picked.value = s;
}

const rows = computed(() =>
  props.turns.map((t, i) => {
    const a = akapen.value;
    const marks = a ? a.marks.filter((m) => m.turn === i) : [];
    const good = a ? a.good.filter((g) => g.turn === i) : [];
    const hs: Highlight[] = [
      ...marks.map((m) => ({ quote: m.quote, type: "mark" as const, priority: m.priority })),
      ...good.map((g) => ({ quote: g.quote, type: "good" as const, priority: 0 })),
    ];
    return { t, i, marks, good, segs: segment(t.text, hs) };
  }),
);

function toKanpe() {
  const marks = akapen.value?.marks ?? [];
  emit(
    "kanpe",
    marks
      .filter((m) => picked.value.has(m.priority))
      .map((m) => ({ quote: m.quote, next: m.next })),
  );
}
</script>

<template>
  <section class="head">
    <p class="small muted">
      {{ t("review.title")
      }}<template v-if="(attempt ?? 1) > 1">（{{ attempt }}{{ t("practice.attempt") }}）</template>
      ・
      {{ scene.title }}
      <span v-if="isSample" class="badge">{{ t("review.sample") }}</span>
      <span v-if="styleLabel" class="badge">{{ t("review.todaysPartner") }}: {{ styleLabel }}</span>
    </p>
    <h1>
      {{ t("review.fixBefore") }}
      <span class="hand big tx">{{ akapen ? akapen.marks.length + t("review.count") : "…" }}</span>
    </h1>
    <p v-if="akapen" class="summary">
      <span class="lbl hand tx">{{ t("review.fromTeacher") }}</span>
      {{ akapen.summary }}
      <span v-if="tr[akapen.summary]" class="trline">{{ tr[akapen.summary] }}</span>
    </p>
    <p v-if="loading" class="muted">{{ t("review.loading") }}</p>
    <p v-if="translating" class="small muted">{{ t("review.translating") }}</p>
    <p v-if="error" class="error">
      {{ error }}
      <button class="btn ghost small" type="button" @click="load">{{ t("common.retry") }}</button>
    </p>
  </section>

  <section v-if="akapen?.retry?.length" class="retry card">
    <h2 class="small">{{ t("review.previous") }}</h2>
    <ul>
      <li v-for="r in akapen.retry" :key="r.quote" :class="{ done: r.done }">
        <span class="mark hand" aria-hidden="true">{{ r.done ? "○" : "△" }}</span>
        <span class="body">
          <span class="was">「{{ r.quote }}」→ {{ r.next }}</span>
          <span class="hand note"
            >{{ t(r.done ? "review.fixed" : "review.notYet") }}{{ r.note }}</span
          >
          <span v-if="tr[r.note]" class="trline">{{ tr[r.note] }}</span>
        </span>
      </li>
    </ul>
  </section>

  <ol v-if="akapen && akapen.marks.length" class="index">
    <li v-for="m in akapen.marks" :key="m.priority">
      <a :href="`#mark-${m.priority}`"
        ><span class="num">{{ m.priority }}</span
        >{{ t(KIND_KEY[m.kind]) }}「{{ m.quote }}」</a
      >
    </li>
  </ol>

  <section class="paper">
    <div v-for="r in rows" :key="r.i" :class="['turn', r.t.speaker]">
      <span class="who">{{ t(r.t.speaker === "partner" ? "common.partner" : "common.me") }}</span>
      <p class="text">
        <template v-for="(s, k) in r.segs" :key="k">
          <span
            v-if="s.highlight?.type === 'mark'"
            :class="r.t.speaker === 'partner' ? 'circle' : 'wavy'"
            >{{ s.text }}</span
          >
          <span v-else-if="s.highlight?.type === 'good'" class="good">{{ s.text }}</span>
          <template v-else>{{ s.text }}</template>
        </template>
        <span v-if="r.good.length" class="okmark" :aria-label="t('review.good')">○</span>
      </p>
      <div v-for="g in r.good" :key="g.quote" class="okline">
        ○ {{ g.note }}
        <span v-if="tr[g.note]" class="trline">{{ tr[g.note] }}</span>
      </div>
      <div v-for="m in r.marks" :id="`mark-${m.priority}`" :key="m.priority" class="marg">
        <p class="hand why">
          <span class="num">{{ m.priority }}</span
          ><span class="lbl tx">{{ t("review.where") }}</span
          >{{ m.why }}
        </p>
        <p v-if="tr[m.why]" class="trline">{{ tr[m.why] }}</p>
        <p class="hand next">
          <span class="lbl tx">{{ t("review.next") }}</span
          >{{ m.next }}
        </p>
        <p v-if="tr[m.next]" class="trline">{{ tr[m.next] }}</p>
        <button
          class="pick no-print"
          type="button"
          :aria-pressed="picked.has(m.priority)"
          @click="toggle(m.priority)"
        >
          {{ picked.has(m.priority) ? t("review.toKanpe") + " ✓" : t("review.notToKanpe") }}
        </button>
      </div>
    </div>
  </section>

  <details v-if="akapen && akapen.later.length" class="later">
    <summary>{{ t("review.later") }}（{{ akapen.later.length }}）</summary>
    <ul>
      <li v-for="l in akapen.later" :key="l.turn + l.quote">
        「{{ l.quote }}」→ {{ l.note }}
        <span v-if="tr[l.note]" class="trline">{{ tr[l.note] }}</span>
      </li>
      <li>{{ t("review.fillers") }}</li>
    </ul>
  </details>

  <div class="foot no-print">
    <button class="btn ghost" type="button" @click="emit('retry')">{{ t("review.retry") }}</button>
    <button class="btn red" type="button" :disabled="!akapen" @click="toKanpe">
      {{ t("review.makeKanpe") }}
    </button>
  </div>
</template>

<style scoped>
.lbl {
  display: inline-block;
  white-space: nowrap;
  font-family: var(--hand);
  font-size: 12px;
  font-weight: 400;
  color: var(--red);
  border: 1px solid var(--red);
  border-radius: 999px;
  padding: 0 7px;
  margin-right: 6px;
  vertical-align: 2px;
}
.summary .lbl {
  color: var(--ink);
  border-color: var(--ink);
}
.trline {
  display: block;
  font-family: var(--body);
  font-size: 14px;
  color: var(--muted);
}
.head {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}
.head h1 {
  font-size: 24px;
}
.big {
  font-size: 34px;
}
.summary {
  font-size: 17px;
}
.num {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.6px solid var(--red);
  color: var(--red);
  font-family: var(--hand);
  font-size: 14px;
  font-weight: 600;
  margin-right: 6px;
  vertical-align: 1px;
  flex: none;
}
.retry {
  margin-bottom: 16px;
  display: grid;
  gap: 6px;
}
.retry ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.retry li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.retry .mark {
  font-size: 22px;
  line-height: 1.2;
  color: var(--red);
}
.retry .done .mark {
  color: var(--ok);
}
.retry .body {
  display: grid;
}
.retry .was {
  font-size: 14px;
  color: var(--muted);
}
.retry .note {
  font-size: 16px;
}
.retry .done .note {
  color: var(--ok);
}
.index {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  display: grid;
  gap: 4px;
}
.index a {
  text-decoration: none;
}
.index a:hover {
  text-decoration: underline;
}
.paper {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px;
  display: grid;
  gap: 14px;
}
.turn {
  display: grid;
  gap: 4px;
}
.who {
  font-size: 11px;
  color: var(--muted);
}
.turn.partner .text {
  background: var(--other);
  border-radius: 12px;
  padding: 8px 12px;
}
.turn.me .text {
  padding: 2px 0;
  font-size: 17px;
}
.wavy {
  text-decoration: underline wavy var(--red);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 6px;
  text-decoration-skip-ink: none;
}
.circle {
  border: 1.6px solid var(--red);
  border-radius: 999px;
  padding: 0 4px;
}
.good {
  text-decoration: underline var(--ok);
  text-underline-offset: 6px;
}
.okmark {
  font-family: var(--hand);
  color: var(--ok);
  font-size: 22px;
  font-weight: 600;
  margin-left: 6px;
}
.okline {
  font-family: var(--hand);
  color: var(--ok);
  font-size: 15px;
  padding-left: 12px;
}
.marg {
  border-left: 2px solid var(--red);
  padding: 2px 0 4px 12px;
  margin-left: 4px;
  display: grid;
  gap: 2px;
}
.why {
  display: flex;
  align-items: flex-start;
  font-size: 16px;
  line-height: 1.6;
}
.next {
  font-size: 19px;
  font-weight: 600;
}
.pick {
  justify-self: start;
  font-size: 13px;
  border: 1px solid var(--red);
  color: var(--red);
  background: transparent;
  border-radius: 999px;
  padding: 2px 12px;
  margin-top: 4px;
}
.pick[aria-pressed="true"] {
  background: var(--red);
  color: var(--paper);
}
.later {
  margin-top: 16px;
}
.later summary {
  cursor: pointer;
  color: var(--ok);
}
.later ul {
  color: var(--muted);
  margin: 6px 0 0;
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}
</style>
