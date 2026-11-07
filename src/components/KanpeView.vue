<script setup lang="ts">
import QRCode from "qrcode";
import { computed, onMounted, ref, watch } from "vue";
import { LANG_NAMES } from "../../shared/prompts.ts";
import type { Kanpe, KanpeLang, Mark } from "../../shared/types.ts";
import { api, type SceneWithCando } from "../lib/api.ts";
import { SAMPLE_KANPE } from "../lib/sample.ts";
import { defaultKanpeLang, t } from "../lib/i18n.ts";
import { shareKanpe } from "../lib/share.ts";
import KanpeSheet from "./KanpeSheet.vue";

const props = defineProps<{
  scene: SceneWithCando;
  fixes: Pick<Mark, "quote" | "next">[];
  isSample: boolean;
}>();
const emit = defineEmits<{ back: [] }>();

const lang = ref<KanpeLang>(defaultKanpeLang.value);
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

// スマホで開く（QR）。カンペをサーバーに置き（30日）、短い URL を QR にする
const showQr = ref(false);
const qr = ref("");
const url = ref("");
const qrError = ref("");
const copied = ref(false);
watch([kanpe, showQr], async ([k, show]) => {
  if (!k || !show) return;
  qr.value = "";
  url.value = "";
  qrError.value = "";
  try {
    url.value = await shareKanpe({ title: props.scene.title, partner: partner.value, kanpe: k });
    qr.value = await QRCode.toDataURL(url.value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });
  } catch (e) {
    qrError.value = (e as Error).message;
  }
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
        {{ t("kanpe.title") }} ・ {{ scene.title }}
        <span v-if="fromSample" class="badge">{{ t("review.sample") }}</span>
      </p>
      <h1>{{ t("kanpe.heading") }}</h1>
    </div>
    <div class="opts">
      <label class="small"
        >{{ t("lang.label") }}
        <select v-model="lang" :disabled="loading" @change="make">
          <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
        </select>
      </label>
      <label class="small"
        ><input v-model="showYomi" type="checkbox" /> {{ t("kanpe.yomi") }}</label
      >
    </div>
  </section>

  <p v-if="loading" class="muted">{{ t("kanpe.loading") }}</p>
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
      {{ t("kanpe.qr") }}
    </button>
    <p class="small muted">{{ t("kanpe.qrNote") }}</p>
    <p v-if="qrError" class="error">{{ qrError }}</p>
    <div v-if="showQr && qr" class="qr">
      <img :src="qr" width="240" height="240" :alt="t('kanpe.qrAlt')" />
      <div class="url">
        <input
          :value="url"
          readonly
          type="text"
          :aria-label="t('kanpe.url')"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button class="btn ghost small" type="button" @click="copy">
          {{ t(copied ? "kanpe.copied" : "kanpe.copy") }}
        </button>
      </div>
    </div>
  </div>

  <div class="foot no-print">
    <button class="btn ghost" type="button" @click="emit('back')">{{ t("kanpe.back") }}</button>
    <p class="small muted">{{ t("kanpe.print") }}</p>
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
