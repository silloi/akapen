/**
 * 作り手（日本語教師）が評価の正解を確かめる道具（/dev/gold）と、その書き出しを
 * eval/cases に入れる台本（scripts/apply-gold.ts）が共に使う、確かめと当てはめ。
 */
import type { MarkKind } from "../shared/types.ts";
import type { EvalCase, GoldMark, NoMark } from "./score.ts";

export const KINDS: MarkKind[] = ["stalled", "missed", "impolite", "grammar"];

export const KIND_LABEL: Record<MarkKind, string> = {
  stalled: "用件が変わる・止まる",
  missed: "聞き取れていない",
  impolite: "失礼に聞こえそう",
  grammar: "文法・語",
};

/** 1つの会話の、作り手が直した正解 */
export interface GoldEdit {
  id: string;
  /** teacher: 作り手が確かめた / draft: まだ */
  goldBy: string;
  gold: { marks: GoldMark[]; noMark: NoMark[] };
  /** 判断の理由（自由に書く） */
  goldNote?: string;
}

/** 道具の「書き出す」で出すファイル */
export interface GoldExport {
  kind: "akapen-gold";
  version: 1;
  exportedAt: string;
  cases: GoldEdit[];
}

export interface GoldProblem {
  /** error: 当てはめられない / warn: 当てはめるが、見直した方がよい */
  level: "error" | "warn";
  message: string;
}

/** 正解の確かめ。引用が発話に文字どおりあるか、赤が多すぎないか、種類と発話の向きが合うか */
export function checkGold(c: EvalCase, gold: GoldEdit["gold"]): GoldProblem[] {
  const out: GoldProblem[] = [];
  const at = (turn: number) => c.turns[turn];
  const quoteOk = (turn: number, quote: string, label: string) => {
    const t = at(turn);
    if (!t) out.push({ level: "error", message: `${label}: ${turn} 番の発話がありません` });
    else if (!quote.trim()) out.push({ level: "error", message: `${label}: 引用が空です` });
    else if (!t.text.includes(quote))
      out.push({
        level: "error",
        message: `${label}: 「${quote}」が ${turn} 番の発話にそのままありません`,
      });
  };
  if (gold.marks.length > 3)
    out.push({ level: "warn", message: `赤が ${gold.marks.length} つあります（多くても3つ）` });
  gold.marks.forEach((m, i) => {
    const label = `赤${i + 1}`;
    if (!KINDS.includes(m.kind))
      out.push({ level: "error", message: `${label}: 種類「${m.kind}」が分かりません` });
    quoteOk(m.turn, m.quote, label);
    const t = at(m.turn);
    if (t && m.kind === "missed" && t.speaker !== "partner")
      out.push({
        level: "warn",
        message: `${label}: 「聞き取れていない」は、ふつう相手の発話から引用します`,
      });
    if (t && m.kind !== "missed" && t.speaker !== "me")
      out.push({ level: "warn", message: `${label}: 相手の発話に「${KIND_LABEL[m.kind]}」の赤` });
  });
  gold.noMark.forEach((n, i) => quoteOk(n.turn, n.quote, `直さない${i + 1}`));
  return out;
}

/** 書き出した正解を会話に当てはめる（順位は並びどおりに 1 から振り直す） */
export function applyGold(c: EvalCase, edit: GoldEdit): EvalCase {
  const marks = edit.gold.marks.map((m, i) => ({ ...m, rank: i + 1 }));
  const next: EvalCase = {
    ...c,
    goldBy: edit.goldBy,
    gold: { marks, noMark: edit.gold.noMark.map((n) => ({ ...n })) },
  };
  if (edit.goldNote?.trim()) next.goldNote = edit.goldNote.trim();
  else delete next.goldNote;
  return next;
}
