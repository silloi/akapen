import { describe, expect, it } from "vite-plus/test";
import { parseRange, serveMedia, type Assets } from "./media.ts";

describe("parseRange", () => {
  it("読める形", () => {
    expect(parseRange("bytes=0-1", 100)).toEqual([0, 1]);
    expect(parseRange("bytes=10-", 100)).toEqual([10, 99]);
    expect(parseRange("bytes=-30", 100)).toEqual([70, 99]);
    expect(parseRange("bytes=90-500", 100)).toEqual([90, 99]);
  });
  it("無い・読めない形は全部を返す", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
  });
  it("ファイルの外", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=5-2", 100)).toBe("invalid");
    expect(parseRange("bytes=-0", 100)).toBe("invalid");
  });
});

describe("serveMedia", () => {
  const data = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
  const assets: Assets = {
    fetch: async () =>
      new Response(data, { headers: { "content-type": "video/mp4", etag: '"abc"' } }),
  };
  const req = (headers: Record<string, string> = {}) =>
    new Request("https://example.com/media/hero.mp4", { headers });

  it("Range に 206 で答える（Safari の最初の問い合わせ bytes=0-1）", async () => {
    const res = await serveMedia(req({ range: "bytes=0-1" }), assets);
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-1/100");
    expect(res.headers.get("content-length")).toBe("2");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1]);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });
  it("Range が無ければ全部", async () => {
    const res = await serveMedia(req(), assets);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });
  it("ファイルの外は 416", async () => {
    const res = await serveMedia(req({ range: "bytes=200-" }), assets);
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
  });
});
