// ════════════════════════════════════════════════════════
// 麻雀成績の毎日の自動バックアップ（Vercel Cron から呼ばれる）
// players / games / dailyFlags / seisekiHistory を1つのJSONにまとめ、Vercel Blob に保存する。
// 古いバックアップは SEISEKI_BACKUP_KEEP_DAYS 日（既定90日）を過ぎたら消す。
//
// 必要な環境変数（Vercel の Settings → Environment Variables）
//   FIREBASE_API_KEY          … 既存のものをそのまま使う
//   CRON_SECRET               … 既存のものをそのまま使う
//   SEISEKI_BACKUP_EMAIL      … 成績スタッフ用アカウントのメールアドレス（履歴を読むため）
//   SEISEKI_BACKUP_PASSWORD   … 同パスワード
//   BLOB_READ_WRITE_TOKEN     … Vercel Blob のストアをプロジェクトにつなぐと自動で入る
//   SEISEKI_BACKUP_ACCESS     … （任意）Blob ストアが Public の場合だけ "public" を指定。既定は "private"
// ════════════════════════════════════════════════════════
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { put, list, del } from "@vercel/blob";

const APP_NAME = "seiseki-backup";
const PREFIX = "seiseki-backups/";
export const BACKUP_COLLECTIONS = ["players", "games", "dailyFlags", "seisekiHistory"];

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "siten-fee7d.firebaseapp.com",
  projectId: "siten-fee7d",
};

// Firestore の Timestamp などを JSON にできる形へ
const toPlain = (v) => {
  if (v === null || typeof v !== "object") return v;
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(toPlain);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
};

export async function collectBackup(db) {
  const data = {};
  for (const name of BACKUP_COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    data[name] = snap.docs.map((d) => ({ id: d.id, ...toPlain(d.data()) }));
  }
  return {
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(BACKUP_COLLECTIONS.map((n) => [n, data[n].length])),
    data,
  };
}

const jstDate = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  try {
    const app = getApps().find((a) => a.name === APP_NAME) || initializeApp(firebaseConfig, APP_NAME);
    const auth = getAuth(app);
    if (!auth.currentUser) {
      await signInWithEmailAndPassword(auth, process.env.SEISEKI_BACKUP_EMAIL, process.env.SEISEKI_BACKUP_PASSWORD);
    }
    const backup = await collectBackup(getFirestore(app));

    const access = process.env.SEISEKI_BACKUP_ACCESS === "public" ? "public" : "private";
    const saved = await put(`${PREFIX}seiseki-${jstDate()}.json`, JSON.stringify(backup), {
      access, addRandomSuffix: true, contentType: "application/json",
    });

    // 保存期間を過ぎた古いバックアップを消す
    const keepDays = Number(process.env.SEISEKI_BACKUP_KEEP_DAYS) || 90;
    const limit = Date.now() - keepDays * 86400 * 1000;
    const old = [];
    let cursor;
    do {
      const page = await list({ prefix: PREFIX, cursor });
      old.push(...page.blobs.filter((b) => new Date(b.uploadedAt).getTime() < limit).map((b) => b.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (old.length) await del(old);

    return res.status(200).json({ ok: true, pathname: saved.pathname, counts: backup.counts, removed: old.length });
  } catch (e) {
    console.error("成績バックアップエラー:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
