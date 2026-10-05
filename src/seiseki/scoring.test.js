// node --test で実行（npm test）
import { test } from "node:test";
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

test("日別: 合計の同点は同順位、本日Pの順位点は平均", () => {
  const seat = (playerId, score) => ({ playerId, name: playerId, score, chombo: 0 });
  const games = [
    { rule: "kenko", round: 1, seats: [seat("A", 40000), seat("B", 32000), seat("C", 27000), seat("D", 21000)] },
    { rule: "kenko", round: 2, seats: [seat("A", 32000), seat("B", 40000), seat("E", 27000), seat("F", 21000)] },
  ];
  const { rounds, rows } = computeDaily("kenko", games, { A: { yakuman: true }, C: { shitei: true } });
  assert.deepEqual(rounds, [1, 2]);
  const by = Object.fromEntries(rows.map((r) => [r.playerId, r]));
  assert.equal(by.A.total, 24);
  assert.equal(by.B.total, 24);
  assert.deepEqual([by.A.rank, by.B.rank, by.C.rank, by.E.rank, by.D.rank, by.F.rank], [1, 1, 3, 3, 5, 5]);
  assert.equal(by.B.dailyP, 22.5);       // (20+15)/2 + 5
  assert.equal(by.A.dailyP, 27.5);       // 22.5 + 役満5
  assert.equal(by.E.dailyP, 13);         // (12+10)/2 + 2
  assert.equal(by.C.dailyP, 14);         // 13 + 指定役1
  assert.equal(by.D.dailyP, 2);          // 5位以下は0 + 2
  assert.deepEqual(by.A.byRound, { 1: 18, 2: 6 });
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
