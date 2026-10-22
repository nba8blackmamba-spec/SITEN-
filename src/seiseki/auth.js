// ════════════════════════════════════════════════════════
// 成績管理のログイン（Firebase Authentication メール/パスワード）
// ログイン状態はブラウザに保存され、ログアウトするまで保持される
// 書き込めるのは seisekiStaff/{uid} が登録されたアカウントだけ（Firestore ルールで判定）
// ════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { getApp } from "firebase/app";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence,
} from "firebase/auth";
import { doc, getDoc, connectFirestoreEmulator } from "firebase/firestore";
import { db } from "../firebase";

export const auth = getAuth(getApp());

// status: "loading" | "signedOut" | "notStaff" | "staff"
export function useStaffAuth() {
  const [state, setState] = useState({ status: "loading", user: null });
  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return setState({ status: "signedOut", user: null });
    try {
      const snap = await getDoc(doc(db, "seisekiStaff", user.uid));
      setState({ status: snap.exists() ? "staff" : "notStaff", user });
    } catch (e) {
      console.error("スタッフ確認エラー:", e);
      setState({ status: "notStaff", user });
    }
  }), []);
  return state;
}

export async function staffSignIn(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export const staffSignOut = () => signOut(auth);

export const authErrorMessage = (e) => ({
  "auth/invalid-credential": "メールアドレスかパスワードが違います",
  "auth/wrong-password": "メールアドレスかパスワードが違います",
  "auth/user-not-found": "メールアドレスかパスワードが違います",
  "auth/invalid-email": "メールアドレスの形式が正しくありません",
  "auth/too-many-requests": "試行回数が多すぎます。しばらく待ってからお試しください",
  "auth/network-request-failed": "通信できませんでした。ネットワークを確認してください",
}[e?.code] || `ログインできませんでした（${e?.code || e?.message || e}）`);

// 開発時の動作確認用: VITE_SEISEKI_EMULATOR=1 でビルドしたときだけエミュレーターにつなぐ（通常のビルドでは取り除かれる）
if (import.meta.env.VITE_SEISEKI_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
