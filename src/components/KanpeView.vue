<script setup lang="ts">
import QRCode from "qrcode";
import { computed, onMounted, ref, watch } from "vue";
import { LANG_NAMES } from "../../shared/prompts.ts";
import type { Kanpe, KanpeLang, Mark } from "../../shared/types.ts";
import { api, type SceneWithCando } from "../lib/api.ts";
import { SAMPLE_KANPE } from "../lib/sample.ts";
import { encodeKanpe, shareUrl } from "../lib/share.ts";
import KanpeSheet from "./KanpeSheet.vue";

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
const partner = computed(() => props.scene.partnerRole.replace(/（.*$/, ""));

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

// スマホで開く（QR）。カンペの中身を URL に入れる。サーバーに保存しない
const showQr = ref(false);
const qr = ref("");
const url = ref("");
const copied = ref(false);
watch([kanpe, showQr], async ([k, show]) => {
  if (!k || !show) return;
  const hash = await encodeKanpe({ title: props.scene.title, partner: partner.value, kanpe: k });
  url.value = shareUrl(hash);
  qr.value = await QRCode.toDataURL(url.value, {
    errorCorrectionLevel: "L",
    margin: 1,
    width: 240,
  });
});
async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // コピーできない環境では、URL を選んでもらう
  }
}
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

  <KanpeSheet
    v-if="kanpe"
    :title="scene.title"
    :partner="partner"
    :kanpe="kanpe"
    :fixes="fixes"
    :show-yomi="showYomi"
  />

  <div v-if="kanpe" class="share no-print">
    <button class="btn red" type="button" :aria-expanded="showQr" @click="showQr = !showQr">
      スマホで開く（QR）
    </button>
    <p class="small muted">
      本番の電話のとき、スマホで大きい文字で見られます。中身は URL
      に入っていて、サーバーには残りません。
    </p>
    <div v-if="showQr && qr" class="qr">
      <img :src="qr" width="240" height="240" alt="カンペを開く QR コード" />
      <div class="url">
        <input
          :value="url"
          readonly
          type="text"
          aria-label="カンペの URL"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button class="btn ghost small" type="button" @click="copy">
          {{ copied ? "コピーした" : "URL をコピー" }}
        </button>
      </div>
    </div>
  </div>

  <div class="foot no-print">
    <button class="btn ghost" type="button" @click="emit('back')">赤ペンにもどる</button>
    <p class="small muted">印刷もできます。</p>
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
.share {
  display: grid;
  gap: 8px;
  justify-items: start;
  margin-top: 20px;
}
.qr {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  max-width: 100%;
}
.qr img {
  background: #fff;
  border-radius: 8px;
}
.url {
  display: grid;
  gap: 8px;
  flex: 1;
  min-width: 200px;
}
.url input {
  font: inherit;
  font-size: 12px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
}
.foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}
</style>
