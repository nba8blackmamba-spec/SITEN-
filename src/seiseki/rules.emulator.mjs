// Firestore ルール（docs/seiseki/firestore.rules）の確認テスト。エミュレーターに対して実行する。
//   npm i -g firebase-tools   （Java が必要）
//   npm run test:rules
// 本番のデータベースには接続しない。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, connectFirestoreEmulator, doc, collection, getDoc, getDocs, setDoc, deleteDoc,
  runTransaction, serverTimestamp, query, where,
} from "firebase/firestore";

const PROJECT = "siten-fee7d";
const FS = "127.0.0.1:8080";
const AUTH = "http://127.0.0.1:9099";
let n = 0;
const apps = [];

async function client(email) {
  const app = initializeApp({ apiKey: "fake", projectId: PROJECT, authDomain: "x" }, `c${n++}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH, { disableWarnings: true });
  if (email) await createUserWithEmailAndPassword(auth, email, "password123");
  return { db, auth, uid: auth.currentUser?.uid };
}

// ルールを通さずに書く（エミュレーターの管理者権限）
const adminSet = (path, fields) => fetch(`http://${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
  method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ fields }),
}).then((r) => assert.ok(r.ok, `adminSet ${path}`));

// アプリ（store.js）と同じ「本体＋履歴」の書き込み
const writeWithHistory = (c, path, data, { target, action = "create", historyOverride = {}, skipHistory = false } = {}) =>
  runTransaction(c.db, async (tx) => {
    const ref = doc(c.db, path);
    const before = (await tx.get(ref)).data() ?? null;
    const hRef = doc(collection(c.db, "seisekiHistory"));
    tx.set(ref, { ...data, lastHistoryId: data.lastHistoryId ?? hRef.id });
    if (!skipHistory) {
      tx.set(hRef, {
        target, docId: ref.id, action, before, after: data, at: serverTimestamp(),
        uid: c.uid ?? null, email: "", staffName: "テスト", ...historyOverride,
      });
    }
    return hRef.id;
  });

const seat = (i) => ({ playerId: String(i), regNo: i, name: `P${i}`, score: 25000, chombo: 0 });
const game = (extra = {}) => ({
  date: "2026-10-05", rule: "lab", round: 1, table: 1, seats: [1, 2, 3, 4].map(seat), adjustment: null,
  deleted: false, deletedAt: null, deletedBy: null, createdAt: "x", updatedAt: "x", createdBy: "", updatedBy: "", ...extra,
});
const player = (regNo, extra = {}) => ({ regNo, name: "山田", kana: "やまだ", createdAt: "x", updatedAt: "x", ...extra });

const denied = (p) => assert.rejects(p, (e) => /permission|PERMISSION_DENIED/i.test(String(e?.code || e?.message)));

let staff, other, anon;
after(() => Promise.all(apps.map(deleteApp)));
before(async () => {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  staff = await client(`staff${Date.now()}@example.com`);
  other = await client(`other${Date.now()}@example.com`);
  anon = await client(null);
  await adminSet(`seisekiStaff/${staff.uid}`, { name: { stringValue: "共用" } });
});

test("スタッフは履歴つきで対局を登録・編集・削除済みにできる", async () => {
  await writeWithHistory(staff, "games/g1", game(), { target: "games" });
  await writeWithHistory(staff, "games/g1", game({ round: 2 }), { target: "games", action: "update" });
  await writeWithHistory(staff, "games/g1", game({ round: 2, deleted: true }), { target: "games", action: "delete" });
  assert.equal((await getDoc(doc(anon.db, "games/g1"))).data().deleted, true);
});

test("履歴なし・使い回しの履歴IDでは書けない", async () => {
  await denied(writeWithHistory(staff, "games/g2", game(), { target: "games", skipHistory: true }));
  const hid = await writeWithHistory(staff, "games/g3", game(), { target: "games" });
  await denied(writeWithHistory(staff, "games/g3", game({ round: 5, lastHistoryId: hid }), { target: "games", skipHistory: true }));
  await denied(setDoc(doc(staff.db, "games/g3"), game({ round: 6 })));
});

