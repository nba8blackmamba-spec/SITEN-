// ════════════════════════════════════════════════════════
// 予約の空き計算・キャンセル待ち繰り上げなどの共通ロジック
// 画面（スタッフ）とサーバー（/api/reserve）の両方から使う。Firestore には触らない純粋な関数だけ置く。
// ════════════════════════════════════════════════════════
export const SEATS = 4;
export const TABLE_IDS = [1, 2, 3, 4, 5, 6];
export const COURSE_IDS = ["health", "labo"];
export const TIME_SLOTS = ["12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00"];

// 誰でも読める「空き状況」用のコピーに入れてよい項目（名前・電話番号などは入れない）
export const PUBLIC_FIELDS = ["id", "tableId", "date", "time", "people", "status", "finished", "createdAt"];
export const toPublic = (r) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, r[k] ?? null]));
export const samePublic = (a, b) => !!a && !!b && PUBLIC_FIELDS.every((k) => (a[k] ?? null) === (b[k] ?? null));

export const bookedCount = (list, tid, date, time, skip = null) =>
  list.filter((r) => r.tableId === tid && r.date === date && r.time === time && r.status === "confirmed" && !r.finished && r.id !== skip)
      .reduce((s, r) => s + (Number(r.people) || 0), 0);
export const seatsLeft = (list, tid, date, time, skip = null) => SEATS - bookedCount(list, tid, date, time, skip);

export const isClosedDate = (settings, date) => {
  if ((settings.closedDays || []).includes(date)) return true;
  const wd = new Date(date + "T00:00:00").getDay();
  return (settings.closedWeekdays || []).includes(wd);
};

export const digitsOnly = (phone) => String(phone || "").replace(/[^\d]/g, "");

export const hasDuplicate = (list, phone, date, skip = null) => {
  const p = digitsOnly(phone);
  return list.some((r) => digitsOnly(r.phone) === p && r.date === date && r.status !== "cancelled" && r.id !== skip);
};

// キャンセル待ちを、席が空いた分だけ古い順に1件繰り上げる（元の画面の動きと同じ）
export const promoteWaitlist = (list, date, time, tableId) => {
  const waiting = list.filter((r) => r.status === "waitlist" && r.date === date && r.time === time && r.tableId === tableId)
                      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let updated = [...list];
  for (const w of waiting) {
    if (seatsLeft(updated, tableId, date, time) >= w.people) {
      updated = updated.map((r) => (r.id === w.id ? { ...r, status: "confirmed" } : r));
      break;
    }
  }
  return updated;
};

export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// キャンセル期限内か（期限0なら常にOK）
export const canCancelAt = (rsv, deadlineHours, now = new Date()) => {
  if (!(deadlineHours > 0)) return true;
  const target = new Date(`${rsv.date}T${rsv.time}:00+09:00`);
  return (target - now) / 3600000 >= deadlineHours;
};

// お客さんから届いた予約内容のチェック（サーバー側で使う）
export const validateBooking = (b) => {
  if (!b || typeof b !== "object") return "予約内容がありません";
  const name = String(b.name || "").trim();
  if (!name || name.length > 40) return "お名前を確認してください";
  if (!/^0\d{9,10}$/.test(digitsOnly(b.phone))) return "電話番号を確認してください";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ""))) return "日付が不正です";
  if (!TIME_SLOTS.includes(b.time)) return "時間が不正です";
  if (!TABLE_IDS.includes(Number(b.tableId))) return "卓が不正です";
  if (!COURSE_IDS.includes(b.course)) return "コースが不正です";
  const people = Number(b.people);
  if (!Number.isInteger(people) || people < 1 || people > SEATS) return "人数が不正です";
  const weeks = Number(b.repeatWeeks || 1);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) return "繰り返し回数が不正です";
  return null;
};
