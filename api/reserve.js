// ════════════════════════════════════════════════════════
// お客さんの予約（新規・変更・キャンセル）
// お客さんの画面は予約データ（名前・電話番号）に直接さわれないので、すべてここを通す。
// 画面の匿名ログインの証明（IDトークン）を確かめ、その人の予約にだけ ownerUid を付ける。
// ════════════════════════════════════════════════════════
import crypto from "node:crypto";
import { doc, getDoc, setDoc, collection, getDocs, query, where } from "firebase/firestore";
import { getServerDb, verifyRequestUser, notifyStore } from "./_lib/server.js";
import {
  seatsLeft, isClosedDate, hasDuplicate, promoteWaitlist, addDays, canCancelAt,
  validateBooking, digitsOnly, toPublic, COURSE_IDS, TABLE_IDS, TIME_SLOTS, SEATS,
} from "../src/reserveLogic.js";

const TABLE_LABEL = (id) => (id ? `${id}卓` : "未定");
const newId = () => crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 8);

async function loadByDates(db, dates) {
  const list = [];
  for (let i = 0; i < dates.length; i += 30) {
    const snap = await getDocs(query(collection(db, "reservations"), where("date", "in", dates.slice(i, i + 30))));
    snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
  }
  return list;
}

const saveRsv = async (db, r) => {
  await setDoc(doc(db, "reservations", r.id), r);
  await setDoc(doc(db, "rsvPublic", r.id), toPublic(r));
};

// 変わった予約だけ保存する
const saveChanged = async (db, before, after) => {
  const prev = new Map(before.map((r) => [r.id, r]));
  for (const r of after) {
    const p = prev.get(r.id);
    if (!p || JSON.stringify(p) !== JSON.stringify(r)) await saveRsv(db, r);
  }
};

async function getSettings(db) {
  const snap = await getDoc(doc(db, "settings", "store"));
  return snap.exists() ? snap.data() : {};
}

async function create(db, user, b) {
  const err = validateBooking(b);
  if (err) return [400, { error: err }];
  const settings = await getSettings(db);
  const weeks = Number(b.repeatWeeks || 1);
  const tableId = Number(b.tableId);
  const people = Number(b.people);
  const dates = Array.from({ length: weeks }, (_, i) => addDays(b.date, i * 7)).filter((d) => !isClosedDate(settings, d));
  if (!dates.length) return [400, { error: "休業日のため予約できません" }];

  let list = await loadByDates(db, dates);
  const before = [...list];
  const phone = String(b.phone).trim();
  const digits = digitsOnly(phone);
  const link = await getDoc(doc(db, "phoneToLineUserId", digits));
  const lineFields = link.exists() && link.data().lineUserId ? { lineUserId: link.data().lineUserId } : {};

  let created = 0, waited = 0, dup = 0, firstStatus = null;
  for (const date of dates) {
    if (hasDuplicate(list, phone, date)) { dup++; continue; }
    const status = !b.forceWaitlist && seatsLeft(list, tableId, date, b.time) >= people ? "confirmed" : "waitlist";
    const r = {
      id: newId(), name: String(b.name).trim().slice(0, 40), phone, people, date, time: b.time, tableId,
      course: b.course, tags: b.isBeginner ? ["初心者"] : [], repeatWeeks: weeks,
      status, createdAt: new Date().toISOString(), memo: "", checkedIn: false, noShow: false, finished: false,
      ownerUid: user.uid, ...lineFields,
    };
    list = [r, ...list];
    firstStatus = firstStatus || status;
    status === "confirmed" ? created++ : waited++;
  }
  if (!created && !waited) return [409, { error: "同じ電話番号でのご予約が既にあります" }];
  await saveChanged(db, before, list);

  if (weeks > 1) {
    await notifyStore(`【定期予約】\n予約者: ${b.name}\n人数: ${people}名\n日付: ${b.date}\n時間: ${b.time}\n確定: ${created}件／待ち: ${waited}件`);
  } else {
    await notifyStore(`【新規予約】\n予約者: ${b.name}\n人数: ${people}名\n日付: ${b.date}\n時間: ${b.time}\n卓: ${TABLE_LABEL(tableId)}\nステータス: ${firstStatus === "confirmed" ? "確定" : "キャンセル待ち"}`);
  }
  return [200, { ok: true, created, waitlisted: waited, skippedDuplicate: dup, firstStatus }];
}

async function loadOwn(db, user, id) {
  const snap = await getDoc(doc(db, "reservations", String(id || "")));
  if (!snap.exists() || snap.data().ownerUid !== user.uid) return null;
  return { ...snap.data(), id: snap.id };
}

async function cancel(db, user, { id }) {
  const rsv = await loadOwn(db, user, id);
  if (!rsv) return [404, { error: "予約が見つかりません" }];
  if (rsv.status === "cancelled") return [200, { ok: true }];
  const settings = await getSettings(db);
  if (!canCancelAt(rsv, Number(settings.cancelDeadlineHours) || 0)) {
    return [400, { error: "キャンセル期限を過ぎています。お店に直接ご連絡ください" }];
  }
  const list = await loadByDates(db, [rsv.date]);
  const next = promoteWaitlist(list.map((r) => (r.id === rsv.id ? { ...r, status: "cancelled" } : r)), rsv.date, rsv.time, rsv.tableId);
  await saveChanged(db, list, next);
  return [200, { ok: true }];
}

async function update(db, user, body) {
  const rsv = await loadOwn(db, user, body.id);
  if (!rsv) return [404, { error: "予約が見つかりません" }];
  if (rsv.status !== "confirmed" || rsv.finished) return [400, { error: "この予約は変更できません" }];
  const date = String(body.date || "");
  const time = body.time;
  const tableId = Number(body.tableId);
  const people = Number(body.people);
  const course = body.course;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIME_SLOTS.includes(time) || !TABLE_IDS.includes(tableId)
      || !COURSE_IDS.includes(course) || !Number.isInteger(people) || people < 1 || people > SEATS) {
    return [400, { error: "変更内容を確認してください" }];
  }
  const settings = await getSettings(db);
  if (isClosedDate(settings, date)) return [400, { error: "休業日のため予約できません" }];

  const list = await loadByDates(db, [...new Set([rsv.date, date])]);
  if (seatsLeft(list, tableId, date, time, rsv.id) < people) return [409, { error: "その卓は満席です" }];
  if (hasDuplicate(list, rsv.phone, date, rsv.id)) return [409, { error: "その日は既に同じ電話番号でのご予約があります" }];

  let next = list.map((r) => (r.id === rsv.id ? { ...r, date, time, tableId, people, course } : r));
  next = promoteWaitlist(next, rsv.date, rsv.time, rsv.tableId);
  await saveChanged(db, list, next);
  return [200, { ok: true }];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await verifyRequestUser(req);
  if (!user) return res.status(401).json({ error: "ページを再読み込みしてからお試しください" });
  const { action, ...body } = req.body || {};
  try {
    const db = await getServerDb();
    const [status, json] =
      action === "create" ? await create(db, user, body.booking) :
      action === "cancel" ? await cancel(db, user, body) :
      action === "update" ? await update(db, user, body) :
      [400, { error: "actionが不正です" }];
    return res.status(status).json(json);
  } catch (e) {
    console.error("予約APIエラー:", e);
    return res.status(500).json({ error: "処理に失敗しました。時間をおいてお試しください" });
  }
}
