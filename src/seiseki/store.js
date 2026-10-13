// ════════════════════════════════════════════════════════
// 成績管理の Firestore 読み書き
//  players/{登録番号}       : { regNo, name, kana, createdAt, updatedAt, lastHistoryId }  ※個人情報は持たない
//  games/{自動ID}           : { date, rule, round, table, seats[4], adjustment, deleted, deletedAt, deletedBy,
//                               createdAt, updatedAt, createdBy, updatedBy, lastHistoryId }
//      seats[i]             : { playerId, regNo, name, score, chombo }（席順 東→南→西→北）
//  dailyFlags/{日付_ルール}  : { date, rule, flags: { [playerId]: { yakuman, shitei } }, updatedAt, lastHistoryId }
//  seisekiHistory/{自動ID}  : { target, docId, action, before, after, at, uid, email, staffName }（追加のみ・スタッフのみ閲覧）
//
// 書き込みはすべてトランザクションで「本体の書き込み＋履歴1件の追加」を同時に行う。
// 本体の lastHistoryId に新しい履歴のIDを入れ、ルール側で履歴が作られたことを確かめる。
// games は削除せず deleted: true の印を付ける（ルールで削除は禁止）。
// ════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection, doc, onSnapshot, query, where, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { auth } from "./auth";
import { nextRegNo } from "./playerSearch";

const playersCol = collection(db, "players");
const gamesCol = collection(db, "games");
const historyCol = collection(db, "seisekiHistory");
const nowIso = () => new Date().toISOString();

// 担当者名（共用アカウントのため自己申告。履歴にはアカウントの uid も残る）
const STAFF_NAME_KEY = "siten_seiseki_staff_name";
export const loadStaffName = () => { try { return localStorage.getItem(STAFF_NAME_KEY) || ""; } catch { return ""; } };
export const saveStaffName = (v) => { try { localStorage.setItem(STAFF_NAME_KEY, v); } catch { /* 保存できなくても続行 */ } };

// 誰でも読める games に入れる担当者名。メールアドレスは入れない（メールは履歴 seisekiHistory にだけ残す）
export class StaffNameError extends Error {}
export const isEmailLike = (s) => String(s || "").includes("@");
const publicStaffName = () => {
  const name = loadStaffName().trim();
  if (isEmailLike(name)) throw new StaffNameError("担当欄にはメールアドレスではなく名前を入れてください");
  return name.slice(0, 30);
};
// 画面に出すエラーメッセージ
export const saveErrorMessage = (e, fallback) => (e instanceof StaffNameError ? e.message : fallback);

const actor = () => {
  const u = auth.currentUser;
  if (!u) throw new Error("ログインしていません");
  return { uid: u.uid, email: u.email || "", staffName: publicStaffName() };
};

// 本体を after の内容で上書きし、同じトランザクションで履歴を1件追加する
const writeWithHistory = (tx, { target, ref, action, before, after }) => {
  const who = actor();
  const hRef = doc(historyCol);
  const { lastHistoryId: _drop, ...afterData } = after;
  tx.set(ref, { ...afterData, lastHistoryId: hRef.id });
  tx.set(hRef, {
    target, docId: ref.id, action, before: before ?? null, after: afterData,
    at: serverTimestamp(), uid: who.uid, email: who.email, staffName: who.staffName,
  });
  return who;
};

// ── 読み取り ────────────────────────────────────────────
export function usePlayers() {
  const [players, setPlayers] = useState([]);
  useEffect(() => onSnapshot(playersCol, (snap) => {
    setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.regNo - b.regNo));
  }, (e) => console.error("名簿の読み込みエラー:", e)), []);
  return players;
}

// 指定日の対局（削除済みも含む。ルール・削除済みの絞り込みは呼び出し側で行う）
export function useGamesOfDate(date) {
  const [games, setGames] = useState([]);
  useEffect(() => {
    setGames([]);
    if (!date) return undefined;
    return onSnapshot(query(gamesCol, where("date", "==", date)), (snap) => {
      setGames(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.round - b.round || a.table - b.table));
    }, (e) => console.error("対局の読み込みエラー:", e));
  }, [date]);
  return games;
}

