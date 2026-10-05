// 名前入力: 2文字ほどで名簿から候補を出す／名簿にない人は新規登録
import { useState } from "react";
import { searchPlayers, findSimilarPlayers } from "./playerSearch";
import { createPlayer } from "./store";
import { SC, F, input, bigBtn, label, card } from "./ui";

export function PlayerPicker({ players, value, onChange, excludeIds = [] }) {
  const [q, setQ] = useState("");
  const [registering, setRegistering] = useState(false);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 52 }}>
        <div style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>
          {value.name}<span style={{ fontSize: 14, color: SC.muted, marginLeft: 8 }}>No.{value.regNo}</span>
        </div>
        <button style={{ ...bigBtn("plain"), fontSize: 16 }} onClick={() => { onChange(null); setQ(""); }}>変更</button>
      </div>
    );
  }

  const candidates = searchPlayers(players, q).filter((p) => !excludeIds.includes(p.id));
  return (
    <div style={{ position: "relative" }}>
      <input style={input} value={q} placeholder="名前・よみ・番号" onChange={(e) => setQ(e.target.value)} />
      {q.trim() && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 20, background: SC.surface, border: `1px solid ${SC.border}`, borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", marginTop: 4, overflow: "hidden" }}>
          {candidates.map((p) => (
            <button key={p.id} onClick={() => { onChange(p); setQ(""); }} style={{ ...F, display: "flex", width: "100%", alignItems: "baseline", gap: 10, padding: "14px 14px", border: "none", borderBottom: `1px solid ${SC.border}`, background: SC.surface, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 14, color: SC.muted, minWidth: 56 }}>No.{p.regNo}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: SC.text }}>{p.name}</span>
              <span style={{ fontSize: 14, color: SC.muted }}>{p.kana}</span>
            </button>
          ))}
          {candidates.length === 0 && q.trim().length >= 2 && (
            <div style={{ padding: "12px 14px", color: SC.muted, fontSize: 15 }}>名簿に見つかりません</div>
          )}
          <button onClick={() => setRegistering(true)} style={{ ...F, width: "100%", padding: "14px", border: "none", background: SC.blueL, color: SC.blue, fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
            ＋ 「{q.trim()}」を新規登録
          </button>
        </div>
      )}
      {registering && (
        <NewPlayerDialog
          players={players} initialName={q.trim()}
          onClose={() => setRegistering(false)}
          onSelect={(p) => { setRegistering(false); setQ(""); onChange(p); }}
        />
      )}
    </div>
  );
}

function NewPlayerDialog({ players, initialName, onClose, onSelect }) {
  const kanaLike = /^[぀-ゟ゠-ヿ\sー]+$/.test(initialName);
  const [name, setName] = useState(initialName);
  const [kana, setKana] = useState(kanaLike ? initialName : "");
  const [similar, setSimilar] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const register = async () => {
    setBusy(true); setErr("");
    try { onSelect(await createPlayer(players, { name, kana })); }
    catch (e) { console.error(e); setErr("登録できませんでした: " + (e.message || e)); setBusy(false); }
  };
  const submit = () => {
    if (!name.trim() || !kana.trim()) { setErr("登録名と読み仮名を入力してください"); return; }
    const near = findSimilarPlayers(players, name, kana);
    if (near.length && !similar) { setSimilar(near); return; }
    register();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...card, width: "100%", maxWidth: 480, marginBottom: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>名簿に新規登録</div>
        {!similar ? (
          <>
            <span style={label}>登録名</span>
            <input style={{ ...input, marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} />
            <span style={label}>読み仮名</span>
            <input style={input} value={kana} placeholder="やまだたろう" onChange={(e) => setKana(e.target.value)} />
            <div style={{ fontSize: 13, color: SC.muted, marginTop: 8 }}>※ 名簿は公開ページでも使うため、電話番号などは入力しないでください</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, color: SC.red, fontWeight: 700, marginBottom: 10 }}>近い名前がすでに登録されています。同じ人ではありませんか？</div>
            {similar.map((p) => (
              <button key={p.id} onClick={() => onSelect(p)} style={{ ...bigBtn("plain"), width: "100%", marginBottom: 8, textAlign: "left" }}>
                <span style={{ fontSize: 14, color: SC.muted, marginRight: 10 }}>No.{p.regNo}</span>{p.name}
                <span style={{ fontSize: 14, color: SC.muted, marginLeft: 10 }}>{p.kana}</span>
                <span style={{ float: "right", fontSize: 15, color: SC.blue }}>この人を選ぶ</span>
              </button>
            ))}
            <div style={{ fontSize: 15, marginTop: 6 }}>登録しようとしている人: <b>{name}</b>（{kana}）</div>
          </>
        )}
        {err && <div style={{ color: SC.red, fontSize: 15, marginTop: 10 }}>⚠ {err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button style={bigBtn("plain")} onClick={onClose} disabled={busy}>やめる</button>
          {similar
            ? <button style={bigBtn("orange")} onClick={register} disabled={busy}>別の人として登録</button>
            : <button style={bigBtn("primary")} onClick={submit} disabled={busy}>登録する</button>}
        </div>
      </div>
    </div>
  );
}
