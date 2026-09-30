"use client";
// «ألغِ … مع السبب»: the ONE cancel sheet (a payment on a member's page, an expense). Nothing is
// deleted: the record stays with its reason and the activity log names who and why.
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useOnline } from "@/components/providers";
import { CANCEL_REASONS } from "@/components/app/cancel-payment";
import { Chips, Sheet, useP } from "./kit";

type Res = { ok: true } | { ok: false; message: string };

export function CancelSheet({
  title,
  children,
  reasons = CANCEL_REASONS,
  onCancel,
  done,
  onClose,
}: {
  /** «ألغِ الدفعة» / «ألغِ المصروف» (also the button) */
  title: string;
  /** what is being cancelled, in one line */
  children: ReactNode;
  reasons?: string[];
  onCancel: (reason: string) => Promise<Res | null>;
  /** the line shown after it worked */
  done: string;
  onClose: () => void;
}) {
  const { snack } = useP();
  const router = useRouter();
  const online = useOnline();
  const [why, setWhy] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reason = why === "أخرى" ? other.trim() : why;
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
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
            disabled={!reason || busy || !online}
            onClick={async () => {
              setBusy(true);
              setErr("");
              const r = await onCancel(reason).catch(() => null);
              setBusy(false);
              if (!r?.ok) return setErr(r?.message ?? "تعذّر الإلغاء. حاول مرة أخرى.");
              router.refresh();
              onClose();
              snack(done);
            }}
          >
            {busy ? "جارٍ الإلغاء…" : reason ? title : "اختر السبب"}
          </button>
        </>
      }
    >
      <p className="pa-quiet">{children}</p>
      <p className="pa-label">السبب</p>
      <Chips
        label="السبب"
        value={why}
        onChange={setWhy}
        options={reasons.map((x) => ({ k: x, l: x }))}
      />
      {why === "أخرى" && (
        <label className="pa-field">
          <span>اكتب السبب</span>
          <input value={other} maxLength={200} onChange={(e) => setOther(e.target.value)} />
        </label>
      )}
    </Sheet>
  );
}