test("対局の本当の削除は、スタッフでもできない", async () => {
  await writeWithHistory(staff, "games/g4", game(), { target: "games" });
  await denied(deleteDoc(doc(staff.db, "games/g4")));
});

test("ログインしていない人・スタッフ未登録のアカウントは書けない（読み取りはできる）", async () => {
  await denied(writeWithHistory(anon, "games/g5", game(), { target: "games" }));
  await denied(writeWithHistory(other, "games/g5", game(), { target: "games" }));
  await denied(writeWithHistory(other, "players/9", player(9), { target: "players" }));
  await denied(setDoc(doc(other.db, `seisekiStaff/${other.uid}`), { name: "x" }));
  assert.ok((await getDocs(collection(anon.db, "games"))).size >= 1);
});

test("名簿: 個人情報の項目は入れられない／登録番号は文書IDと一致・変更不可", async () => {
  await writeWithHistory(staff, "players/1", player(1), { target: "players" });
  await denied(writeWithHistory(staff, "players/2", player(2, { phone: "09012345678" }), { target: "players" }));
  await denied(writeWithHistory(staff, "players/3", player(4), { target: "players" }));
  await denied(writeWithHistory(staff, "players/1", player(5), { target: "players", action: "update" }));
  await denied(deleteDoc(doc(staff.db, "players/1")));
});

test("対局: ルール名・席数・項目をチェックする", async () => {
  await denied(writeWithHistory(staff, "games/g6", game({ rule: "other" }), { target: "games" }));
  await denied(writeWithHistory(staff, "games/g6", game({ seats: [seat(1)] }), { target: "games" }));
  await denied(writeWithHistory(staff, "games/g6", game({ memo: "x" }), { target: "games" }));
});

test("履歴: 書き換え・削除・なりすまし・時刻のごまかしはできない／読めるのはスタッフだけ", async () => {
  const hid = await writeWithHistory(staff, "games/g7", game(), { target: "games" });
  await denied(setDoc(doc(staff.db, `seisekiHistory/${hid}`), { target: "games" }));
  await denied(deleteDoc(doc(staff.db, `seisekiHistory/${hid}`)));
  await denied(writeWithHistory(staff, "games/g8", game(), { target: "games", historyOverride: { uid: other.uid } }));
  await denied(writeWithHistory(staff, "games/g8", game(), { target: "games", historyOverride: { at: new Date() } }));
  assert.ok((await getDocs(query(collection(staff.db, "seisekiHistory"), where("docId", "==", "g7")))).size === 1);
  await denied(getDocs(collection(anon.db, "seisekiHistory")));
  await denied(getDocs(collection(other.db, "seisekiHistory")));
});

test("日別チェック: 文書IDは 日付_ルール", async () => {
  await writeWithHistory(staff, "dailyFlags/2026-10-05_kenko",
    { date: "2026-10-05", rule: "kenko", flags: { 1: { yakuman: true } }, updatedAt: "x" }, { target: "dailyFlags" });
  await denied(writeWithHistory(staff, "dailyFlags/bad",
    { date: "2026-10-05", rule: "kenko", flags: {}, updatedAt: "x" }, { target: "dailyFlags" }));
  await denied(writeWithHistory(anon, "dailyFlags/2026-10-06_kenko",
    { date: "2026-10-06", rule: "kenko", flags: {}, updatedAt: "x" }, { target: "dailyFlags" }));
});

test("既存のコレクションは今まで通り（ログインなしで読み書きできる）", async () => {
  await setDoc(doc(anon.db, "reservations/r1"), { name: "x" });
  await setDoc(doc(anon.db, "tables/1"), { status: "empty" });
  await setDoc(doc(anon.db, "lineUsers/u1/messages/m1"), { text: "x" });
  assert.equal((await getDoc(doc(anon.db, "reservations/r1"))).data().name, "x");
});
