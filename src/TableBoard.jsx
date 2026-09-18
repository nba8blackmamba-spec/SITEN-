// ════════════════════════════════════════════════════════
// 卓状況ボード（/board ページ + 管理画面パネル + ヘッダー用ミニプレビュー）
// ════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, increment } from "firebase/firestore";

export const GAME_MINUTES = 50;
const TABLE_NUMBERS = [1, 2, 3, 4, 5, 6];

const BC = {
  bg: "#F0F4F8", surface: "#FFFFFF", border: "#D9E2EC", emptySurface: "#EAF8EF",
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
// 50分カウントダウン・終了間近/時間超過の判定は「ラボ」卓のみに適用
const isTimedType = (type) => type === "lab";

// ── Firestore ヘルパー ──────────────────────────────────
const tableRef = (n) => doc(db, "tables", String(n));
const metaRef = doc(db, "boardMeta", "main");

export const startGame = (n, memberCount = 0) =>
  setDoc(tableRef(n), {
    number: n, status: "playing", startedAt: new Date().toISOString(), memberCount, durationMinutes: GAME_MINUTES,
  }, { merge: true });
export const endGame = (n) =>
  setDoc(tableRef(n), { number: n, status: "empty", startedAt: null, staffCount: 0, memberCount: 0, durationMinutes: GAME_MINUTES }, { merge: true });
export const changeStaff = (n, delta) =>
  setDoc(tableRef(n), { number: n, staffCount: increment(delta) }, { merge: true });
export const changeWait = (delta) =>
  setDoc(metaRef, { waitCount: increment(delta) }, { merge: true });
export const changeType = (n, type) =>
  setDoc(tableRef(n), { number: n, type }, { merge: true });
// 残り時間を直接調整する: startedAt はそのままに、経過時間 + 指定した残り分数を
// 「実質的な試合時間(durationMinutes)」として保存し、次回以降の計算式に反映する
export const setRemainingMinutes = (n, startedAt, remainingMinutes) => {
  const elapsedMinutes = (Date.now() - new Date(startedAt).getTime()) / 60000;
  const durationMinutes = elapsedMinutes + remainingMinutes;
  return setDoc(tableRef(n), { number: n, durationMinutes }, { merge: true });
};

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
      memberCount: Number(data.memberCount) || 0,
      durationMinutes: Number(data.durationMinutes) || GAME_MINUTES,
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
function remainingInfo(startedAt, now, durationMinutes = GAME_MINUTES) {
  if (!startedAt) return null;
  const startMs = new Date(startedAt).getTime();
  const remainingMs = durationMinutes * 60000 - (now - startMs);
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
// 塗りつぶし版のチェックアイコン(空き卓表示用)
const CheckCircleFilledIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" fill={color} />
    <path d="M8.5 12.3l2.4 2.4l4.8 -4.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
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

// 横長・区切り線で4分割された集計バー
function StatBar({ waitCount, inStoreCount, emptyCount, lowTimeCount, compact }) {
  const items = [
    { label: "待ち", value: waitCount, unit: "名", color: BC.text, Icon: UsersIcon },
    { label: "店内", value: inStoreCount, unit: "名", color: BC.text, Icon: DoorIcon },
    { label: "空き", value: emptyCount, unit: "卓", color: BC.green, Icon: CheckCircleIcon },
    { label: "残りわずか", value: lowTimeCount, unit: "卓", color: BC.red, Icon: AlertTriangleIcon },
  ];
  return (
    <div style={{
      display: "flex", background: BC.surface, border: `1px solid ${BC.border}`,
      borderRadius: compact ? 8 : 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    }}>
      {items.map((it, i) => (
        <div key={it.label} style={{
          flex: 1, textAlign: "center", padding: compact ? "5px 2px" : "10px 6px",
          borderLeft: i > 0 ? `1px solid ${BC.border}` : "none",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
            fontSize: compact ? 8.5 : 11, color: BC.muted, fontWeight: 700,
          }}>
            {!compact && <it.Icon size={11} color={BC.muted} />}
            {it.label}
          </div>
          <div style={{ fontSize: compact ? 14 : 22, fontWeight: 800, color: it.color, fontVariantNumeric: "tabular-nums" }}>
            {it.value}<span style={{ fontSize: compact ? 8 : 11, fontWeight: 600, marginLeft: 1 }}>{it.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TableRow({ table, now, compact }) {
  const playing = table.status === "playing";
  const timed = isTimedType(table.type);
  const info = playing && timed ? remainingInfo(table.startedAt, now, table.durationMinutes) : null;
  const soon = !!(info && info.soon);
  const overtime = !!(info && info.overtime);
  const tInfo = typeInfo(table.type);

  return (
    <div style={{
      display: "flex", background: playing ? BC.surface : BC.emptySurface, border: `1px solid ${BC.border}`,
      borderLeft: `6px solid ${tInfo.color}`, borderRadius: compact ? 8 : 10,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden",
    }}>
      <div style={{ flex: 1, padding: compact ? "8px 10px" : "12px 16px", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: compact ? 16 : 20, fontWeight: 800, color: BC.text }}>{table.number}卓</span>
            {playing && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 8px", borderRadius: 20,
                fontSize: compact ? 9 : 10.5, fontWeight: 800, background: `${tInfo.color}22`, color: tInfo.color,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: tInfo.color, display: "inline-block" }} />
                {tInfo.label}
              </span>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            {!playing && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: BC.green, fontWeight: 800, fontSize: compact ? 12 : 14 }}>
                <CheckCircleFilledIcon size={compact ? 16 : 19} />空き卓
              </div>
            )}
            {playing && timed && overtime && (
              <span style={{ padding: "3px 10px", borderRadius: 20, background: `${BC.red}1F`, color: BC.red, fontSize: compact ? 10 : 11, fontWeight: 800 }}>
                時間超過
              </span>
            )}
            {playing && timed && soon && !overtime && (
              <span style={{ padding: "3px 10px", borderRadius: 20, background: `${BC.orange}2A`, color: "#B8710A", fontSize: compact ? 10 : 11, fontWeight: 800 }}>
                終了間近
              </span>
            )}
            {playing && !timed && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: BC.blue, fontWeight: 800, fontSize: compact ? 11 : 13 }}>
                <ClockIcon size={compact ? 13 : 15} />対局中
              </div>
            )}
          </div>
        </div>

        {playing && (
          <>
            {table.memberCount > 0 && (
              <div style={{ fontSize: compact ? 10 : 11, color: BC.muted, marginTop: 4 }}>メンバー{table.memberCount}名</div>
            )}
            {timed && info && (
              <div style={{
                fontSize: compact ? 20 : 32, fontWeight: 800, marginTop: 2, lineHeight: 1.15,
                color: overtime ? BC.red : BC.text, fontVariantNumeric: "tabular-nums",
              }}>
                {overtime ? `+${formatClock(info.remainingMs)}` : formatClock(info.remainingMs)}
              </div>
            )}
          </>
        )}

        {table.staffCount > 0 && (
          <div style={{
            marginTop: 6, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px",
            borderRadius: 20, background: `${BC.orange}22`, color: "#8A6300",
            fontSize: compact ? 9 : 11, fontWeight: 700,
          }}>
            <UsersIcon size={compact ? 9 : 11} />
            スタッフ{table.staffCount}名対応中
          </div>
        )}
      </div>
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
  const inStoreCount = tables.reduce((sum, t) => sum + (t.status === "playing" ? t.memberCount : 0), 0);
  const lowTimeCount = tables.filter((t) => {
    if (t.status !== "playing" || !isTimedType(t.type)) return false;
    const info = remainingInfo(t.startedAt, now, t.durationMinutes);
    return !!(info && (info.soon || info.overtime));
  }).length;

  return (
    <div style={{
      ...F, background: compact ? "transparent" : BC.bg, minHeight: compact ? "auto" : "100vh",
      color: BC.text, padding: compact ? 6 : "16px 16px 28px", overflow: "hidden",
    }}>
      <div style={{ maxWidth: compact ? "100%" : 640, margin: "0 auto" }}>
        {!compact && (
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 10 }}>SITEN 卓状況</div>
        )}
        <StatBar waitCount={waitCount} inStoreCount={inStoreCount} emptyCount={emptyCount} lowTimeCount={lowTimeCount} compact={compact} />
        {!compact && (
          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <TypeLegend />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 10, marginTop: compact ? 6 : 14 }}>
          {tables.map((t) => <TableRow key={t.number} table={t} now={now} compact={compact} />)}
        </div>
      </div>
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
  const emptyCount = tables.filter((t) => t.status === "empty").length;
  const inStoreCount = tables.reduce((sum, t) => sum + (t.status === "playing" ? t.memberCount : 0), 0);
  const lowTimeCount = tables.filter((t) => {
    if (t.status !== "playing" || !isTimedType(t.type)) return false;
    const info = remainingInfo(t.startedAt, now, t.durationMinutes);
    return !!(info && (info.soon || info.overtime));
  }).length;

  return (
    <div style={{ ...F }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BC.blue, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16 }}>
        卓状況管理
      </div>

      <div style={{ marginBottom: 16 }}>
        <StatBar waitCount={waitCount} inStoreCount={inStoreCount} emptyCount={emptyCount} lowTimeCount={lowTimeCount} />
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
        {tables.map((t) => <AdminTableCard key={t.number} t={t} now={now} />)}
      </div>
    </div>
  );
}

