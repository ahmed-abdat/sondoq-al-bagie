import { describe, expect, it } from "vitest";
import { choiceForMethod, offeredWallets, walletDone } from "./wallet-picker";
import type { PWallet } from "./types";

const w = (id: number, p: Partial<PWallet> = {}): PWallet => ({
  id,
  name: `w${id}`,
  logo: null,
  kind: "wallet",
  active: true,
  method: "other",
  accounts: [],
  ...p,
});
const list = [
  w(1, { method: "bankily", accounts: [{ id: "a1", number: "1", holder: "x" }] }),
  w(2, {
    method: "masrvi",
    accounts: [
      { id: "a2", number: "2", holder: "x" },
      { id: "a3", number: "3", holder: "x" },
    ],
  }),
  w(3, { method: "sedad" }),
  w(4, { method: "click", active: false, accounts: [{ id: "a4", number: "4", holder: "x" }] }),
  w(8, { kind: "cash", method: "cash" }),
];

describe("the one wallet picker", () => {
  it("offers active wallets with an account, cash only when asked", () => {
    expect(offeredWallets(list, false).map((x) => x.id)).toEqual([1, 2]);
    expect(offeredWallets(list, true).map((x) => x.id)).toEqual([1, 2, 8]);
  });
  it("offers every active wallet while none has an account yet", () => {
    const bare = list.map((x) => ({ ...x, accounts: [] }));
    expect(offeredWallets(bare, false).map((x) => x.id)).toEqual([1, 2, 3]);
  });
  it("the wallet read on a picture, by its old method", () => {
    expect(choiceForMethod(list, "bankily")).toEqual({
      walletTypeId: 1,
      method: "bankily",
      cash: false,
    });
    expect(choiceForMethod(list, "click")).toBeNull();
  });
  it("asks which account only when the wallet has several", () => {
    expect(walletDone(list, { walletTypeId: 1, method: "bankily", cash: false })).toBe(true);
    expect(walletDone(list, { walletTypeId: 2, method: "masrvi", cash: false })).toBe(false);
    expect(
      walletDone(list, { walletTypeId: 2, fundAccountId: "a3", method: "masrvi", cash: false }),
    ).toBe(true);
    expect(walletDone(list, null)).toBe(false);
  });
});
