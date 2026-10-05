// 対局の入力・編集・削除
import { useMemo, useState } from "react";
import { RULES, RULE_IDS, SEAT_WINDS, computeGame, checkTotal, autoAdjust, fmtPoint, CHOMBO_PENALTY } from "./scoring";
import { saveGame, deleteGame, restoreGame, loadStaffName } from "./store";
import { HistoryDialog } from "./History";
import { PlayerPicker } from "./PlayerPicker";
import { SC, F, card, label, input, bigBtn, pointColor } from "./ui";

const emptySeat = () => ({ player: null, input: "", chombo: 0 });
const newForm = (round = 1, table = 1, players = [null, null, null, null]) => ({
  id: null, round, table, adjustment: null,
  seats: players.map((p) => ({ ...emptySeat(), player: p })),
});
// 百点単位の入力 → 素点（"250" → 25000, "-35" → -3500）
const toScore = (s) => (/^-?\d+$/.test(s) ? Number(s) * 100 : null);
const fmtScore = (n) => n.toLocaleString("ja-JP");

export function GameEntry({ date, setDate, rule, setRule, players, games, flash }) {
  const [form, setForm] = useState(() => newForm());
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [historyOf, setHistoryOf] = useState(null);

  const scores = form.seats.map((s) => toScore(s.input));
  const allScored = scores.every((s) => s !== null);
  const results = allScored ? computeGame(rule, scores, form.seats.map((s) => s.chombo)) : null;
  const total = allScored ? checkTotal(rule, scores) : null;
  const ruleGames = useMemo(() => games.filter((g) => g.rule === rule && !g.deleted), [games, rule]);
  const deletedGames = useMemo(() => games.filter((g) => g.rule === rule && g.deleted), [games, rule]);

  const updateSeat = (i, patch) => setForm((f) => ({
    ...f, seats: f.seats.map((s, j) => (j === i ? { ...s, ...patch } : s)),
  }));
  // 点数を手で直したら、自動調整の記録は実態と合わなくなるので外す
  const setScoreInput = (i, v) => setForm((f) => ({
    ...f, adjustment: null, seats: f.seats.map((s, j) => (j === i ? { ...s, input: v } : s)),
  }));

  const pressKey = (k) => {
    const cur = form.seats[active].input;
    if (k === "back") setScoreInput(active, cur.slice(0, -1));
    else if (k === "clear") setScoreInput(active, "");
    else if (k === "sign") setScoreInput(active, cur.startsWith("-") ? cur.slice(1) : "-" + cur);
    else if (k === "next") setActive((a) => (a + 1) % 4);
    else if (cur.replace("-", "").length < 4) setScoreInput(active, (cur === "0" ? "" : cur === "-0" ? "-" : cur) + k);
  };

  const applyAutoAdjust = () => {
    const { scores: next, adjustment } = autoAdjust(rule, scores);
    if (!adjustment) return;
    setForm((f) => ({
      ...f,
      seats: f.seats.map((s, i) => ({ ...s, input: String(next[i] / 100) })),
      adjustment: {
        ...adjustment, wind: SEAT_WINDS[adjustment.seat], playerName: f.seats[adjustment.seat].player?.name || "",
        at: new Date().toISOString(), by: loadStaffName(),
      },
    }));
    flash(`${SEAT_WINDS[adjustment.seat]}家を ${adjustment.amount > 0 ? "+" : ""}${fmtScore(adjustment.amount)}点 調整しました`);
  };

  const startEdit = (g) => {
    setForm({
      id: g.id, round: g.round, table: g.table, adjustment: g.adjustment || null,
      seats: g.seats.map((s) => ({
        player: players.find((p) => p.id === s.playerId) || { id: s.playerId, regNo: s.regNo, name: s.name },
        input: String(s.score / 100), chombo: s.chombo || 0,
      })),
    });
    setActive(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (g) => {
    if (!window.confirm(`${g.round}回戦 ${g.table}卓 の記録を削除します。よろしいですか？\n（削除済みとして残るので、あとで元に戻せます）`)) return;
    try {
      await deleteGame(g.id);
      if (form.id === g.id) setForm(newForm(form.round, form.table));
      flash("削除しました");
    } catch (e) { console.error(e); flash("削除できませんでした", false); }
  };

  const restore = async (g) => {
    try { await restoreGame(g.id); flash("元に戻しました ✓"); }
    catch (e) { console.error(e); flash("元に戻せませんでした", false); }
  };

  const save = async () => {
    if (form.seats.some((s) => !s.player)) return flash("4人の名前を選んでください", false);
    const ids = form.seats.map((s) => s.player.id);
    if (new Set(ids).size < 4) return flash("同じ人が2つの席に入っています", false);
    if (!allScored) return flash("4人の点数を入力してください", false);
    if (!(form.round >= 1) || !(form.table >= 1)) return flash("回戦と卓を入力してください", false);
    const warns = [];
    if (!total.ok) warns.push(`4人の合計が ${fmtScore(total.total)}点 です（基準 ${fmtScore(total.base)}点）`);
    const others = ruleGames.filter((g) => g.id !== form.id && g.round === form.round);
    if (others.some((g) => g.table === form.table)) warns.push(`${form.round}回戦 ${form.table}卓 はすでに登録されています`);
    const dupPlayers = form.seats.filter((s) => others.some((g) => g.seats.some((x) => x.playerId === s.player.id)));
    if (dupPlayers.length) warns.push(`${dupPlayers.map((s) => s.player.name).join("・")} さんは同じ回戦の別の卓にも入っています`);
    if (warns.length && !window.confirm(`${warns.join("\n")}\n\nこのまま保存しますか？`)) return;

    const game = {
      date, rule, round: form.round, table: form.table, adjustment: form.adjustment || null,
      seats: form.seats.map((s, i) => ({
        playerId: s.player.id, regNo: s.player.regNo, name: s.player.name, score: scores[i], chombo: s.chombo,
      })),
    };
    setBusy(true);
    try {
      await saveGame(form.id, game);
      flash(form.id ? "更新しました ✓" : "登録しました ✓");
      // 同じ卓の次の回戦をすぐ入力できるよう、メンバーを残して点数だけ空にする
      setForm(form.id ? newForm(form.round, form.table) : newForm(form.round + 1, form.table, form.seats.map((s) => s.player)));
      setActive(0);
    } catch (e) {
      console.error(e); flash("保存できませんでした", false);
    } finally { setBusy(false); }
  };

  const takenIds = form.seats.map((s) => s.player?.id).filter(Boolean);

  return (
    <div>
      <div style={card}>
        {form.id && (
          <div style={{ background: `${SC.orange}22`, color: SC.text, borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            編集中: {form.round}回戦 {form.table}卓
            <button style={{ ...bigBtn("plain"), fontSize: 15, minHeight: 40 }} onClick={() => setForm(newForm(form.round, form.table))}>編集をやめる</button>
          </div>
        )}
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
          <Stepper label="回戦" value={form.round} onChange={(round) => setForm((f) => ({ ...f, round }))} />
          <Stepper label="卓" value={form.table} onChange={(table) => setForm((f) => ({ ...f, table }))} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "3 1 520px", minWidth: 0 }}>
          {form.seats.map((s, i) => (
            <div key={i} style={{ ...card, padding: 12, marginBottom: 10, borderColor: active === i ? SC.blue : SC.border, borderWidth: active === i ? 2 : 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: SC.blue, color: SC.white, fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{SEAT_WINDS[i]}</div>
                <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                  <PlayerPicker players={players} value={s.player} onChange={(p) => updateSeat(i, { player: p })} excludeIds={takenIds} />
                </div>
                <button onClick={() => setActive(i)} style={{ ...F, minHeight: 52, width: 150, borderRadius: 8, border: `2px solid ${active === i ? SC.blue : SC.border}`, background: active === i ? SC.blueL : SC.surface, fontSize: 22, fontWeight: 700, textAlign: "right", padding: "0 12px", cursor: "pointer", color: (scores[i] ?? 0) < 0 ? SC.red : SC.text }}>
                  {scores[i] === null ? <span style={{ color: SC.muted, fontSize: 16 }}>{s.input === "-" ? "−" : "点数"}</span> : fmtScore(scores[i])}
                </button>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                <span style={{ fontSize: 15, color: SC.muted, fontWeight: 600 }}>チョンボ</span>
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} style={{ ...bigBtn("plain", s.chombo === n), minWidth: 52, padding: "8px 0", ...(s.chombo === n && n > 0 ? { background: SC.red, borderColor: SC.red } : {}) }} onClick={() => updateSeat(i, { chombo: n })}>{n}</button>
                ))}
                <div style={{ flex: 1 }} />
                {results && (
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 18, fontWeight: 700, marginRight: 14 }}>{results[i].rank}着</span>
                    <span style={{ fontSize: 26, fontWeight: 800, color: pointColor(results[i].point) }}>{fmtPoint(results[i].point)}</span>
                    {results[i].chombo > 0 && <div style={{ fontSize: 13, color: SC.red }}>チョンボ −{results[i].chomboPenalty}含む</div>}
                  </div>
                )}
              </div>
            </div>
          ))}

          {total && (
            <div style={{ ...card, background: total.ok ? `${SC.green}18` : `${SC.red}12`, borderColor: total.ok ? SC.green : SC.red }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: total.ok ? SC.text : SC.red }}>
                {total.ok ? "✓ " : "⚠ "}4人の合計 {fmtScore(total.total)}点（基準 {fmtScore(total.base)}点）
                {!total.ok && ` ${total.diff > 0 ? "+" : ""}${fmtScore(total.diff)}点 ずれています`}
              </div>
              {!total.ok && RULES[rule].autoAdjust && (
                <button style={{ ...bigBtn("orange"), marginTop: 10 }} onClick={applyAutoAdjust}>
                  自動調整（{total.diff < 0 ? "不足分を4位に加算" : "超過分を1位から引く"}）
                </button>
              )}
            </div>
          )}
          {form.adjustment && (
            <div style={{ fontSize: 15, color: SC.text, marginBottom: 12 }}>
              自動調整あり: {form.adjustment.wind}家 {form.adjustment.playerName} {fmtScore(form.adjustment.before)} → {fmtScore(form.adjustment.after)}点
            </div>
          )}
          <button style={{ ...bigBtn("primary"), width: "100%", fontSize: 22, minHeight: 64 }} onClick={save} disabled={busy}>
            {busy ? "保存中..." : form.id ? "この内容で更新" : "登録する"}
          </button>
        </div>

        <div style={{ flex: "1 1 260px", position: "sticky", top: 12 }}>
          <NumPad windLabel={SEAT_WINDS[active]} value={form.seats[active].input} onKey={pressKey} />
        </div>
      </div>

      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{date} {RULES[rule].label} の記録（{ruleGames.length}件）</div>
        {ruleGames.length === 0 && <div style={{ color: SC.muted, fontSize: 16 }}>まだ記録がありません</div>}
        {ruleGames.map((g) => {
          const r = computeGame(g.rule, g.seats.map((s) => s.score), g.seats.map((s) => s.chombo));
          return (
            <div key={g.id} style={{ borderTop: `1px solid ${SC.border}`, padding: "12px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: form.id === g.id ? `${SC.orange}14` : "transparent" }}>
              <div style={{ fontWeight: 800, fontSize: 17, minWidth: 110 }}>{g.round}回戦 {g.table}卓</div>
              <div style={{ flex: 1, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 15 }}>
                {g.seats.map((s, i) => (
                  <span key={i}>
                    <span style={{ color: SC.muted }}>{SEAT_WINDS[i]}</span> {s.name} {fmtScore(s.score)}
                    {s.chombo > 0 && <span style={{ color: SC.red }}> 罰{s.chombo}</span>}
                    {" "}<b style={{ color: pointColor(r[i].point) }}>({fmtPoint(r[i].point)})</b>
                  </span>
                ))}
                {g.adjustment && <span style={{ color: SC.orange, fontWeight: 700 }}>自動調整あり</span>}
              </div>
              <button style={{ ...bigBtn("plain"), fontSize: 16 }} onClick={() => setHistoryOf(g)}>履歴</button>
              <button style={{ ...bigBtn("plain"), fontSize: 16 }} onClick={() => startEdit(g)}>編集</button>
              <button style={{ ...bigBtn("danger"), fontSize: 16 }} onClick={() => remove(g)}>削除</button>
            </div>
          );
        })}
        <div style={{ fontSize: 13, color: SC.muted, marginTop: 8 }}>チョンボは1回につき −{CHOMBO_PENALTY}ポイント</div>
        {deletedGames.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button style={{ ...bigBtn("plain"), fontSize: 15, minHeight: 44 }} onClick={() => setShowDeleted((v) => !v)}>
              削除済み（{deletedGames.length}件）を{showDeleted ? "隠す" : "表示"}
            </button>
            {showDeleted && deletedGames.map((g) => (
              <div key={g.id} style={{ borderTop: `1px solid ${SC.border}`, padding: "10px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", color: SC.muted }}>
                <div style={{ fontWeight: 800, fontSize: 16, minWidth: 110, textDecoration: "line-through" }}>{g.round}回戦 {g.table}卓</div>
                <div style={{ flex: 1, fontSize: 14 }}>
                  {g.seats.map((s) => `${s.name} ${fmtScore(s.score)}`).join(" / ")}
                  {g.deletedBy && `（削除: ${g.deletedBy}）`}
                </div>
                <button style={{ ...bigBtn("plain"), fontSize: 15 }} onClick={() => setHistoryOf(g)}>履歴</button>
                <button style={{ ...bigBtn("green"), fontSize: 15 }} onClick={() => restore(g)}>元に戻す</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {historyOf && <HistoryDialog game={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}

function Stepper({ label: text, value, onChange }) {
  return (
    <div>
      <span style={label}>{text}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button style={bigBtn("plain")} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
        <div style={{ minWidth: 56, textAlign: "center", fontSize: 24, fontWeight: 800 }}>{value}</div>
        <button style={bigBtn("plain")} onClick={() => onChange(value + 1)}>＋</button>
      </div>
    </div>
  );
}

function NumPad({ windLabel, value, onKey }) {
  const keys = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], ["sign", "0", "back"]];
  const text = { sign: "±", back: "⌫" };
  const shown = toScore(value);
  return (
    <div style={{ ...card, padding: 12 }}>
      <div style={{ fontSize: 15, color: SC.muted, marginBottom: 4 }}>{windLabel}家の点数（百点単位）</div>
      <div style={{ fontSize: 30, fontWeight: 800, textAlign: "right", padding: "6px 8px", background: SC.bg, borderRadius: 8, marginBottom: 10, minHeight: 50, color: (shown ?? 0) < 0 ? SC.red : SC.text }}>
        {value || <span style={{ color: SC.muted }}>0</span>}
        <span style={{ fontSize: 16, color: SC.muted, marginLeft: 8 }}>{shown !== null ? `= ${fmtScore(shown)}点` : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {keys.flat().map((k) => (
          <button key={k} onClick={() => onKey(k)} style={{ ...F, minHeight: 64, fontSize: 28, fontWeight: 700, borderRadius: 10, border: `1.5px solid ${SC.border}`, background: k === "sign" ? `${SC.red}14` : SC.surface, color: k === "sign" ? SC.red : SC.text, cursor: "pointer" }}>
            {text[k] || k}
          </button>
        ))}
        <button onClick={() => onKey("clear")} style={{ ...bigBtn("plain"), minHeight: 56 }}>クリア</button>
        <button onClick={() => onKey("next")} style={{ ...bigBtn("primary"), minHeight: 56, gridColumn: "span 2" }}>次の席へ →</button>
      </div>
    </div>
  );
}
