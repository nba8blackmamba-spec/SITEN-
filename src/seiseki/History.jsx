// 対局1件の変更履歴（いつ・誰が・何を変えたか）
import { useHistory } from "./store";
import { SEAT_WINDS } from "./scoring";
import { SC, card, bigBtn } from "./ui";

const ACTIONS = { create: "登録", update: "編集", delete: "削除", restore: "元に戻す" };
const fmtAt = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return "（保存中）";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const seatsText = (g) => g?.seats?.map((s, i) => `${SEAT_WINDS[i]} ${s.name} ${s.score.toLocaleString("ja-JP")}${s.chombo ? ` 罰${s.chombo}` : ""}`).join(" / ");
const headText = (g) => (g ? `${g.date} ${g.round}回戦 ${g.table}卓` : "");

export function HistoryDialog({ game, onClose }) {
  const items = useHistory(game.id);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ ...card, width: "100%", maxWidth: 760, maxHeight: "85vh", overflowY: "auto", marginBottom: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>変更履歴: {game.round}回戦 {game.table}卓</div>
          <button style={bigBtn("plain")} onClick={onClose}>閉じる</button>
        </div>
        {items === null && <div style={{ color: SC.muted }}>読み込み中...</div>}
        {items?.length === 0 && <div style={{ color: SC.muted }}>履歴がありません</div>}
        {items?.map((h) => {
          const changedHead = h.before && headText(h.before) !== headText(h.after);
          const changedSeats = h.before && seatsText(h.before) !== seatsText(h.after);
          return (
            <div key={h.id} style={{ borderTop: `1px solid ${SC.border}`, padding: "10px 0", fontSize: 15 }}>
              <div style={{ fontWeight: 700 }}>
                {fmtAt(h.at)}　{ACTIONS[h.action] || h.action}
                <span style={{ color: SC.muted, fontWeight: 400, marginLeft: 10 }}>担当: {h.staffName || "（未入力）"}</span>
              </div>
              {h.action === "create" && <div>{headText(h.after)}　{seatsText(h.after)}</div>}
              {changedHead && <div>{headText(h.before)} → <b>{headText(h.after)}</b></div>}
              {changedSeats && (
                <div>
                  <div style={{ color: SC.muted }}>変更前: {seatsText(h.before)}</div>
                  <div>変更後: {seatsText(h.after)}</div>
                </div>
              )}
              {h.action === "update" && !changedHead && !changedSeats && <div style={{ color: SC.muted }}>（自動調整の記録などの変更）</div>}
              {h.after?.adjustment && h.action !== "delete" && h.action !== "restore" && (
                <div style={{ color: SC.orange }}>自動調整: {h.after.adjustment.wind}家 {h.after.adjustment.before} → {h.after.adjustment.after}点</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
