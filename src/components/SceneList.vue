<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { CanDo } from "../../shared/types.ts";
import { api, type Health, type SceneWithCando } from "../lib/api.ts";

const props = defineProps<{ scenes: SceneWithCando[]; health: Health }>();
const reviewed = computed(() => props.scenes.filter((s) => s.status !== "draft"));
const drafts = computed(() => {
  const map = new Map<string, SceneWithCando[]>();
  for (const s of props.scenes.filter((x) => x.status === "draft")) {
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
    <h1>本番の電話の前に、声で予行演習。</h1>
    <p>
      相手役と電話で話してみて、<span class="hand">伝わらなかった所</span
      >に赤ペンを入れます。最後に、本番で手元に置くカンペを作ります。
    </p>
    <p class="small muted">
      日本語のテストではありません。文法の正しさより、用件が伝わったかを先に見ます。
    </p>
  </section>

  <section class="list" aria-label="場面">
    <h2 class="h">場面をえらぶ</h2>
    <div class="grid">
      <button
        v-for="s in reviewed"
        :key="s.id"
        class="scene"
        type="button"
        @click="emit('choose', s)"
      >
        <span class="meta">
          <span class="badge">{{ s.cando?.level }}</span>
          <span class="badge">生活Can do {{ s.candoNo }}</span>
          <span v-if="s.medical" class="badge">受付と話すだけ</span>
        </span>
        <span class="title">{{ s.title }}</span>
        <span class="sum">{{ s.summary }}</span>
      </button>
    </div>
    <h2 class="h drafts-h">
      ほかの場面
      <span class="small muted"
        >下書き。先生が確かめる前のもの（{{ scenes.length - reviewed.length }}）</span
      >
    </h2>
    <div v-for="[major, list] in drafts" :key="major" class="draft-group">
      <h3>{{ major }}</h3>
      <div class="grid">
        <button
          v-for="s in list"
          :key="s.id"
          class="scene draft"
          type="button"
          @click="emit('choose', s)"
        >
          <span class="meta">
            <span class="badge">{{ s.cando?.level }}</span>
            <span class="badge">{{ s.channel === "counter" ? "窓口" : "電話" }}</span>
            <span v-if="s.medical" class="badge">受付と話すだけ</span>
            <span class="badge draft-badge">下書き</span>
          </span>
          <span class="title">{{ s.title }}</span>
          <span class="sum">{{ s.summary }}</span>
        </button>
      </div>
    </div>
    <p class="sample">
      <button class="btn ghost" type="button" @click="emit('sample')">見本の赤ペンを見る</button>
      <span class="small muted">手で作った見本の会話です</span>
    </p>
    <p v-if="!health.claude" class="small muted">
      この環境では Claude につながっていないので、予行演習はできません。見本だけ見られます。
    </p>
  </section>

  <section class="note card">
    <h2 class="h">いのちや安全にかかわる時は</h2>
    <p>
      110番・119番や、急な病気・けがのときは、予行演習より、多言語の窓口を使ってください。119番は多くの地域で通訳につないでもらえます。
    </p>
    <p class="small muted">
      「生活Can
      do」は、「できるようにならなければならない一覧」ではありません。医療・防災など安全や生命にかかわる場面は、日本語の学習より、多言語での情報が大切なものもあります。
    </p>
  </section>

  <details v-if="groups.length" class="others">
    <summary>まだ場面になっていない電話の Can do</summary>
    <div v-for="[major, list] in groups" :key="major" class="group">
      <h3>{{ major }}</h3>
      <ul>
        <li v-for="c in list" :key="c.no">
          <span class="badge">{{ c.level }}</span>
          {{ c.case2 }}
          <span v-if="c.safety" class="safety">予行演習にしない（多言語の窓口へ）</span>
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
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
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
.scene.draft {
  border-style: dashed;
}
.draft-badge {
  color: var(--red);
  border-color: var(--red);
}
.drafts-h {
  margin-top: 28px;
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
