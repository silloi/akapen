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
 * - そうすると iPad で、1回目は録れるが2回目から声が届かなかった。相手の2回目の声も小さかった。
 *   iPad / iPhone は、マイクが開いている間、音を「通話」の状態で扱う（ふつうの音も通話の音量になり、
 *   その間に流した音の後の録音が空になる。WebKit の報告あり）→ iPad / iPhone では、録音のたびにマイクを
 *   開き、録り終えたらすぐ閉じる（fresh）。作り手の iPad では、このやり方で許可の確認は毎回は出なかった。
 *   ほかの端末では開いたままにし（keep）、録音ごとにマイクの複製で録る。それでも空だったら fresh に切り替える。
 * - 実機でしか起きないことを調べるため、URL に #debug を付けて開くと、練習の画面に記録が出る。
 */
import { reactive } from "vue";
import { forSpeech } from "../../shared/reading.ts";
import { api } from "./api.ts";

// ───────────────────────── 記録（#debug）─────────────────────────

export const voiceLog = reactive<string[]>([]);
const t0 = Date.now();
export function vlog(msg: string): void {
  voiceLog.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${msg}`);
  if (voiceLog.length > 80) voiceLog.splice(0, voiceLog.length - 80);
}

// ───────────────────────── 録音 ─────────────────────────

/** これより小さい録音は、録れていない（入れ物だけ） */
export const MIN_RECORDING_BYTES = 1000;
/** マイクが開いているか（開いている間は、音の準備で端末の声を鳴らさない） */
let micOpen = false;

/**
 * iPad / iPhone か（中身はどれも WebKit）。iPadOS は、PC と同じ見え方（Macintosh）をすることがあるので、
 * タッチの点の数でも見る。
 */
function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function waitUnmuted(t: MediaStreamTrack, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!t.muted) return resolve();
    const timer = setTimeout(resolve, ms);
    t.addEventListener(
      "unmute",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  /** 開いたままにするマイク（許可の確認を毎回出さないため） */
  private stream: MediaStream | null = null;
  /** 録音ごとの複製（録り終えたら閉じる） */
  private take: MediaStream | null = null;
  /**
   * keep: マイクを開いたまま、録音ごとに複製して録る（はじめはこれ）
   * fresh: 録音ごとにマイクを開き直す（keep で録れなかったとき。1回目と同じやり方）
   */
  private mode: "keep" | "fresh" = isAppleMobile() ? "fresh" : "keep";

  constructor() {
    if (typeof navigator !== "undefined")
      vlog(
        `${navigator.userAgent.slice(0, 110)} mp4=${typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4")} mode=${this.mode}`,
      );
  }

  private closeStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    micOpen = false;
  }

  /** マイクを開く（keep で、開いていて止まっていなければ、そのまま使う） */
  private async open(): Promise<MediaStream> {
    const track = this.stream?.getAudioTracks()[0];
    if (this.mode === "keep" && this.stream && track?.readyState === "live") {
      if (track.muted) {
        vlog("mic muted, waiting");
        await waitUnmuted(track, 1500);
      }
      if (!track.muted) return this.stream;
      vlog("mic still muted, reopening");
    }
    this.closeStream();
    vlog(`getUserMedia (${this.mode})`);
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const t = s.getAudioTracks()[0];
    if (t) {
      t.onmute = () => vlog("track muted");
      t.onunmute = () => vlog("track unmuted");
      t.onended = () => vlog("track ended");
    }
    this.stream = s;
    micOpen = true;
    return s;
  }

  /** 録り始める。本当に録り始めてから返す（返る前に話した分が切れないように） */
  async start(): Promise<void> {
    const stream = await this.open();
    // 同じトラックで MediaRecorder を作り直すと、2回目から録れない端末がある → 録音ごとに複製
    const source = this.mode === "keep" ? stream.clone() : stream;
    this.take = this.mode === "keep" ? source : null;
    this.chunks = [];
    const rec = new MediaRecorder(source);
    this.rec = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    await new Promise<void>((resolve) => {
      rec.onstart = () => resolve();
      setTimeout(resolve, 600);
      rec.start();
    });
    const t = source.getAudioTracks()[0];
    vlog(
      `rec start ${rec.mimeType || "?"} ${rec.state} track=${t?.readyState}${t?.muted ? " muted" : ""}`,
    );
  }

  /** 録り終える。keep のときマイクは閉じない（次の録音で、また許可を聞かれないように） */
  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.rec;
      this.rec = null;
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const blob = new Blob(this.chunks, { type: rec?.mimeType || "audio/webm" });
        this.take?.getTracks().forEach((t) => t.stop());
        this.take = null;
        if (this.mode === "fresh") this.closeStream();
        vlog(`rec stop ${blob.size}B ${blob.type}`);
        resolve(blob);
      };
      if (!rec || rec.state === "inactive") return finish();
      // stop の知らせが来ない端末のための見張り
      timer = window.setTimeout(() => {
        vlog("rec stop timeout");
        finish();
      }, 3000);
      rec.onstop = finish;
      rec.stop();
    });
  }

  /** 録れなかった（空だった・声が無かった）。この練習の間は、録音ごとにマイクを開き直す */
  failed(): void {
    if (this.mode === "keep") vlog("switch to fresh mode");
    this.mode = "fresh";
    this.closeStream();
  }

  /** 練習を出るときに、マイクを閉じる */
  release(): void {
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.rec = null;
    this.take?.getTracks().forEach((t) => t.stop());
    this.take = null;
    this.closeStream();
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
let primed = false;
export function unlockAudio(): void {
  // マイクが開いている間は何も鳴らさない（端末の声などで、マイクが止まることがある）
  if (unlocked || !player || finishCurrent || micOpen) return;
  player.src = silentWav();
  unlocking = player
    .play()
    .then(() => {
      unlocked = true;
      vlog("audio unlocked");
      if (!finishCurrent) player.pause();
    })
    .catch((e: unknown) => vlog(`unlock failed ${e instanceof Error ? e.name : ""}`));
  // 端末の読み上げ（ElevenLabs が使えないとき）の準備は、一度だけ
  if (!primed && "speechSynthesis" in window) {
    primed = true;
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
      // 本物の声が一度鳴れば、もう準備は要らない
      unlocked = true;
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
      vlog(`voice ${r}`);
      if (r !== "error") return r;
      if (my !== gen) return "stopped";
    }
  }
  const r = await speakBrowser(text, slow);
  vlog(`device voice ${r}`);
  return r;
}
