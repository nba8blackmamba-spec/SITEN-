// 成績管理画面の共通スタイル（タブレット向けに大きめ）
export const SC = {
  bg: "#F0F4F8", surface: "#FFFFFF", border: "#D9E2EC", text: "#1A2B3C", muted: "#7A8A9A", white: "#FFFFFF",
  blue: "#1565C0", blueL: "#E3EEFA", green: "#2ECC71", red: "#E74C3C", orange: "#F5B400", purple: "#9B6BE8",
};
export const F = { fontFamily: "'Hiragino Kaku Gothic Pro','Yu Gothic',sans-serif", boxSizing: "border-box" };

export const card = {
  background: SC.surface, border: `1px solid ${SC.border}`, borderRadius: 12, padding: 16, marginBottom: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};
export const label = { fontSize: 14, color: SC.muted, marginBottom: 6, display: "block", fontWeight: 600 };
export const input = {
  ...F, width: "100%", minHeight: 52, background: SC.surface, border: `1.5px solid ${SC.border}`, borderRadius: 8,
  padding: "10px 14px", color: SC.text, fontSize: 20, outline: "none",
};
export const bigBtn = (variant = "primary", active = false) => {
  const bg = {
    primary: SC.blue, danger: SC.red, green: SC.green, orange: SC.orange,
    plain: active ? SC.blue : SC.surface,
  }[variant];
  return {
    ...F, minHeight: 52, minWidth: 52, padding: "10px 18px", borderRadius: 10, cursor: "pointer",
    fontSize: 18, fontWeight: 700,
    border: variant === "plain" ? `1.5px solid ${active ? SC.blue : SC.border}` : "none",
    background: bg, color: variant === "plain" && !active ? SC.text : SC.white,
  };
};
export const pointColor = (x) => (Math.round(x * 10) < 0 ? SC.red : SC.text);

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
