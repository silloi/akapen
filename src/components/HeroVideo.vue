<script setup lang="ts">
/**
 * トップの動画。実際の画面（予行演習 → 赤ペン → カンペ → いろいろなことば）を順に見せる。
 * 動画と区切りの時間は scripts/hero/ で作る（src/lib/hero.json）。音は無い。
 * 動画の下のボタンで、今どこを見せているかを示す（押すとそこへ飛ぶ）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import hero from "../lib/hero.json" with { type: "json" };
import { t, type UiKey } from "../lib/i18n.ts";

const LABEL: Record<string, UiKey> = {
  practice: "step.practice",
  review: "step.review",
  kanpe: "step.kanpe",
  langs: "hero.langs",
};
const segments = computed(() => hero.segments.filter((s) => LABEL[s.key]));

const video = ref<HTMLVideoElement | null>(null);
const current = ref(0);
const playing = ref(false);
/** 動きを減らす設定の人には、自動では流さない */
const reduced =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 自分で止めたか（画面の外に出て戻ってきても、流し直さない） */
let userPaused = reduced;

function onTime() {
  const v = video.value;
  if (!v) return;
  let i = 0;
  segments.value.forEach((s, k) => {
    if (v.currentTime >= s.start) i = k;
  });
  current.value = i;
}
function seek(k: number) {
  const v = video.value;
  if (!v) return;
  v.currentTime = (segments.value[k]?.start ?? 0) + 0.05;
  current.value = k;
  userPaused = false;
  void v.play().catch(() => {});
}
function toggle() {
  const v = video.value;
  if (!v) return;
  if (v.paused) {
    userPaused = false;
    void v.play().catch(() => {});
  } else {
    userPaused = true;
    v.pause();
  }
}

// 画面の外にあるときは止める（電池と通信の節約）
let io: IntersectionObserver | null = null;
onMounted(() => {
  const v = video.value;
  if (!v || typeof IntersectionObserver === "undefined") return;
  io = new IntersectionObserver(([e]) => {
    if (!e) return;
    if (e.isIntersecting && !userPaused) void v.play().catch(() => {});
    else if (!e.isIntersecting) v.pause();
  });
  io.observe(v);
});
onBeforeUnmount(() => io?.disconnect());
</script>

<template>
  <figure class="hero-video">
    <div class="frame" :style="{ aspectRatio: `${hero.width} / ${hero.height}` }">
      <video
        ref="video"
        :poster="hero.poster"
        :autoplay="!reduced"
        muted
        loop
        playsinline
        preload="auto"
        :aria-label="t('hero.alt')"
        @timeupdate="onTime"
        @play="playing = true"
        @pause="playing = false"
      >
        <!-- AV1（軽い）が流せない端末は H.264 へ。codecs を書いて、流せないものは取りに行かせない -->
        <source :src="hero.webm" type='video/webm; codecs="av01.0.04M.08"' />
        <source :src="hero.mp4" type='video/mp4; codecs="avc1.64001F"' />
      </video>
      <button
        type="button"
        class="pp"
        :aria-label="t(playing ? 'hero.pause' : 'hero.play')"
        @click="toggle"
      >
        <svg v-if="playing" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </button>
    </div>
    <figcaption class="steps">
      <button
        v-for="(s, k) in segments"
        :key="s.key"
        type="button"
        :class="{ on: current === k }"
        :aria-current="current === k ? 'step' : undefined"
        @click="seek(k)"
      >
        {{ t(LABEL[s.key]!) }}
      </button>
    </figcaption>
  </figure>
</template>

<style scoped>
.hero-video {
  margin: 0;
  display: grid;
  gap: 10px;
}
.frame {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--paper);
  box-shadow:
    0 1px 2px rgb(0 0 0 / 6%),
    0 12px 32px rgb(0 0 0 / 10%);
}
video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pp {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 0;
  display: grid;
  place-items: center;
  background: rgb(29 35 41 / 70%);
  color: #fff;
  opacity: 0.75;
}
.pp:hover,
.pp:focus-visible {
  opacity: 1;
}
.steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 6px;
}
.steps button {
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 999px;
}
.steps button.on {
  color: var(--paper);
  background: var(--red);
  font-weight: 700;
}
</style>
