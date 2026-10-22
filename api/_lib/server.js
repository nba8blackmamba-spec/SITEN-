// ════════════════════════════════════════════════════════
// サーバー（Vercel Functions）共通の処理
// ・サーバー用のスタッフアカウントで Firebase にログインしてから Firestore を使う
//   （Firestore ルールで「誰でも読み書き」を禁止したため、ログインなしでは読み書きできない）
// ・画面から届いた Firebase のログイン証明（IDトークン）を確かめる
//
// 必要な環境変数（Vercel の Settings → Environment Variables）
//   FIREBASE_API_KEY                         … 既存
//   SERVER_STAFF_EMAIL / SERVER_STAFF_PASSWORD … サーバー用スタッフアカウント（seisekiStaff に登録したもの）
//     ※ 未設定なら SEISEKI_BACKUP_EMAIL / SEISEKI_BACKUP_PASSWORD を代わりに使う
// ※ api/ の中でも「_」で始まるフォルダは Vercel の公開URLにならない
// ════════════════════════════════════════════════════════
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const APP_NAME = "siten-server";
export const PROJECT_ID = "siten-fee7d";
export const STORE_LINE_USER_ID = "U06ebc959d7d9eea50dc1c3f6254c0fc4";

let signingIn = null;

export async function getServerDb() {
  const app = getApps().find((a) => a.name === APP_NAME) || initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
  }, APP_NAME);
  const auth = getAuth(app);
  if (!auth.currentUser) {
    const email = process.env.SERVER_STAFF_EMAIL || process.env.SEISEKI_BACKUP_EMAIL;
    const password = process.env.SERVER_STAFF_PASSWORD || process.env.SEISEKI_BACKUP_PASSWORD;
    if (!email || !password) throw new Error("サーバー用スタッフアカウントの環境変数が未設定です");
    signingIn = signingIn || signInWithEmailAndPassword(auth, email, password).finally(() => { signingIn = null; });
    await signingIn;
  }
  return getFirestore(app);
}

// Authorization: Bearer <IDトークン> を確かめて、ログイン中のユーザー情報を返す（だめなら null）
export async function verifyRequestUser(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: m[1] }),
    });
    if (!r.ok) return null;
    const u = (await r.json()).users?.[0];
    return u ? { uid: u.localId, email: u.email || null } : null;
  } catch (e) {
    console.error("トークン確認エラー:", e);
    return null;
  }
}

// スタッフとしてログインしているか（seisekiStaff/{uid} があるか）
export async function verifyStaff(req) {
  const user = await verifyRequestUser(req);
  if (!user) return null;
  const db = await getServerDb();
  const snap = await getDoc(doc(db, "seisekiStaff", user.uid));
  return snap.exists() ? { ...user, name: snap.data().name || "スタッフ" } : null;
}

export async function requireStaff(req, res) {
  const staff = await verifyStaff(req);
  if (!staff) { res.status(401).json({ error: "スタッフとしてログインしてください" }); return null; }
  return staff;
}

export async function pushLine(to, text) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

export const notifyStore = (text) => pushLine(STORE_LINE_USER_ID, text).catch((e) => console.error("店舗LINE通知エラー:", e));
