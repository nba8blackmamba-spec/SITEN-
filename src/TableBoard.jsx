// ════════════════════════════════════════════════════════
// 卓状況ボード（/board ページ + 管理画面パネル + ヘッダー用ミニプレビュー）
// ════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, increment } from "firebase/firestore";

export const GAME_MINUTES = 50;
const TABLE_NUMBERS = [1, 2, 3, 4, 5, 6];

const BC = {
  bg: "#F0F4F8", surface: "#FFFFFF", border: "#D9E2EC",
  text: "#1A2B3C", muted: "#7A8A9A", white: "#FFFFFF",
  blue: "#1565C0", green: "#2ECC71", red: "#E74C3C", orange: "#F5B400", purple: "#9B6BE8",
};
const F = { fontFamily: "'Hiragino Kaku Gothic Pro','Yu Gothic',sans-serif", boxSizing: "border-box" };

// ── 卓の種別 ─────────────────────────────────────────────
const TABLE_TYPES = [
  { id: "health", label: "健康麻雀", color: BC.green },
  { id: "lab", label: "ラボ", color: BC.purple },
  { id: "rental", label: "貸卓", color: BC.orange },
];
const typeInfo = (id) => TABLE_TYPES.find((t) => t.id === id) || TABLE_TYPES[0];

// ── Firestore ヘルパー ──────────────────────────────────
const tableRef = (n) => doc(db, "tables", String(n));
const metaRef = doc(db, "boardMeta", "main");

export const startGame = (n) =>
  setDoc(tableRef(n), { number: n, status: "playing", startedAt: new Date().toISOString() }, { merge: true });
export const endGame = (n) =>
  setDoc(tableRef(n), { number: n, status: "empty", startedAt: null, staffCount: 0 }, { merge: true });
export const changeStaff = (n, delta) =>
  setDoc(tableRef(n), { number: n, staffCount: increment(delta) }, { merge: true });
export const changeWait = (delta) =>
  setDoc(metaRef, { waitCount: increment(delta) }, { merge: true });
export const changeType = (n, type) =>
  setDoc(tableRef(n), { number: n, type }, { merge: true });

// ── フック ──────────────────────────────────────────────
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function useTables() {
  const [rows, setRows] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "tables"), (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      setRows(next);
    });
    return unsub;
  }, []);
  const tables = TABLE_NUMBERS.map((n) => {
    const data = rows[String(n)] || {};
    return {
      number: n,
      status: data.status === "playing" ? "playing" : "empty",
      startedAt: data.startedAt || null,
      staffCount: Number(data.staffCount) || 0,
      type: TABLE_TYPES.some((t) => t.id === data.type) ? data.type : "health",
    };
  });
  return { tables };
}

function useWaitCount() {
  const [waitCount, setWaitCount] = useState(0);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "boardMeta", "main"), (snap) => {
      setWaitCount(Number(snap.data()?.waitCount) || 0);
    });
    return unsub;
  }, []);
  return { waitCount };
}

// ── 残り時間ロジック ────────────────────────────────────
function remainingInfo(startedAt, now) {
  if (!startedAt) return null;
  const startMs = new Date(startedAt).getTime();
  const remainingMs = GAME_MINUTES * 60000 - (now - startMs);
  return {
    remainingMs,
    overtime: remainingMs <= 0,
    soon: remainingMs > 0 && remainingMs <= 10 * 60000,
  };
}
const formatClock = (ms) => {
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// ── アイコン（Tabler Icons 風のインライン SVG） ─────────
const Icon = ({ children, size = 16, color = "currentColor", strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
    {children}
  </svg>
);
const CheckCircleIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></Icon>
);
const ClockIcon = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></Icon>
);
const UsersIcon = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </Icon>
);
const AlertTriangleIcon = (p) => (
  <Icon {...p}>
    <path d="M12 9v4" />
    <path d="M10.36 3.6l-8.1 13.53a1.9 1.9 0 0 0 1.64 2.87h16.2a1.9 1.9 0 0 0 1.64 -2.87l-8.1 -13.53a1.9 1.9 0 0 0 -3.27 0z" />
    <path d="M12 16h.01" />
  </Icon>
);
const DoorIcon = (p) => (
  <Icon {...p}>
    <path d="M14 3v18" />
    <path d="M4 21h16" />
    <path d="M6 21v-16a2 2 0 0 1 2 -2h6l4 4v14" />
  </Icon>
);

