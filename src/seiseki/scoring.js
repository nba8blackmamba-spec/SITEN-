// ════════════════════════════════════════════════════════
// 麻雀成績 換算ロジック（画面・Firestore に依存しない純粋関数）
// ルールを足すときは RULES に1件追加し、必要なら rankPointsFor に分岐を足す
// ════════════════════════════════════════════════════════

// チョンボ1回あたりに引くポイント（設定値はここだけ）
export const CHOMBO_PENALTY = 20;

// 素点ポイントの基準点（返し）
export const RETURN_SCORE = 30000;

export const SEAT_WINDS = ["東", "南", "西", "北"];

// uma: 1位〜4位の順位点（固定の場合）
// floatUma: 浮き人数ごとの順位点（健康）
export const RULES = {
  kenko: {
    id: "kenko", label: "健康", baseTotal: 120000, autoAdjust: true, dailyBonus: true,
    floatUma: {
      1: [12, -2, -4, -6],
      2: [8, 4, -4, -8],
      3: [6, 4, 2, -12],
    },
  },
  lab: {
    id: "lab", label: "ラボ", baseTotal: 100000, autoAdjust: false, dailyBonus: false,
    uma: [50, 10, -10, -30],
  },
  kyokai: {
    id: "kyokai", label: "協会", baseTotal: 100000, autoAdjust: false, dailyBonus: false,
    uma: [50, 10, -10, -30],
  },
};
export const RULE_IDS = Object.keys(RULES);
export const ruleOf = (id) => RULES[id] || null;

// 健康の日別「本日P」
export const DAILY_RANK_POINTS = [20, 15, 12, 10]; // 1〜4位（5位以下は0）
export const DAILY_PLUS_BONUS = 5;   // 合計が0以上
export const DAILY_MINUS_BONUS = 2;  // 合計がマイナス
export const DAILY_YAKUMAN_BONUS = 5;
export const DAILY_SHITEI_BONUS = 1;

// 浮動小数の誤差で同点判定がずれないよう、比較用に丸める
const key = (x) => Math.round(x * 1e6) / 1e6;

// 小数第1位までの表示用
export const fmtPoint = (x) => {
  const v = Math.round(x * 10) / 10;
  const s = (Object.is(v, -0) ? 0 : v).toFixed(1);
  return v > 0 ? `+${s}` : s;
};

// 値の大きい順に着順を付ける（同値は同じ着順）。
// 戻り値: 各要素の着順(1始まり)
export const rankDesc = (values) =>
  values.map((v) => 1 + values.filter((w) => key(w) > key(v)).length);

// 同着の人は、その人たちが占める着順の配分を平均して分け合う
// placeValues: 1位から順の配分（足りない着順は0）
export const sharedPlaceValues = (values, placeValues) => {
  const ranks = rankDesc(values);
  return values.map((v, i) => {
    const tied = values.filter((w) => key(w) === key(v)).length;
    let sum = 0;
    for (let p = ranks[i]; p < ranks[i] + tied; p++) sum += placeValues[p - 1] ?? 0;
    return sum / tied;
  });
};

// 着順に応じた順位点の配分（1位から順）
export const rankPointsFor = (ruleId, scores) => {
  const rule = ruleOf(ruleId);
  if (!rule) throw new Error(`未知のルール: ${ruleId}`);
  if (rule.floatUma) {
    // 浮き人数は順位点を決める前に数える（30000点ちょうども浮き）
    const floats = scores.filter((s) => s >= RETURN_SCORE).length;
    return rule.floatUma[floats] || [0, 0, 0, 0]; // 4人浮き(全員30000点)などは0
  }
  return rule.uma;
};

// 1対局の換算
// scores: 4席の素点, chombos: 4席のチョンボ回数
export const computeGame = (ruleId, scores, chombos = [0, 0, 0, 0]) => {
  const ranks = rankDesc(scores);
  const rankPoints = sharedPlaceValues(scores, rankPointsFor(ruleId, scores));
  return scores.map((score, i) => {
    const rawPoint = (score - RETURN_SCORE) / 1000;
    const chombo = Number(chombos[i]) || 0;
    const chomboPenalty = chombo * CHOMBO_PENALTY;
    return {
      score, rank: ranks[i], rawPoint, rankPoint: rankPoints[i],
      chombo, chomboPenalty,
      point: rawPoint + rankPoints[i] - chomboPenalty,
    };
  });
};

// 4人の合計点チェック（チョンボは関係しない）
export const checkTotal = (ruleId, scores) => {
  const total = scores.reduce((a, b) => a + b, 0);
  const base = ruleOf(ruleId).baseTotal;
  return { total, base, diff: total - base, ok: total === base };
};

// 健康の自動調整: 不足分は4位に加算、超過分は1位から引く
// 同点の場合は席順（東→北）で先の人を対象にする
// 戻り値: { scores, adjustment } 調整不要なら adjustment は null
export const autoAdjust = (ruleId, scores) => {
  const { diff, base } = checkTotal(ruleId, scores);
  if (diff === 0) return { scores: [...scores], adjustment: null };
  const target = diff < 0
    ? scores.indexOf(Math.min(...scores))
    : scores.indexOf(Math.max(...scores));
  const next = [...scores];
  next[target] = scores[target] - diff;
  return {
    scores: next,
    adjustment: {
      seat: target, before: scores[target], after: next[target],
      amount: -diff, base, kind: diff < 0 ? "shortage" : "excess",
    },
  };
};

// ── 日別成績 ────────────────────────────────────────────
// games: { round, rule, deleted?, seats: [{ playerId, name, score, chombo }] } の配列（同じ日）
// flags: { [playerId]: { yakuman, shitei } }（健康のみ）
// 戻り値: { rounds: [1,2,...], rows: [{ playerId, name, total, byRound, rank, dailyP? }] }
export const computeDaily = (ruleId, games, flags = {}) => {
  const rule = ruleOf(ruleId);
  const map = new Map();
  const roundSet = new Set();
  for (const g of games) {
    if (g.rule !== ruleId || g.deleted) continue; // 削除済みは集計しない
    const results = computeGame(ruleId, g.seats.map((s) => s.score), g.seats.map((s) => s.chombo));
    roundSet.add(g.round);
    g.seats.forEach((s, i) => {
      if (!map.has(s.playerId)) map.set(s.playerId, { playerId: s.playerId, name: s.name, total: 0, byRound: {} });
      const row = map.get(s.playerId);
      row.total += results[i].point;
      row.byRound[g.round] = (row.byRound[g.round] ?? 0) + results[i].point;
    });
  }
  const rows = [...map.values()];
  const ranks = rankDesc(rows.map((r) => r.total));
  rows.forEach((r, i) => { r.rank = ranks[i]; });
  if (rule.dailyBonus) {
    const placeP = sharedPlaceValues(rows.map((r) => r.total), DAILY_RANK_POINTS);
    rows.forEach((r, i) => {
      const f = flags[r.playerId] || {};
      r.dailyP = placeP[i]
        + (key(r.total) >= 0 ? DAILY_PLUS_BONUS : DAILY_MINUS_BONUS)
        + (f.yakuman ? DAILY_YAKUMAN_BONUS : 0)
        + (f.shitei ? DAILY_SHITEI_BONUS : 0);
    });
  }
  rows.sort((a, b) => a.rank - b.rank || String(a.name).localeCompare(String(b.name), "ja"));
  return { rounds: [...roundSet].sort((a, b) => a - b), rows };
};
