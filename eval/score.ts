/**
 * 作り手の赤ペン（正解）と Claude の赤ペンを比べる。
 *
 * - 合う: 同じ発話で、引用が重なる（片方がもう片方を含む）。正解の alt に挙げた所でもよい。種類は問わない（種類が合ったかは別に数える）
 * - 拾えた割合（recall）: 正解の赤のうち、Claude も入れたもの
 * - 入れすぎ: Claude の赤のうち、正解に無いもの
 * - 1番が合う: 正解の1番と Claude の1番が合う（正解に赤が無いときは、Claude も赤を入れなければ合う）
 * - 入れてはいけない所: 正解で「直さなくていい」とした所に、Claude が赤を入れた数
 */
import type { MarkKind, Turn } from "../shared/types.ts";

export interface GoldMark {
  rank: number;
  kind: MarkKind;
  turn: number;
  quote: string;
  /** 同じつまずきを別の所に入れても合うとする所（例: 聞き取れなかった相手の言葉と、ずれた答え） */
  alt?: { turn: number; quote: string }[];
}

export interface EvalCase {
  id: string;
  sceneId: string;
  note: string;
  /** 正解を誰が入れたか（draft: 作り手が確かめる前の仮） */
  goldBy: string;
  turns: Turn[];
  gold: { marks: GoldMark[]; noMark: { turn: number; quote: string; reason: string }[] };
}

export interface PredMark {
  priority: number;
  kind: MarkKind;
  turn: number;
  quote: string;
}

export interface CaseScore {
  id: string;
  gold: number;
  pred: number;
  hit: number;
  kindHit: number;
  extra: number;
  top1: boolean;
  forbidden: number;
}

function overlaps(a: { turn: number; quote: string }, b: { turn: number; quote: string }): boolean {
  return a.turn === b.turn && (a.quote.includes(b.quote) || b.quote.includes(a.quote));
}

function matches(g: GoldMark, p: { turn: number; quote: string }): boolean {
  return overlaps(g, p) || (g.alt ?? []).some((a) => overlaps(a, p));
}

export function scoreCase(c: EvalCase, pred: PredMark[]): CaseScore {
  const gold = [...c.gold.marks].sort((a, b) => a.rank - b.rank);
  const sorted = [...pred].sort((a, b) => a.priority - b.priority);
  const used = new Set<number>();
  let hit = 0;
  let kindHit = 0;
  for (const g of gold) {
    const i = sorted.findIndex((p, k) => !used.has(k) && matches(g, p));
    if (i >= 0) {
      used.add(i);
      hit++;
      if (sorted[i]!.kind === g.kind) kindHit++;
    }
  }
  const top1 =
    gold.length === 0 ? sorted.length === 0 : Boolean(sorted[0] && matches(gold[0]!, sorted[0]));
  const forbidden = sorted.filter((p) => c.gold.noMark.some((n) => overlaps(n, p))).length;
  return {
    id: c.id,
    gold: gold.length,
    pred: sorted.length,
    hit,
    kindHit,
    extra: sorted.length - used.size,
    top1,
    forbidden,
  };
}

export interface Summary {
  cases: number;
  recall: number;
  precision: number;
  kindAgreement: number;
  top1: number;
  forbidden: number;
}

export function summarize(scores: CaseScore[]): Summary {
  const sum = (f: (s: CaseScore) => number) => scores.reduce((a, s) => a + f(s), 0);
  const gold = sum((s) => s.gold);
  const pred = sum((s) => s.pred);
  const hit = sum((s) => s.hit);
  return {
    cases: scores.length,
    recall: gold ? hit / gold : 1,
    precision: pred ? hit / pred : 1,
    kindAgreement: hit ? sum((s) => s.kindHit) / hit : 1,
    top1: scores.length ? scores.filter((s) => s.top1).length / scores.length : 0,
    forbidden: sum((s) => s.forbidden),
  };
}