// ════════════════════════════════════════════════════════
// /board（お客様向け）
// ════════════════════════════════════════════════════════
function TableCard({ table, now, compact }) {
  const playing = table.status === "playing";
  const info = playing ? remainingInfo(table.startedAt, now) : null;
  const danger = !!(info && (info.soon || info.overtime));
  const tInfo = typeInfo(table.type);
  const iconSize = compact ? 11 : 13;
  return (
    <div style={{
      background: BC.surface, border: `1.5px solid ${danger ? BC.red : BC.border}`,
      borderRadius: compact ? 8 : 12, padding: compact ? "8px 6px" : "14px 10px",
      textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "border-color 0.2s",
    }}>
      <div style={{ fontSize: compact ? 11 : 12, color: BC.muted, fontWeight: 700, letterSpacing: "0.08em" }}>
        {table.number}卓
      </div>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
        padding: compact ? "1px 7px" : "2px 9px", borderRadius: 20,
        fontSize: compact ? 9 : 10.5, fontWeight: 800, background: `${tInfo.color}22`, color: tInfo.color,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tInfo.color, display: "inline-block" }} />
        {tInfo.label}
      </div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4,
        padding: compact ? "2px 8px" : "3px 10px", borderRadius: 20,
        fontSize: compact ? 11 : 13, fontWeight: 800,
        background: playing ? (danger ? `${BC.red}22` : `${BC.blue}22`) : `${BC.green}22`,
        color: playing ? (danger ? BC.red : BC.blue) : BC.green,
      }}>
        {playing ? <ClockIcon size={iconSize} /> : <CheckCircleIcon size={iconSize} />}
        {playing ? "対局中" : "空き卓"}
      </div>
      {playing && info && (
        <div style={{ marginTop: compact ? 4 : 8 }}>
          <div style={{
            fontSize: compact ? 15 : 22, fontWeight: 800, color: danger ? BC.red : BC.text,
            fontVariantNumeric: "tabular-nums",
          }}>
            {info.overtime ? `+${formatClock(info.remainingMs)}` : formatClock(info.remainingMs)}
          </div>
          {!compact && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
              fontSize: 10, color: danger ? BC.red : BC.muted, fontWeight: 700, marginTop: 2,
            }}>
              {danger && <AlertTriangleIcon size={11} />}
              {info.overtime ? "終了時刻を超過" : info.soon ? "まもなく終了" : "残り時間"}
            </div>
          )}
        </div>
      )}
      {table.staffCount > 0 && (
        <div style={{
          marginTop: compact ? 4 : 8, display: "inline-flex", alignItems: "center", gap: 3,
          padding: compact ? "1px 6px" : "3px 9px", borderRadius: 20, background: `${BC.orange}22`, color: "#8A6300",
          fontSize: compact ? 9 : 11, fontWeight: 700,
        }}>
          <UsersIcon size={compact ? 9 : 11} />
          スタッフ{table.staffCount}名対応中
        </div>
      )}
    </div>
  );
}

