import type { PartnerReply, Speed } from "../../shared/prompts.ts";
import type { Akapen, CanDo, Kanpe, KanpeLang, Mark, Scene, Turn } from "../../shared/types.ts";

export type SceneWithCando = Scene & { cando?: CanDo };

export class ApiFailure extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    if (ct.includes("json")) {
      const e = (await res.json()) as { error: string; message: string };
      throw new ApiFailure(e.error, e.message);
    }
    throw new ApiFailure("http", `通信に失敗しました（${res.status}）`);
  }
  return (await res.json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export interface Health {
  claude: boolean;
  stt: boolean;
  tts: boolean;
}

export const api = {
  health: () => call<Health>("/api/health"),
  scenes: () => call<SceneWithCando[]>("/api/scenes"),
  phoneCandos: () => call<(CanDo & { safety: boolean })[]>("/api/phone-candos"),
  turn: (sceneId: string, speed: Speed, turns: Turn[]) =>
    call<PartnerReply>("/api/turn", post({ sceneId, speed, turns })),
  akapen: (sceneId: string, turns: Turn[]) =>
    call<{ akapen: Akapen }>("/api/akapen", post({ sceneId, turns })),
  kanpe: (sceneId: string, lang: KanpeLang, fixes: Pick<Mark, "quote" | "next">[]) =>
    call<Kanpe>("/api/kanpe", post({ sceneId, lang, fixes })),
  stt: (audio: Blob) => call<{ text: string }>("/api/stt", { method: "POST", body: audio }),
  async tts(text: string): Promise<Blob | null> {
    const res = await fetch("/api/tts", post({ text }));
    return res.ok ? await res.blob() : null;
  },
};
