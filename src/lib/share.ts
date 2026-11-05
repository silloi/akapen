/**
 * カンペを URL に入れて、スマホで開く（QR）。サーバーに保存しない。
 * 中身は JSON → deflate-raw → base64url。名前などは〔 〕のままなので、個人の情報は入らない。
 */
import type { Kanpe } from "../../shared/types.ts";

export interface SharedKanpe {
  /** 場面の名前（API に頼らず画面に出すため） */
  title: string;
  /** 相手（短く） */
  partner: string;
  kanpe: Kanpe;
}

const PREFIX = "#k=";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeKanpe(data: SharedKanpe): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  const packed = await pipe(json, new CompressionStream("deflate-raw"));
  return PREFIX + toBase64Url(packed);
}

export async function decodeKanpe(hash: string): Promise<SharedKanpe | null> {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const packed = fromBase64Url(hash.slice(PREFIX.length));
    const json = await pipe(packed, new DecompressionStream("deflate-raw"));
    const data = JSON.parse(new TextDecoder().decode(json)) as SharedKanpe;
    if (!data.kanpe || !Array.isArray(data.kanpe.say)) return null;
    return data;
  } catch {
    return null;
  }
}

export function shareUrl(hash: string): string {
  return `${location.origin}${location.pathname}${hash}`;
}
