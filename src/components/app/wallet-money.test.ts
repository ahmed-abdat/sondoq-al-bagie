import { describe, expect, it } from "vitest";
import type { FundAccountAdmin, WalletType } from "@/lib/data/types";
import { moveSources, moveTargets, oldWithMoney, walletBalance } from "./wallet-money";

const w: WalletType = {
  id: 1,
  name: "بنكيلي",
  logoPath: null,
  kind: "wallet",
  sortOrder: 1,
  active: true,
  legacyMethod: "bankily",
  opening: null,
};
const cash: WalletType = { ...w, id: 8, name: "نقدًا", kind: "cash", legacyMethod: "cash" };
const acc = (id: string, active: boolean, num: string): FundAccountAdmin => ({
  id,
  method: "bankily",
  accountNumber: num,
  holderName: "رابطة",
  sortOrder: 0,
  active,
  note: null,
  walletTypeId: 1,
  opening: null,
});
// QA pass 9 P0-1: the number was replaced; the old one holds 127 000, the new one 0
const accs = [acc("old", false, "22000001"), acc("new", true, "22000077")];
const b = { accounts: { old: 127_000, new: 0 }, cash: 370_500 };

describe("a wallet's money after «غيّر الرقم»", () => {
  it("is the sum over all its numbers, the old one included", () => {
    expect(walletBalance(accs, w, b)).toBe(127_000);
  });
  it("lists the old number that still holds money", () => {
    expect(oldWithMoney(accs, w, b).map((a) => a.id)).toEqual(["old"]);
    expect(oldWithMoney(accs, w, { ...b, accounts: { old: 0, new: 5 } })).toEqual([]);
  });
  it("«حوّل» can take money from the old number; money only goes to active numbers or cash", () => {
    expect(moveSources([w], cash, accs, b).map((s) => [s.label, s.accountId, s.balance])).toEqual([
      ["بنكيلي", "new", 0],
      ["بنكيلي (الرقم القديم 22000001)", "old", 127_000],
      ["النقد", null, 370_500],
    ]);
    expect(moveTargets([w], cash, accs).map((t) => t.accountId)).toEqual(["new", null]);
  });
});
