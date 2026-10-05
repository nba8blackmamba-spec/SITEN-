// 日別成績（日付・ルールごと。ルールは混ぜない）
import { useMemo, useState } from "react";
import { RULES, RULE_IDS, computeDaily, fmtPoint } from "./scoring";
import { useDailyFlags, setDailyFlag, saveErrorMessage } from "./store";
import { SC, card, label, input, bigBtn, pointColor } from "./ui";

const th = { padding: "10px 10px", fontSize: 15, color: SC.muted, fontWeight: 700, borderBottom: `2px solid ${SC.border}`, whiteSpace: "nowrap", textAlign: "right" };
const td = { padding: "12px 10px", fontSize: 18, borderBottom: `1px solid ${SC.border}`, whiteSpace: "nowrap", textAlign: "right" };
const fmtP = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function DailyResults({ date, setDate, rule, setRule, games, players, flash }) {
  const savedFlags = useDailyFlags(date, rule);
  // 保存が終わるまでの間も、押したチェックをすぐ画面に出す
  const [pending, setPending] = useState({});
  const flags = useMemo(() => {
    const merged = { ...savedFlags };
    for (const [k, v] of Object.entries(pending)) {
      const [d, r, pid, f] = k.split("|");
      if (d === date && r === rule) merged[pid] = { ...(merged[pid] || {}), [f]: v };
    }
    return merged;
  }, [savedFlags, pending, date, rule]);
  const { rounds, rows } = useMemo(() => computeDaily(rule, games, flags), [rule, games, flags]);
  const nameOf = (r) => players.find((p) => p.id === r.playerId)?.name || r.name;
  const bonus = RULES[rule].dailyBonus;

  const toggle = (playerId, field, value) => {
    const k = [date, rule, playerId, field].join("|");
    setPending((p) => ({ ...p, [k]: value }));
    setDailyFlag(date, rule, playerId, field, value)
      .catch((e) => { console.error(e); flash(saveErrorMessage(e, "保存できませんでした"), false); })
      .finally(() => setPending(({ [k]: _done, ...rest }) => rest));
  };

  return (
    <div>
      <div style={card}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <span style={label}>日付</span>
            <input type="date" style={input} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div style={{ flex: "2 1 300px" }}>
            <span style={label}>ルール</span>
            <div style={{ display: "flex", gap: 8 }}>
              {RULE_IDS.map((id) => (
                <button key={id} style={{ ...bigBtn("plain", rule === id), flex: 1 }} onClick={() => setRule(id)}>{RULES[id].label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{date} {RULES[rule].label} の成績</div>
        {rows.length === 0 ? (
          <div style={{ color: SC.muted, fontSize: 16, padding: "20px 0" }}>この日の記録はありません</div>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>順位</th>
                <th style={{ ...th, textAlign: "left" }}>名前</th>
                <th style={th}>合計</th>
                {rounds.map((n) => <th key={n} style={th}>{n}回戦</th>)}
                {bonus && <th style={{ ...th, textAlign: "center" }}>役満和了</th>}
                {bonus && <th style={{ ...th, textAlign: "center" }}>指定役</th>}
                {bonus && <th style={th}>本日P</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId}>
                  <td style={{ ...td, fontWeight: 700 }}>{r.rank}</td>
                  <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{nameOf(r)}</td>
                  <td style={{ ...td, fontWeight: 800, color: pointColor(r.total) }}>{fmtPoint(r.total)}</td>
                  {rounds.map((n) => (
                    <td key={n} style={{ ...td, color: r.byRound[n] === undefined ? SC.muted : pointColor(r.byRound[n]) }}>
                      {r.byRound[n] === undefined ? "−" : fmtPoint(r.byRound[n])}
                    </td>
                  ))}
                  {bonus && ["yakuman", "shitei"].map((f) => (
                    <td key={f} style={{ ...td, textAlign: "center" }}>
                      <input type="checkbox" checked={!!flags[r.playerId]?.[f]} onChange={(e) => toggle(r.playerId, f, e.target.checked)} style={{ width: 28, height: 28, cursor: "pointer" }} />
                    </td>
                  ))}
                  {bonus && <td style={{ ...td, fontWeight: 800 }}>{fmtP(r.dailyP)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bonus && rows.length > 0 && (
          <div style={{ fontSize: 13, color: SC.muted, marginTop: 10 }}>
            本日P = 合計の順位点（1位20・2位15・3位12・4位10、同点は平均）＋ 合計0以上なら5／マイナスなら2 ＋ 役満和了5 ＋ 指定役1
          </div>
        )}
      </div>
    </div>
  );
}
