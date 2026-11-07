/**
 * 相手役に渡す「今日」とカレンダー（日本時間）。
 *
 * 本物の受付は今日の日付を知っているので、学習者が「来週の火曜日」と言えば、自分で日付に直して確かめる。
 * 知らせないと、相手役が「来週の火曜日は、何日でしょうか」と学習者に聞き返してしまう（11/7 の試し撮り）。
 */
export interface Ymd {
  y: number;
  /** 1〜12 */
  m: number;
  d: number;
}

const WEEKDAYS = "日月火水木金土";
const DAY = 24 * 60 * 60 * 1000;

const toTime = (x: Ymd) => Date.UTC(x.y, x.m - 1, x.d);
const fromTime = (t: number): Ymd => {
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};

/** 日本時間の今日 */
export function todayJst(now: Date = new Date()): Ymd {
  return fromTime(now.getTime() + 9 * 60 * 60 * 1000);
}

/** 曜日（日・月・火…） */
export function weekdayOf(x: Ymd): string {
  return WEEKDAYS[new Date(toTime(x)).getUTCDay()]!;
}

/** 「2026年11月8日（日）」 */
export function formatDate(x: Ymd): string {
  return `${x.y}年${x.m}月${x.d}日（${weekdayOf(x)}）`;
}

/**
 * 今日を含む週から weeks 週ぶんのカレンダー。1行が月曜から日曜の1週間。
 * 行の始めと月が変わる所に月を書く（年が変わる所には年も）。今日には「←今日」を付ける。
 */
export function calendarLines(today: Ymd, weeks = 8): string[] {
  const base = toTime(today);
  const monday = base - ((new Date(base).getUTCDay() + 6) % 7) * DAY;
  const lines: string[] = [];
  let prev: Ymd | null = null;
  for (let w = 0; w < weeks; w++) {
    const cells: string[] = [];
    for (let i = 0; i < 7; i++) {
      const t = monday + (w * 7 + i) * DAY;
      const x = fromTime(t);
      const head =
        (prev && prev.y !== x.y ? `${x.y}年` : "") + (i === 0 || prev?.m !== x.m ? `${x.m}月` : "");
      cells.push(`${head}${x.d}日(${weekdayOf(x)})${t === base ? "←今日" : ""}`);
      prev = x;
    }
    lines.push(cells.join(" "));
  }
  return lines;
}
