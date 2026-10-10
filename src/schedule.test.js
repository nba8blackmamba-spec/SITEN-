import { describe, it, expect } from "vitest";
import holidayJp from "@holiday-jp/holiday_jp";
import {
  jstParts, dayTypeOf, itemStatus, buildTodaySchedule, visibleTodayItems,
  formatScheduleDate, toMinutes, overridesFor, withHidden, withExtraAdded, withExtraRemoved, BASE_SCHEDULE,
} from "./schedule.js";
import { isJapaneseHoliday, listJapaneseHolidays, HOLIDAY_TABLE_LAST_YEAR } from "./holidaysJP.js";

// 日本時間の "YYYY-MM-DD" "HH:MM" → ms
const jst = (dateKey, hhmm) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - 9 * 3600 * 1000;
};
const visible = (dateKey, hhmm, overrides) =>
  visibleTodayItems(buildTodaySchedule(jst(dateKey, hhmm), overrides)).map((it) => ({
    id: it.id, name: it.name, time: it.timeLabel, status: it.status,
  }));

describe("日本時間の判定", () => {
  it("UTCの前日15:00は日本時間の翌0:00", () => {
    const p = jstParts(Date.UTC(2026, 9, 9, 15, 0));
    expect(p.dateKey).toBe("2026-10-10");
    expect(p.minutes).toBe(0);
    expect(p.weekday).toBe(6);
  });
  it("見出しの日付", () => {
    expect(formatScheduleDate("2026-10-10")).toBe("10月10日(土)");
  });
  it("時刻の変換", () => {
    expect(toMinutes("24:00")).toBe(1440);
    expect(toMinutes("12:30")).toBe(750);
    expect(toMinutes("")).toBe(null);
    expect(toMinutes("25:00")).toBe(null);
  });
});

describe("祝日", () => {
  it("2026-11-03・2026-11-23は祝日", () => {
    expect(isJapaneseHoliday("2026-11-03")).toBe(true);
    expect(isJapaneseHoliday("2026-11-23")).toBe(true);
    expect(isJapaneseHoliday("2026-11-24")).toBe(false);
  });
  it("振替休日・国民の休日を含む", () => {
    expect(isJapaneseHoliday("2026-05-06")).toBe(true); // 振替休日
    expect(isJapaneseHoliday("2026-09-22")).toBe(true); // 国民の休日
  });
  it(`祝日表が @holiday-jp/holiday_jp と一致する(〜${HOLIDAY_TABLE_LAST_YEAR}年)`, () => {
    // ライブラリの日付キー("YYYY-MM-DD")を直接使う(端末のタイムゾーンに左右されない)
    const fromLib = Object.keys(holidayJp.holidays)
      .filter((k) => k >= "2025-01-01" && k <= `${HOLIDAY_TABLE_LAST_YEAR}-12-31`)
      .sort();
    expect(listJapaneseHolidays()).toEqual(fromLib);
  });
});

describe("曜日の判定", () => {
  it("平日・土日・祝日", () => {
    expect(dayTypeOf("2026-10-07")).toBe("weekday"); // 水
    expect(dayTypeOf("2026-10-10")).toBe("holiday"); // 土
    expect(dayTypeOf("2026-10-11")).toBe("holiday"); // 日
    expect(dayTypeOf("2026-10-12")).toBe("holiday"); // 月・スポーツの日
  });
  it("第2・第4金曜", () => {
    expect(dayTypeOf("2026-10-09")).toBe("secondFourthFriday"); // 9日
    expect(dayTypeOf("2026-10-23")).toBe("secondFourthFriday"); // 23日
    expect(dayTypeOf("2026-10-02")).toBe("weekday"); // 第1
    expect(dayTypeOf("2026-10-16")).toBe("weekday"); // 第3
    expect(dayTypeOf("2026-10-30")).toBe("weekday"); // 第5
    expect(dayTypeOf("2026-05-08")).toBe("secondFourthFriday"); // 8日(境界)
    expect(dayTypeOf("2026-08-14")).toBe("secondFourthFriday"); // 14日(境界)
    expect(dayTypeOf("2026-05-22")).toBe("secondFourthFriday"); // 22日(境界)
    expect(dayTypeOf("2026-08-28")).toBe("secondFourthFriday"); // 28日(境界)
  });
  it("第2・第4金曜が祝日なら祝日を優先", () => {
    expect(dayTypeOf("2028-02-11")).toBe("holiday"); // 金・建国記念の日(第2金曜)
    expect(visible("2028-02-11", "18:00")).toEqual([{ id: "base:lab-allday", name: "ラボ", time: "", status: "allday" }]);
  });
});

