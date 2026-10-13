// vitest で実行（npm test）
import { test } from "vitest";
import assert from "node:assert/strict";
import { computeGame, computeDaily, checkTotal, autoAdjust, fmtPoint, CHOMBO_PENALTY } from "./scoring.js";
import { searchPlayers, findSimilarPlayers, normalize } from "./playerSearch.js";

const pts = (results) => results.map((r) => Math.round(r.point * 1000) / 1000);
const ranks = (results) => results.map((r) => r.rank);

test("ラボ: 2位と3位が同点なら同じ着順で順位点を平均する", () => {
  const r = computeGame("lab", [40000, 25000, 25000, 10000]);
  assert.deepEqual(ranks(r), [1, 2, 2, 4]);
  assert.deepEqual(pts(r), [60, -5, -5, -50]); // 2・3位の順位点 (+10-10)/2 = 0
});

test("ラボ: 1位同点", () => {
  const r = computeGame("lab", [35000, 35000, 20000, 10000]);
  assert.deepEqual(ranks(r), [1, 1, 3, 4]);
  assert.deepEqual(pts(r), [35, 35, -20, -50]); // (50+10)/2 = 30
});

test("協会はラボと同じ換算", () => {
  const s = [42000, 31000, 18000, 9000];
  assert.deepEqual(pts(computeGame("kyokai", s)), pts(computeGame("lab", s)));
});

test("健康: 1人浮き +12/-2/-4/-6", () => {
  const r = computeGame("kenko", [45000, 28000, 26000, 21000]);
  assert.deepEqual(pts(r), [27, -4, -8, -15]);
});

test("健康: 2人浮き +8/+4/-4/-8", () => {
  const r = computeGame("kenko", [40000, 32000, 27000, 21000]);
  assert.deepEqual(pts(r), [18, 6, -7, -17]);
});

test("健康: 3人浮き +6/+4/+2/-12（30000点ちょうども浮き）", () => {
  const r = computeGame("kenko", [35000, 31000, 30000, 24000]);
  assert.deepEqual(pts(r), [11, 5, 2, -18]);
});

test("健康: 3人浮きで2位同点（浮き人数を数えてから平均）", () => {
  const r = computeGame("kenko", [30000, 30000, 32000, 28000]);
  assert.deepEqual(ranks(r), [2, 2, 1, 4]);
  assert.deepEqual(pts(r), [3, 3, 8, -14]); // (4+2)/2 = 3
});

test("健康: 4人とも30000点なら順位点はすべて0", () => {
  const r = computeGame("kenko", [30000, 30000, 30000, 30000]);
  assert.deepEqual(ranks(r), [1, 1, 1, 1]);
  assert.deepEqual(pts(r), [0, 0, 0, 0]);
});

test("チョンボ: ポイントだけ引き、素点・着順・合計チェックは変えない", () => {
  const scores = [40000, 30000, 20000, 10000];
  const r = computeGame("lab", scores, [0, 1, 0, 2]);
  assert.equal(CHOMBO_PENALTY, 20);
  assert.deepEqual(ranks(r), [1, 2, 3, 4]);
  assert.deepEqual(r.map((x) => x.score), scores);
  assert.deepEqual(pts(r), [60, -10, -20, -90]); // 2位 0+10-20, 4位 -20-30-40
  assert.equal(checkTotal("lab", scores).ok, true);
});

test("合計チェック: ラボ・協会10万点、健康12万点", () => {
  assert.equal(checkTotal("lab", [25000, 25000, 25000, 25000]).ok, true);
  assert.equal(checkTotal("kyokai", [25000, 25000, 25000, 24000]).diff, -1000);
  assert.equal(checkTotal("kenko", [30000, 30000, 30000, 30000]).ok, true);
});

test("健康の自動調整: 不足は4位に加算、超過は1位から引く", () => {
  const a = autoAdjust("kenko", [40000, 32000, 27000, 20000]); // 1000点不足
  assert.deepEqual(a.scores, [40000, 32000, 27000, 21000]);
  assert.equal(a.adjustment.seat, 3);
  assert.equal(a.adjustment.amount, 1000);
  const b = autoAdjust("kenko", [41000, 32000, 27000, 21000]); // 1000点超過
  assert.deepEqual(b.scores, [40000, 32000, 27000, 21000]);
  assert.equal(b.adjustment.seat, 0);
  assert.equal(b.adjustment.amount, -1000);
  assert.equal(autoAdjust("kenko", [30000, 30000, 30000, 30000]).adjustment, null);
});

