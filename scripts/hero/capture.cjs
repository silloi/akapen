// トップの動画の素材: アプリの画面を 440px 幅・2倍で撮る（scripts/hero/README.md）。
// 練習は、相手役・文字起こし・声を台本の返事に差し替える（Claude を呼ばない。会話は lib/sample.ts の見本と同じ）。
// 赤ペン・カンペ・訳は、開いているアプリ（BASE）の API をそのまま使う。
//   node scripts/hero/capture.cjs [all|practice|review]   → ./cap/ に PNG と、要素の位置の JSON
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:5173";
const UI = require(require("path").join(__dirname, "../../data/ui.i18n.json"));
const W = 440,
  H = 860;
const TURNS = [
  ["p", "お電話ありがとうございます。みなと市粗大ごみ受付センターです。"],
  ["m", "あの、えっと、ごみを、大きいごみを、捨てたい、です。"],
  ["p", "粗大ごみの収集のお申し込みですね。お名前をフルネームでお願いします。"],
  ["m", "リン・メイです。"],
  ["p", "リン・メイ様ですね。ご住所をお願いします。"],
  ["m", "みなと市さくら町、さん、3丁目5の12、さくらハイツ201です。"],
  ["p", "ありがとうございます。何をお出しになりますか。"],
  ["m", "れいぞうこ、と、いす。いすは、木の。"],
  ["p", "冷蔵庫は家電リサイクルの対象になりますので、こちらではお受けできないんです。"],
  ["m", "だいじょうぶです。"],
  ["p", "申し訳ありません、冷蔵庫もお出しになりたいということでしょうか。"],
  ["m", "いすだけ。いつ来ますか？"],
  ["p", "いすだけですね。最短ですと11月17日の火曜日になりますが、よろしいですか。"],
  ["m", "はい。お金は？"],
  [
    "p",
    "処理券を400円分、コンビニでお買い求めいただき、いすに貼って、当日の朝8時までにお出しください。",
  ],
  ["m", "わかりました。ありがとうございます。"],
];
const P = TURNS.filter((t) => t[0] === "p").map((t) => t[1]);
P.push("ご利用ありがとうございました。失礼いたします。");
const M = TURNS.filter((t) => t[0] === "m").map((t) => t[1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = require("fs");
fs.mkdirSync("cap", { recursive: true });
async function saveBoxes(p, path, sels) {
  const out = await p.evaluate((sels) => {
    const o = {};
    for (const s of sels) {
      const els = [...document.querySelectorAll(s)];
      o[s] = els.map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x + scrollX, r.y + scrollY, r.width, r.height];
      });
    }
    return o;
  }, sels);
  fs.writeFileSync(path.replace(/\.png$/, ".json"), JSON.stringify(out));
}
const SELS = [
  ".call",
  ".log",
  ".controls",
  ".done",
  ".status",
  ".info",
  "h1",
  ".turn",
  ".wavy",
  ".mark",
  ".note",
  ".kanpe",
  ".qr",
  ".share",
  ".sec",
  "header.top",
  ".later",
  "main",
  ".marg",
  ".summary",
  ".index",
  ".paper",
  ".jumps",
  ".fold",
];
const which = process.argv[2] || "all";

async function ctxFor(b, lang, extra = {}) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    ...extra,
  });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem("akapen.lang", l);
    } catch {}
  }, lang);
  return ctx;
}

