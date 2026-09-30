"use client";
// «سجّل مصروفًا»: amount, what for, kind (or an open campaign), from which wallet or cash.
// Any committee member (plan §9). Saved at once; the list and the balance refresh.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnline } from "@/components/providers";
import { useAct } from "@/components/app/act";
import { DateField } from "@/components/app/date-field";
import { sendOnce, useOnceId } from "@/components/app/once-id";
import { failure } from "@/lib/data/errors";
import { todayIso } from "@/lib/dates";
import { METHOD_LABELS } from "@/lib/methods";
import { parseAmount, toWesternDigits } from "@/lib/money";
import { Chips, fmt, Sheet, useP } from "./kit";

const KINDS = [
  { k: "teaching", l: "التدريس" },
  { k: "honoring", l: "التكريم" },
  { k: "sports", l: "الرياضة" },
  { k: "other", l: "أخرى" },
] as const;
type Kind = (typeof KINDS)[number]["k"];

export function ExpenseSheet({
  open,
  onClose,
  campaign,
}: {
  open: boolean;
  onClose: () => void;
  /** from a campaign page: the expense is paid from that campaign */
  campaign?: string;
}) {
  return open ? <Body onClose={onClose} campaign={campaign} /> : null;
}

function Body({ onClose, campaign }: { onClose: () => void; campaign?: string }) {
  const { d, snack } = useP();
  const router = useRouter();
  const online = useOnline();
  const once = useOnceId();
  const { recordExpense } = useAct();
  const [amt, setAmt] = useState("");
  const [what, setWhat] = useState("");
  const [kind, setKind] = useState<Kind>("other");
  const [from, setFrom] = useState<string>(campaign ?? "");
  const [wallet, setWallet] = useState<string>("");
  const [on, setOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amount = Math.round(parseAmount(amt) ?? 0);
  const open = d.campaigns.filter((c) => c.status === "open");
  const wallets = d.accounts.filter((a) => a.active);
  const label = !amount ? "اكتب المبلغ" : !what.trim() ? "اكتب ماذا اشتُري" : "سجّل المصروف";

  const save = async () => {
    if (!amount || !what.trim() || busy) return;
    setBusy(true);
    setErr("");
    let r;
    try {
      r = await sendOnce(once, (id) =>
        recordExpense({
          id,
          spentOn: on || todayIso(),
          category: kind,
          amount,
          note: what.trim(),
          campaignId: from || undefined,
          fundAccountId: wallet && wallet !== "cash" ? wallet : undefined,
          paidInCash: wallet === "cash" ? true : undefined,
        }),
      );
    } catch {
      r = failure("network");
    } finally {
      setBusy(false);
    }
    if (!r.ok) return setErr(r.message);
    router.refresh();
    onClose();
    snack(`سُجّل المصروف: ${what.trim()}، ${fmt(amount)} أوقية.`);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="سجّل مصروفًا"
      foot={
        <>
          {err && (
            <p className="pa-alert" role="alert">
              {err}
            </p>
          )}
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            disabled={!amount || !what.trim() || busy || !online}
            onClick={() => void save()}
          >
            {busy ? "جارٍ الحفظ…" : label}
          </button>
        </>
      }
    >
      <label className="pa-field pa-field-big">
        <span>المبلغ بالأوقية القديمة</span>
        <input
          inputMode="numeric"
          dir="ltr"
          value={amt}
          onChange={(e) => setAmt(toWesternDigits(e.target.value))}
          placeholder="0"
        />
      </label>
      <label className="pa-field">
        <span>ماذا اشتُري؟</span>
        <input
          value={what}
          maxLength={500}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="مثل: كرات وأقمصة للفريق"
        />
      </label>
      <div className="pa-field">
        <span>متى صُرف؟</span>
        <DateField value={on} onChange={setOn} label="متى صُرف؟" noFuture />
      </div>
      <p className="pa-label">لأي نشاط؟</p>
      <Chips label="النشاط" value={kind} onChange={setKind} options={[...KINDS]} />
      {open.length > 0 && (
        <>
          <p className="pa-label">من أين المال؟</p>
          <Chips
            label="من أين المال"
            value={from}
            onChange={setFrom}
            options={[
              { k: "", l: "الصندوق" },
              ...open.map((c) => ({ k: c.id, l: `تبرع: ${c.title}` })),
            ]}
          />
        </>
      )}
      <p className="pa-label">من أي محفظة؟ (اختياري)</p>
      <Chips
        label="المحفظة"
        value={wallet}
        onChange={setWallet}
        options={[
          ...wallets.map((a) => ({ k: a.id, l: METHOD_LABELS[a.method] })),
          { k: "cash", l: "نقدًا" },
        ]}
      />
    </Sheet>
  );
}
