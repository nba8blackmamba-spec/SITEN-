// ════════════════════════════════════════════════════════
// 成績管理の Firestore 読み書き
//  players/{登録番号}   : { regNo, name, kana, createdAt, updatedAt }  ※個人情報は持たない
//  games/{自動ID}       : { date, rule, round, table, seats[4], adjustment, createdAt, updatedAt, createdBy, updatedBy }
//      seats[i]         : { playerId, regNo, name, score, chombo }（席順 東→南→西→北）
//  dailyFlags/{日付_ルール}: { date, rule, flags: { [playerId]: { yakuman, shitei } }, updatedAt }（健康のみ）
// ════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection, doc, onSnapshot, query, where, addDoc, setDoc, updateDoc, deleteDoc, runTransaction,
} from "firebase/firestore";
import { nextRegNo } from "./playerSearch";

const playersCol = collection(db, "players");
const gamesCol = collection(db, "games");
const nowIso = () => new Date().toISOString();

export function usePlayers() {
  const [players, setPlayers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => onSnapshot(playersCol, (snap) => {
    setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.regNo - b.regNo));
    setLoaded(true);
  }, (e) => { console.error("名簿の読み込みエラー:", e); setLoaded(true); }), []);
  return { players, loaded };
}

// 指定日の対局（ルールの絞り込みは呼び出し側で行う）
export function useGamesOfDate(date) {
  const [games, setGames] = useState([]);
  useEffect(() => {
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

// 登録番号は既存の最大+1。同時登録で番号がぶつからないようトランザクションで確保する
export async function createPlayer(players, { name, kana }) {
  let regNo = nextRegNo(players);
  return runTransaction(db, async (tx) => {
    for (let i = 0; i < 50; i++, regNo++) {
      const ref = doc(playersCol, String(regNo));
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        const data = { regNo, name: name.trim(), kana: kana.trim(), createdAt: nowIso(), updatedAt: nowIso() };
        tx.set(ref, data);
        return { id: ref.id, ...data };
      }
    }
    throw new Error("登録番号を確保できませんでした");
  });
}

export const saveGame = (id, game, staffName) => {
  const data = { ...game, updatedAt: nowIso(), updatedBy: staffName || "" };
  if (id) return updateDoc(doc(gamesCol, id), data);
  return addDoc(gamesCol, { ...data, createdAt: nowIso(), createdBy: staffName || "" });
};

export const deleteGame = (id) => deleteDoc(doc(gamesCol, id));

export const setDailyFlag = (date, rule, playerId, field, value) =>
  setDoc(doc(db, "dailyFlags", `${date}_${rule}`), {
    date, rule, updatedAt: nowIso(), flags: { [playerId]: { [field]: value } },
  }, { merge: true });
