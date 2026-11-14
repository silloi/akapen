/**
 * akapen の Worker。静的アセット（Vue の SPA）は Cloudflare が配信し、/api/* だけここに来る。
 */
import Anthropic from "@anthropic-ai/sdk";
import { allCandos, findCando, findSocial } from "../shared/cando.ts";
import { callJson, ClaudeError } from "../shared/claude.ts";
import {
  AKAPEN_SCHEMA,
  AKAPEN_SYSTEM,
  akapenUser,
  KANPE_SCHEMA,
  KANPE_SYSTEM,
  kanpeUser,
  LANG_NAMES,
  langLine,
  PARTNER_SCHEMA,
  partnerMessages,
  partnerSystem,
  PROMPT_VERSION,
  type PartnerReply,
  type PartnerStyle,
  type Speed,
  STYLE_LABELS,
  GLOSS_SYSTEM,
  TRANSLATE_SYSTEM,
  UI_LANG_NAMES,
} from "../shared/prompts.ts";
import { kanjiDigitsToAscii } from "../shared/numbers.ts";
import { fillPersona } from "../shared/persona.ts";
import { forSpeech } from "../shared/reading.ts";
import { findScene, SAFETY_CANDO_NOS, SCENES } from "../shared/scenes.ts";
import type { Kanpe, KanpeLang, Mark, Turn } from "../shared/types.ts";
import { normalizeAkapen, type RawAkapen } from "../shared/validate.ts";
import { errorResponse, HttpError, json, readJson } from "./http.ts";
import { serveMedia } from "./media.ts";

const MAX_TURNS = 40;
const MAX_TEXT = 1000;

function client(env: Env): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "no_claude_key", "Claude の API キーが設定されていません");
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

function sceneOf(id: unknown) {
  const scene = typeof id === "string" ? findScene(id) : undefined;
  if (!scene) throw new HttpError(404, "no_scene", "場面が見つかりません");
  return { scene, cando: findCando(scene.candoNo) };
}

function checkTurns(turns: unknown): Turn[] {
  if (!Array.isArray(turns) || turns.length > MAX_TURNS) {
    throw new HttpError(400, "bad_turns", "会話の記録が読めません");
  }
  return turns.map((t) => {
    const ok =
      t &&
      (t.speaker === "partner" || t.speaker === "me") &&
      typeof t.text === "string" &&
      t.text.length <= MAX_TEXT;
    if (!ok) throw new HttpError(400, "bad_turns", "会話の記録が読めません");
    return { speaker: t.speaker, text: t.text } as Turn;
  });
}

async function handleTurn(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{
    sceneId: string;
    speed?: Speed;
    style?: PartnerStyle;
    turns: Turn[];
  }>(request);
  const { scene, cando } = sceneOf(body.sceneId);
  const turns = checkTurns(body.turns);
  if (turns.length === 0) return json<PartnerReply>({ say: scene.opening, ended: false });
  const speed: Speed = body.speed === "natural" ? "natural" : "slow";
  const style: PartnerStyle = body.style && body.style in STYLE_LABELS ? body.style : "normal";
  const r = await callJson<PartnerReply>(client(env), {
    model: env.CLAUDE_MODEL,
    effort: "low",
    system: partnerSystem(scene, cando, speed, style),
    messages: partnerMessages(turns),
    schema: PARTNER_SCHEMA,
    maxTokens: 4000,
  });
  return json(r.data);
}

async function handleAkapen(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{
    sceneId: string;
    turns: Turn[];
    previous?: Pick<Mark, "quote" | "next">[];
  }>(request);
  const { scene, cando } = sceneOf(body.sceneId);
  const turns = checkTurns(body.turns);
  if (!turns.some((t) => t.speaker === "me")) {
    throw new HttpError(400, "no_utterance", "まだ何も話していません");
  }
  const previous = (body.previous ?? [])
    .slice(0, 3)
    .filter((p) => typeof p?.quote === "string" && typeof p?.next === "string")
    .map((p) => ({ quote: p.quote.slice(0, MAX_TEXT), next: p.next.slice(0, MAX_TEXT) }));
  const r = await callJson<RawAkapen>(client(env), {
    model: env.CLAUDE_MODEL,
    effort: "medium",
    system: AKAPEN_SYSTEM,
    messages: [{ role: "user", content: akapenUser(scene, cando, turns, previous) }],
    schema: AKAPEN_SCHEMA,
  });
  const { akapen, dropped } = normalizeAkapen(r.data, turns, previous);
  if (dropped.length) console.log("akapen dropped", JSON.stringify(dropped));
  return json({ akapen, promptVersion: PROMPT_VERSION, model: r.model });
}

