/**
 * トップの動画（public/media/）を、Range（一部だけの取得）に答えて返す。
 *
 * Workers の静的ファイルは Range を付けて頼んでも 200 で全部を返す。iPhone・iPad の Safari は、
 * 動画を Range で少しずつ取りに来て、206 が返らないと流さない。動画は小さい（1MB 前後）ので、
 * 静的ファイルを丸ごと読んでから切り出す。名前に中身のハッシュが入っているので、長く置いてよい。
 */
/** 静的ファイルの取り出し口（env.ASSETS）。テストでも使えるよう、要るところだけの形にする */
export interface Assets {
  fetch(request: Request): Promise<Response>;
}

export async function serveMedia(request: Request, assets: Assets): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  // 静的ファイルには Range や条件を付けずに頼む（全部をもらって、ここで切る）
  const res = await assets.fetch(new Request(request.url));
  if (!res.ok) return res;
  const body = await res.arrayBuffer();
  const headers = new Headers({
    "content-type": res.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  });
  const etag = res.headers.get("etag");
  if (etag) headers.set("etag", etag);
  const range = parseRange(request.headers.get("range"), body.byteLength);
  if (range === "invalid") {
    headers.set("content-range", `bytes */${body.byteLength}`);
    return new Response(null, { status: 416, headers });
  }
  const head = request.method === "HEAD";
  if (!range) {
    headers.set("content-length", String(body.byteLength));
    return new Response(head ? null : body, { status: 200, headers });
  }
  const [start, end] = range;
  headers.set("content-range", `bytes ${start}-${end}/${body.byteLength}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(head ? null : body.slice(start, end + 1), { status: 206, headers });
}

/**
 * "bytes=0-1"・"bytes=100-"・"bytes=-500" を [始め, 終わり]（両端を含む）にする。
 * Range が無い・読めない形（いくつもの範囲など）は null（全部を返す）。ファイルの外は "invalid"。
 */
export function parseRange(
  header: string | null,
  size: number,
): [number, number] | null | "invalid" {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return "invalid";
    return [Math.max(0, size - n), size - 1];
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) return "invalid";
  return [start, end];
}