async function practice(b, lang) {
  const ctx = await ctxFor(b, lang, { permissions: ["microphone"] });
  await ctx.addInitScript(() => {
    const s = window.speechSynthesis;
    s.speak = (u) => {
      setTimeout(() => {
        u.onstart?.();
        setTimeout(() => u.onend?.(), 900);
      }, 30);
    };
    s.cancel = () => {};
  });
  let pi = 0,
    mi = 0;
  await ctx.route("**/api/health", (r) =>
    r.fulfill({ json: { ok: true, claude: true, stt: true, tts: false } }),
  );
  await ctx.route("**/api/turn", async (r) => {
    const say = P[pi++];
    await sleep(500);
    r.fulfill({ json: { say, ended: pi >= P.length } });
  });
  await ctx.route("**/api/stt**", async (r) => {
    const text = M[mi++];
    await sleep(400);
    r.fulfill({ json: { text } });
  });
  await ctx.route("**/api/tts", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route("**/api/akapen", (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.locator(".scene", { hasText: "粗大ごみの回収を電話で頼む" }).first().click();
  let n = 0;
  const shot = async (tag) => {
    const path = `cap/practice-${lang}-${String(n++).padStart(2, "0")}-${tag}.png`;
    await p.screenshot({ path, fullPage: true });
    await saveBoxes(p, path, SELS);
  };
  for (let i = 0; i < M.length; i++) {
    // 相手が話している所
    await p.waitForFunction(
      () =>
        document.querySelector(".status")?.textContent?.includes("話して") ||
        document.querySelector("button.mic.rec"),
      null,
      { timeout: 15000 },
    );
    if (!(await p.$("button.mic.rec"))) {
      await sleep(150);
      await shot("speak");
    }
    await p.waitForSelector("button.mic.rec", { timeout: 15000 });
    await sleep(500);
    await shot("rec");
    await sleep(700);
    await p.click("button.mic");
    await p.waitForSelector("button.mic:not(.rec)");
  }
  await p.waitForSelector(".done button", { timeout: 15000 });
  await sleep(400);
  await shot("ended");
  await ctx.close();
}

async function review(b, lang, kanpeLang) {
  const ctx = await ctxFor(b, lang);
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.click(".cta button.btn.ghost");
  await p.waitForLoadState("networkidle");
  await sleep(1500);
  // 訳しています… が消えるまで
  const tr =
    lang === "ja" ? "訳しています" : (UI[lang] && UI[lang]["review.translating"]) || "訳しています";
  await p
    .waitForFunction((tr) => !document.body.innerText.includes(tr.replace(/…|\.\.\./g, "")), tr, {
      timeout: 90000,
    })
    .catch(() => console.log("translate wait timeout", lang));
  await sleep(800);
  await p.screenshot({ path: `cap/review-${lang}.png`, fullPage: true });
  await saveBoxes(p, `cap/review-${lang}.png`, SELS);
  if (!kanpeLang) {
    await ctx.close();
    return;
  }
  await p.locator(".actions .btn.red, button.btn.red").last().click();
  if (kanpeLang) {
    await p.waitForSelector(".opts select");
    const cur = await p.$eval(".opts select", (s) => s.value);
    if (cur !== kanpeLang) {
      await p.waitForSelector(".kanpe", { timeout: 90000 }).catch(() => {});
      await p.selectOption(".opts select", kanpeLang);
    }
  }
  await p.waitForFunction(
    () =>
      !!document.querySelector(".kanpe") &&
      !document.body.innerText.includes("カンペを作っています"),
    null,
    { timeout: 120000 },
  );
  await sleep(800);
  await p.screenshot({ path: `cap/kanpe-${lang}-${kanpeLang}.png`, fullPage: true });
  await saveBoxes(p, `cap/kanpe-${lang}-${kanpeLang}.png`, SELS);
  await p.click(".share button.btn.red");
  await p.waitForSelector(".qr img", { timeout: 30000 });
  await sleep(500);
  await p.screenshot({ path: `cap/kanpe-${lang}-${kanpeLang}-qr.png`, fullPage: true });
  await saveBoxes(p, `cap/kanpe-${lang}-${kanpeLang}-qr.png`, SELS);
  const url = await p.$eval(".qr input", (i) => i.value);
  console.log("share url", url);
  const live = await ctx.newPage();
  await live.goto(url, { waitUntil: "networkidle" });
  await live.waitForSelector(".kanpe.live");
  await sleep(800);
  await live.screenshot({ path: `cap/live-${lang}-${kanpeLang}.png`, fullPage: true });
  await saveBoxes(live, `cap/live-${lang}-${kanpeLang}.png`, SELS);
  await live.setViewportSize({ width: 390, height: 844 });
  await sleep(400);
  await live.screenshot({ path: `cap/live390-${lang}-${kanpeLang}.png` });
  await ctx.close();
}

void (async () => {
  const b = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  try {
    if (which === "all" || which === "practice") await practice(b, "ja");
    if (which === "all" || which === "review") {
      if (!process.env.SKIPJA) await review(b, "ja", "vi");
      for (const l of (process.env.LANGS || "en,vi,zh,ne,my,easy,ko").split(","))
        await review(b, l);
    }
  } finally {
    await b.close();
  }
})();
