/**
 * Claude の赤ペンを確かめて整える。
 * - 引用（quote）がその発話に文字どおり無いものは捨てる（どこに赤を入れるか決められないため）
 * - 言いよどみだけの赤は捨てる
 * - 種類の優先順に並べ直し、多くても3つにし、priority を 1 から振り直す
 */
import type { Akapen, Mark, MarkKind, Note, Retry, Turn } from "./types.ts";

export const KIND_ORDER: MarkKind[] = ["stalled", "missed", "impolite", "grammar"];

const FILLER = /^[\s、。・…ー〜えっとあのそのまーうん]*$/u;

export interface RawAkapen {
  marks: Omit<Mark, "priority">[];
  good: Note[];
  later: Note[];
  retry?: Retry[];
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

/** 引用の比べ方: 記号・空白・かっこを除いて比べる（Claude が句点やかぎかっこを落としても対応づく） */
const loose = (s: string) => s.replace(/[\s「」『』（）()。、．，.,!?！？…・　]/g, "");

/**
 * 前回の赤ペンと、Claude の retry を対応づける。
 * 1. 引用か「次はこう言う」が文字どおり同じ → 2. 記号を除いて同じか片方が片方を含む → 3. 数が同じなら順番どおり。
 * 対応が無いものは △（この場面が出てこなかった）。
 * 以前は 1 だけだったため、Claude が句点などを変えると全部 △ になった（11/7 の試し撮りで起きた）。
 */
export function matchRetry(raw: Retry[], previous: Pick<Mark, "quote" | "next">[]): Retry[] {
  const used = new Set<number>();
  const take = (i: number) => {
    used.add(i);
    return raw[i]!;
  };
  const pick = (p: Pick<Mark, "quote" | "next">, idx: number): Retry | undefined => {
    const exact = raw.findIndex(
      (x, i) => !used.has(i) && (x.quote === p.quote || x.next === p.next),
    );
    if (exact >= 0) return take(exact);
    const lq = loose(p.quote);
    const ln = loose(p.next);
    const near = raw.findIndex((x, i) => {
      if (used.has(i)) return false;
      const xq = loose(x.quote);
      const xn = loose(x.next);
      const same = (a: string, b: string) =>
        !!a && !!b && (a === b || a.includes(b) || b.includes(a));
      return same(xq, lq) || same(xn, ln);
    });
    if (near >= 0) return take(near);
    if (raw.length === previous.length && !used.has(idx)) return take(idx);
    return undefined;
  };
  return previous.map((p, idx) => {
    const r = pick(p, idx);
    return r
      ? { ...p, done: r.done, note: r.note }
      : { ...p, done: false, note: "今回は、この場面が出てきませんでした。" };
  });
}

export function normalizeAkapen(
  raw: RawAkapen,
  turns: Turn[],
  previous: Pick<Mark, "quote" | "next">[] = [],
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
      later: notes(raw.later, 6, "later"),
      // 前回の赤ペンに対応するものだけ残す（Claude が作った項目は捨てる）
      retry: previous.length ? matchRetry(raw.retry ?? [], previous) : undefined,
      summary: raw.summary,
    },
    dropped,
  };
}
