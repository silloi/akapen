/**
 * 発話の文を、赤ペン（波線・丸）と ○ の範囲で区切る。文字は変えない。
 */
export interface Highlight {
  quote: string;
  /** mark: 赤ペン（直す所）、good: ○ */
  type: "mark" | "good";
  /** 赤ペンの番号（good は 0） */
  priority: number;
}

export interface Segment {
  text: string;
  highlight?: Highlight;
}

export function segment(text: string, highlights: Highlight[]): Segment[] {
  // 最初に見つかった位置で区切る。重なるものは、先に置いたもの（赤ペン）を優先する
  const ranges: { start: number; end: number; h: Highlight }[] = [];
  const ordered = [...highlights].sort((a, b) =>
    a.type === b.type ? a.priority - b.priority : a.type === "mark" ? -1 : 1,
  );
  for (const h of ordered) {
    if (!h.quote) continue;
    let from = 0;
    while (from <= text.length) {
      const start = text.indexOf(h.quote, from);
      if (start < 0) break;
      const end = start + h.quote.length;
      if (!ranges.some((r) => start < r.end && r.start < end)) {
        ranges.push({ start, end, h });
        break;
      }
      from = start + 1;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) out.push({ text: text.slice(pos, r.start) });
    out.push({ text: text.slice(r.start, r.end), highlight: r.h });
    pos = r.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
