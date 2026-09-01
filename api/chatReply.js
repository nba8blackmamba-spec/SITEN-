export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, message } = req.body;
  if (!userId || !message) {
    return res.status(400).json({ error: "userIdとmessageが必要です" });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  try {
    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text: message }],
      }),
    });
    const lineData = await lineRes.json();
    if (!lineRes.ok) {
      return res.status(500).json({ error: "LINE送信に失敗しました", detail: lineData });
    }

    const { initializeApp, getApps } = await import("firebase/app");
    const { getFirestore, doc, setDoc, collection, addDoc, serverTimestamp } =
      await import("firebase/firestore");

    if (!getApps().length) {
      initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: "siten-fee7d.firebaseapp.com",
        projectId: "siten-fee7d",
      });
    }
    const db = getFirestore();

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
