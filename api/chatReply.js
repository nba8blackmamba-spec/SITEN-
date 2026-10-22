// スタッフ画面から LINE のお客さんへ返信（スタッフとしてログインしている場合のみ）
import { doc, setDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { requireStaff, getServerDb, pushLine } from "./_lib/server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!(await requireStaff(req, res))) return;

  const { userId, message } = req.body || {};
  if (!userId || !message) {
    return res.status(400).json({ error: "userIdとmessageが必要です" });
  }

  try {
    const { ok, data: lineData } = await pushLine(userId, String(message));
    if (!ok) {
      return res.status(500).json({ error: "LINE送信に失敗しました", detail: lineData });
    }

    const db = await getServerDb();
    await addDoc(collection(db, "lineUsers", userId, "messages"), {
      text: message,
      from: "store",
      createdAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, "lineUsers", userId),
      {
        lastMessage: message,
        lastMessageAt: serverTimestamp(),
        unread: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, lineData });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
