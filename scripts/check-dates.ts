/**
 * 相手役の日付の確かめ: 学習者が「来週の火曜日」「あした」のように相対的な日で言ったとき、
 * 相手役が自分で日付に直して確かめるか（「来週の火曜日ですと、11月17日ですね」）、
 * それとも「何日でしょうか」と学習者に聞き返すか（本物の受付はしない）を見る。
 *
 *   ANTHROPIC_API_KEY=... vpx scripts/check-dates.ts [--runs 2]
 *
 * 今日の日付は固定する（日曜日と火曜日の2通り。日曜日は「来週」がどちらの週かあいまいになる）。
 * 結果: 直した（期待する日を言った）/ 聞き返した（「何日」）/ そのほか（返事を読んで判断）
 */
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs } from "node:util";
import { type Ymd } from "../shared/calendar.ts";
import { findCando } from "../shared/cando.ts";
import { callJson } from "../shared/claude.ts";
import {
  PARTNER_SCHEMA,
  partnerMessages,
  partnerSystem,
  PROMPT_VERSION,
  type PartnerReply,
} from "../shared/prompts.ts";
import { findScene } from "../shared/scenes.ts";
import type { Turn } from "../shared/types.ts";

const { values } = parseArgs({ options: { runs: { type: "string", default: "2" } } });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.AKAPEN_ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com",
});

interface Probe {
  sceneId: string;
  /** 相手役の最初の一言の後の、会話の続き（最後は学習者） */
  turns: Turn[];
  /** 今日 → 正しいとみなす日（日にちの数字） */
  expect: Record<string, number[]>;
}

const p = (text: string): Turn => ({ speaker: "partner", text });
const m = (text: string): Turn => ({ speaker: "me", text });

const PROBES: Probe[] = [
  {
    // 11/7 の試し撮りで「来週の火曜日は、11月の何日でしょうか」と聞き返した所
    sceneId: "sodai-gomi",
    turns: [
      m("粗大ごみを、お願いしたいです。"),
      p("粗大ごみの収集のお申し込みですね。何をお出しになりますか。"),
      m("木のいすです。"),
      p("木のいす1点ですね。収集のご希望の日はございますか。"),
      m("来週の火曜日は、いいですか？"),
    ],
    expect: { "2026-11-08": [10, 17], "2026-11-10": [17] },
  },
  {
    sceneId: "restaurant",
    turns: [
      m("予約をお願いします。"),
      p("ありがとうございます。ご希望のお日にちとお時間はいつでしょうか。"),
      m("今週の土曜日、夜7時です。"),
    ],
    expect: { "2026-11-08": [14], "2026-11-10": [14] },
  },
  {
    sceneId: "clinic",
    turns: [
      m("予約したいです。初めてです。"),
      p("ご予約ですね。ご希望のお日にちはございますか。"),
      m("あしたの午後は、いいですか。"),
    ],
    expect: { "2026-11-08": [9], "2026-11-10": [11] },
  },
  {
    sceneId: "cando-731",
    turns: [
      m("部屋を使いたいです。"),
      p("ご利用のお申し込みですね。ご希望のお日にちとお時間をお願いします。"),
      m("来月の最初の土曜日の、午後1時から4時です。"),
    ],
    expect: { "2026-11-08": [5], "2026-11-10": [5] },
  },
];

const ymd = (s: string): Ymd => {
  const [y, mo, d] = s.split("-").map(Number) as [number, number, number];
  return { y, m: mo, d };
};

const runs = Number(values.runs);
const tally = { resolved: 0, askedBack: 0, other: 0 };
console.log(`指示 ${PROMPT_VERSION}`);
for (const probe of PROBES) {
  const scene = findScene(probe.sceneId)!;
  const turns: Turn[] = [p(scene.opening), ...probe.turns];
  for (const [today, ok] of Object.entries(probe.expect)) {
    for (let r = 0; r < runs; r++) {
      const res = await callJson<PartnerReply>(client, {
        model: "claude-opus-5-5",
        effort: "low",
        system: partnerSystem(scene, findCando(scene.candoNo), "slow", "normal", ymd(today)),
        messages: partnerMessages(turns),
        schema: PARTNER_SCHEMA,
        maxTokens: 4000,
      });
      const say = res.data.say;
      const days = [...say.matchAll(/(\d{1,2})日/g)].map((x) => Number(x[1]));
      const askedBack = /何日|いつの|日にちを.*(お願い|教え)/.test(say);
      const verdict = askedBack
        ? "聞き返した"
        : days.some((d) => ok.includes(d))
          ? "直した"
          : "そのほか";
      if (verdict === "直した") tally.resolved++;
      else if (verdict === "聞き返した") tally.askedBack++;
      else tally.other++;
      const last = probe.turns[probe.turns.length - 1]!.text;
      console.log(`${probe.sceneId} 今日=${today} 「${last}」→ [${verdict}] ${say}`);
    }
  }
}
console.log(
  `\n直した ${tally.resolved}・聞き返した ${tally.askedBack}・そのほか ${tally.other}（全 ${tally.resolved + tally.askedBack + tally.other}）`,
);
