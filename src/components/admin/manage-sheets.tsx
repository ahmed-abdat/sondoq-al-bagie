"use client";
// Rare «المسؤول» jobs as sheets on the page they belong to (no separate management pages):
// «عضو جديد» on الأعضاء, «تعديل البيانات» on a member's page, «تعديل» on a تبرع's page.
// The data is asked when the sheet opens, so the daily screens stay light.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useDemoState } from "@/components/app/act";
import { CampaignFormBody } from "@/components/app/campaign-form";
import { AddMemberBody, MemberAdminBody } from "@/components/app/members-admin";
import { Sheet } from "@/components/app/sheet";
import { useP } from "./kit";
import { campaignForEdit, memberAdminData } from "./report-action";

type AdminData = NonNullable<Awaited<ReturnType<typeof memberAdminData>>>;

function useLoad<T>(load: () => Promise<T | null>) {
  const [v, setV] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    load()
      .then((x) => live && setV(x))
      .catch(() => live && setV(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the sheet opens
  }, []);
  return v;
}

function Wait({ v }: { v: unknown }) {
  return v === undefined ? (
    <p className="bq-hint" role="status">
      جارٍ التحميل…
    </p>
  ) : (
    <p className="bq-alert" role="alert">
      تعذّر التحميل. تحقق من الإنترنت ثم حاول مرة أخرى.
    </p>
  );
}

function useDone(onClose: () => void) {
  const router = useRouter();
  const { snack } = useP();
  return (t: string) => {
    onClose();
    router.refresh();
    snack(t);
  };
}

export function AddMemberSheet({ onClose }: { onClose: () => void }) {
  const v = useLoad<AdminData>(memberAdminData);
  const done = useDone(onClose);
  return (
    <Sheet label="عضو جديد" onDone={onClose}>
      {v ? (
        <AddMemberBody
          members={v.members}
          prices={v.prices}
          thisMonth={v.thisMonth}
          onDone={done}
        />
      ) : (
        <Wait v={v} />
      )}
    </Sheet>
  );
}

export function EditMemberSheet({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const v = useLoad<AdminData>(memberAdminData);
  const done = useDone(onClose);
  const demo = useDemoState();
  const raw = v?.members.find((x) => x.memberId === memberId);
  // demo: what this phone already did (credit paid, edits) shows at once, as on the old list
  const paidNow = demo.creditPaid[memberId]?.length ?? 0;
  const m = raw && {
    ...raw,
    ...demo.memberPatch[memberId],
    monthsBehind: Math.max(0, raw.monthsBehind - paidNow),
    monthsPaidThisYear: raw.monthsPaidThisYear + paidNow,
    amountOwed: Math.max(0, raw.amountOwed - paidNow * (v?.prices[raw.groupCode] ?? 0)),
  };
  const baseCredit = v?.credit[memberId];
  const credit =
    baseCredit && paidNow
      ? {
          amount: Math.max(0, baseCredit.amount - paidNow * (v?.prices[raw!.groupCode] ?? 0)),
          months: baseCredit.months.filter((k) => !demo.creditPaid[memberId]!.includes(k)),
        }
      : baseCredit;
  return (
    <Sheet label="تعديل البيانات" onDone={onClose}>
      {v && m ? (
        <MemberAdminBody
          m={m}
          members={v.members}
          thisMonth={v.thisMonth}
          admin={v.admin}
          credit={credit}
          price={v.prices[m.groupCode] ?? 0}
          months={v.months[m.memberId]}
          monthsCtx={v.monthsCtx}
          onDone={done}
        />
      ) : (
        <Wait v={v === undefined ? undefined : null} />
      )}
    </Sheet>
  );
}

export function EditCampaignSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const v = useLoad(() => campaignForEdit(id));
  const done = useDone(onClose);
  return (
    <Sheet label="تعديل التبرع" onDone={onClose}>
      {v ? (
        <CampaignFormBody campaign={v.campaign} pendingCount={v.pendingCount} onDone={done} />
      ) : (
        <Wait v={v} />
      )}
    </Sheet>
  );
}

/** «تبرع جديد»: the same form as «تعديل التبرع» (one component for both). */
export function NewCampaignSheet({ onClose }: { onClose: () => void }) {
  const done = useDone(onClose);
  return (
    <Sheet label="تبرع جديد" onDone={onClose}>
      <CampaignFormBody onDone={done} />
    </Sheet>
  );
}
