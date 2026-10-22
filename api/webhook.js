import crypto from "node:crypto";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getServerDb } from "./_lib/server.js";

// LINE から本当に届いたものか、署名（X-Line-Signature）で確かめる
// 必要な環境変数: LINE_CHANNEL_SECRET（LINE Developers → チャネル基本設定 → チャネルシークレット）
export function isValidLineSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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

async function fetchLineDisplayName(userId, token) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.displayName || null;
  } catch (e) {
    console.error("プロフィール取得エラー:", e);
    return null;
  }
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

  // ② こちら側でも、誰がメッセージを送ってきたかを記録する（LINE からの正しい署名がある場合のみ）
  if (!isValidLineSignature(rawBody, req.headers["x-line-signature"], process.env.LINE_CHANNEL_SECRET)) {
    console.error("LINE署名が一致しないため記録しません（LINE_CHANNEL_SECRET を確認）");
    return res.status(200).json({ ok: true });
  }
  try {
    const body = JSON.parse(rawBody);
    const events = body.events || [];

    const db = await getServerDb();
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      const userRef = doc(db, "lineUsers", userId);
      const messageText = event.message?.text || null;

      const update = {
        userId,
        lastEventType: event.type,
        lastMessage: messageText,
        updatedAt: new Date().toISOString(),
      };

      if (messageText) {
        update.lastMessageAt = serverTimestamp();
        update.unread = true;
      }

      // 表示名がまだ保存されていなければLINEのprofile APIから取得して保存する
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists() || !snap.data().name) {
          const displayName = await fetchLineDisplayName(userId, lineToken);
          if (displayName) update.name = displayName;
        }
      } catch (e) {
        console.error("表示名チェックエラー:", e);
      }

      // 「リマインド希望 電話番号」形式のメッセージを検出し、電話番号とLINEユーザーIDを紐づける
      let linkedPhone = null;
      if (messageText) {
        const m = messageText.match(/リマインド希望[\s　]*([0-9０-９\-ー－\s　]{9,17})/);
        if (m) {
          const phoneDigits = m[1]
            .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
            .replace(/[^\d]/g, "");
          if (/^0\d{9,10}$/.test(phoneDigits)) {
            linkedPhone = phoneDigits;
            update.phone = phoneDigits;
          }
        }
      }

      await setDoc(userRef, update, { merge: true });

      if (linkedPhone) {
        try {
          await setDoc(doc(db, "phoneToLineUserId", linkedPhone), { lineUserId: userId });
        } catch (e) {
          console.error("電話番号紐づけエラー:", e);
        }
        try {
          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${lineToken}`,
            },
            body: JSON.stringify({
              to: userId,
              messages: [{ type: "text", text: "LINE通知の設定が完了しました。次回のご予約から自動でリマインドをお送りします" }],
            }),
          });
        } catch (e) {
          console.error("確認メッセージ送信エラー:", e);
        }
      }

      if (messageText) {
        await addDoc(collection(db, "lineUsers", userId, "messages"), {
          text: messageText,
          from: "customer",
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (e) {
    console.error("記録エラー:", e);
  }

  return res.status(200).json({ ok: true });
}