function TypeLegend({ small }) {
  return (
    <div style={{ display: "flex", gap: small ? 10 : 14, flexWrap: "wrap", alignItems: "center" }}>
      {TABLE_TYPES.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: small ? 10 : 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.color, display: "inline-block" }} />
          <span style={{ color: BC.muted, fontWeight: 600 }}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

export function TableBoardPage() {
  const [compact] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("compact") === "true"; }
    catch { return false; }
  });
  const now = useNow(1000);
  const { tables } = useTables();
  const { waitCount } = useWaitCount();
  const emptyCount = tables.filter((t) => t.status === "empty").length;

  return (
    <div style={{
      ...F, background: compact ? "transparent" : BC.bg, minHeight: compact ? "auto" : "100vh",
      color: BC.text, padding: compact ? 6 : 0, overflow: "hidden",
    }}>
      {!compact && (
        <header style={{ background: BC.surface, borderBottom: `1px solid ${BC.border}`, padding: "16px 20px" }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.1em" }}>SITEN 卓状況</div>
          <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <DoorIcon size={15} color={BC.green} />
              空いている卓 <b style={{ fontSize: 20, color: BC.green }}>{emptyCount}</b> / {tables.length}卓
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <UsersIcon size={15} color={BC.blue} />
              待ち人数 <b style={{ fontSize: 20, color: BC.blue }}>{waitCount}</b>名
            </div>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BC.border}` }}>
            <TypeLegend />
          </div>
        </header>
      )}
      {compact && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
          <span>空き <b style={{ color: BC.green }}>{emptyCount}</b>/{tables.length}</span>
          <span>待ち <b style={{ color: BC.blue }}>{waitCount}</b>名</span>
        </div>
      )}
      <main style={{ maxWidth: compact ? "100%" : 900, margin: compact ? 0 : "0 auto", padding: compact ? 0 : "20px 16px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 84 : 130}px, 1fr))`,
          gap: compact ? 6 : 12,
        }}>
          {tables.map((t) => <TableCard key={t.number} table={t} now={now} compact={compact} />)}
        </div>
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 管理画面パネル
// ════════════════════════════════════════════════════════
const counterBtnStyle = (disabled, sm = false) => ({
  width: sm ? 26 : 34, height: sm ? 26 : 34, borderRadius: "50%", border: `1px solid ${BC.border}`,
  background: disabled ? BC.bg : BC.white, color: disabled ? BC.muted : BC.text,
  fontSize: sm ? 15 : 18, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", lineHeight: 1,
});
const actionBtnStyle = (color) => ({
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
  padding: "9px 0", borderRadius: 6, border: "none", cursor: "pointer",
  fontSize: 13, fontWeight: 700, background: color, color: BC.white,
});
const typeSelectStyle = {
  marginTop: 10, width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${BC.border}`,
  fontSize: 12, color: BC.text, background: BC.white, cursor: "pointer",
};

export function AdminTableBoardPanel() {
  const now = useNow(1000);
  const { tables } = useTables();
  const { waitCount } = useWaitCount();

  return (
    <div style={{ ...F }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BC.blue, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16 }}>
        卓状況管理
      </div>

      <div style={{
        background: BC.surface, border: `1px solid ${BC.border}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16,
      }}>
        <TypeLegend small />
      </div>

      <div style={{
        background: BC.surface, border: `1px solid ${BC.border}`, borderRadius: 10, padding: 16,
        marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
          <UsersIcon size={16} color={BC.blue} />全体の待ち人数
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => waitCount > 0 && changeWait(-1)} disabled={waitCount <= 0} style={counterBtnStyle(waitCount <= 0)}>−</button>
          <div style={{ fontSize: 22, fontWeight: 800, minWidth: 32, textAlign: "center" }}>{waitCount}</div>
          <button onClick={() => changeWait(1)} style={counterBtnStyle(false)}>＋</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
        {tables.map((t) => {
          const playing = t.status === "playing";
          const info = playing ? remainingInfo(t.startedAt, now) : null;
          const danger = !!(info && (info.soon || info.overtime));
          const tInfo = typeInfo(t.type);
          return (
            <div key={t.number} style={{
              background: BC.surface, border: `1.5px solid ${danger ? BC.red : BC.border}`, borderRadius: 10, padding: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{t.number}卓</div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                  background: playing ? (danger ? `${BC.red}22` : `${BC.blue}22`) : `${BC.green}22`,
                  color: playing ? (danger ? BC.red : BC.blue) : BC.green,
                }}>
                  {playing ? <ClockIcon size={12} /> : <CheckCircleIcon size={12} />}
                  {playing ? "対局中" : "空き卓"}
                </div>
              </div>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
                padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                background: `${tInfo.color}22`, color: tInfo.color,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: tInfo.color, display: "inline-block" }} />
                {tInfo.label}
              </div>
              <select value={t.type} onChange={(e) => changeType(t.number, e.target.value)} style={typeSelectStyle}>
                {TABLE_TYPES.map((tp) => <option key={tp.id} value={tp.id}>{tp.label}</option>)}
              </select>

              {playing && info && (
                <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: danger ? BC.red : BC.text, fontVariantNumeric: "tabular-nums" }}>
                  {info.overtime ? `+${formatClock(info.remainingMs)}` : formatClock(info.remainingMs)}
                  <span style={{ fontSize: 11, color: danger ? BC.red : BC.muted, fontWeight: 700, marginLeft: 6 }}>
                    {info.overtime ? "超過" : info.soon ? "まもなく終了" : "残り"}
                  </span>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {!playing ? (
                  <button onClick={() => startGame(t.number)} style={actionBtnStyle(BC.blue)}><ClockIcon size={14} />対局開始</button>
                ) : (
                  <button onClick={() => endGame(t.number)} style={actionBtnStyle(BC.red)}><DoorIcon size={14} />終了</button>
                )}
              </div>

              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BC.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: BC.muted }}>
                  <UsersIcon size={13} />スタッフ人数
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => t.staffCount > 0 && changeStaff(t.number, -1)} disabled={t.staffCount <= 0} style={counterBtnStyle(t.staffCount <= 0, true)}>−</button>
                  <div style={{ fontSize: 15, fontWeight: 800, minWidth: 20, textAlign: "center" }}>{t.staffCount}</div>
                  <button onClick={() => changeStaff(t.number, 1)} style={counterBtnStyle(false, true)}>＋</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// 予約サイトヘッダー用ミニプレビュー（タップで /board へ遷移）
// ════════════════════════════════════════════════════════
export function HeaderBoardPreview() {
  return (
    <div
      onClick={() => { window.location.href = "/board"; }}
      title="卓状況を見る"
      style={{
        position: "relative", width: 168, height: 60, borderRadius: 8, overflow: "hidden",
        border: `1px solid ${BC.border}`, cursor: "pointer", flexShrink: 0, background: BC.white,
      }}
    >
      <iframe
        src="/board?compact=true"
        title="卓状況プレビュー"
        scrolling="no"
        style={{ width: "100%", height: "100%", border: "none", pointerEvents: "none" }}
      />
    </div>
  );
}
