/**
 * 声の入出力。録音は MediaRecorder、相手役の声は ElevenLabs（無ければブラウザの読み上げ）。
 *
 * iPad / iPhone（WebKit。iOS の Chrome も同じ）で実機を触って分かったことへの対応（11/7）:
 * - 通信を待ってから鳴らす音は「自動再生」とみなされ、断られる → 1つの <audio> を使い回し、
 *   最初の画面の操作（タップ）の中で一度鳴らしておく（unlockAudio）。断られたら "blocked" を返し、
 *   画面で「もう一度聞く」を押してもらう。
 * - 「もう一度聞く」を続けて押すと、声が何重にも重なった → 読み上げは常に1つ。新しい読み上げや
 *   停止で世代（gen）を進め、古い読み上げは止め、待っていた結果は捨てる。ElevenLabs の声は
 *   文ごとに覚えておき、聞き直しで取り直さない（待たない・クレジットを使わない）。
 * - 録音のたびにマイクの許可を聞かれた → マイクは練習の間ずっと開いておき、練習を出るときに閉じる。
 */
import { forSpeech } from "../../shared/reading.ts";
import { api } from "./api.ts";

// ───────────────────────── 録音 ─────────────────────────

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  /** マイクを開く（開いていれば、そのまま使う） */
  private async open(): Promise<MediaStream> {
    if (this.stream?.getAudioTracks().some((t) => t.readyState === "live")) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return this.stream;
  }

  /** 録り始める。本当に録り始めてから返す（返る前に話した分が切れないように） */
  async start(): Promise<void> {
    const stream = await this.open();
    this.chunks = [];
    const rec = new MediaRecorder(stream);
    this.rec = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    await new Promise<void>((resolve) => {
      rec.onstart = () => resolve();
      setTimeout(resolve, 600);
      rec.start();
    });
  }

  /** 録り終える。マイクは閉じない（次の録音で、また許可を聞かれないように） */
  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.rec;
      this.rec = null;
      if (!rec || rec.state === "inactive") return resolve(new Blob());
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
  }

  /** 練習を出るときに、マイクを閉じる */
  release(): void {
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

// ───────────────────────── 相手役の声 ─────────────────────────

/** done: 最後まで流れた / stopped: 止められた・新しい読み上げに替わった / blocked: 端末に断られた */
export type SpeakResult = "done" | "stopped" | "blocked";

const player: HTMLAudioElement | null = typeof Audio === "undefined" ? null : new Audio();
let gen = 0;
/** いま流れている読み上げを終わらせる（止めたときに、待っている speak を返すため） */
let finishCurrent: ((r: SpeakResult) => void) | null = null;
let unlocked = false;
let unlocking: Promise<unknown> | null = null;

/** 無音の短い WAV（タップの中で一度鳴らして、あとから鳴らせるようにする）。一度だけ作る */
let silent: string | null = null;
function silentWav(): string {
  if (silent) return silent;
  const n = 800;
  const v = new DataView(new ArrayBuffer(44 + n));
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  silent = URL.createObjectURL(new Blob([v.buffer], { type: "audio/wav" }));
  return silent;
}

/**
 * タップなどの操作の中で（await の前に）呼ぶ。iOS は、操作の中で一度鳴らした <audio> と読み上げだけを、
 * あとから（通信を待ってから）鳴らせる。一度うまくいけば、あとは何もしない。
 */
export function unlockAudio(): void {
  if (unlocked || !player || finishCurrent) return;
  player.src = silentWav();
  unlocking = player
    .play()
    .then(() => {
      unlocked = true;
      if (!finishCurrent) player.pause();
    })
    .catch(() => {});
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

// 最初の操作で自動で準備する（場面を選んだタップで、最初の一言を鳴らせるように）
if (typeof document !== "undefined") {
  const once = () => {
    unlockAudio();
    if (unlocked) for (const e of EVENTS) document.removeEventListener(e, once, true);
  };
  const EVENTS = ["touchend", "click", "keydown"] as const;
  for (const e of EVENTS) document.addEventListener(e, once, true);
}

/** ElevenLabs の声を、文ごとに覚えておく（聞き直しで取り直さない） */
const ttsCache = new Map<string, Promise<Blob | null>>();
function tts(text: string): Promise<Blob | null> {
  let p = ttsCache.get(text);
  if (!p) {
    p = api.tts(text).catch(() => null);
    ttsCache.set(text, p);
    void p.then((b) => {
      if (!b) ttsCache.delete(text);
    });
    if (ttsCache.size > 40) ttsCache.delete(ttsCache.keys().next().value!);
  }
  return p;
}

/** 流れている声を止める（世代は進めない） */
function halt(): void {
  const f = finishCurrent;
  finishCurrent = null;
  player?.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  f?.("stopped");
}

export function stopSpeaking(): void {
  gen++;
  halt();
}

function playBlob(blob: Blob, slow: boolean): Promise<SpeakResult | "error"> {
  const audio = player;
  if (!audio) return Promise.resolve("error");
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    let started = false;
    const timers: number[] = [];
    const finish = (r: SpeakResult | "error") => {
      if (finishCurrent === finish) finishCurrent = null;
      timers.forEach((t) => clearTimeout(t));
      audio.onended = audio.onerror = audio.onplaying = audio.onloadedmetadata = null;
      if (r !== "done") audio.pause();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    finishCurrent = finish;
    audio.onended = () => finish("done");
    audio.onerror = () => finish("error");
    audio.onplaying = () => {
      started = true;
    };
    // ended が来ない端末のための見張り（長さ ÷ 速さ ＋ 3秒）
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration))
        timers.push(
          window.setTimeout(
            () => finish("done"),
            (audio.duration / audio.playbackRate) * 1000 + 3000,
          ),
        );
    };
    // 鳴り始めない（断られたとも言われない）ときは、断られたとみなす
    timers.push(window.setTimeout(() => !started && finish("blocked"), 6000));
    audio.src = url;
    audio.defaultPlaybackRate = audio.playbackRate = slow ? 0.9 : 1;
    audio.play().catch((e: unknown) => {
      if (finishCurrent === finish)
        finish(e instanceof DOMException && e.name === "NotAllowedError" ? "blocked" : "error");
    });
  });
}