export function useDailyFlags(date, rule) {
  const [flags, setFlags] = useState({});
  useEffect(() => {
    setFlags({});
    if (!date || !rule) return undefined;
    return onSnapshot(doc(db, "dailyFlags", `${date}_${rule}`),
      (snap) => setFlags(snap.exists() ? snap.data().flags || {} : {}),
      (e) => console.error("日別チェックの読み込みエラー:", e));
  }, [date, rule]);
  return flags;
}

export function useHistory(docId) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!docId) return undefined;
    return onSnapshot(query(historyCol, where("docId", "==", docId)), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.at?.toMillis?.() ?? Infinity) - (b.at?.toMillis?.() ?? Infinity)));
    }, (e) => { console.error("履歴の読み込みエラー:", e); setItems([]); });
  }, [docId]);
  return items;
}

// ── 書き込み ────────────────────────────────────────────
// 登録番号は既存の最大+1。同時登録で番号がぶつからないようトランザクションで確保する
export async function createPlayer(players, { name, kana }) {
  const start = nextRegNo(players);
  return runTransaction(db, async (tx) => {
    for (let regNo = start; regNo < start + 50; regNo++) {
      const ref = doc(playersCol, String(regNo));
      if ((await tx.get(ref)).exists()) continue;
      const data = { regNo, name: name.trim(), kana: kana.trim(), createdAt: nowIso(), updatedAt: nowIso() };
      writeWithHistory(tx, { target: "players", ref, action: "create", before: null, after: data });
      return { id: ref.id, ...data };
    }
    throw new Error("登録番号を確保できませんでした");
  });
}

export const saveGame = (id, rawGame) => runTransaction(db, async (tx) => {
  const by = publicStaffName();
  const game = { ...rawGame, adjustment: rawGame.adjustment ? { ...rawGame.adjustment, by } : null };
  if (!id) {
    const ref = doc(gamesCol);
    writeWithHistory(tx, {
      target: "games", ref, action: "create", before: null,
      after: { ...game, deleted: false, deletedAt: null, deletedBy: null, createdAt: nowIso(), createdBy: by, updatedAt: nowIso(), updatedBy: by },
    });
    return ref.id;
  }
  const ref = doc(gamesCol, id);
  const snap = await tx.get(ref);
  if (!snap.exists()) throw new Error("対局が見つかりません");
  writeWithHistory(tx, {
    target: "games", ref, action: "update", before: snap.data(),
    after: { ...snap.data(), ...game, updatedAt: nowIso(), updatedBy: by },
  });
  return id;
});

// 削除（削除済みの印を付ける）／元に戻す
const setGameDeleted = (id, deleted) => runTransaction(db, async (tx) => {
  const ref = doc(gamesCol, id);
  const snap = await tx.get(ref);
  if (!snap.exists()) throw new Error("対局が見つかりません");
  const by = publicStaffName();
  writeWithHistory(tx, {
    target: "games", ref, action: deleted ? "delete" : "restore", before: snap.data(),
    after: {
      ...snap.data(), deleted, deletedAt: deleted ? nowIso() : null, deletedBy: deleted ? by : null,
      updatedAt: nowIso(), updatedBy: by,
    },
  });
});
export const deleteGame = (id) => setGameDeleted(id, true);
export const restoreGame = (id) => setGameDeleted(id, false);

export const setDailyFlag = (date, rule, playerId, field, value) => runTransaction(db, async (tx) => {
  const ref = doc(db, "dailyFlags", `${date}_${rule}`);
  const snap = await tx.get(ref);
  const before = snap.exists() ? snap.data() : null;
  const flags = { ...(before?.flags || {}) };
  flags[playerId] = { ...(flags[playerId] || {}), [field]: value };
  writeWithHistory(tx, {
    target: "dailyFlags", ref, action: before ? "update" : "create", before,
    after: { date, rule, flags, updatedAt: nowIso() },
  });
});