// 健康の1局分（4人）を作る
const kenkoGame = (round, ids, scores) => ({
  rule: "kenko", round, seats: ids.map((id, i) => ({ playerId: id, name: id, score: scores[i], chombo: 0 })),
});
const TWO_FLOAT = [40000, 32000, 27000, 21000];   // +18 / +6 / -7 / -17
const ONE_FLOAT = [45000, 28000, 26000, 21000];   // +27 / -4 / -8 / -15
const THREE_FLOAT = [35000, 31000, 30000, 24000]; // +11 / +5 / +2 / -18
const daily = (games, flags) => Object.fromEntries(computeDaily("kenko", games, flags).rows.map((r) => [r.playerId, r]));

test("本日P: 1〜4位は順位点だけ、5位以下はプラス5／マイナス2（足し合わせない）", () => {
  const by = daily([
    kenkoGame(1, ["A", "B", "C", "D"], TWO_FLOAT),
    kenkoGame(1, ["E", "F", "G", "H"], ONE_FLOAT),
    kenkoGame(1, ["I", "J", "K", "L"], THREE_FLOAT),
  ], { E: { yakuman: true }, J: { shitei: true } });
  // 合計: E27 A18 I11 B6 J5 K2 F-4 C-7 G-8 H-15 D-17 L-18
  assert.equal(by.A.rank, 2);
  assert.equal(by.A.dailyP, 15);
  assert.equal(by.E.dailyP, 25);  // 1位 20 + 役満5（プラスの5は足さない）
  assert.equal(by.B.rank, 4);
  assert.equal(by.B.dailyP, 10);  // 4位
  assert.equal(by.J.rank, 5);
  assert.equal(by.J.rankP, 5);    // 5位でプラス
  assert.equal(by.J.dailyP, 6);   // 5 + 指定役1
  assert.equal(by.K.dailyP, 5);   // 6位でプラス
  assert.equal(by.F.dailyP, 2);   // 7位でマイナス
  assert.ok(Object.values(by).every((r) => r.tie === false));
});

test("本日P: 1位でプラスは20だけ、4位はマイナスでも10、5位でマイナスは2", () => {
  const by = daily([
    kenkoGame(1, ["A", "B", "C", "D"], TWO_FLOAT),
    kenkoGame(1, ["E", "F", "G", "H"], ONE_FLOAT),
  ]);
  // 合計: E27 A18 B6 F-4 C-7 G-8 H-15 D-17
  assert.equal(by.E.dailyP, 20);
  assert.equal(by.F.rank, 4);
  assert.equal(by.F.dailyP, 10);
  assert.equal(by.C.rank, 5);
  assert.equal(by.C.dailyP, 2);
});

test("本日P: 合計がちょうど0の人はプラス側（5）、5位以下どうしの同点は印なし", () => {
  const by = daily([
    kenkoGame(1, ["Y", "Z", "P", "Q"], [38000, 30000, 26000, 26000]), // +16 / +4 / -10 / -10
    kenkoGame(1, ["U", "V", "W", "X"], TWO_FLOAT),                    // +18 / +6 / -7 / -17
    kenkoGame(2, ["R", "Z", "S", "T"], ONE_FLOAT),                    // +27 / -4 / -8 / -15
  ]);
  // 合計: R27 U18 Y16 V6 Z0 W-7 S-8 P-10 Q-10 T-15 X-17
  assert.equal(by.Z.total, 0);
  assert.equal(by.Z.rank, 5);
  assert.equal(by.Z.dailyP, 5);
  assert.deepEqual([by.P.rank, by.Q.rank], [8, 8]);
  assert.deepEqual([by.P.tie, by.Q.tie], [false, false]);
  assert.deepEqual([by.P.dailyP, by.Q.dailyP], [2, 2]);
});

test("本日P: 1〜4位が関わる同点は「同点」の印を出し、手入力するまで空（null）", () => {
  const games = [
    kenkoGame(1, ["A", "B", "C", "D"], TWO_FLOAT),
    kenkoGame(1, ["E", "F", "G", "H"], TWO_FLOAT),
    kenkoGame(1, ["I", "J", "K", "L"], ONE_FLOAT),
  ];
  // 合計: I27 / A・E 18（2〜3位の同点）/ B・F 6（4〜5位の同点）/ J-4 / C・G -7（7〜8位の同点）/ K-8 / L-15 / D・H -17
  const by = daily(games, { B: { shitei: true } });
  assert.equal(by.I.dailyP, 20);
  for (const id of ["A", "E", "B", "F"]) {
    assert.equal(by[id].tie, true, id);
    assert.equal(by[id].rankP, null, id);
    assert.equal(by[id].dailyP, null, id); // ボーナスがあっても空のまま
  }
  assert.deepEqual([by.B.rank, by.F.rank], [4, 4]);
  // 5位以下どうしの同点は印なし
  assert.deepEqual([by.C.tie, by.G.tie, by.C.dailyP, by.G.dailyP], [false, false, 2, 2]);
  assert.equal(by.J.dailyP, 2);
});

