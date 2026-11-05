/**
 * 声の入出力。録音は MediaRecorder、相手役の声は ElevenLabs（無ければブラウザの読み上げ）。
 */
import { api } from "./api.ts";

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec) return resolve(new Blob());
      rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: rec.mimeType || "audio/webm" }));
      };
      rec.stop();
    });
  }
}

let current: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  current?.pause();
  current = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export async function speak(text: string, slow: boolean, useEleven: boolean): Promise<void> {
  stopSpeaking();
  if (useEleven) {
    const blob = await api.tts(text).catch(() => null);
    if (blob) {
      const audio = new Audio(URL.createObjectURL(blob));
      audio.playbackRate = slow ? 0.9 : 1;
      current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
      return;
    }
  }
  if (!("speechSynthesis" in window)) return;
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = slow ? 0.8 : 1;
    const ja = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
    if (ja) u.voice = ja;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