async function handleKanpe(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{
    sceneId: string;
    lang: KanpeLang;
    fixes?: Pick<Mark, "quote" | "next">[];
  }>(request);
  const { scene, cando } = sceneOf(body.sceneId);
  if (!(body.lang in LANG_NAMES)) throw new HttpError(400, "bad_lang", "言語が選べません");
  const fixes = (body.fixes ?? []).slice(0, 5).filter((f) => typeof f?.next === "string");
  const r = await callJson<Omit<Kanpe, "lang">>(client(env), {
    model: env.CLAUDE_MODEL,
    effort: "low",
    system: KANPE_SYSTEM,
    messages: [
      {
        role: "user",
        content: kanpeUser(scene, cando, body.lang, fixes, findSocial(scene.socialNos)),
      },
    ],
    schema: KANPE_SCHEMA,
  });
  return json<Kanpe>({ ...r.data, lang: body.lang });
}

/** 赤ペンの説明文を、その人の言語に訳す（会話の引用や「次はこう言う」の日本語はそのまま。意味だけを添える） */
async function handleTranslate(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ lang: string; texts: string[]; kind?: string }>(request);
  const lang = typeof body.lang === "string" ? body.lang : "";
  // utterance: 練習の会話の一文（タップしたとき）。やさしい日本語（easy）への言い換えもできる
  const utterance = body.kind === "utterance";
  const langName =
    utterance && lang === "easy"
      ? "やさしい日本語"
      : lang in UI_LANG_NAMES
        ? UI_LANG_NAMES[lang as keyof typeof UI_LANG_NAMES]
        : "";
  if (!langName) throw new HttpError(400, "bad_lang", "言語が選べません");
  const texts = Array.isArray(body.texts)
    ? body.texts
        .filter((x) => typeof x === "string")
        .slice(0, 40)
        .map((x) => x.slice(0, 400))
    : [];
  if (texts.length === 0) return json({ texts: [] });
  const r = await callJson<{ texts: string[] }>(client(env), {
    model: env.CLAUDE_MODEL,
    effort: "low",
    system: utterance ? GLOSS_SYSTEM : TRANSLATE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `## 言語\n${langLine(langName, lang)}\n\n## 文（順番どおり、同じ数だけ返す）\n${JSON.stringify(texts)}`,
      },
    ],
    schema: {
      type: "object",
      properties: { texts: { type: "array", items: { type: "string" } } },
      required: ["texts"],
      additionalProperties: false,
    },
    maxTokens: 8000,
  });
  return json({ texts: r.data.texts.slice(0, texts.length) });
}

/** 文字起こし: 誤りと言いよどみを残す（no_verbatim: false） */
async function handleStt(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST")
    throw new HttpError(405, "method_not_allowed", "POST で送ってください");
  if (!env.ELEVENLABS_API_KEY) {
    throw new HttpError(503, "no_stt_key", "文字起こしの API キーが設定されていません");
  }
  const audio = await request.blob();
  if (audio.size === 0 || audio.size > 10_000_000) {
    throw new HttpError(400, "bad_audio", "音声が読めません（10MB まで）");
  }
  const params = new URL(request.url).searchParams;
  const sceneId = params.get("scene");
  const scene = sceneId ? findScene(sceneId) : undefined;
  // 練習で名乗る名前は画面の言語ごとに違うので、〔名前〕を埋めてから渡す
  const lang = params.get("lang");
  const form = new FormData();
  form.append("model_id", env.SCRIBE_MODEL);
  form.append("language_code", "ja");
  form.append("no_verbatim", "false");
  form.append("tag_audio_events", "false");
  // 場面の語と練習用の固有名詞を前もって渡す（住所・建物名の聞き違いが減る。docs/stt-check.md）
  for (const k of scene?.keyterms ?? []) form.append("keyterms", fillPersona(k, lang));
  // iPad / iPhone の録音は MP4（AAC）、Chrome は WebM。中身に合う名前で渡す
  const type = request.headers.get("content-type") ?? "";
  const ext = /mp4|m4a|aac/.test(type)
    ? "mp4"
    : /ogg/.test(type)
      ? "ogg"
      : /wav/.test(type)
        ? "wav"
        : "webm";
  form.append("file", audio, `speech.${ext}`);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) {
    console.error("stt", res.status, await res.text());
    throw new HttpError(502, "stt_failed", "文字起こしに失敗しました");
  }
  const data = (await res.json()) as { text?: string };
  return json({ text: kanjiDigitsToAscii((data.text ?? "").trim()) });
}

