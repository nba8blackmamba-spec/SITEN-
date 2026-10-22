import { doc, getDoc, collection, getDocs, query, where, addDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getServerDb, notifyStore } from "./_lib/server.js";

const TYPE_LABEL = { class: "教室", tournament: "大会" };

// 今日以降で直近の指定曜日を返す（毎週くり返しイベント用）
function nextOccurrenceDate(weekday, base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const diff = ((Number(weekday) || 0) - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const notifyStoreOnLine = (typeLabel, title, name, people) =>
  notifyStore(`【${typeLabel}申込】${title}に${name}様(${people}名)が申し込みました`);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { eventId, name, phone, people, memo } = req.body || {};
  if (!eventId || !name || !phone || !people) {
    return res.status(400).json({ error: "eventId, name, phone, peopleが必要です" });
  }
  const peopleNum = Number(people);
  if (!Number.isInteger(peopleNum) || peopleNum <= 0 || peopleNum > 20) {
    return res.status(400).json({ error: "人数が不正です" });
  }

  try {
    const db = await getServerDb();

    const eventSnap = await getDoc(doc(db, "events", eventId));
    if (!eventSnap.exists()) {
      return res.status(404).json({ error: "イベントが見つかりません" });
    }
    const event = eventSnap.data();
    if (event.closed) {
      return res.status(400).json({ error: "このイベントは募集を終了しています" });
    }

    const occurrenceDate = event.recurring ? nextOccurrenceDate(event.weekday) : (event.date || "");

    const capacity = Number(event.capacity) || 0;
    if (capacity > 0) {
      // 単発イベントはそもそも日程が1つしかないため、occurrenceDateの有無に関わらず
      // そのeventIdの申込みを全てカウントする。繰り返しイベントのみ週ごとに絞り込む。
      const constraints = [
        collection(db, "eventApplications"),
        where("eventId", "==", eventId),
        where("status", "==", "confirmed"),
      ];
      if (event.recurring) {
        constraints.push(where("occurrenceDate", "==", occurrenceDate));
      }
      const appsSnap = await getDocs(query(...constraints));
      const applied = appsSnap.docs.reduce((s, d) => s + (Number(d.data().people) || 0), 0);
      if (applied + peopleNum > capacity) {
        return res.status(400).json({ error: "定員を超えるため申し込めません" });
      }
    }

    const appRef = await addDoc(collection(db, "eventApplications"), {
      eventId,
      name: String(name).slice(0, 40),
      phone: String(phone).slice(0, 20),
      people: peopleNum,
      memo: String(memo || "").slice(0, 500),
      status: "confirmed",
      occurrenceDate,
      createdAt: serverTimestamp(),
    });
    // 誰でも読める「申込人数」用のコピー（名前・電話番号は入れない）
    await setDoc(doc(db, "eventAppsPublic", appRef.id), {
      id: appRef.id, eventId, occurrenceDate, people: peopleNum, status: "confirmed",
    });

    const typeLabel = TYPE_LABEL[event.type] || "イベント";
    await notifyStoreOnLine(typeLabel, event.title || "", name, peopleNum);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
