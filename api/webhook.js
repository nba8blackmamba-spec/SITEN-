export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).end("ok");

  const rawBody = await getRawBody(req);

  // ① これまで通り、Lステップにもそのまま転送する
  try {
    await fetch("https://cb.lmes.jp/line/callback/add/206050", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Line-Signature": req.headers["x-line-signature"] || "",
      },
      body: rawBody,
    });
  } catch (e) {
    console.error("Lステップ転送エラー:", e);
  }

  // ② こちら側でも、誰がメッセージを送ってきたかを記録する
  try {
    const body = JSON.parse(rawBody);
    const events = body.events || [];

    const { initializeApp, getApps } = await import("firebase/app");
    const { getFirestore, doc, setDoc } = await import("firebase/firestore");

    if (!getApps().length) {
      initializeApp({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: "siten-fee7d.firebaseapp.com",
        projectId: "siten-fee7d",
      });
    }
    const db = getFirestore();

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      await setDoc(
        doc(db, "lineUsers", userId),
        {
          userId,
          lastEventType: event.type,
          lastMessage: event.message?.text || null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.error("記録エラー:", e);
  }

  return res.status(200).json({ ok: true });
}