describe("平日の時刻による切り替え", () => {
  const day = "2026-10-07"; // 水
  it("12:00 は両方とも開始前で表示", () => {
    expect(visible(day, "12:00")).toEqual([
      { id: "base:health", name: "健康マージャン", time: "12:30〜17:00", status: "upcoming" },
      { id: "base:lab", name: "ラボ", time: "17:00〜24:00", status: "upcoming" },
    ]);
  });
  it("12:30 は健康マージャンが開催中", () => {
    expect(visible(day, "12:30").map((x) => x.status)).toEqual(["active", "upcoming"]);
  });
  it("17:00 は健康マージャンが消え、ラボが開催中", () => {
    expect(visible(day, "17:00")).toEqual([
      { id: "base:lab", name: "ラボ", time: "17:00〜24:00", status: "active" },
    ]);
  });
  it("23:59 はラボが開催中", () => {
    expect(visible(day, "23:59")).toEqual([
      { id: "base:lab", name: "ラボ", time: "17:00〜24:00", status: "active" },
    ]);
  });
  it("24:00 でラボは終了(翌日0:00は翌日の予定になる)", () => {
    expect(itemStatus({ start: "17:00", end: "24:00" }, 24 * 60)).toBe("ended");
    const next = buildTodaySchedule(jst(day, "23:59") + 60 * 1000, null);
    expect(next.dateKey).toBe("2026-10-08");
    expect(visibleTodayItems(next).map((x) => x.status)).toEqual(["upcoming", "upcoming"]);
  });
});

describe("第2・第4金曜・土日・祝日", () => {
  it("第2金曜の昼は健康マージャン、夜は協会ルール", () => {
    expect(visible("2026-10-09", "13:00").map((x) => x.name)).toEqual(["健康マージャン", "協会ルール"]);
    expect(visible("2026-10-09", "20:00")).toEqual([
      { id: "base:association", name: "協会ルール", time: "17:00〜24:00", status: "active" },
    ]);
  });
  it("第4金曜の夜も協会ルール", () => {
    expect(visible("2026-10-23", "18:30").map((x) => x.name)).toEqual(["協会ルール"]);
  });
  it("土日は終日ラボ(時間なし)", () => {
    expect(visible("2026-10-10", "10:00")).toEqual([{ id: "base:lab-allday", name: "ラボ", time: "", status: "allday" }]);
    expect(visible("2026-10-11", "23:00")).toEqual([{ id: "base:lab-allday", name: "ラボ", time: "", status: "allday" }]);
  });
  it("祝日(平日)は終日ラボ", () => {
    expect(visible("2026-11-03", "13:00")).toEqual([{ id: "base:lab-allday", name: "ラボ", time: "", status: "allday" }]);
    expect(visible("2026-11-23", "18:00")).toEqual([{ id: "base:lab-allday", name: "ラボ", time: "", status: "allday" }]);
  });
});

describe("手で変えた予定", () => {
  const day = "2026-10-10";
  const extra = { id: "x1", kind: "proam", name: "プロアマS第5戦", start: "13:00", end: "18:00" };
  it("追加した予定が時間順に並ぶ(時間なしが先頭)", () => {
    const ov = withExtraAdded(overridesFor(null, day), extra);
    expect(visible(day, "12:00", ov)).toEqual([
      { id: "base:lab-allday", name: "ラボ", time: "", status: "allday" },
      { id: "x1", name: "プロアマS第5戦", time: "13:00〜18:00", status: "upcoming" },
    ]);
    expect(visible(day, "18:00", ov).map((x) => x.id)).toEqual(["base:lab-allday"]);
  });
  it("名前を省略すると種別名になる", () => {
    const ov = withExtraAdded(overridesFor(null, day), { id: "x2", kind: "tournament" });
    expect(visible(day, "12:00", ov).map((x) => x.name)).toEqual(["ラボ", "大会"]);
  });
  it("今日は非表示", () => {
    const ov = withHidden(overridesFor(null, day), "base:lab-allday", true);
    expect(visible(day, "12:00", ov)).toEqual([]);
    expect(visible(day, "12:00", withHidden(ov, "base:lab-allday", false))).toHaveLength(1);
  });
  it("日付が変わると、追加・非表示は効かなくなる", () => {
    const ov = withHidden(withExtraAdded(overridesFor(null, day), extra), "base:lab-allday", true);
    expect(visible("2026-10-11", "12:00", ov)).toEqual([{ id: "base:lab-allday", name: "ラボ", time: "", status: "allday" }]);
  });
  it("追加した予定を消すと、非表示指定も消える", () => {
    const ov = withHidden(withExtraAdded(overridesFor(null, day), extra), "x1", true);
    const removed = withExtraRemoved(ov, "x1");
    expect(removed.extras).toEqual([]);
    expect(removed.hidden).toEqual([]);
  });
  it("開始だけ・終了だけの予定", () => {
    expect(itemStatus({ start: "18:00" }, 17 * 60)).toBe("upcoming");
    expect(itemStatus({ start: "18:00" }, 23 * 60)).toBe("active");
    expect(itemStatus({ end: "15:00" }, 14 * 60)).toBe("active");
    expect(itemStatus({ end: "15:00" }, 15 * 60)).toBe("ended");
  });
});

it("基本の予定はデータとして1か所にある", () => {
  expect(Object.keys(BASE_SCHEDULE).sort()).toEqual(["holiday", "secondFourthFriday", "weekday"]);
});