/** 相手役の声（ElevenLabs）。声の ID が無ければ 404 を返し、画面はブラウザの読み上げを使う */
async function handleTts(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ text: string }>(request);
  const voice: string = env.TTS_VOICE_ID;
  if (!env.ELEVENLABS_API_KEY || !voice) {
    throw new HttpError(404, "no_tts", "読み上げの声が設定されていません");
  }
  if (typeof body.text !== "string" || !body.text || body.text.length > 500) {
    throw new HttpError(400, "bad_text", "読み上げる文が読めません");
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        text: forSpeech(body.text),
        model_id: env.TTS_MODEL,
        language_code: "ja",
      }),
    },
  );
  if (!res.ok) {
    console.error("tts", res.status, await res.text());
    throw new HttpError(502, "tts_failed", "読み上げに失敗しました");
  }
  return new Response(res.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
}

/** QR で開くカンペの保存期間（秒）。30日 */
const SHARE_TTL = 30 * 24 * 60 * 60;
const SHARE_MAX_BYTES = 64 * 1024;

/**
 * カンペをサーバーに置き、短い URL（/k/<id>）で開けるようにする。
 * id は 128 ビットの乱数（base64url 22文字）なので、URL を知らない人がたどり着くことはまずない。
 * 中身はカンペ（架空の練習の情報と言い回し）だけ。録音や文字起こしは入らない。
 */
async function handleShare(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") throw new HttpError(405, "method", "POST だけです");
  const raw = await request.text();
  if (raw.length > SHARE_MAX_BYTES) throw new HttpError(413, "too_big", "カンペが大きすぎます");
  let data: { title?: unknown; partner?: unknown; kanpe?: { say?: unknown } };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "bad_json", "JSON が読めません");
  }
  if (typeof data.title !== "string" || !Array.isArray(data.kanpe?.say)) {
    throw new HttpError(400, "bad_kanpe", "カンペの形が違います");
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await env.KANPE.put(id, raw, { expirationTtl: SHARE_TTL });
  return json({ id, ttlDays: SHARE_TTL / 86400 });
}

async function handleShared(id: string, env: Env): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) throw new HttpError(404, "no_kanpe", "カンペがありません");
  const raw = await env.KANPE.get(id);
  if (!raw) throw new HttpError(404, "no_kanpe", "カンペがありません（30日で消えます）");
  return new Response(raw, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/media/")) return serveMedia(request, env.ASSETS);
    try {
      const shared = /^\/api\/share\/([^/]+)$/.exec(pathname);
      if (shared) return await handleShared(shared[1], env);
      switch (pathname) {
        case "/api/health":
          return json({
            ok: true,
            claude: Boolean(env.ANTHROPIC_API_KEY),
            stt: Boolean(env.ELEVENLABS_API_KEY),
            tts: Boolean(env.ELEVENLABS_API_KEY && env.TTS_VOICE_ID),
            model: env.CLAUDE_MODEL,
            promptVersion: PROMPT_VERSION,
          });
        case "/api/scenes":
          return json(SCENES.map((s) => ({ ...s, cando: findCando(s.candoNo) })));
        case "/api/phone-candos": {
          // 電話が出てくる「やり取り」の Can do（準備中の場面の一覧に出す）
          const ready = new Set(SCENES.map((s) => s.candoNo));
          return json(
            allCandos()
              .filter((c) => /電話(で|し|を)|に電話|電話による/.test(c.cando) && !ready.has(c.no))
              .map((c) => ({ ...c, safety: SAFETY_CANDO_NOS.has(c.no) })),
          );
        }
        case "/api/turn":
          return await handleTurn(request, env);
        case "/api/akapen":
          return await handleAkapen(request, env);
        case "/api/kanpe":
          return await handleKanpe(request, env);
        case "/api/translate":
          return await handleTranslate(request, env);
        case "/api/stt":
          return await handleStt(request, env);
        case "/api/tts":
          return await handleTts(request, env);
        case "/api/share":
          return await handleShare(request, env);
        default:
          return json({ error: "not_found", message: "見つかりません" }, 404);
      }
    } catch (e) {
      if (e instanceof ClaudeError) {
        return json({ error: e.code, message: e.message }, 502);
      }
      return errorResponse(e);
    }
  },
} satisfies ExportedHandler<Env>;
