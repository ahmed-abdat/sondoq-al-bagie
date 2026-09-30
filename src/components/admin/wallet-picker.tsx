"use client";
// «من أي محفظة؟»: the ONE wallet list (payment, expense, contribution). The fund's active wallets
// from الإعدادات, plus «نقدًا» where cash is possible. Value: a fund account id, "cash", or "".
import type { Method } from "@/lib/methods";
import { METHOD_LABELS } from "@/lib/methods";
import { Chips, useP } from "./kit";

export function WalletPicker({
  value,
  onChange,
  cash = true,
  label = "المحفظة",
}: {
  value: string;
  onChange: (id: string, method: Method | "cash" | null) => void;
  /** offer «نقدًا» */
  cash?: boolean;
  label?: string;
}) {
  const { d } = useP();
  const wallets = d.accounts.filter((a) => a.active);
  return (
    <Chips
      label={label}
      value={value}
      onChange={(id) =>
        onChange(id, id === "cash" ? "cash" : (d.accounts.find((a) => a.id === id)?.method ?? null))
      }
      options={[
        ...wallets.map((a) => ({ k: a.id, l: METHOD_LABELS[a.method] })),
        ...(cash ? [{ k: "cash", l: "نقدًا" }] : []),
      ]}
    />
  );
}
