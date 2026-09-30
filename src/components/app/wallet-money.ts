// The money of each wallet on the settings page (m43), from the server's wallets report: pure,
// tested. A wallet's money is the sum over ALL its accounts: a replaced (stopped) number keeps its
// money until it is moved, and «حوّل» can move it from there (QA pass 9 P0-1).
import type { FundAccountAdmin, WalletType } from "@/lib/data/types";

export type Balances = { accounts: Record<string, number>; cash: number | null };
export type MoveEnd = { key: string; label: string; accountId: string | null; balance?: number };

const of = (accs: FundAccountAdmin[], w: WalletType) => accs.filter((a) => a.walletTypeId === w.id);

/** Sum over every account of the wallet the server gives a balance for (undefined: none). */
export function walletBalance(accs: FundAccountAdmin[], w: WalletType, b: Balances) {
  const xs = of(accs, w).flatMap((a) =>
    b.accounts[a.id] !== undefined ? [b.accounts[a.id]] : [],
  );
  return xs.length ? xs.reduce((s, x) => s + x, 0) : undefined;
}

/** Stopped (replaced) numbers that still hold money. */
export function oldWithMoney(accs: FundAccountAdmin[], w: WalletType, b: Balances) {
  return of(accs, w).filter((a) => !a.active && (b.accounts[a.id] ?? 0) > 0);
}

/** Where money can come from: each wallet's active number, each old number with money, cash. */
export function moveSources(
  wallets: WalletType[],
  cash: WalletType | undefined,
  accs: FundAccountAdmin[],
  b: Balances,
): MoveEnd[] {
  return [
    ...wallets.flatMap((w) => {
      const act = of(accs, w).find((a) => a.active);
      return [
        ...(act
          ? [{ key: act.id, label: w.name, accountId: act.id, balance: b.accounts[act.id] }]
          : []),
        ...oldWithMoney(accs, w, b).map((a) => ({
          key: a.id,
          label: `${w.name} (الرقم القديم ${a.accountNumber})`,
          accountId: a.id,
          balance: b.accounts[a.id],
        })),
      ];
    }),
    ...(cash ? [{ key: "cash", label: "النقد", accountId: null, balance: b.cash ?? undefined }] : []),
  ];
}

/** Where money can go: each wallet's active number, and cash. */
export function moveTargets(
  wallets: WalletType[],
  cash: WalletType | undefined,
  accs: FundAccountAdmin[],
): MoveEnd[] {
  return [
    ...wallets.flatMap((w) => {
      const act = of(accs, w).find((a) => a.active);
      return act ? [{ key: act.id, label: w.name, accountId: act.id }] : [];
    }),
    ...(cash ? [{ key: "cash", label: "النقد", accountId: null }] : []),
  ];
}
