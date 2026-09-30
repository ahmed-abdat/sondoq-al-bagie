"use client";
// «سجّل مصروفًا»: the ONE expense sheet (home, المصاريف, a تبرع/لوحة page with it preset).
// Order (owner): المبلغ → النشاط → ماذا اشتُري → من أي محفظة → التاريخ → صورة الفاتورة (اختياري).
// Any committee member records; saved at once; the button says what is still missing.
import { AmountInput, amountValue } from "@/components/app/amount-input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnline } from "@/components/providers";
import { useAct } from "@/components/app/act";
import { DateField } from "@/components/app/date-field";
import { imageOpenError } from "@/components/app/derive";
import { sendOnce, useOnceId } from "@/components/app/once-id";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import { failure } from "@/lib/data/errors";
import { todayIso } from "@/lib/dates";
import { Chips, fmt, Sheet, useP, X } from "./kit";
import { WalletPicker, type WalletChoice } from "./wallet-picker";

export function ExpenseSheet({
  open,
  onClose,
  campaign,
}: {
  open: boolean;
  onClose: () => void;
  /** from a تبرع or لوحة page: the expense is paid from it */
  campaign?: string;
}) {
  return open ? <Body onClose={onClose} campaign={campaign} /> : null;
}

function Body({ onClose, campaign }: { onClose: () => void; campaign?: string }) {
  const { d, snack } = useP();
  const router = useRouter();
  const online = useOnline();
  const once = useOnceId();
  const { recordExpense, uploadProof } = useAct();
  const [amt, setAmt] = useState("");
  // «النشاط» (m38): the list «المسؤول» manages; only active ones are offered
  const [kind, setKind] = useState<string>("");
  const acts = d.activities.filter((a) => a.active);
  const [what, setWhat] = useState("");
  const [from, setFrom] = useState<string>(campaign ?? "");
  const [wallet, setWallet] = useState<WalletChoice | null>(null);
  const [on, setOn] = useState(todayIso());
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amount = amountValue(amt);
  const open = [
    ...d.campaigns
      .filter((c) => c.status === "open")
      .map((c) => ({ id: c.id, l: `تبرع: ${c.title}` })),
    ...d.levies
      .filter((l) => l.status === "open")
      .map((l) => ({ id: l.id, l: `لوحة: ${l.title}` })),
  ];
  const next = !amount
    ? "اكتب المبلغ"
    : !kind
      ? "اختر النشاط"
      : !what.trim()
        ? "اكتب ماذا اشتُري"
        : null;

  const save = async () => {
    if (next || busy) return;
    setBusy(true);
    setErr("");
    let r;
    try {
      r = await sendOnce(once, async (id) => {
        let receiptPath: string | undefined;
        if (shot) {
          const fd = new FormData();
          fd.set("file", dataUrlToBlob(shot), "invoice.jpg");
          fd.set("kind", "expenses");
          fd.set("id", id);
          const up = await uploadProof(fd);
          if (!up.ok) return up;
          receiptPath = up.data.path;
        }
        return recordExpense({
          id,
          spentOn: on || todayIso(),
          activityId: Number(kind),
          amount,
          note: what.trim(),
          campaignId: from || undefined,
          // m41: the wallet (cash is a wallet too) and, when it has several, the account
          ...(wallet && wallet.walletTypeId > 0
            ? { walletTypeId: wallet.walletTypeId, fundAccountId: wallet.fundAccountId }
            : wallet?.cash
              ? { paidInCash: true }
              : {}),
          receiptPath,
        });
      });
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
          {!online && (
            <p className="pa-hint" role="status">
              لا يوجد اتصال. سجّل عند عودة الإنترنت، ما كتبته باقٍ.
            </p>
          )}
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            disabled={!!next || busy || !online}
            onClick={() => void save()}
          >
            {busy ? "جارٍ الحفظ…" : (next ?? "سجّل المصروف")}
          </button>
        </>
      }
    >
      <label className="pa-field pa-field-big">
        <span>المبلغ (أوقية)</span>
        <AmountInput value={amt} onChange={setAmt} placeholder="0" />
      </label>
      <p className="pa-label">النشاط</p>
      <Chips
        label="النشاط"
        value={kind}
        onChange={setKind}
        options={acts.map((a) => ({ k: String(a.id), l: a.name }))}
      />
      <label className="pa-field">
        <span>ماذا اشتُري؟</span>
        <input
          value={what}
          maxLength={500}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="مثل: كرات وأقمصة للفريق"
        />
      </label>
      {open.length > 0 && !campaign && (
        <>
          <p className="pa-label">من أين المال؟</p>
          <Chips
            label="من أين المال"
            value={from}
            onChange={setFrom}
            options={[{ k: "", l: "الصندوق" }, ...open.map((c) => ({ k: c.id, l: c.l }))]}
          />
        </>
      )}
      <p className="pa-label">من أي محفظة؟ (اختياري)</p>
      <WalletPicker value={wallet} onChange={setWallet} />
      <div className="pa-field">
        <span>التاريخ</span>
        <DateField value={on} onChange={setOn} label="تاريخ المصروف" noFuture />
      </div>
      <p className="pa-label">صورة الفاتورة (اختياري)</p>
      {shot ? (
        <div className="r2-paid">
          {/* eslint-disable-next-line @next/next/no-img-element -- local picture */}
          <img src={shot} alt="صورة الفاتورة" className="r2-shot" />
          <button
            type="button"
            className="pa-btn pa-btn-ghost pa-btn-sm"
            onClick={() => setShot(null)}
          >
            {X.x(18)} أزل الصورة
          </button>
        </div>
      ) : (
        <label className="pa-btn pa-btn-soft pa-btn-block">
          {X.image(20)} أضف صورة الفاتورة
          <input
            type="file"
            accept="image/*"
            className="bq-sr"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setShot(await compressImage(f));
              } catch {
                setErr(imageOpenError(f));
              }
            }}
          />
        </label>
      )}
    </Sheet>
  );
}
