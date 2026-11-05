/**
 * Claude の赤ペンを確かめて整える。
 * - 引用（quote）がその発話に文字どおり無いものは捨てる（どこに赤を入れるか決められないため）
 * - 言いよどみだけの赤は捨てる
 * - 種類の優先順に並べ直し、多くても3つにし、priority を 1 から振り直す
 */
import type { Akapen, Mark, MarkKind, Note, Turn } from "./types.ts";

export const KIND_ORDER: MarkKind[] = ["stalled", "missed", "impolite", "grammar"];

const FILLER = /^[\s、。・…ー〜えっとあのそのまーうん]*$/u;

export interface RawAkapen {
  marks: Omit<Mark, "priority">[];
  good: Note[];
  later: Note[];
  summary: string;
}

export interface Dropped {
  reason: string;
  item: unknown;
}

function quoteOk(turns: Turn[], turn: number, quote: string): boolean {
  const t = turns[turn];
  return Boolean(t && quote && t.text.includes(quote));
}

export function normalizeAkapen(
  raw: RawAkapen,
  turns: Turn[],
): { akapen: Akapen; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const marks = raw.marks.filter((m) => {
    if (!quoteOk(turns, m.turn, m.quote)) {
      dropped.push({ reason: "引用が発話に無い", item: m });
      return false;
    }
    if (FILLER.test(m.quote)) {
      dropped.push({ reason: "言いよどみだけ", item: m });
      return false;
    }
    // missed は相手の発話、それ以外は学習者の発話に入れる
    const speaker = turns[m.turn]?.speaker;
    if ((m.kind === "missed") !== (speaker === "partner")) {
      dropped.push({ reason: "発話の話し手と種類が合わない", item: m });
      return false;
    }
    return true;
  });
  // 安定した並べ替え（同じ種類の中では Claude の順を保つ）
  const sorted = marks
    .map((m, i) => ({ m, i }))
    .sort((a, b) => KIND_ORDER.indexOf(a.m.kind) - KIND_ORDER.indexOf(b.m.kind) || a.i - b.i)
    .map(({ m }) => m);
  for (const m of sorted.slice(3)) dropped.push({ reason: "4つ目以降", item: m });
  const notes = (list: Note[], max: number, label: string) => {
    const ok = list.filter((n) => {
      if (!quoteOk(turns, n.turn, n.quote)) {
        dropped.push({ reason: `${label}: 引用が発話に無い`, item: n });
        return false;
      }
      return true;
    });
    return ok.slice(0, max);
  };
  return {
    akapen: {
      marks: sorted.slice(0, 3).map((m, i) => ({ ...m, priority: i + 1 })),
      good: notes(raw.good, 3, "good"),
      later: notes(raw.later, 4, "later"),
      summary: raw.summary,
    },
    dropped,
  };
}
