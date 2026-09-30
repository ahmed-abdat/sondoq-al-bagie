"use client";
// «من أي محفظة؟»: the ONE wallet list (payment, expense). The fund's active wallets from الإعدادات
// (m41) that have an account, plus «نقدًا» where cash is possible. When a wallet has more than one
// account, «أي حساب؟» asks which. The choice carries what the server needs.
import type { Method } from "@/lib/methods";
import { Chips, useP } from "./kit";
import type { PWallet } from "./types";

export type WalletChoice = {
  walletTypeId: number;
  /** the account, when the wallet has several (one account: the server fills it) */
  fundAccountId?: string;
  /** what the payment records as (its old method, "cash", or "other") */
  method: Method;
  cash: boolean;
};

/** The wallets offered: active, with an account (all active ones when none has an account yet). */
export function offeredWallets(wallets: PWallet[], cash: boolean): PWallet[] {
  const live = wallets.filter((w) => w.active && w.kind === "wallet");
  const withAcc = live.filter((w) => w.accounts.length > 0);
  const money = withAcc.length ? withAcc : live;
  const c = cash ? wallets.filter((w) => w.active && w.kind === "cash") : [];
  return [...money, ...c];
}

/** The wallet the picture was read from (its old method), if the fund offers it. */
export function choiceForMethod(wallets: PWallet[], m: Method | null): WalletChoice | null {
  const w = m ? offeredWallets(wallets, m === "cash").find((x) => x.method === m) : undefined;
  return w ? choiceOf(w) : null;
}

const choiceOf = (w: PWallet, fundAccountId?: string): WalletChoice => ({
  walletTypeId: w.id,
  ...(fundAccountId ? { fundAccountId } : {}),
  method: w.kind === "cash" ? "cash" : w.method,
  cash: w.kind === "cash",
});

/** Nothing more to ask: a wallet chosen, and its account when it has several. */
export const walletDone = (wallets: PWallet[], c: WalletChoice | null) => {
  if (!c) return false;
  const w = wallets.find((x) => x.id === c.walletTypeId);
  return !!w && (w.accounts.length < 2 || !!c.fundAccountId);
};

export function WalletPicker({
  value,
  onChange,
  cash = true,
  label = "المحفظة",
}: {
  value: WalletChoice | null;
  onChange: (c: WalletChoice | null) => void;
  /** offer «نقدًا» */
  cash?: boolean;
  label?: string;
}) {
  const { d } = useP();
  const list = offeredWallets(d.wallets, cash);
  const cur = value ? d.wallets.find((w) => w.id === value.walletTypeId) : undefined;
  return (
    <>
      <Chips
        label={label}
        value={value ? String(value.walletTypeId) : ""}
        onChange={(k) => {
          const w = list.find((x) => String(x.id) === k);
          onChange(w ? choiceOf(w, w.accounts.length === 1 ? w.accounts[0].id : undefined) : null);
        }}
        options={list.map((w) => ({ k: String(w.id), l: w.name }))}
      />
      {cur && cur.accounts.length > 1 && (
        <>
          <p className="pa-label">أي حساب؟</p>
          <Chips
            label="أي حساب"
            value={value?.fundAccountId ?? ""}
            onChange={(id) => onChange(choiceOf(cur, id))}
            options={cur.accounts.map((a) => ({ k: a.id, l: a.number }))}
          />
        </>
      )}
    </>
  );
}
