import { describe, expect, it } from "vite-plus/test";
import { calendarLines, formatDate, todayJst, weekdayOf } from "./calendar.ts";

describe("calendar", () => {
  it("日本時間の今日（UTC の15時を過ぎると次の日）", () => {
    expect(todayJst(new Date("2026-11-07T14:59:00Z"))).toEqual({ y: 2026, m: 11, d: 7 });
    expect(todayJst(new Date("2026-11-07T15:00:00Z"))).toEqual({ y: 2026, m: 11, d: 8 });
  });

  it("曜日", () => {
    expect(weekdayOf({ y: 2026, m: 11, d: 8 })).toBe("日");
    expect(weekdayOf({ y: 2026, m: 11, d: 18 })).toBe("水");
    expect(formatDate({ y: 2026, m: 11, d: 10 })).toBe("2026年11月10日（火）");
  });

  it("月曜はじまりの1週1行。今日に印。月と年の変わり目に月・年", () => {
    const lines = calendarLines({ y: 2026, m: 11, d: 8 }, 8);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe("11月2日(月) 3日(火) 4日(水) 5日(木) 6日(金) 7日(土) 8日(日)←今日");
    expect(lines[1]!.startsWith("11月9日(月) 10日(火)")).toBe(true);
    expect(lines[4]).toBe("11月30日(月) 12月1日(火) 2日(水) 3日(木) 4日(金) 5日(土) 6日(日)");
    // 年をまたぐ
    const dec = calendarLines({ y: 2026, m: 12, d: 28 }, 2);
    expect(dec[0]).toBe(
      "12月28日(月)←今日 29日(火) 30日(水) 31日(木) 2027年1月1日(金) 2日(土) 3日(日)",
    );
  });
});