test("本日P: 同点で順位Pを手入力した人は、手入力の値＋ボーナス", () => {
  const games = [
    kenkoGame(1, ["A", "B", "C", "D"], TWO_FLOAT),
    kenkoGame(1, ["E", "F", "G", "H"], TWO_FLOAT),
    kenkoGame(1, ["I", "J", "K", "L"], ONE_FLOAT),
  ];
  const by = daily(games, {
    A: { manualRankP: 15, yakuman: true },
    E: { manualRankP: 12 },
    B: { manualRankP: 10, shitei: true },
    // F は未入力
  });
  assert.deepEqual([by.A.tie, by.A.rankP, by.A.dailyP], [true, 15, 20]);
  assert.deepEqual([by.E.rankP, by.E.dailyP], [12, 12]);
  assert.deepEqual([by.B.rankP, by.B.dailyP], [10, 11]);
  assert.deepEqual([by.F.tie, by.F.dailyP], [true, null]);
  // 同点でない人の手入力は使わない
  assert.equal(daily(games, { I: { manualRankP: 3 } }).I.dailyP, 20);
});

test("日別: 回戦ごとのポイントと合計", () => {
  const { rounds, rows } = computeDaily("kenko", [
    kenkoGame(1, ["A", "B", "C", "D"], TWO_FLOAT),
    kenkoGame(2, ["B", "A", "E", "F"], TWO_FLOAT),
  ]);
  assert.deepEqual(rounds, [1, 2]);
  const a = rows.find((r) => r.playerId === "A");
  assert.deepEqual([a.total, a.byRound], [24, { 1: 18, 2: 6 }]);
});

test("日別: チョンボを引いた後のポイントで集計し、他ルールは混ぜない", () => {
  const seat = (playerId, score, chombo = 0) => ({ playerId, name: playerId, score, chombo });
  const games = [
    { rule: "lab", round: 1, seats: [seat("A", 40000, 1), seat("B", 30000), seat("C", 20000), seat("D", 10000)] },
    { rule: "kyokai", round: 1, seats: [seat("A", 40000), seat("B", 30000), seat("C", 20000), seat("D", 10000)] },
  ];
  const { rows } = computeDaily("lab", games);
  const a = rows.find((r) => r.playerId === "A");
  assert.equal(a.total, 40); // 60 - 20
  assert.equal(a.dailyP, undefined);
  assert.equal(rows[0].playerId, "A");
});

test("日別: 削除済みの対局は集計しない", () => {
  const seat = (playerId, score) => ({ playerId, name: playerId, score, chombo: 0 });
  const seats = [seat("A", 40000), seat("B", 30000), seat("C", 20000), seat("D", 10000)];
  const games = [
    { rule: "lab", round: 1, seats },
    { rule: "lab", round: 2, seats, deleted: true },
  ];
  const { rounds, rows } = computeDaily("lab", games);
  assert.deepEqual(rounds, [1]);
  assert.equal(rows.find((r) => r.playerId === "A").total, 60);
});

test("表示は小数第1位まで", () => {
  assert.equal(fmtPoint(16.6666), "+16.7");
  assert.equal(fmtPoint(-5), "-5.0");
  assert.equal(fmtPoint(0), "0.0");
});

test("名簿検索: 漢字・読み仮名（ひらがな/カタカナ）・登録番号", () => {
  const players = [
    { regNo: 1, name: "山田太郎", kana: "やまだたろう" },
    { regNo: 2, name: "山本花子", kana: "やまもとはなこ" },
    { regNo: 12, name: "田中一郎", kana: "たなかいちろう" },
  ];
  assert.deepEqual(searchPlayers(players, "山田").map((p) => p.regNo), [1]);
  assert.deepEqual(searchPlayers(players, "ヤマ").map((p) => p.regNo), [1, 2]);
  assert.deepEqual(searchPlayers(players, "12").map((p) => p.regNo), [12]);
  assert.deepEqual(searchPlayers(players, "山"), []); // 1文字では出さない
  assert.equal(normalize("ヤマ ダ"), "やまだ");
  assert.deepEqual(findSimilarPlayers(players, "山田 太郎", "").map((p) => p.regNo), [1]);
  assert.deepEqual(findSimilarPlayers(players, "山田", "やまだ").map((p) => p.regNo), [1]);
  assert.deepEqual(findSimilarPlayers(players, "佐藤", "さとう"), []);
});
