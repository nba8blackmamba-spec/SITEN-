// サイト内チャットの送信
// ・お客さん: ログイン証明（匿名ログイン）が必要。チャットはその人専用（siteChats/{uid}）
// ・お店: スタッフとしてログインしている場合のみ。chatId で相手を指定
import { doc, setDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getServerDb, verifyRequestUser, verifyStaff, notifyStore } from "./_lib/server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { chatId: bodyChatId, phone, name, text, from } = req.body || {};
  const msg = String(text || "").trim();
  if (!msg || msg.length > 1000 || (from !== "customer" && from !== "store")) {
    return res.status(400).json({ error: "text(1000文字以内), from(customer/store)が必要です" });
  }

  let chatId;
  if (from === "customer") {
    const user = await verifyRequestUser(req);
    if (!user) return res.status(401).json({ error: "ページを再読み込みしてからお試しください" });
    chatId = user.uid;
  } else {
    const staff = await verifyStaff(req);
    if (!staff) return res.status(401).json({ error: "スタッフとしてログインしてください" });
    chatId = String(bodyChatId || "");
    if (!chatId) return res.status(400).json({ error: "chatIdが必要です" });
  }

  try {
    const db = await getServerDb();
    await addDoc(collection(db, "siteChats", chatId, "messages"), {
      text: msg,
      from,
      createdAt: serverTimestamp(),
    });

    const meta = {
      lastMessage: msg,
      lastMessageAt: serverTimestamp(),
      unreadByStore: from === "customer",
      unreadByCustomer: from === "store",
    };
    if (from === "customer") {
      meta.ownerUid = chatId;
      meta.name = String(name || "").slice(0, 40);
      meta.phone = String(phone || "").slice(0, 20);
    }
    await setDoc(doc(db, "siteChats", chatId), meta, { merge: true });

    if (from === "customer") {
      const preview = msg.length > 30 ? `${msg.slice(0, 30)}…` : msg;
      await notifyStore(`【サイトチャット】${meta.name || "お客様"}様から新着メッセージ: ${preview}`);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
