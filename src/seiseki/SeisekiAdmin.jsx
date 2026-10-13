// ════════════════════════════════════════════════════════
// /seiseki/admin  スタッフ用 成績入力ページ
// ログインは Firebase Authentication（成績専用のスタッフアカウント）。
// ログイン状態は端末に保存されるので、ログアウトしない限り毎回の入力は不要。
// ════════════════════════════════════════════════════════
import { useState } from "react";
import { useStaffAuth, staffSignIn, staffSignOut, authErrorMessage } from "./auth";
import { usePlayers, useGamesOfDate, loadStaffName, saveStaffName, isEmailLike } from "./store";
import { GameEntry } from "./GameEntry";
import { DailyResults } from "./DailyResults";
import { SC, F, card, label, input, bigBtn, todayStr } from "./ui";

export function SeisekiAdminPage() {
  const { status, user } = useStaffAuth();
  return (
    <div style={{ ...F, background: SC.bg, minHeight: "100vh", color: SC.text }}>
      {status === "staff" && <SeisekiAdmin email={user.email} />}
      {status === "signedOut" && <Login />}
      {status === "notStaff" && (
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "80px 16px" }}>
          <div style={card}>
            <div style={{ fontSize: 17, marginBottom: 14 }}>このアカウントには成績を入力する権限がありません。</div>
            <button style={{ ...bigBtn("plain"), width: "100%" }} onClick={staffSignOut}>ログアウト</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr("");
    try { await staffSignIn(email, pw); } catch (e) { setErr(authErrorMessage(e)); setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "80px 16px" }}>
      <div style={card}>
        <span style={label}>メールアドレス</span>
        <input type="email" autoComplete="username" style={{ ...input, marginBottom: 12 }} value={email} onChange={(e) => setEmail(e.target.value)} />
        <span style={label}>パスワード</span>
        <input type="password" autoComplete="current-password" style={input} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div style={{ color: SC.red, fontSize: 15, marginTop: 8 }}>⚠ {err}</div>}
        <button style={{ ...bigBtn("primary"), width: "100%", marginTop: 14 }} onClick={submit} disabled={busy}>{busy ? "ログイン中..." : "ログイン"}</button>
      </div>
    </div>
  );
}

function SeisekiAdmin({ email }) {
  const [tab, setTab] = useState("entry");
  const [date, setDate] = useState(todayStr);
  const [rule, setRule] = useState("kenko");
  const [staffName, setStaffNameState] = useState(loadStaffName);
  const [toast, setToast] = useState(null);
  const players = usePlayers();
  const games = useGamesOfDate(date);

  const setStaffName = (v) => { setStaffNameState(v); saveStaffName(v); };
  const flash = (msg, ok = true) => { setToast({ msg, ok, at: Date.now() }); setTimeout(() => setToast((t) => (t && Date.now() - t.at >= 2500 ? null : t)), 2600); };
  const logout = () => { if (window.confirm("ログアウトしますか？（次回はメールアドレスとパスワードの入力が必要です）")) staffSignOut(); };
  const shared = { date, setDate, rule, setRule, players, games, flash };

  return (
    <>
      <header style={{ background: SC.surface, borderBottom: `1px solid ${SC.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em", marginRight: 12 }}>SITEN 成績入力</div>
        {[["entry", "対局入力"], ["daily", "日別成績"]].map(([k, l]) => (
          <button key={k} style={bigBtn("plain", tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 14, color: SC.muted, display: "flex", alignItems: "center", gap: 6 }}>
          担当
          <input style={{ ...input, width: 130, minHeight: 44, fontSize: 16, ...(isEmailLike(staffName) ? { borderColor: SC.red } : {}) }} value={staffName} placeholder="名前" onChange={(e) => setStaffName(e.target.value)} />
        </label>
        {isEmailLike(staffName) && <span style={{ fontSize: 13, color: SC.red, fontWeight: 700 }}>メールアドレスではなく名前を入れてください</span>}
        <button style={{ ...bigBtn("plain"), color: SC.red, borderColor: `${SC.red}66`, fontSize: 15 }} onClick={logout} title={email}>ログアウト</button>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 16px 60px" }}>
        {tab === "entry" && <GameEntry {...shared} />}
        {tab === "daily" && <DailyResults {...shared} />}
      </main>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.ok ? SC.green : SC.red, color: "#fff", padding: "14px 26px", borderRadius: 10, fontWeight: 700, fontSize: 18, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