function AdminTableCard({ t, now }) {
  const [pendingMembers, setPendingMembers] = useState(4);
  const [remainingInput, setRemainingInput] = useState("");
  const playing = t.status === "playing";
  const timed = isTimedType(t.type);
  const info = playing && timed ? remainingInfo(t.startedAt, now, t.durationMinutes) : null;
  const soon = !!(info && info.soon);
  const overtime = !!(info && info.overtime);
  const danger = soon || overtime;
  const tInfo = typeInfo(t.type);

  const applyRemaining = () => {
    const val = Number(remainingInput);
    if (!Number.isFinite(val) || val < 0) return;
    setRemainingMinutes(t.number, t.startedAt, val);
    setRemainingInput("");
  };

  return (
    <div style={{
      background: playing ? BC.surface : BC.emptySurface, border: `1.5px solid ${danger ? BC.red : BC.border}`, borderRadius: 10, padding: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{t.number}卓</div>
        {!playing && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: BC.green }}>
            <CheckCircleFilledIcon size={17} />空き卓
          </div>
        )}
        {playing && timed && overtime && (
          <div style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: `${BC.red}1F`, color: BC.red }}>
            時間超過
          </div>
        )}
        {playing && timed && soon && !overtime && (
          <div style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: `${BC.orange}2A`, color: "#B8710A" }}>
            終了間近
          </div>
        )}
        {playing && (!timed || (!soon && !overtime)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: BC.blue }}>
            <ClockIcon size={13} />対局中
          </div>
        )}
      </div>

      {playing && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
          padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 800,
          background: `${tInfo.color}22`, color: tInfo.color,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: tInfo.color, display: "inline-block" }} />
          {tInfo.label}
        </div>
      )}
      <select value={t.type} onChange={(e) => changeType(t.number, e.target.value)} style={typeSelectStyle}>
        {TABLE_TYPES.map((tp) => <option key={tp.id} value={tp.id}>{tp.label}</option>)}
      </select>

      {playing && t.memberCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: BC.muted, marginTop: 8 }}>
          <UsersIcon size={13} />メンバー{t.memberCount}名
        </div>
      )}
      {playing && timed && info && (
        <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800, color: danger ? BC.red : BC.text, fontVariantNumeric: "tabular-nums" }}>
          {info.overtime ? `+${formatClock(info.remainingMs)}` : formatClock(info.remainingMs)}
        </div>
      )}
      {playing && timed && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <input
            type="number" min="0" step="1" value={remainingInput}
            onChange={(e) => setRemainingInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyRemaining()}
            placeholder="残り時間を入力(分)"
            style={{
              flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BC.border}`,
              fontSize: 12, color: BC.text, background: BC.white,
            }}
          />
          <button onClick={applyRemaining} style={{
            padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 700, background: BC.blue, color: BC.white, flexShrink: 0,
          }}>
            設定
          </button>
        </div>
      )}

      {!playing && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: BC.muted }}>
            <UsersIcon size={13} />開始時の人数
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setPendingMembers((m) => Math.max(1, m - 1))} disabled={pendingMembers <= 1} style={counterBtnStyle(pendingMembers <= 1, true)}>−</button>
            <div style={{ fontSize: 15, fontWeight: 800, minWidth: 20, textAlign: "center" }}>{pendingMembers}</div>
            <button onClick={() => setPendingMembers((m) => Math.min(4, m + 1))} disabled={pendingMembers >= 4} style={counterBtnStyle(pendingMembers >= 4, true)}>＋</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {!playing ? (
          <button onClick={() => startGame(t.number, pendingMembers)} style={actionBtnStyle(BC.blue)}><ClockIcon size={14} />対局開始</button>
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
