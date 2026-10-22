import { describe, it, expect } from "vitest";
import { seatsLeft, promoteWaitlist, hasDuplicate, toPublic, validateBooking, canCancelAt } from "./reserveLogic";
import { isValidLineSignature } from "../api/webhook.js";
import crypto from "node:crypto";

const r = (id, o) => ({ id, tableId: 1, date: "2026-11-01", time: "13:00", people: 1, status: "confirmed", finished: false, createdAt: `2026-10-01T00:00:0${id}Z`, ...o });

describe("予約ロジック", () => {
  it("空き席を数える（キャンセル・終了済みは除く）", () => {
    const list = [r(1, { people: 2 }), r(2, { status: "cancelled", people: 2 }), r(3, { finished: true })];
    expect(seatsLeft(list, 1, "2026-11-01", "13:00")).toBe(2);
  });
  it("キャンセル待ちを古い順に1件繰り上げる", () => {
    const list = [r(1, { people: 2 }), r(2, { status: "waitlist", people: 2 }), r(3, { status: "waitlist", people: 1 })];
    const out = promoteWaitlist(list, "2026-11-01", "13:00", 1);
    expect(out.find((x) => x.id === 2).status).toBe("confirmed");
    expect(out.find((x) => x.id === 3).status).toBe("waitlist");
  });
  it("電話番号の重複はハイフン違いでも見つける", () => {
    expect(hasDuplicate([r(1, { phone: "090-1234-5678" })], "09012345678", "2026-11-01")).toBe(true);
  });
  it("公開用コピーに名前・電話番号を入れない", () => {
    const p = toPublic(r(1, { name: "山田", phone: "09012345678", ownerUid: "u", lineUserId: "U1" }));
    expect(Object.keys(p)).not.toContain("name");
    expect(Object.keys(p)).not.toContain("phone");
    expect(Object.keys(p)).not.toContain("lineUserId");
    expect(Object.keys(p)).not.toContain("ownerUid");
  });
  it("おかしな予約内容をはじく", () => {
    const ok = { name: "山田", phone: "09012345678", date: "2026-11-01", time: "13:00", tableId: 1, course: "health", people: 2 };
    expect(validateBooking(ok)).toBeNull();
    expect(validateBooking({ ...ok, people: 9 })).not.toBeNull();
    expect(validateBooking({ ...ok, tableId: 99 })).not.toBeNull();
    expect(validateBooking({ ...ok, phone: "abc" })).not.toBeNull();
  });
  it("キャンセル期限（日本時間）", () => {
    const rsv = { date: "2026-11-01", time: "13:00" };
    expect(canCancelAt(rsv, 24, new Date("2026-10-31T03:00:00Z"))).toBe(true);  // 31日12時JST
    expect(canCancelAt(rsv, 24, new Date("2026-10-31T05:00:00Z"))).toBe(false); // 31日14時JST
    expect(canCancelAt(rsv, 0)).toBe(true);
  });
});

describe("LINE署名チェック", () => {
  it("正しい署名だけ通す", () => {
    const body = '{"events":[]}';
    const sig = crypto.createHmac("sha256", "secret").update(body).digest("base64");
    expect(isValidLineSignature(body, sig, "secret")).toBe(true);
    expect(isValidLineSignature(body, sig, "other")).toBe(false);
    expect(isValidLineSignature(body, "", "secret")).toBe(false);
    expect(isValidLineSignature(body, sig, "")).toBe(false);
  });
});
