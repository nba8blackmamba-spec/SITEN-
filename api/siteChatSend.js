const STORE_LINE_USER_ID = "U06ebc959d7d9eea50dc1c3f6254c0fc4";

async function notifyStoreOnLine(name, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const preview = text.length > 30 ? `${text.slice(0, 30)}…` : text;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: STORE_LINE_USER_ID,
        messages: [{ type: "text", text: `【サイトチャット】${name}様から新着メッセージ: ${preview}` }],
      }),
    });
  } catch (e) {
    console.error("サイトチャットLINE通知エラー:", e);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { phone, name, text, from } = req.body || {};
  if (!phone || !text || !from || (from !== "customer" && from !== "store")) {
    return res.status(400).json({ error: "phone, text, from(customer/store)が必要です" });
  }

  try {
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

    await addDoc(collection(db, "siteChats", phone, "messages"), {
      text,
      from,
      createdAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, "siteChats", phone),
      {
        name: name || "",
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        unreadByStore: from === "customer",
        unreadByCustomer: from === "store",
      },
      { merge: true }
    );

    if (from === "customer") {
      await notifyStoreOnLine(name || "お客様", text);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