function speakBrowser(text: string, slow: boolean): Promise<SpeakResult> {
  if (!("speechSynthesis" in window)) return Promise.resolve("done");
  return new Promise((resolve) => {
    let started = false;
    const timers: number[] = [];
    const finish = (r: SpeakResult) => {
      if (finishCurrent === finish) finishCurrent = null;
      timers.forEach((t) => clearTimeout(t));
      resolve(r);
    };
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    u.lang = "ja-JP";
    u.rate = slow ? 0.8 : 1;
    const ja = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
    if (ja) u.voice = ja;
    u.onstart = () => {
      started = true;
    };
    u.onend = () => finish("done");
    u.onerror = (e) =>
      finish(
        e.error === "not-allowed"
          ? "blocked"
          : e.error === "interrupted" || e.error === "canceled"
            ? "stopped"
            : "done",
      );
    finishCurrent = finish;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    timers.push(
      window.setTimeout(() => {
        if (!started && finishCurrent === finish) {
          speechSynthesis.cancel();
          finish("blocked");
        }
      }, 6000),
    );
  });
}

/**
 * 相手役の声を流す。前の声は止める（重ならない）。
 * ElevenLabs が使えないとき（声が取れない・流せない）だけ、ブラウザの読み上げにする（両方は流さない）。
 */
export async function speak(text: string, slow: boolean, useEleven: boolean): Promise<SpeakResult> {
  const my = ++gen;
  halt();
  if (useEleven) {
    const blob = await tts(text);
    if (unlocking) await unlocking;
    if (my !== gen) return "stopped";
    if (blob) {
      const r = await playBlob(blob, slow);
      if (r !== "error") return r;
      if (my !== gen) return "stopped";
    }
  }
  return speakBrowser(text, slow);
}
