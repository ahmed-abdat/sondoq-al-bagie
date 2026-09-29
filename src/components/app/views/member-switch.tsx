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
  /** the phone was full: the least recently used person left it */
  const [dropped, setDropped] = useState<string | null>(null);
  const home = () => {
    forgetMemberCard();
    router.replace("/");
    router.refresh();
  };
  const go = async (k: "add" | "stay") => {
    setBusy(k);
    setErr("");
    const r = k === "add" ? await memberAcceptPending() : await memberDeclinePending();
    setBusy(null);
    if (!r.ok) return setErr(r.message);
    const gone = r.data && "droppedName" in r.data ? r.data.droppedName : null;
    if (gone) return setDropped(gone);
    home();
  };
  if (dropped)
    return (
      <div className="bq-switch-btns">
        <p className="bq-lead" role="status">
          أُضيف {next}. أزيل {dropped} من هذا الجهاز لأن الهاتف يحمل 5 أشخاص على الأكثر، ويمكن فتح
          رابطه من جديد متى شاء.
        </p>
        <button type="button" className="bq-btn bq-btn-primary bq-btn-lg bq-press" onClick={home}>
          متابعة
        </button>
      </div>
    );
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
