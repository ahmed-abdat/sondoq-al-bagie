"use client";
// /m/switch: «أضف … وانتقل إليه» or «ابقَ باسم …». Both go home after the server answers.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { forgetMemberCard } from "../member-card-cache";
import { useMemberAct } from "../member-act";

export function MemberSwitchChoice({ current, next }: { current: string; next: string }) {
  const router = useRouter();
  const online = useOnline();
  const { memberAcceptPending, memberDeclinePending } = useMemberAct();
  const [busy, setBusy] = useState<"add" | "stay" | null>(null);
  const [err, setErr] = useState("");
  const go = async (k: "add" | "stay") => {
    setBusy(k);
    setErr("");
    const r = await (k === "add" ? memberAcceptPending() : memberDeclinePending());
    setBusy(null);
    if (!r.ok) return setErr(r.message);
    forgetMemberCard();
    router.replace("/");
    router.refresh();
  };
  return (
    <div className="bq-switch-btns">
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="bq-btn bq-btn-primary bq-btn-lg bq-press"
        disabled={!!busy || !online}
        onClick={() => void go("add")}
      >
        {busy === "add" ? "جارٍ الإضافة…" : `أضف ${next} وانتقل إليه`}
      </button>
      <button
        type="button"
        className="bq-btn bq-btn-soft bq-btn-lg bq-press"
        disabled={!!busy || !online}
        onClick={() => void go("stay")}
      >
        ابقَ باسم {current}
      </button>
      <OfflineWriteHint />
    </div>
  );
}
