// ════════════════════════════════════════════════════════
// 名簿の検索・重複チェック（純粋関数）
// ════════════════════════════════════════════════════════

// 比較用に正規化: 空白除去・カタカナ→ひらがな・全角英数→半角・小文字化
export const normalize = (s) =>
  String(s || "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();

// 漢字（登録名）・読み仮名・登録番号で検索
export const searchPlayers = (players, q, limit = 8) => {
  const n = normalize(q);
  if (!n) return [];
  const isNum = /^\d+$/.test(n);
  if (!isNum && n.length < 2) return [];
  const hits = players.filter((p) =>
    (isNum && String(p.regNo) === n) ||
    normalize(p.name).includes(n) ||
    normalize(p.kana).includes(n),
  );
  const score = (p) => (normalize(p.name).startsWith(n) || normalize(p.kana).startsWith(n) ? 0 : 1);
  return hits.sort((a, b) => score(a) - score(b) || a.regNo - b.regNo).slice(0, limit);
};

// 新規登録の前に「近い名前」を探す（二重登録防止）
export const findSimilarPlayers = (players, name, kana) => {
  const nn = normalize(name);
  const nk = normalize(kana);
  const near = (a, b) => a && b && (a === b || (Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a))));
  return players.filter((p) => {
    const pn = normalize(p.name);
    const pk = normalize(p.kana);
    return near(nn, pn) || near(nk, pk) || near(nn, pk) || near(nk, pn);
  });
};

export const nextRegNo = (players) => players.reduce((m, p) => Math.max(m, Number(p.regNo) || 0), 0) + 1;
