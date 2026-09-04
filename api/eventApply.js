const STORE_LINE_USER_ID = "U06ebc959d7d9eea50dc1c3f6254c0fc4";
const TYPE_LABEL = { class: "教室", tournament: "大会" };

async function notifyStoreOnLine(typeLabel, title, name, people) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: STORE_LINE_USER_ID,
        messages: [{ type: "text", text: `【${typeLabel}申込】${title}に${name}様(${people}名)が申し込みました` }],
      }),
    });
  } catch (e) {
    console.error("イベント申込LINE通知エラー:", e);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { eventId, name, phone, people, memo } = req.body || {};
  if (!eventId || !name || !phone || !people) {
    return res.status(400).json({ error: "eventId, name, phone, peopleが必要です" });
  }
  const peopleNum = Number(people);
  if (!Number.isFinite(peopleNum) || peopleNum <= 0) {
    return res.status(400).json({ error: "人数が不正です" });
  }

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getFirestore, doc, getDoc, collection, getDocs, query, where, addDoc, serverTimestamp } =
      await import("firebase/firestore");

    if (!getApps().length) {
      initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: "siten-fee7d.firebaseapp.com",
        projectId: "siten-fee7d",
      });
    }
    const db = getFirestore();

    const eventSnap = await getDoc(doc(db, "events", eventId));
    if (!eventSnap.exists()) {
      return res.status(404).json({ error: "イベントが見つかりません" });
    }
    const event = eventSnap.data();
    if (event.closed) {
      return res.status(400).json({ error: "このイベントは募集を終了しています" });
    }

    const capacity = Number(event.capacity) || 0;
    if (capacity > 0) {
      const appsSnap = await getDocs(
        query(collection(db, "eventApplications"), where("eventId", "==", eventId), where("status", "==", "confirmed"))
      );
      const applied = appsSnap.docs.reduce((s, d) => s + (Number(d.data().people) || 0), 0);
      if (applied + peopleNum > capacity) {
        return res.status(400).json({ error: "定員を超えるため申し込めません" });
      }
    }

    await addDoc(collection(db, "eventApplications"), {
      eventId,
      name,
      phone,
      people: peopleNum,
      memo: memo || "",
      status: "confirmed",
      createdAt: serverTimestamp(),
    });

    const typeLabel = TYPE_LABEL[event.type] || "イベント";
    await notifyStoreOnLine(typeLabel, event.title || "", name, peopleNum);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
