// ════════════════════════════════════════════════════════
// /seiseki/admin  スタッフ用 成績入力ページ
// ログインは店舗管理と同じパスワード・同じログイン状態（localStorage）を使う
// ════════════════════════════════════════════════════════
import { useState } from "react";
import { ADMINS } from "../App.jsx";
import { usePlayers, useGamesOfDate } from "./store";
import { GameEntry } from "./GameEntry";
import { DailyResults } from "./DailyResults";
import { SC, F, card, label, input, bigBtn, todayStr } from "./ui";

const AUTH_KEY = "siten_admin_auth";
const NAME_KEY = "siten_admin_name";
const readLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても続行 */ } };

export function SeisekiAdminPage() {
  const [auth, setAuth] = useState(() => readLS(AUTH_KEY) === "true");
  const [staffName, setStaffName] = useState(() => readLS(NAME_KEY) || "");

  const login = (name) => { writeLS(AUTH_KEY, "true"); writeLS(NAME_KEY, name); setAuth(true); setStaffName(name); };
  const logout = () => { writeLS(AUTH_KEY, "false"); writeLS(NAME_KEY, ""); setAuth(false); setStaffName(""); };

  return (
    <div style={{ ...F, background: SC.bg, minHeight: "100vh", color: SC.text }}>
      {auth ? <SeisekiAdmin staffName={staffName} onLogout={logout} /> : <Login onAuth={login} />}
    </div>
  );
}

function Login({ onAuth }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    const found = ADMINS.find((a) => a.pass === pw);
    if (found) onAuth(found.name); else setErr("パスワードが違います");
  };
  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "80px 16px" }}>
      <div style={card}>
        <span style={label}>パスワード</span>
        <input type="password" style={input} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div style={{ color: SC.red, fontSize: 15, marginTop: 8 }}>⚠ {err}</div>}
        <button style={{ ...bigBtn("primary"), width: "100%", marginTop: 14 }} onClick={submit}>ログイン</button>
      </div>
    </div>
  );
}

function SeisekiAdmin({ staffName, onLogout }) {
  const [tab, setTab] = useState("entry");
  const [date, setDate] = useState(todayStr);
  const [rule, setRule] = useState("kenko");
  const [toast, setToast] = useState(null);
  const { players } = usePlayers();
  const games = useGamesOfDate(date);

  const flash = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2600); };
  const shared = { date, setDate, rule, setRule, players, games, flash };

  return (
    <>
      <header style={{ background: SC.surface, borderBottom: `1px solid ${SC.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em", marginRight: 12 }}>SITEN 成績入力</div>
        {[["entry", "対局入力"], ["daily", "日別成績"]].map(([k, l]) => (
          <button key={k} style={bigBtn("plain", tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {staffName && <span style={{ fontSize: 14, color: SC.muted }}>担当: <b style={{ color: SC.blue }}>{staffName}</b></span>}
        <button style={{ ...bigBtn("plain"), color: SC.red, borderColor: `${SC.red}66`, fontSize: 15 }} onClick={onLogout}>ログアウト</button>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 16px 60px" }}>
        {tab === "entry" && <GameEntry {...shared} staffName={staffName} />}
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
