// ════════════════════════════════════════════════════════
// 「本日の予定」の判定ロジック（画面から切り離した純粋関数）
// 日付・時刻は端末の設定に関係なく日本時間(JST, UTC+9・夏時間なし)で判定する
// ════════════════════════════════════════════════════════
import { isJapaneseHoliday } from "./holidaysJP.js";

// ── 予定の種別 ──────────────────────────────────────────
export const SCHEDULE_KINDS = [
  { id: "proam", label: "プロアマ大会", color: "#F28C28" },
  { id: "tournament", label: "大会", color: "#F28C28" },
  { id: "lab", label: "ラボ", color: "#9B6BE8" },
  { id: "health", label: "健康マージャン", color: "#2ECC71" },
  { id: "association", label: "協会ルール", color: "#1565C0" },
  { id: "other", label: "その他", color: "#9AA5B1" },
];
export const scheduleKindInfo = (id) =>
  SCHEDULE_KINDS.find((k) => k.id === id) || SCHEDULE_KINDS[SCHEDULE_KINDS.length - 1];

// ── 基本の予定（毎週の決まった予定） ────────────────────
// 後で画面から変更できるよう、データとしてここ1か所にまとめている。
// id は「今日は非表示」の指定に使うので、変えないこと。
// start / end は "HH:MM"（"24:00" 可）。両方省略すると終日（名前だけ表示）。
export const BASE_SCHEDULE = {
  // 平日(月〜金、祝日を除く)
  weekday: [
    { id: "health", kind: "health", start: "12:30", end: "17:00" },
    { id: "lab", kind: "lab", start: "17:00", end: "24:00" },
  ],
  // 第2・第4金曜(その月の8〜14日と22〜28日の金曜。祝日なら holiday が優先)
  secondFourthFriday: [
    { id: "health", kind: "health", start: "12:30", end: "17:00" },
    { id: "association", kind: "association", start: "17:00", end: "24:00" },
  ],
  // 土曜・日曜・祝日
  holiday: [
    { id: "lab-allday", kind: "lab" },
  ],
};

// ── 日本時間ヘルパー ────────────────────────────────────
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const pad2 = (n) => String(n).padStart(2, "0");

// 任意の時刻(ms)を、日本時間の日付・曜日・0時からの経過分に分解する
export function jstParts(nowMs) {
  const d = new Date(nowMs + JST_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    year, month, day,
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

// "YYYY-MM-DD" → 曜日(0=日)・日
const dateKeyInfo = (dateKey) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { year: y, month: m, day: d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

// 見出し用: "10月10日(土)"
export const formatScheduleDate = (dateKey) => {
  const { month, day, weekday } = dateKeyInfo(dateKey);
  return `${month}月${day}日(${WEEKDAY_LABELS[weekday]})`;
};

// "HH:MM" → 0時からの分。不正な値は null
export const toMinutes = (hhmm) => {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v >= 0 && v <= 24 * 60 ? v : null;
};

// ── 曜日・祝日の判定 ────────────────────────────────────
// 戻り値: "holiday"(土日祝) | "secondFourthFriday" | "weekday"
export function dayTypeOf(dateKey) {
  const { day, weekday } = dateKeyInfo(dateKey);
  if (weekday === 0 || weekday === 6 || isJapaneseHoliday(dateKey)) return "holiday";
  if (weekday === 5 && ((day >= 8 && day <= 14) || (day >= 22 && day <= 28))) return "secondFourthFriday";
  return "weekday";
}

export const baseItemsFor = (dateKey, config = BASE_SCHEDULE) =>
  (config[dayTypeOf(dateKey)] || []).map((it) => ({ ...it, id: `base:${it.id}`, source: "base" }));

// ── 時刻による状態 ──────────────────────────────────────
// 戻り値: "allday"(時間なし) | "upcoming" | "active"(開催中) | "ended"(終了)
export function itemStatus(item, minutes) {
  const s = toMinutes(item.start);
  const e = toMinutes(item.end);
  if (s == null && e == null) return "allday";
  if (e != null && minutes >= e) return "ended";
  if (s != null && minutes < s) return "upcoming";
  return "active";
}

// 表示用の時間: "12:30〜17:00" / "18:00〜" / "〜17:00" / ""
export const formatTimeRange = (item) => {
  const s = toMinutes(item.start) != null ? item.start : "";
  const e = toMinutes(item.end) != null ? item.end : "";
  return s || e ? `${s}〜${e}` : "";
};

export const itemName = (item) => (item.name && String(item.name).trim()) || scheduleKindInfo(item.kind).label;

// ── 手で変えた分（その日だけ有効） ─────────────────────
// 保存形式: { date: "YYYY-MM-DD", extras: [{ id, kind, name?, start?, end? }], hidden: [id, ...] }
// 保存されている日付が今日でなければ、空として扱う(翌日には自然に元に戻る)
export function overridesFor(raw, dateKey) {
  if (!raw || raw.date !== dateKey) return { date: dateKey, extras: [], hidden: [] };
  return {
    date: dateKey,
    extras: Array.isArray(raw.extras) ? raw.extras.filter((x) => x && x.id) : [],
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((x) => typeof x === "string") : [],
  };
}

const sortKey = (item) => {
  const s = toMinutes(item.start);
  const e = toMinutes(item.end);
  // 時間のない予定は先頭、それ以外は開始(なければ終了)の早い順
  return [s == null && e == null ? -1 : (s ?? 0), e ?? 24 * 60];
};

// 今日の予定一覧（基本 + 手で足した分。非表示・終了も含む。管理画面用）
export function buildTodaySchedule(nowMs, rawOverrides, config = BASE_SCHEDULE) {
  const { dateKey, minutes } = jstParts(nowMs);
  const ov = overridesFor(rawOverrides, dateKey);
  const items = [
    ...baseItemsFor(dateKey, config),
    ...ov.extras.map((x) => ({ ...x, source: "extra" })),
  ].map((it) => ({
    ...it,
    name: itemName(it),
    color: scheduleKindInfo(it.kind).color,
    timeLabel: formatTimeRange(it),
    status: itemStatus(it, minutes),
    hidden: ov.hidden.includes(it.id),
  }));
  items.sort((a, b) => {
    const [as, ae] = sortKey(a);
    const [bs, be] = sortKey(b);
    return as - bs || ae - be;
  });
  return { dateKey, dateLabel: formatScheduleDate(dateKey), minutes, items, overrides: ov };
}

// /board に出す分（非表示・終了したものを除く）
export const visibleTodayItems = (schedule) =>
  schedule.items.filter((it) => !it.hidden && it.status !== "ended");

// ── 管理画面からの変更（保存する値を返す） ─────────────
export const withHidden = (ov, id, hide) => ({
  ...ov,
  hidden: hide ? [...new Set([...ov.hidden, id])] : ov.hidden.filter((x) => x !== id),
});
export const withExtraAdded = (ov, extra) => ({ ...ov, extras: [...ov.extras, extra] });
export const withExtraRemoved = (ov, id) => ({
  ...ov,
  extras: ov.extras.filter((x) => x.id !== id),
  hidden: ov.hidden.filter((x) => x !== id),
});
