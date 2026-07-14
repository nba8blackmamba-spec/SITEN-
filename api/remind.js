import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "siten-fee7d.firebaseapp.com",
  projectId: "siten-fee7d",
};

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  if (!getApps().length) initializeApp(firebaseConfig);
  const db = getFirestore();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const snap = await getDocs(collection(db, "reservations"));
  const reservations = snap.docs.map(d => d.data());
  const targets = reservations.filter(r =>
    r.date === tomorrowStr && r.status === "confirmed" && !r.finished && r.lineUserId
  );

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  let sent = 0;

  for (const r of targets) {
    const message = `【SITENご予約リマインダー】\n明日${r.date} ${r.time}〜のご予約があります。\n卓: ${r.tableId}卓 / ${r.course === "health" ? "健康麻雀" : "ラボ"}\nお待ちしております🀄`;
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: r.lineUserId,
        messages: [{ type: "text", text: message }],
      }),
    });
    sent++;
  }

  return res.status(200).json({ sent });
}
